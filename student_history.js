import { requireAuth } from "./auth_service.js";
import { renderStudentShell } from "./student_layout.js";
import { showToast, friendlyError } from "./ui_helpers.js";
import { fetchMyBorrowings } from "./borrowing_data.js";

const profile = await requireAuth(["Student"]);
const { mainEl } = renderStudentShell({ activeKey: "history", profile });

mainEl.innerHTML = `
  <div class="student-welcome">
    <h1>Borrowing History</h1>
    <p>Books you've returned in the past.</p>
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

async function load() {
  const wrap = document.getElementById("wrap");
  try {
    const rows = await fetchMyBorrowings(profile.profile_id, ["Returned"]);
    if (!rows.length) {
      wrap.innerHTML = `<div class="empty-state">No returned books yet.</div>`;
      return;
    }
    wrap.innerHTML = `
      <table class="borrowed-table">
        <thead><tr><th>Title</th><th>Borrowed</th><th>Returned</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r) => `
              <tr>
                <td>${escapeHtml(r.bookTitle)}</td>
                <td>${formatDate(r.borrowedDate)}</td>
                <td>${formatDate(r.returnedDate)}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
  } catch (error) {
    wrap.innerHTML = `<div class="empty-state">Couldn't load your history.</div>`;
    showToast(friendlyError(error), "error");
  }
}

await load();
