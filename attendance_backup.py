import argparse
import csv
import os
import sys
from datetime import datetime, timedelta

import requests

SUPABASE_URL = os.environ.get(
    "SUPABASE_URL", "https://mqydllsssbornidwfslc.supabase.co"
)
SUPABASE_ANON_KEY = os.environ.get(
    "SUPABASE_ANON_KEY", "sb_publishable_K4xmv94WqLocEvWcGFBKlg_BKVbpSFW"
)

BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backups")


def get_today_range():
    """(start_iso, end_iso) for today, in this machine's local timezone."""
    now = datetime.now().astimezone()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return start.isoformat(), end.isoformat()


def fetch_logs(log_type: str):
    """Fetch today's attendance_logs of one type, joined with member info."""
    start_iso, end_iso = get_today_range()

    url = f"{SUPABASE_URL}/rest/v1/attendance_logs"
    # A list of tuples (not a dict) so scanned_at can appear twice —
    # PostgREST ANDs repeated filter keys together for a range query.
    params = [
        (
            "select",
            "scanned_at,type,latitude,longitude,members(full_name,phone,unit,role)",
        ),
        ("type", f"eq.{log_type}"),
        ("scanned_at", f"gte.{start_iso}"),
        ("scanned_at", f"lt.{end_iso}"),
        ("order", "scanned_at.asc"),
    ]
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    }

    response = requests.get(url, headers=headers, params=params, timeout=30)
    response.raise_for_status()
    return response.json()


def write_csv(rows, label: str):
    os.makedirs(BACKUP_DIR, exist_ok=True)
    date_str = datetime.now().strftime("%Y-%m-%d")
    filepath = os.path.join(BACKUP_DIR, f"{label}_{date_str}.csv")

    fieldnames = [
        "full_name",
        "phone",
        "unit",
        "role",
        "type",
        "scanned_at",
        "latitude",
        "longitude",
    ]

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            member = row.get("members") or {}
            writer.writerow(
                {
                    "full_name": member.get("full_name", ""),
                    "phone": member.get("phone", ""),
                    "unit": member.get("unit", ""),
                    "role": member.get("role", ""),
                    "type": row.get("type", ""),
                    "scanned_at": row.get("scanned_at", ""),
                    "latitude": row.get("latitude", ""),
                    "longitude": row.get("longitude", ""),
                }
            )

    return filepath


def main():
    parser = argparse.ArgumentParser(
        description="Backup today's attendance logs to CSV."
    )
    parser.add_argument(
        "--type",
        choices=["checkin", "checkout"],
        required=True,
        help="Which records to download: checkin or checkout",
    )
    args = parser.parse_args()

    log_type = "check_in" if args.type == "checkin" else "check_out"

    try:
        rows = fetch_logs(log_type)
    except requests.RequestException as e:
        print(f"Failed to fetch attendance logs: {e}", file=sys.stderr)
        sys.exit(1)

    filepath = write_csv(rows, args.type)
    print(f"Saved {len(rows)} {args.type} record(s) to {filepath}")


if __name__ == "__main__":
    main()


# ---------------------------------------------------------------
# Scheduling (pick whichever matches your OS — the script itself
# doesn't run continuously, it just needs to be triggered twice a day)
# ---------------------------------------------------------------
#
# macOS / Linux (cron) — run `crontab -e` and add:
#
#   0 12 * * * /usr/bin/python3 /full/path/to/attendance_backup.py --type checkin  >> /full/path/to/backup.log 2>&1
#   0 19 * * * /usr/bin/python3 /full/path/to/attendance_backup.py --type checkout >> /full/path/to/backup.log 2>&1
#
# Windows (Task Scheduler):
#   Create two Basic Tasks, each set to trigger Daily at 12:00 PM and
#   7:00 PM respectively. Action: "Start a program"
#     Program:   python.exe
#     Arguments: C:\full\path\to\attendance_backup.py --type checkin
#   (swap --type checkout for the 7:00 PM task)
