import { requireAuth } from "./auth_service.js";
import { renderAdminShell } from "./admin_layout.js";
import { showToast, friendlyError } from "./ui_helpers.js";
import { fetchAllCopies, updateCopy, deleteCopy } from "./catalog_data.js";

const profile = await requireAuth(["Admin"]);
const { mainEl } = renderAdminShell({ activeKey: "copies", title: "Book Copies", profile });

let allCopies = [];
const STATUSES = ["Available", "Borrowed", "Reserved", "Lost", "Damaged", "Under Maintenance"];

mainEl.innerHTML = `
  <div class="toolbar">
    <input type="text" id="search-input" placeholder="Search by book title, accession #, or barcode…" />
    <select id="status-filter">
      <option value="">All statuses</option>
      ${STATUSES.map((s) => `<option value="${s}">${s}</option>`).join("")}
    </select>
  </div>

  <div class="data-table-wrap">
    <table class="data-table">
      <thead>
        <tr><th>Book</th><th>Accession #</th><th>Barcode</th><th>Condition</th><th>Shelf</th><th>Status</th><th></th></tr>
      </thead>
      <tbody id="tbody"><tr><td colspan="7" class="empty-state"><span class="spinner spinner-dark"></span></td></tr></tbody>
    </table>
  </div>
`;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function currentFilters() {
  return {
    search: document.getElementById("search-input").value.trim().toLowerCase(),
    status: document.getElementById("status-filter").value,
  };
}

function render() {
  const { search, status } = currentFilters();
  const tbody = document.getElementById("tbody");

  const filtered = allCopies.filter((c) => {
    if (status && c.status !== status) return false;
    if (search) {
      const haystack = `${c.bookTitle} ${c.accessionNumber} ${c.barcode || ""} ${c.bookIsbn}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No copies match those filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map(
      (c) => `
      <tr data-copy-id="${c.copyId}">
        <td>${escapeHtml(c.bookTitle)}</td>
        <td>${escapeHtml(c.accessionNumber)}</td>
        <td>${escapeHtml(c.barcode || "—")}</td>
        <td>${escapeHtml(c.condition || "—")}</td>
        <td>${escapeHtml(c.shelfLocation || "—")}</td>
        <td>
          <select class="status-select" data-copy-id="${c.copyId}">
            ${STATUSES.map((s) => `<option value="${s}" ${s === c.status ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </td>
        <td class="row-actions"><button class="delete-btn" data-copy-id="${c.copyId}">Remove</button></td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll(".status-select").forEach((sel) => {
    sel.addEventListener("change", () => handleStatusChange(sel.dataset.copyId, sel.value));
  });
  tbody.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleDelete(btn.dataset.copyId));
  });
}

async function load() {
  try {
    allCopies = await fetchAllCopies();
    render();
  } catch (error) {
    showToast(friendlyError(error), "error");
  }
}

async function handleStatusChange(copyId, status) {
  try {
    await updateCopy(copyId, { status });
    const copy = allCopies.find((c) => c.copyId === copyId);
    if (copy) copy.status = status;
    showToast("Copy status updated.", "success");
  } catch (error) {
    showToast(friendlyError(error), "error");
    await load();
  }
}

async function handleDelete(copyId) {
  if (!confirm("Remove this copy? This can't be undone.")) return;
  try {
    await deleteCopy(copyId);
    showToast("Copy removed.", "success");
    await load();
  } catch (error) {
    showToast(friendlyError(error), "error");
  }
}

document.getElementById("search-input").addEventListener("input", render);
document.getElementById("status-filter").addEventListener("change", render);

await load();
