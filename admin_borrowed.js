import { requireAuth } from "./auth_service.js";
import { renderAdminShell } from "./admin_layout.js";
import { showToast } from "./ui_helpers.js";
import { fetchAllBorrowings, friendlyBorrowingError } from "./borrowing_data.js";

const profile = await requireAuth(["Admin"]);
const { mainEl } = renderAdminShell({ activeKey: "borrowed", title: "Borrowed Books", profile });

let allRows = [];

mainEl.innerHTML = `
  <div class="toolbar">
    <input type="text" id="search-input" placeholder="Search by book title or borrower name…" />
  </div>

  <div class="data-table-wrap">
    <table class="data-table">
      <thead><tr><th>Book</th><th>Borrower</th><th>Copy #</th><th>Borrowed</th><th>Due</th><th>Status</th></tr></thead>
      <tbody id="tbody"><tr><td colspan="6" class="empty-state"><span class="spinner spinner-dark"></span></td></tr></tbody>
    </table>
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
  const diffDays = (new Date(row.dueDate) - new Date()) / 86400000;
  return diffDays <= 3;
}

function render() {
  const q = document.getElementById("search-input").value.trim().toLowerCase();
  const tbody = document.getElementById("tbody");
  const filtered = q
    ? allRows.filter((r) => `${r.bookTitle} ${r.borrowerName}`.toLowerCase().includes(q))
    : allRows;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No active loans match that search.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((r) => {
      const badge = r.overdue ? "late" : dueSoon(r) ? "soon" : "ok";
      const label = r.overdue ? "Overdue" : dueSoon(r) ? "Due soon" : "On time";
      return `
        <tr>
          <td>${escapeHtml(r.bookTitle)}</td>
          <td>${escapeHtml(r.borrowerName)} <span class="role-tag">${escapeHtml(r.borrowerRole)}</span></td>
          <td>${escapeHtml(r.accessionNumber || "—")}</td>
          <td>${formatDate(r.borrowedDate)}</td>
          <td>${formatDate(r.dueDate)}</td>
          <td><span class="due-badge ${badge}">${label}</span></td>
        </tr>`;
    })
    .join("");
}

async function load() {
  try {
    allRows = await fetchAllBorrowings(["Borrowed", "Overdue"]);
    render();
  } catch (error) {
    showToast(friendlyBorrowingError(error), "error");
  }
}

document.getElementById("search-input").addEventListener("input", render);

await load();
