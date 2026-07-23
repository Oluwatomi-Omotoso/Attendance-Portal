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
// Quick Check-in / Sign-out (localStorage based, geofenced)
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

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function attachResetHandler() {
  const btn = document.getElementById("notYouBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    renderCheckinBox();
  });
}

async function renderCheckinBox() {
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
        <p class="text-ink/40 text-xs mt-5 mb-2 font-mono uppercase tracking-wide">Already registered elsewhere?</p>
        <div class="flex flex-col sm:flex-row gap-2">
          <input
            id="recoverPhone"
            type="tel"
            placeholder="Phone number used at registration"
            class="flex-1 px-3 py-2.5 border border-ink/15 bg-white/70 rounded-lg text-sm focus:outline-none focus:border-brass"
          />
          <button
            id="recoverBtn"
            class="btn-press bg-navy hover:bg-navy-panel text-paper font-medium py-2.5 px-4 rounded-lg text-sm transition"
          >
            Find Me
          </button>
        </div>
        <p id="recoverMessage" class="text-xs font-mono mt-2"></p>
      </div>
    `;
    document
      .getElementById("goRegisterBtn")
      .addEventListener("click", () => switchTab(1));
    document
      .getElementById("recoverBtn")
      .addEventListener("click", handleRecover);
    return;
  }

  checkinDeviceBox.innerHTML = `<p class="text-ink/40 text-sm font-mono">Loading status...</p>`;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: todayLogs, error } = await supabase
    .from("attendance_logs")
    .select("type, scanned_at")
    .eq("member_id", stored.id)
    .gte("scanned_at", startOfDay.toISOString())
    .order("scanned_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error(error);
  }

  const latest = todayLogs && todayLogs[0];
  const pastNoon = new Date().getHours() >= 12;

  if (!latest) {
    renderCheckInState(stored);
  } else if (latest.type === "check_in" && !pastNoon) {
    renderWaitingState(stored, latest.scanned_at);
  } else if (latest.type === "check_in" && pastNoon) {
    renderSignOutState(stored);
  } else {
    renderDoneState(stored, latest.scanned_at);
  }
}

function renderCheckInState(stored) {
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
  attachResetHandler();
}

function renderWaitingState(stored, checkInTime) {
  checkinDeviceBox.innerHTML = `
    <div class="panel-in bg-navy text-paper rounded-lg py-8 px-4 sm:py-10 sm:px-6 mb-3 relative overflow-hidden">
      <div class="absolute top-0 left-0 right-0 h-1 bg-brass"></div>
      <div class="flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-widest text-brass mb-3">
        <span class="status-light ready"></span> Checked In
      </div>
      <p class="font-display text-lg sm:text-xl font-bold mb-2">${escapeHtml(stored.full_name)}</p>
      <p class="text-paper/60 text-sm">Checked in at ${formatTime(checkInTime)}. Sign-out opens at 12:00 PM.</p>
    </div>
    <button id="notYouBtn" class="text-xs font-mono text-ink/40 hover:text-ink/70 underline mt-1 transition-colors">
      Not you? Reset this device
    </button>
  `;
  attachResetHandler();
}

function renderSignOutState(stored) {
  checkinDeviceBox.innerHTML = `
    <div class="panel-in bg-navy text-paper rounded-lg py-8 px-4 sm:py-10 sm:px-6 mb-3 relative overflow-hidden">
      <div class="absolute top-0 left-0 right-0 h-1 bg-brass"></div>
      <div class="flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-widest text-brass mb-3">
        <span class="status-light ready"></span> Checked In
      </div>
      <p class="font-display text-lg sm:text-xl font-bold mb-4">${escapeHtml(stored.full_name)}, ready to sign out?</p>
      <button
        id="signOutBtn"
        class="btn-press w-full sm:w-auto bg-brass hover:bg-brass-dark text-navy font-display font-semibold uppercase tracking-wide py-3 px-8 rounded-lg transition text-sm"
      >
        Sign Out
      </button>
    </div>
    <button id="notYouBtn" class="text-xs font-mono text-ink/40 hover:text-ink/70 underline mt-1 transition-colors">
      Not you? Reset this device
    </button>
  `;
  document.getElementById("signOutBtn").addEventListener("click", handleSignOut);
  attachResetHandler();
}

function renderDoneState(stored, signOutTime) {
  checkinDeviceBox.innerHTML = `
    <div class="panel-in bg-navy text-paper rounded-lg py-8 px-4 sm:py-10 sm:px-6 mb-3 relative overflow-hidden">
      <div class="absolute top-0 left-0 right-0 h-1 bg-signal"></div>
      <div class="flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-widest text-signal mb-3">
        <span class="status-light on"></span> Complete
      </div>
      <p class="font-display text-lg sm:text-xl font-bold mb-2">${escapeHtml(stored.full_name)}</p>
      <p class="text-paper/60 text-sm">Signed out at ${formatTime(signOutTime)}. See you tomorrow.</p>
    </div>
    <button id="notYouBtn" class="text-xs font-mono text-ink/40 hover:text-ink/70 underline mt-1 transition-colors">
      Not you? Reset this device
    </button>
  `;
  attachResetHandler();
}

async function handleRecover() {
  const phoneInput = document.getElementById("recoverPhone");
  const msg = document.getElementById("recoverMessage");
  const phone = phoneInput.value.trim();

  if (!phone) {
    msg.textContent = "Enter the phone number you registered with.";
    msg.className = "text-xs font-mono mt-2 text-rust";
    return;
  }

  const btn = document.getElementById("recoverBtn");
  btn.disabled = true;
  btn.textContent = "Searching...";

  const { data, error } = await supabase
    .from("members")
    .select("id, full_name")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1);

  btn.disabled = false;
  btn.textContent = "Find Me";

  if (error || !data || data.length === 0) {
    console.error(error);
    msg.textContent = "No matching registration found. Check the number or register fresh.";
    msg.className = "text-xs font-mono mt-2 text-rust";
    return;
  }

  const member = data[0];
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ id: member.id, full_name: member.full_name }),
  );
  renderCheckinBox();
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

  if (error) {
    console.error(error);
    btn.disabled = false;
    btn.textContent = "Check In Now";
    setCheckinMessage(error.message || "Failed to check in. Try again.", false);
    return;
  }

  setCheckinMessage(`Checked in: ${stored.full_name}`, true);
  renderCheckinBox();
  loadRecentActivity();
}

async function handleSignOut() {
  const stored = getStoredMember();
  if (!stored) return;

  const btn = document.getElementById("signOutBtn");
  btn.disabled = true;
  btn.textContent = "Getting location...";

  let position;
  try {
    position = await getCurrentPosition();
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = "Sign Out";
    const msg =
      err.code === err.PERMISSION_DENIED
        ? "Location permission is required to sign out. Please allow it in your browser settings."
        : "Couldn't get your location. Try again.";
    setCheckinMessage(msg, false);
    return;
  }

  btn.textContent = "Signing out...";

  const { error } = await supabase.rpc("log_signout", {
    p_member_id: stored.id,
    p_lat: position.coords.latitude,
    p_lng: position.coords.longitude,
  });

  if (error) {
    console.error(error);
    btn.disabled = false;
    btn.textContent = "Sign Out";
    setCheckinMessage(error.message || "Failed to sign out. Try again.", false);
    return;
  }

  setCheckinMessage(`Signed out: ${stored.full_name}`, true);
  renderCheckinBox();
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
      const time = formatTime(row.scanned_at);
      const label = row.type === "check_out" ? "Signed out" : "Checked in";
      return `
        <div class="item-in bg-white/70 border border-ink/10 p-4 rounded-lg flex items-center justify-between gap-3" style="animation-delay: ${i * 60}ms">
          <div>
            <p class="font-medium text-ink text-sm">${escapeHtml(row.full_name)}</p>
            <p class="text-xs text-ink/50 font-mono">${label} • ${escapeHtml(row.unit || "—")}</p>
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
