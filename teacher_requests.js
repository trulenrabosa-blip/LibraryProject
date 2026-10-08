import { requireAuth } from "./auth_service.js";
import { renderTeacherShell } from "./teacher_layout.js";
import { showToast, friendlyError } from "./ui_helpers.js";
import { fetchMyBorrowings } from "./borrowing_data.js";

const profile = await requireAuth(["Teacher"]);
const { mainEl } = renderTeacherShell({ activeKey: "requests", profile });

mainEl.innerHTML = `
  <div class="student-welcome">
    <h1>My Requests</h1>
    <p>Borrow requests you've submitted, and where they stand.</p>
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
    const rows = await fetchMyBorrowings(profile.profile_id, ["Pending", "Approved", "Rejected"]);
    if (!rows.length) {
      wrap.innerHTML = `<div class="empty-state">You haven't requested any books yet — try Browse Books.</div>`;
      return;
    }
    wrap.innerHTML = `
      <table class="borrowed-table">
        <thead><tr><th>Title</th><th>Requested</th><th>Status</th></tr></thead>
        <tbody>
          ${rows
            .map((r) => {
              const cls = r.status.toLowerCase();
              return `
                <tr>
                  <td>${escapeHtml(r.bookTitle)}</td>
                  <td>${formatDate(r.requestDate)}</td>
                  <td>
                    <span class="req-status ${cls}">${escapeHtml(r.status)}</span>
                    ${r.status === "Rejected" && r.notes ? `<div class="req-note">${escapeHtml(r.notes)}</div>` : ""}
                    ${r.status === "Approved" ? `<div class="req-note">Visit the library to pick it up.</div>` : ""}
                  </td>
                </tr>`;
            })
            .join("")}
        </tbody>
      </table>`;
  } catch (error) {
    wrap.innerHTML = `<div class="empty-state">Couldn't load your requests.</div>`;
    showToast(friendlyError(error), "error");
  }
}

await load();
