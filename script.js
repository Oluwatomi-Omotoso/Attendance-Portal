const STORAGE_KEY = "attendance_member";

function switchTab(index) {
  for (let i = 0; i < 3; i++) {
    document
      .getElementById(`screen${i}`)
      .classList.toggle("hidden", i !== index);
    document
      .getElementById(`tab${i}`)
      .classList.toggle("tab-active", i === index);
  }
  if (index === 2) {
    renderCheckinBox();
    loadRecentActivity();
  }
}
window.switchTab = switchTab;

// ---------------------------------------------------------------
// Registration
// ---------------------------------------------------------------
const registrationForm = document.getElementById("registrationForm");
const registerBtn = document.getElementById("registerBtn");
const regResult = document.getElementById("qrResult");

registerBtn.addEventListener("click", async () => {
  const fullName = document.getElementById("fullName").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const unit = document.getElementById("unit").value;
  const role = document.getElementById("role").value.trim();

  if (!fullName) {
    alert("Full name is required.");
    return;
  }

  registerBtn.disabled = true;
  registerBtn.textContent = "Registering...";

  const { data: member, error } = await supabase
    .from("members")
    .insert({ full_name: fullName, phone, unit, role })
    .select()
    .single();

  registerBtn.disabled = false;
  registerBtn.textContent = "Register";

  if (error) {
    console.error(error);
    alert("Something went wrong registering. Please try again.");
    return;
  }

  // Remember this person on this device — this is what makes future
  // check-ins a single tap instead of re-entering details.
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ id: member.id, full_name: member.full_name }),
  );

  registrationForm.reset();
  showRegConfirmation(member.full_name);
});

function showRegConfirmation(fullName) {
  regResult.classList.remove("hidden");
  regResult.innerHTML = `
    <div class="panel-in text-center mt-8 pt-8 border-t border-ink/10">
      <div class="flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-widest text-signal mb-3">
        <span class="status-light on"></span> Registered
      </div>
      <h3 class="font-display text-xl font-bold text-ink mb-2">You're all set, ${escapeHtml(fullName)}!</h3>
      <p class="text-ink/60 text-sm">This device will remember you — head to Quick Check-in next time to sign in with one tap.</p>
    </div>
  `;
}

// ---------------------------------------------------------------
// Quick Check-in (localStorage based, geofenced)
// ---------------------------------------------------------------
const checkinDeviceBox = document.getElementById("checkinDeviceBox");
const checkinMessage = document.getElementById("checkinMessage");

function getStoredMember() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function renderCheckinBox() {
  const stored = getStoredMember();
  checkinMessage.textContent = "";

  if (!stored) {
    checkinDeviceBox.innerHTML = `
      <div class="panel-in border-2 border-dashed border-rust/40 rounded-lg py-8 px-4 sm:py-10 sm:px-6 bg-rust/5">
        <div class="flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-widest text-rust mb-3">
          <span class="status-light error"></span> No Profile On Record
        </div>
        <p class="text-ink/60 mb-4 text-sm">This device hasn't been registered yet.</p>
        <button
          id="goRegisterBtn"
          class="btn-press w-full sm:w-auto bg-brass hover:bg-brass-dark text-navy font-display font-semibold uppercase tracking-wide py-3 px-6 rounded-lg transition text-sm"
        >
          Register Now
        </button>
      </div>
    `;
    document
      .getElementById("goRegisterBtn")
      .addEventListener("click", () => switchTab(1));
    return;
  }

  checkinDeviceBox.innerHTML = `
    <div class="panel-in bg-navy text-paper rounded-lg py-8 px-4 sm:py-10 sm:px-6 mb-3 relative overflow-hidden">
      <div class="absolute top-0 left-0 right-0 h-1 bg-signal"></div>
      <div class="flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-widest text-signal mb-3">
        <span class="status-light on"></span> Ready
      </div>
      <p class="font-display text-lg sm:text-xl font-bold mb-4">Welcome back, ${escapeHtml(stored.full_name)}</p>
      <button
        id="checkInNowBtn"
        class="btn-press w-full sm:w-auto bg-brass hover:bg-brass-dark text-navy font-display font-semibold uppercase tracking-wide py-3 px-8 rounded-lg transition text-sm"
      >
        Check In Now
      </button>
    </div>
    <button id="notYouBtn" class="text-xs font-mono text-ink/40 hover:text-ink/70 underline mt-1 transition-colors">
      Not you? Reset this device
    </button>
  `;

  document
    .getElementById("checkInNowBtn")
    .addEventListener("click", handleCheckIn);
  document.getElementById("notYouBtn").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    renderCheckinBox();
  });
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported on this device."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
    });
  });
}

async function handleCheckIn() {
  const stored = getStoredMember();
  if (!stored) return;

  const btn = document.getElementById("checkInNowBtn");
  btn.disabled = true;
  btn.textContent = "Getting location...";

  let position;
  try {
    position = await getCurrentPosition();
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = "Check In Now";
    const msg =
      err.code === err.PERMISSION_DENIED
        ? "Location permission is required to check in. Please allow it in your browser settings."
        : "Couldn't get your location. Try again.";
    setCheckinMessage(msg, false);
    return;
  }

  btn.textContent = "Checking in...";

  const { error } = await supabase.rpc("log_attendance", {
    p_member_id: stored.id,
    p_lat: position.coords.latitude,
    p_lng: position.coords.longitude,
  });

  btn.disabled = false;
  btn.textContent = "Check In Now";

  if (error) {
    console.error(error);
    setCheckinMessage(error.message || "Failed to check in. Try again.", false);
    return;
  }

  setCheckinMessage(`Checked in: ${stored.full_name}`, true);
  loadRecentActivity();
}

function setCheckinMessage(text, success) {
  checkinMessage.textContent = text;
  checkinMessage.className = `panel-in mt-4 font-mono text-sm ${success ? "text-signal" : "text-rust"}`;
}

// ---------------------------------------------------------------
// Recent Activity list
// ---------------------------------------------------------------
async function loadRecentActivity() {
  const list = document.getElementById("recentActivityList");
  if (!list) return;

  const { data, error } = await supabase
    .from("recent_activity")
    .select("*")
    .limit(5);

  if (error) {
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML = `<p class="text-ink/40 text-sm font-mono">No check-ins yet.</p>`;
    return;
  }

  list.innerHTML = data
    .map((row, i) => {
      const time = new Date(row.scanned_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `
        <div class="item-in bg-white/70 border border-ink/10 p-4 rounded-lg flex items-center justify-between gap-3" style="animation-delay: ${i * 60}ms">
          <div>
            <p class="font-medium text-ink text-sm">${escapeHtml(row.full_name)}</p>
            <p class="text-xs text-ink/50 font-mono">${escapeHtml(row.unit || "—")}</p>
          </div>
          <p class="text-xs font-mono text-ink/40 shrink-0">${time}</p>
        </div>
      `;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", () => {
  // Returning devices (already registered) skip straight to Check-in —
  // that's their one-tap action. Only new devices see Welcome/Register.
  const alreadyRegistered = getStoredMember() !== null;
  switchTab(alreadyRegistered ? 2 : 0);
});
