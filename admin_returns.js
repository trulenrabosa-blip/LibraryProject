import { requireAuth } from "./auth_service.js";
import { renderAdminShell } from "./admin_layout.js";
import { showToast } from "./ui_helpers.js";
import { fetchAllBorrowings, processReturn, friendlyBorrowingError } from "./borrowing_data.js";

const profile = await requireAuth(["Admin"]);
const { mainEl } = renderAdminShell({ activeKey: "returns", title: "Returns", profile });

let activeLoans = [];
let recentlyReturned = [];

mainEl.innerHTML = `
  <h3 class="section-heading">Process a return</h3>
  <div class="toolbar">
    <input type="text" id="search-input" placeholder="Search by book title or borrower name…" />
  </div>
  <div class="data-table-wrap">
    <table class="data-table">
      <thead><tr><th>Book</th><th>Borrower</th><th>Copy #</th><th>Due</th><th>Status</th><th></th></tr></thead>
      <tbody id="active-tbody"><tr><td colspan="6" class="empty-state"><span class="spinner spinner-dark"></span></td></tr></tbody>
    </table>
  </div>

  <h3 class="section-heading">Recently returned</h3>
  <div class="data-table-wrap">
    <table class="data-table">
      <thead><tr><th>Book</th><th>Borrower</th><th>Returned</th></tr></thead>
      <tbody id="returned-tbody"><tr><td colspan="3" class="empty-state"><span class="spinner spinner-dark"></span></td></tr></tbody>
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

function renderActive() {
  const q = document.getElementById("search-input").value.trim().toLowerCase();
  const tbody = document.getElementById("active-tbody");
  const filtered = q
    ? activeLoans.filter((r) => `${r.bookTitle} ${r.borrowerName}`.toLowerCase().includes(q))
    : activeLoans;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Nothing currently checked out matches that search.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.bookTitle)}</td>
        <td>${escapeHtml(r.borrowerName)} <span class="role-tag">${escapeHtml(r.borrowerRole)}</span></td>
        <td>${escapeHtml(r.accessionNumber || "—")}</td>
        <td>${formatDate(r.dueDate)}</td>
        <td><span class="due-badge ${r.overdue ? "late" : "ok"}">${r.overdue ? "Overdue" : "On time"}</span></td>
        <td class="row-actions"><button class="return-btn" data-id="${r.borrowingId}">Process Return</button></td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll(".return-btn").forEach((btn) => btn.addEventListener("click", () => handleReturn(btn.dataset.id)));
}

function renderReturned() {
  const tbody = document.getElementById("returned-tbody");
  if (!recentlyReturned.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-state">No returns yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = recentlyReturned
    .slice(0, 15)
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.bookTitle)}</td>
        <td>${escapeHtml(r.borrowerName)} <span class="role-tag">${escapeHtml(r.borrowerRole)}</span></td>
        <td>${formatDate(r.returnedDate)}</td>
      </tr>`
    )
    .join("");
}

async function load() {
  try {
    const [active, returned] = await Promise.all([
      fetchAllBorrowings(["Borrowed", "Overdue"]),
      fetchAllBorrowings(["Returned"]),
    ]);
    activeLoans = active;
    recentlyReturned = returned.sort((a, b) => new Date(b.returnedDate) - new Date(a.returnedDate));
    renderActive();
    renderReturned();
  } catch (error) {
    showToast(friendlyBorrowingError(error), "error");
  }
}

async function handleReturn(id) {
  try {
    await processReturn(id);
    showToast("Return processed.", "success");
    await load();
  } catch (error) {
    showToast(friendlyBorrowingError(error), "error");
  }
}

document.getElementById("search-input").addEventListener("input", renderActive);

await load();
