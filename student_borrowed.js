import { requireAuth } from "./auth_service.js";
import { renderStudentShell } from "./student_layout.js";
import { showToast, friendlyError } from "./ui_helpers.js";
import { fetchMyBorrowings } from "./borrowing_data.js";

const profile = await requireAuth(["Student"]);
const { mainEl } = renderStudentShell({ activeKey: "borrowed", profile });

mainEl.innerHTML = `
  <div class="student-welcome">
    <h1>My Borrowed Books</h1>
    <p>Everything currently checked out to you.</p>
  </div>
  <div class="panel">
    <div id="wrap"><div class="empty-state"><span class="spinner spinner-dark"></span></div></div>
  </div>
`;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
}

function dueSoon(row) {
  if (row.overdue || !row.dueDate) return false;
  return (new Date(row.dueDate) - new Date()) / 86400000 <= 3;
}

async function load() {
  const wrap = document.getElementById("wrap");
  try {
    const rows = await fetchMyBorrowings(profile.profile_id, ["Borrowed", "Overdue"]);
    if (!rows.length) {
      wrap.innerHTML = `<div class="empty-state">You don't have any books checked out right now.</div>`;
      return;
    }
    wrap.innerHTML = `
      <table class="borrowed-table">
        <thead><tr><th>Title</th><th>Borrowed</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>
          ${rows
            .map((r) => {
              const badge = r.overdue ? "late" : dueSoon(r) ? "soon" : "ok";
              const label = r.overdue ? "Overdue" : dueSoon(r) ? "Due soon" : "On time";
              return `
                <tr>
                  <td>${escapeHtml(r.bookTitle)}</td>
                  <td>${formatDate(r.borrowedDate)}</td>
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

await load();
