// Simple demo “database” using localStorage
const STORAGE_KEYS = {
  MEMBERS: "sjc_hostel_members",
  REPORTS: "sjc_hostel_reports",
};

// Demo users
const USERS = [
  { username: "admin", password: "admin123", role: "admin", name: "Hostel Admin" },
  { username: "member", password: "member123", role: "member", name: "Hostel Member" },
];

let currentUser = null;

/* ---------- Helpers for storage ---------- */
function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveToStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ---------- Members ---------- */
function getMembers() {
  return loadFromStorage(STORAGE_KEYS.MEMBERS, [
    {
      id: 1,
      name: "John Joseph",
      room: "A-101",
      image:
        "https://avatars.dicebear.com/api/initials/JJ.svg?background=%231f2937&radius=50",
    },
    {
      id: 2,
      name: "Mary Stella",
      room: "B-202",
      image:
        "https://avatars.dicebear.com/api/initials/MS.svg?background=%231f2937&radius=50",
    },
  ]);
}

function setMembers(members) {
  saveToStorage(STORAGE_KEYS.MEMBERS, members);
}

/* ---------- Reports ---------- */
function getReports() {
  return loadFromStorage(STORAGE_KEYS.REPORTS, []);
}

function setReports(reports) {
  saveToStorage(STORAGE_KEYS.REPORTS, reports);
}

/* ---------- UI Updates ---------- */
function showElement(id) {
  document.getElementById(id).classList.remove("hidden");
}

function hideElement(id) {
  document.getElementById(id).classList.add("hidden");
}

function renderMembers() {
  const members = getMembers();
  const grid = document.getElementById("members-grid");
  grid.innerHTML = "";

  members.forEach((m) => {
    const card = document.createElement("div");
    card.className = "member-card";

    const img = document.createElement("img");
    img.className = "member-avatar";
    img.src =
      m.image ||
      "https://avatars.dicebear.com/api/initials/" +
        encodeURIComponent(m.name) +
        ".svg?background=%231f2937&radius=50";
    img.alt = m.name;

    const info = document.createElement("div");
    info.className = "member-info";
    const name = document.createElement("h4");
    name.textContent = m.name;
    const room = document.createElement("p");
    room.textContent = "Room: " + m.room;

    info.appendChild(name);
    info.appendChild(room);

    card.appendChild(img);
    card.appendChild(info);
    grid.appendChild(card);
  });

  // update stats
  document.getElementById("stat-members").textContent = members.length;
}

function renderReports() {
  const reports = getReports();
  const body = document.getElementById("reports-body");
  body.innerHTML = "";

  reports.forEach((r) => {
    const tr = document.createElement("tr");

    const tdRoom = document.createElement("td");
    tdRoom.textContent = r.room;

    const tdUser = document.createElement("td");
    tdUser.textContent = r.username;

    const tdDate = document.createElement("td");
    tdDate.textContent = new Date(r.datetime).toLocaleString();

    const tdFile = document.createElement("td");
    tdFile.textContent = r.fileName;

    const tdRemarks = document.createElement("td");
    tdRemarks.textContent = r.remarks || "-";

    tr.appendChild(tdRoom);
    tr.appendChild(tdUser);
    tr.appendChild(tdDate);
    tr.appendChild(tdFile);
    tr.appendChild(tdRemarks);
    body.appendChild(tr);
  });

  // stats
  document.getElementById("stat-reports").textContent = reports.length;

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCount = reports.filter(
    (r) => r.datetime.slice(0, 10) === todayStr
  ).length;
  document.getElementById("stat-today").textContent = todayCount;
}

function updateRoleVisibility() {
  const isAdmin = currentUser?.role === "admin";
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.style.display = isAdmin ? "" : "none";
  });
}

/* ---------- Navigation ---------- */
function switchPage(targetId) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.add("hidden"));

  document.getElementById(targetId).classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.target === targetId);
  });
}

/* ---------- Login ---------- */
function handleLogin(event) {
  event.preventDefault();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  const user = USERS.find(
    (u) => u.username === username && u.password === password
  );

  const errorEl = document.getElementById("login-error");

  if (!user) {
    errorEl.textContent = "Invalid username or password.";
    return;
  }

  currentUser = user;
  errorEl.textContent = "";

  document.getElementById("current-user").textContent =
    user.name + " (" + user.role.toUpperCase() + ")";

  hideElement("login-page");
  showElement("app");

  updateRoleVisibility();
  renderMembers();
  renderReports();
  switchPage("dashboard");
}

function handleLogout() {
  currentUser = null;
  showElement("login-page");
  hideElement("app");
  document.getElementById("login-form").reset();
}

/* ---------- Add Member (admin) ---------- */
function handleAddMember(event) {
  event.preventDefault();
  if (!currentUser || currentUser.role !== "admin") return;

  const name = document.getElementById("member-name").value.trim();
  const room = document.getElementById("member-room").value.trim();
  const image = document.getElementById("member-image").value.trim();

  if (!name || !room) return;

  const members = getMembers();
  const newMember = {
    id: Date.now(),
    name,
    room,
    image: image || null,
  };
  members.push(newMember);
  setMembers(members);
  renderMembers();

  event.target.reset();
}

/* ---------- Submit Report ---------- */
function handleReportSubmit(event) {
  event.preventDefault();
  if (!currentUser) return;

  const room = document.getElementById("report-room").value.trim();
  const datetime = document.getElementById("report-datetime").value;
  const fileInput = document.getElementById("report-file");
  const remarks = document.getElementById("report-remarks").value.trim();

  if (!room || !datetime || !fileInput.files.length) return;

  const fileName = fileInput.files[0].name;

  const reports = getReports();
  reports.unshift({
    id: Date.now(),
    room,
    datetime,
    fileName,
    remarks,
    username: currentUser.username,
  });
  setReports(reports);
  renderReports();

  event.target.reset();
}

/* ---------- Admin clear data ---------- */
function handleClearData() {
  if (!currentUser || currentUser.role !== "admin") return;
  if (!confirm("Are you sure you want to clear all data?")) return;
  localStorage.removeItem(STORAGE_KEYS.MEMBERS);
  localStorage.removeItem(STORAGE_KEYS.REPORTS);
  renderMembers();
  renderReports();
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  // Login
  document
    .getElementById("login-form")
    .addEventListener("submit", handleLogin);
  document
    .getElementById("logout-btn")
    .addEventListener("click", handleLogout);

  // Nav
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      if (target) switchPage(target);
    });
  });

  // Forms
  document
    .getElementById("member-form")
    .addEventListener("submit", handleAddMember);
  document
    .getElementById("report-form")
    .addEventListener("submit", handleReportSubmit);
  document
    .getElementById("clear-data-btn")
    .addEventListener("click", handleClearData);
});