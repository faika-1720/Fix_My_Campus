const $ = (id) => document.getElementById(id);
let token = localStorage.getItem("fmc_token") || "";
let currentUser = null;
let complaints = [];
let toastTimer;

function showToast(message, isError = false) {
  const toast = $("toast");
  toast.textContent = message;
  toast.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.className = "toast", 3000);
}
async function api(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    if (response.status === 401 && token) logout(false);
    throw new Error(data.message || "Something went wrong.");
  }
  return data;
}
function setLoggedIn(user, newToken) {
  currentUser = user;
  token = newToken;
  localStorage.setItem("fmc_token", token);
  $("loginScreen").classList.add("hidden");
  $("appScreen").classList.remove("hidden");
  $("userName").textContent = user.name;
  $("userRole").textContent = user.role;
  $("userAvatar").textContent = user.name.charAt(0).toUpperCase();
  $("topAvatar").textContent = user.name.charAt(0).toUpperCase();
  document.querySelectorAll(".student-only").forEach(el => el.style.display = user.role === "student" ? (el.classList.contains("nav-item") ? "flex" : "inline-flex") : "none");
  document.querySelectorAll(".admin-only").forEach(el => el.style.display = user.role === "admin" ? "flex" : "none");
  $("welcomeTitle").textContent = user.role === "student" ? `Hello, ${user.name.split(" ")[0]}.` : user.role === "staff" ? "Staff workspace." : "Admin overview.";
  $("welcomeText").textContent = user.role === "student" ? "Here’s an update on the complaints you’ve raised." : user.role === "staff" ? "Review campus issues and keep progress moving." : "Monitor campus complaints and manage user access.";
  $("dateLabel").textContent = new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
  goView("dashboard");
  refreshData();
}
function logout(showMessage = true) {
  token = ""; currentUser = null; complaints = [];
  localStorage.removeItem("fmc_token");
  $("appScreen").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
  $("password").value = "";
  if (showMessage) showToast("You have signed out.");
}
function goView(view) {
  const allowed = ["dashboard", "complaints", "new", "users"];
  if (!allowed.includes(view)) view = "dashboard";
  if (view === "new" && currentUser?.role !== "student") view = "dashboard";
  if (view === "users" && currentUser?.role !== "admin") view = "dashboard";
  document.querySelectorAll(".view").forEach(el => el.classList.add("hidden"));
  $(`${view}View`).classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.view === view || (view === "new" && el.dataset.view === "new")));
  const names = {dashboard:"Dashboard",complaints:"Complaints",new:"New complaint",users:"User management"};
  $("pageName").textContent = names[view];
  $("sidebar").classList.remove("open");
  if (view === "complaints") renderComplaints();
  if (view === "users") loadUsers();
}
async function refreshData() {
  try {
    const [dashboard, list] = await Promise.all([api("/api/dashboard"), api("/api/complaints")]);
    const s = dashboard.stats || {};
    $("statTotal").textContent = Number(s.total || 0);
    $("statSubmitted").textContent = Number(s.submitted || 0);
    $("statProgress").textContent = Number(s.inProgress || 0);
    $("statResolved").textContent = Number(s.resolved || 0);
    complaints = list.complaints || [];
    $("navCount").textContent = complaints.length;
    renderRecent();
    renderComplaints();
  } catch (err) { showToast(err.message, true); }
}
function statusClass(status) { return "status-" + status.toLowerCase().replace(/\s+/g, "-"); }
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function formatDate(value) {
  if (!value) return "Just now";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "Recently" : d.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});
}
function complaintCard(c, canUpdate = false) {
  const statusControl = canUpdate ? `<select class="status-select" data-status-id="${c.id}" aria-label="Update complaint status">${["Submitted","In Progress","Resolved","Rejected"].map(s => `<option ${s===c.status?"selected":""}>${s}</option>`).join("")}</select>` : "";
  return `<article class="complaint-card"><div><div class="complaint-title-row"><span class="complaint-title">${esc(c.title)}</span><span class="category-pill">${esc(c.category)}</span></div><div class="complaint-meta"><span>⌖ ${esc(c.location)}</span><span>▦ ${formatDate(c.created_at)}</span>${currentUser.role !== "student" ? `<span>♙ ${esc(c.student_name || "Student")}</span>` : ""}${c.staff_name ? `<span>Assigned: ${esc(c.staff_name)}</span>` : ""}</div><p class="complaint-description">${esc(c.description)}</p></div><div class="complaint-right"><span class="status-pill ${statusClass(c.status)}">${esc(c.status)}</span><span class="priority-pill ${c.priority==="High"?"priority-high":""}">${esc(c.priority)} priority</span>${statusControl}</div></article>`;
}
function renderRecent() {
  const list = $("recentList");
  const recent = complaints.slice(0, 4);
  list.innerHTML = recent.map(c => complaintCard(c, currentUser.role !== "student")).join("");
  $("dashboardEmpty").classList.toggle("hidden", recent.length !== 0);
  bindStatusControls();
}
function renderComplaints() {
  if (!currentUser) return;
  const query = ($("searchComplaints")?.value || "").trim().toLowerCase();
  const status = $("statusFilter")?.value || "";
  const filtered = complaints.filter(c => (!status || c.status === status) && (!query || [c.title,c.description,c.category,c.location,c.student_name].some(v => String(v||"").toLowerCase().includes(query))));
  $("allComplaints").innerHTML = filtered.map(c => complaintCard(c, currentUser.role !== "student")).join("");
  $("complaintsEmpty").classList.toggle("hidden", filtered.length !== 0);
  bindStatusControls();
}
function bindStatusControls() {
  document.querySelectorAll("[data-status-id]").forEach(select => {
    if (select.dataset.bound) return;
    select.dataset.bound = "1";
    select.addEventListener("change", async () => {
      const previous = complaints.find(c => String(c.id) === select.dataset.statusId)?.status;
      select.disabled = true;
      try {
        await api(`/api/complaints/${select.dataset.statusId}`, { method:"PATCH", body:JSON.stringify({status:select.value}) });
        showToast("Complaint status updated.");
        await refreshData();
      } catch (err) { showToast(err.message, true); select.value = previous || "Submitted"; }
      finally { select.disabled = false; }
    });
  });
}
async function loadUsers() {
  try {
    const data = await api("/api/users");
    $("usersList").innerHTML = data.users.map(u => `<article class="user-card"><div class="avatar">${esc(u.name.charAt(0).toUpperCase())}</div><div class="user-card-info"><b>${esc(u.name)}</b><small>${esc(u.email)}</small><small>${esc(u.department || "No department")}</small></div><span class="role-badge">${esc(u.role)}</span></article>`).join("");
  } catch (err) { showToast(err.message, true); }
}

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("loginError").textContent = "";
  $("loginButton").disabled = true;
  $("loginButton").textContent = "Signing in...";
  try {
    const data = await api("/api/login", { method:"POST", body:JSON.stringify({email:$("email").value,password:$("password").value}) });
    setLoggedIn(data.user, data.token);
    showToast(`Welcome, ${data.user.name.split(" ")[0]}!`);
  } catch (err) { $("loginError").textContent = err.message; }
  finally { $("loginButton").disabled = false; $("loginButton").innerHTML = 'Sign in <span>→</span>'; }
});
document.querySelectorAll(".demo-login").forEach(button => button.addEventListener("click", () => {
  $("email").value = button.dataset.email;
  $("password").value = button.dataset.password;
  $("loginForm").requestSubmit();
}));
$("togglePassword").addEventListener("click", () => {
  const input = $("password");
  input.type = input.type === "password" ? "text" : "password";
  $("togglePassword").textContent = input.type === "password" ? "Show" : "Hide";
});
$("logoutButton").addEventListener("click", () => logout());
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => goView(button.dataset.view)));
document.querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => goView(button.dataset.go)));
$("searchComplaints").addEventListener("input", renderComplaints);
$("statusFilter").addEventListener("change", renderComplaints);
$("menuButton").addEventListener("click", () => $("sidebar").classList.toggle("open"));
$("complaintForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("complaintError").textContent = "";
  const button = $("submitComplaint");
  button.disabled = true; button.textContent = "Submitting...";
  const body = {title:$("complaintTitle").value.trim(),description:$("description").value.trim(),category:$("category").value,location:$("location").value.trim(),priority:$("priority").value};
  try {
    await api("/api/complaints", {method:"POST",body:JSON.stringify(body)});
    $("complaintForm").reset();
    $("priority").value = "Medium";
    await refreshData();
    showToast("Your complaint has been submitted.");
    goView("complaints");
  } catch (err) { $("complaintError").textContent = err.message; }
  finally { button.disabled = false; button.innerHTML = 'Submit complaint <span>→</span>'; }
});
$("userForm").addEventListener("submit", async e => {
  e.preventDefault(); $("userError").textContent = "";
  const body = {name:$("newUserName").value.trim(),email:$("newUserEmail").value.trim(),password:$("newUserPassword").value,role:$("newUserRole").value,department:$("newUserDepartment").value.trim()};
  try {
    await api("/api/users",{method:"POST",body:JSON.stringify(body)});
    $("userForm").reset(); showToast("User created successfully."); await loadUsers();
  } catch (err) { $("userError").textContent = err.message; }
});

(async function init() {
  if (!token) return;
  try {
    const data = await api("/api/me");
    setLoggedIn(data.user, token);
  } catch { logout(false); }
})();
