# ICT Check-In Portal

This is a geofenced, device-based attendance system built for the internal ICT team with help desk. It features a register once on a device, then check in and sign out with a single tap every day after.

No app install, no shared kiosk. Every person's own phone or laptop remembers them.

---

**The problem**

The attendance model we've been running has been on an Excel sheet. One person logs in the details of each person as they resume, meaning the attendance records where very volatile, and the process very redundant.
I set out to redefine the process, keeping the process to a simple tap for sign-ins and check-outs.

Most "attendance app" tutorials defaulted to a QR-code-per-person model: register, get a QR code, print it or save it, scan it at a kiosk every day. It requires more infrastructure than a small internal team needs.

This instead treats the device itself as the credential. Register once on your own phone, and that phone remembers you. Attendance becomes "open the page, tap once."

---

**Features**

- Sign up once, check in forever: Registeration writes a member record to Supabase and stores the returned ID locally on that device. No login, no password, no QR code.
- Geofenced checkin/sign-out: Attendance can only be logged from within a set radius of the office. This is enforced server-side via a Postgres function, not just a client-side check, so it can't be bypassed by calling the API directly with the public key.

- Time-gated sign out: The check-in button automattically becomes a sign-out button once the person has checked in and its past 12:00 PM. Before that, it shows a waiting state instead.

- Returning device shortuct: A device already registered skips the welcome/register screens entirely and lands straight on quick check-in.

- Phone number recovery: When testing the site, I noticed how frequently my device's local storage gets cleared (albeit, because of my incissent habits for clearing unnecessary storage), so I added a feature that allows the person look themselves up by the phone number they registered with, instead of creating duplicate profiles.

- Immutable attendance records: Row level security policies explicitly block all "update" operations on both tables. Once a check-in or sign-out is logged nobody not even me (the admin using a direct API access) can alter it.

- Live activity feed: The five most recent check-ins/sign outs across the teamss is pulled from a Postgres View. This one's just for our personal strive for punctuality.

- Mobile first: It's designed for the phone in-hand use case, sure it's fine for desktop, but that's the priority use-case.

- Automated daily backups: Having to scan through an entire log to see who's been logging and who's not proved tiresome, so I added a scheduled GitHub workflow action. It downloads the day's checkins at noon and sign-outs at 7PM as csvs, independent of Supabase itself.

---

**Tech stack**

Frontend: Vanilla HTML/CSS/JS +Tailwind (CDN)

Backend: Supabase(Postgres + PosgREST +RPC)

Auth: None, its device scoped via local storage, no user accounts.

Geolocation: Browser geolocation API + Haversine distance calculation handled in Postgres.

Fonts: Space Grotesk(display), IBM Plex Sans (body), IBM Plex Mono (data/status)

There's no build setup, no bundler just 4 static files that can be hosted anywhere with HTTPS

How it works:

_Registration_

1. The user fills out the form. A row is inserted into members, returning a genereated UUID.
2. That UUID + name is saved to localStorage on the device. This is the device's credential from then no.

_Check-in/Sign-out_

1. On loading the "Quick Check-In, the app queries today's most recent attendance event for the stored member ID to determine which of four states to show: not checked in, checked in(waiting for noon), ready to sign out, or done for the day.
2. On tap, the browser's geolocation API requests the device's current coordinates.
3. Those coordinates are passed to a Postgres RPC function "log_attendance" or "log_signout", not a direct table insert.
4. The function calculates the great-circlee distance from the office using the Haversine formula and rejects the insert server-side if the device is outside the allowed radius. This is the part that can't be spoofed from the browser console.

_Recovery_

If localStorage comes up empty, the app shows a phone-number lookup instead of only offering to re-register. It queries the existing "members" table for a matching phone number, and if found, writes that number's ID back into localStorage, from that point the device behaves exactly as if it had just registered normally.

_Backups_

A standalone Python script(attendance_backup.py) hits the same Supabase Rest API the frontend uses. It's read-only, and uses the same anon_key, no elevated access, and exports the day's records to CSV.

Two scheduled GitHub Actions workflows (.github/workflows/checkin-backup.yml and check-out-backup.yml) run it automatically:

- 12:00PM WAT: Downloads the day's check-ins
- 7:00PM WAT: Downloads the days's sign-outs

Each run commits the resulting CSV into a "backups" folder in the repo, so attendance history is preserved independent of Supabase itself, versioned in git, and doesn't depend on any single laptop being on.

_Security model_

- RLS everywhere: Both tables have Row Level Security enabled. Reads and inserts are scoped by explicit policies; updates are explicitly denied.

- Gefencing lives in the database, not the browser: Client-side location check is trivial to bypass by anyone who opens dev tools and calls the Supabase REST API directly with the public anon_key. Locking the insert path behind a security deinfer Postgres functions closes that gap.

- The anon/published key is meant to be public: It's visible in the deployed JS by design. Supabase's security model relies on RLS + the RPC functinoss, not on hiding that key. The service_role/secret key is never used client-side.

---

**Project structure**

    ├── index.html
    ├── styles.css
    ├── script.js
    ├── supabase-client.js
    ├── schema.sql
    ├── attendance_backup.py
    ├── requirements.txt
    └── .github/
        └── workflows/
            ├── checkin-backup.yml
            └── checkout-backup.yml

---

**Setup**

1. Create a Supabase Project.
2. Run schema.sql in the Supabase SQL Editor.
3. In schema.sql, replace the office_lat/office_lng values inside log_attendance and log_signout with your actual office coordinates.

4. In supabase-client.js, add your Project URL and anon/publishable key.
5. Serve the three static files over HTTPS(geolocation requires this). GitHub Pages, Netlify, or Cloudfare Pages all work with zero config.

For automated backups:

In the repo's Settings, Secrets and variables, Actions: add SUPABASE_URL and SUPABASE_ANON_KEY as repository secrets (same values as in step 4).

And.. that's it, the two scheduled workflows pick those up automatically.

Trigger either one manually from the Actions tab first to confirm it works before trusting the schedule.

**Known limitations / possible next steps**

- Sign-out currently locks the day. There is no support for multiple check-in/out cycles (e.g. lunch breaks).
- No admin dashboard yet; attendance history is queryable directly in Supabase's Table Editor, or via the backups/ CSVs, in the meantime.
- GitHub Actions schedules can lag a few minutes and are auto-disabled after 60 days of zero repo activity. Its fine for a daily backup, just worth knowing if the repo goes quiet.
- Recovery is keyed on phone number, which isn't enforced unique in the schema, if two people share a number, recovery returns whichever registered most recently.

---

**CREDITS**

- Built by Oluwatomi Omotoso, as part of my 6 month internship with NUPRC.

- Project scope and idea by Farid Aminu, polished by my supervisor Mr. Musa.

- Project UI and schema definitions polished and upgraded by Claude-code (Thanks a ton Anthropic, this really saved me from sleepless nights).

Cheers!!
