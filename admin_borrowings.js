import { requireAuth } from "./auth_service.js";
import { renderAdminShell } from "./admin_layout.js";
import { showToast } from "./ui_helpers.js";
import { fetchAllBorrowings, approveRequest, rejectRequest, markBorrowed, friendlyBorrowingError } from "./borrowing_data.js";

const profile = await requireAuth(["Admin"]);
const { mainEl } = renderAdminShell({ activeKey: "borrowings", title: "Borrowing Requests", profile });

let activeTab = "Pending";
let rows = { Pending: [], Approved: [] };

mainEl.innerHTML = `
  <div class="tab-row">
    <button class="tab-btn active" data-tab="Pending" id="tab-pending">Pending Approval <span class="count" id="count-pending"></span></button>
    <button class="tab-btn" data-tab="Approved" id="tab-approved">Approved — Awaiting Pickup <span class="count" id="count-approved"></span></button>
  </div>

  <div class="data-table-wrap">
    <table class="data-table">
      <thead>
        <tr><th>Requested</th><th>Book</th><th>Borrower</th><th>Copy #</th><th>Actions</th></tr>
      </thead>
      <tbody id="tbody"><tr><td colspan="5" class="empty-state"><span class="spinner spinner-dark"></span></td></tr></tbody>
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

function render() {
  const tbody = document.getElementById("tbody");
  const list = rows[activeTab];

  document.getElementById("count-pending").textContent = `(${rows.Pending.length})`;
  document.getElementById("count-approved").textContent = `(${rows.Approved.length})`;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Nothing here right now.</td></tr>`;
    return;
  }

  tbody.innerHTML = list
    .map((r) => {
      const actions =
        activeTab === "Pending"
          ? `<button class="primary approve-btn" data-id="${r.borrowingId}">Approve</button>
             <button class="danger reject-btn" data-id="${r.borrowingId}">Reject</button>`
          : `<button class="primary checkout-btn" data-id="${r.borrowingId}">Mark as Borrowed</button>`;

      return `
        <tr>
          <td>${formatDate(r.requestDate)}</td>
          <td>${escapeHtml(r.bookTitle)}</td>
          <td>${escapeHtml(r.borrowerName)} <span class="role-tag">${escapeHtml(r.borrowerRole)}</span></td>
          <td>${escapeHtml(r.accessionNumber || "—")}</td>
          <td class="row-actions">${actions}</td>
        </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".approve-btn").forEach((btn) => btn.addEventListener("click", () => handleApprove(btn.dataset.id)));
  tbody.querySelectorAll(".reject-btn").forEach((btn) => btn.addEventListener("click", () => handleReject(btn.dataset.id)));
  tbody.querySelectorAll(".checkout-btn").forEach((btn) => btn.addEventListener("click", () => handleCheckout(btn.dataset.id)));
}

async function load() {
  try {
    const [pending, approved] = await Promise.all([
      fetchAllBorrowings(["Pending"]),
      fetchAllBorrowings(["Approved"]),
    ]);
    rows.Pending = pending;
    rows.Approved = approved;
    render();
  } catch (error) {
    showToast(friendlyBorrowingError(error), "error");
  }
}

async function handleApprove(id) {
  try {
    await approveRequest(id);
    showToast("Request approved.", "success");
    await load();
  } catch (error) {
    showToast(friendlyBorrowingError(error), "error");
  }
}

async function handleReject(id) {
  const notes = prompt("Optional note for the borrower (why it's being declined):", "");
  if (notes === null) return; // cancelled
  try {
    await rejectRequest(id, notes || null);
    showToast("Request rejected.", "success");
    await load();
  } catch (error) {
    showToast(friendlyBorrowingError(error), "error");
  }
}

async function handleCheckout(id) {
  try {
    await markBorrowed(id);
    showToast("Marked as borrowed — due date set.", "success");
    await load();
  } catch (error) {
    showToast(friendlyBorrowingError(error), "error");
  }
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    activeTab = btn.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
    render();
  });
});

await load();
