import { requireAuth } from "./auth_service.js";
import { renderStudentShell } from "./student_layout.js";
import { showToast, friendlyError } from "./ui_helpers.js";
import { fetchStudentStats, fetchCurrentBorrowings } from "./student_dashboard_data.js";

const profile = await requireAuth(["Student"]);
const { mainEl } = renderStudentShell({ activeKey: "dashboard", profile });

mainEl.innerHTML = `
  <div class="student-welcome">
    <h1>Welcome, ${escapeHtml(profile.full_name)}</h1>
    <p>Here's where things stand with your account.</p>
  </div>

  <div class="stat-grid" id="stat-grid">
    ${statSkeleton("Currently Borrowed")}
    ${statSkeleton("Due Soon")}
    ${statSkeleton("Overdue")}
    ${statSkeleton("Pending Requests")}
  </div>

  <div class="panel">
    <h3>Currently borrowed</h3>
    <div id="borrowed-wrap"><div class="empty-state"><span class="spinner spinner-dark"></span></div></div>
  </div>
`;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function statSkeleton(label) {
  return `
    <div class="stat-card">
      <div class="stat-card-label">${label}</div>
      <div class="stat-card-value"><span class="spinner spinner-dark"></span></div>
    </div>`;
}

function setStat(grid, index, value, opts = {}) {
  const card = grid.children[index];
  const valueEl = card.querySelector(".stat-card-value");
  valueEl.textContent = value;
  if (opts.warn) valueEl.classList.add("stat-warn");
  if (opts.sub) {
    const sub = document.createElement("div");
    sub.className = "stat-card-sub";
    sub.textContent = opts.sub;
    card.appendChild(sub);
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

async function loadStats() {
  try {
    const s = await fetchStudentStats(profile.profile_id);
    const grid = document.getElementById("stat-grid");
    setStat(grid, 0, s.currentlyBorrowed, { sub: s.borrowLimit ? `of ${s.borrowLimit} allowed` : undefined });
    setStat(grid, 1, s.dueSoon, { warn: s.dueSoon > 0 });
    setStat(grid, 2, s.overdue, { warn: s.overdue > 0 });
    setStat(grid, 3, s.pendingRequests);
  } catch (error) {
    showToast(friendlyError(error), "error");
  }
}

async function loadBorrowedTable() {
  const wrap = document.getElementById("borrowed-wrap");
  try {
    const rows = await fetchCurrentBorrowings(profile.profile_id);
    if (!rows.length) {
      wrap.innerHTML = `<div class="empty-state">You don't have any books checked out right now.</div>`;
      return;
    }
    wrap.innerHTML = `
      <table class="borrowed-table">
        <thead><tr><th>Title</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>
          ${rows
            .map((r) => {
              const badge = r.overdue ? "late" : r.dueSoon ? "soon" : "ok";
              const label = r.overdue ? "Overdue" : r.dueSoon ? "Due soon" : "On time";
              return `
                <tr>
                  <td>${escapeHtml(r.title)}</td>
                  <td>${formatDate(r.dueDate)}</td>
                  <td><span class="due-badge ${badge}">${label}</span></td>
                </tr>`;
            })
            .join("")}
        </tbody>
      </table>`;
  } catch (error) {
    wrap.innerHTML = `<div class="empty-state">Couldn't load your borrowed books.</div>`;
    showToast(friendlyError(error), "error");
  }
}


loadStats();
loadBorrowedTable();
