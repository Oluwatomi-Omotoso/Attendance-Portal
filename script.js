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
const regResult = document.getElementById("qrResult"); // reused container, no QR anymore

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
    <div class="text-center mt-8 border-t pt-8">
      <h3 class="text-xl font-bold mb-2">You're all set, ${escapeHtml(fullName)}!</h3>
      <p class="text-gray-600">This device will remember you — head to Quick Check-in next time to sign in with one tap.</p>
    </div>
  `;
}

// ---------------------------------------------------------------
// Quick Check-in (localStorage based, no scanning)
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
      <div class="border-2 border-dashed border-gray-300 rounded-2xl py-8 px-4 sm:py-10 sm:px-6">
        <i class="fas fa-user-slash text-4xl text-gray-300 mb-3"></i>
        <p class="text-gray-600 mb-4">No profile found on this device.</p>
        <button
          id="goRegisterBtn"
          class="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-2xl transition"
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
    <div class="bg-green-500 text-white rounded-2xl sm:rounded-3xl py-8 px-4 sm:py-12 sm:px-8 mb-2">
      <i class="fas fa-check-circle text-4xl sm:text-5xl mb-3"></i>
      <p class="text-lg sm:text-xl font-bold mb-1">Welcome back, ${escapeHtml(stored.full_name)}</p>
      <button
        id="checkInNowBtn"
        class="w-full sm:w-auto mt-4 bg-white text-green-600 font-semibold py-3 px-8 rounded-2xl hover:bg-green-50 transition"
      >
        Check In Now
      </button>
    </div>
    <button id="notYouBtn" class="text-sm text-gray-400 hover:text-gray-600 underline mt-2">
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
    // The database raises a specific "must be on company grounds" message —
    // surface it directly since it's more useful than a generic failure.
    setCheckinMessage(error.message || "Failed to check in. Try again.", false);
    return;
  }

  setCheckinMessage(`Checked in: ${stored.full_name}`, true);
  loadRecentActivity();
}

function setCheckinMessage(text, success) {
  checkinMessage.textContent = text;
  checkinMessage.className = `mt-4 font-medium ${success ? "text-green-600" : "text-red-600"}`;
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
    list.innerHTML = `<p class="text-gray-400 text-sm">No check-ins yet.</p>`;
    return;
  }

  list.innerHTML = data
    .map((row) => {
      const time = new Date(row.scanned_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `
        <div class="bg-gray-50 p-4 rounded-2xl">
          <p class="font-medium">${escapeHtml(row.full_name)}</p>
          <p class="text-sm text-gray-500">Checked in at ${time} • ${escapeHtml(row.unit || "—")}</p>
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
  switchTab(0);
});
