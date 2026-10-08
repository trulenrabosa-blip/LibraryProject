import { requireAuth } from "./auth_service.js";
import { renderAdminShell } from "./admin_layout.js";
import { showToast, friendlyError } from "./ui_helpers.js";
import {
  fetchBooks,
  filterBooks,
  fetchCategories,
  fetchPublishers,
  fetchAuthors,
  fetchBookDetail,
  createBook,
  updateBook,
  setBookAvailability,
  deleteBook,
  createCopy,
  updateCopy,
  deleteCopy,
  suggestNextAccessionNumber,
} from "./catalog_data.js";

const profile = await requireAuth(["Admin"]);
const { mainEl } = renderAdminShell({ activeKey: "books", title: "Books", profile });

let allBooks = [];
let categories = [];
let publishers = [];
let authors = [];
let editingBookId = null;
let openCopiesBookId = null;

mainEl.innerHTML = `
  <div class="toolbar">
    <input type="text" id="search-input" placeholder="Search title, ISBN, author, publisher…" />
    <select id="category-filter"><option value="">All categories</option></select>
    <select id="availability-filter">
      <option value="">All availability</option>
      <option value="available">Has available copies</option>
      <option value="unavailable">No available copies</option>
    </select>
    <span class="toolbar-spacer"></span>
    <button id="add-book-btn" class="btn btn-primary">+ Add Book</button>
  </div>

  <div class="data-table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          <th></th><th>Title</th><th>Author</th><th>Category</th><th>Publisher</th>
          <th>Available</th><th>Total</th><th>Location</th><th>Status</th><th>Actions</th>
        </tr>
      </thead>
      <tbody id="books-tbody">
        <tr><td colspan="10" class="empty-state"><span class="spinner spinner-dark"></span></td></tr>
      </tbody>
    </table>
  </div>

  <div class="modal-backdrop" id="book-modal">
    <div class="modal-card">
      <h2 id="modal-title">Add Book</h2>
      <div id="modal-alert"></div>
      <form id="book-form" novalidate>
        <div class="form-grid">
          <div class="field field-full">
            <label for="f-title">Title *</label>
            <input type="text" id="f-title" required />
          </div>
          <div class="field field-full">
            <label for="f-subtitle">Subtitle</label>
            <input type="text" id="f-subtitle" />
          </div>
          <div class="field">
            <label for="f-isbn">ISBN</label>
            <input type="text" id="f-isbn" />
          </div>
          <div class="field">
            <label for="f-year">Publication Year</label>
            <input type="number" id="f-year" min="1000" max="2100" />
          </div>
          <div class="field">
            <label for="f-category">Category</label>
            <select id="f-category"><option value="">— None —</option></select>
          </div>
          <div class="field">
            <label for="f-publisher">Publisher</label>
            <select id="f-publisher"><option value="">— None —</option></select>
          </div>
          <div class="field">
            <label for="f-edition">Edition</label>
            <input type="text" id="f-edition" />
          </div>
          <div class="field">
            <label for="f-language">Language</label>
            <input type="text" id="f-language" value="English" />
          </div>
          <div class="field">
            <label for="f-pages">Pages</label>
            <input type="number" id="f-pages" min="1" />
          </div>
          <div class="field">
            <label for="f-status">Availability Status</label>
            <select id="f-status">
              <option value="Available">Available</option>
              <option value="Unavailable">Unavailable</option>
            </select>
          </div>
          <div class="field field-full">
            <label for="f-shelf">Shelf Location</label>
            <input type="text" id="f-shelf" placeholder="e.g. CS-101" />
          </div>
          <div class="field field-full">
            <label for="f-cover">Cover Image URL</label>
            <input type="text" id="f-cover" placeholder="https://…" />
          </div>
          <div class="field field-full">
            <label for="f-description">Description</label>
            <textarea id="f-description" class="field-textarea"></textarea>
          </div>
          <div class="field field-full">
            <label>Authors</label>
            <div class="author-checklist" id="author-checklist"></div>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" id="cancel-modal-btn" class="btn btn-secondary">Cancel</button>
          <button type="submit" id="save-book-btn" class="btn btn-primary">Save Book</button>
        </div>
      </form>
    </div>
  </div>
`;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function optionsHtml(list, valueKey, labelKey, selectedValue) {
  return list
    .map((item) => {
      const value = item[valueKey];
      const selected = value === selectedValue ? "selected" : "";
      return `<option value="${value}" ${selected}>${escapeHtml(item[labelKey])}</option>`;
    })
    .join("");
}

// ---------------------------------------------------------------------- //
// Load lookups (categories/publishers/authors) for filters + the form
// ---------------------------------------------------------------------- //
async function loadLookups() {
  [categories, publishers, authors] = await Promise.all([fetchCategories(), fetchPublishers(), fetchAuthors()]);

  document.getElementById("category-filter").innerHTML +=
    optionsHtml(categories, "category_id", "category_name");
  document.getElementById("f-category").innerHTML += optionsHtml(categories, "category_id", "category_name");
  document.getElementById("f-publisher").innerHTML += optionsHtml(publishers, "publisher_id", "publisher_name");

  document.getElementById("author-checklist").innerHTML = authors
    .map(
      (a) => `
      <label>
        <input type="checkbox" value="${a.author_id}" class="author-checkbox" />
        ${escapeHtml(a.author_name)}
      </label>`
    )
    .join("");
}

// ---------------------------------------------------------------------- //
// Table rendering
// ---------------------------------------------------------------------- //
function currentFilters() {
  return {
    search: document.getElementById("search-input").value,
    categoryId: document.getElementById("category-filter").value,
    availability: document.getElementById("availability-filter").value,
  };
}

function renderTable() {
  const tbody = document.getElementById("books-tbody");
  const filtered = filterBooks(allBooks, currentFilters());

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-state">No books match those filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((book) => {
      const initials = book.title.slice(0, 2).toUpperCase();
      const authorNames = book.authors.map((a) => a.author_name).join(", ") || "—";
      const statusClass = book.availabilityStatus === "Available" ? "available" : "unavailable";
      const copyClass = book.availableCopies === 0 ? "zero" : "";

      return `
        <tr data-book-id="${book.bookId}">
          <td><button class="expand-btn" data-book-id="${book.bookId}" title="Manage copies" style="background:none;border:none;cursor:pointer;font-size:0.9rem;">▸</button></td>
          <td>
            <div class="book-title-cell">
              <div class="book-cover-mini">${escapeHtml(initials)}</div>
              <div>
                <div class="book-title-main">${escapeHtml(book.title)}</div>
                <div class="book-title-sub">${escapeHtml(book.isbn || "No ISBN")}</div>
              </div>
            </div>
          </td>
          <td>${escapeHtml(authorNames)}</td>
          <td>${escapeHtml(book.categoryName)}</td>
          <td>${escapeHtml(book.publisherName)}</td>
          <td><span class="copy-count ${copyClass}">${book.availableCopies}</span></td>
          <td><span class="copy-count">${book.totalCopies}</span></td>
          <td>${escapeHtml(book.shelfLocation || "—")}</td>
          <td><span class="status-badge ${statusClass}">${book.availabilityStatus}</span></td>
          <td>
            <div class="row-actions">
              <button class="edit-btn" data-book-id="${book.bookId}">Edit</button>
              <button class="toggle-btn" data-book-id="${book.bookId}" data-status="${book.availabilityStatus}">
                ${book.availabilityStatus === "Available" ? "Deactivate" : "Reactivate"}
              </button>
              <button class="danger delete-btn" data-book-id="${book.bookId}">Delete</button>
            </div>
          </td>
        </tr>
        <tr class="copies-row" id="copies-row-${book.bookId}" style="display:none;"><td colspan="10"></td></tr>
      `;
    })
    .join("");

  attachRowHandlers();
}

function attachRowHandlers() {
  document.querySelectorAll(".expand-btn").forEach((btn) => {
    btn.addEventListener("click", () => toggleCopies(btn.dataset.bookId, btn));
  });
  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openModal(btn.dataset.bookId));
  });
  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleToggleStatus(btn.dataset.bookId, btn.dataset.status));
  });
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleDelete(btn.dataset.bookId));
  });
}

// ---------------------------------------------------------------------- //
// Copies (expandable per-book panel)
// ---------------------------------------------------------------------- //
async function toggleCopies(bookId, expandBtn) {
  const row = document.getElementById(`copies-row-${bookId}`);
  const isOpen = row.style.display !== "none";

  if (openCopiesBookId && openCopiesBookId !== bookId) {
    const prevRow = document.getElementById(`copies-row-${openCopiesBookId}`);
    if (prevRow) prevRow.style.display = "none";
  }

  if (isOpen) {
    row.style.display = "none";
    openCopiesBookId = null;
    expandBtn.textContent = "▸";
    return;
  }

  row.style.display = "";
  openCopiesBookId = bookId;
  expandBtn.textContent = "▾";
  await renderCopiesPanel(bookId);
}

async function renderCopiesPanel(bookId) {
  const cell = document.querySelector(`#copies-row-${bookId} td`);
  cell.innerHTML = `<div class="empty-state"><span class="spinner spinner-dark"></span></div>`;

  try {
    const [detail, suggestedAccession] = await Promise.all([fetchBookDetail(bookId), suggestNextAccessionNumber()]);
    const copies = detail.book_copies || [];

    cell.innerHTML = `
      ${
        copies.length
          ? `<table class="copies-mini-table">
              <thead><tr><th>Accession #</th><th>Barcode</th><th>Condition</th><th>Status</th><th>Shelf</th><th>Price</th><th></th></tr></thead>
              <tbody>
                ${copies
                  .map(
                    (c) => `
                    <tr data-copy-id="${c.copy_id}">
                      <td>${escapeHtml(c.accession_number)}</td>
                      <td>${escapeHtml(c.barcode || "—")}</td>
                      <td>${escapeHtml(c.condition || "—")}</td>
                      <td>
                        <select class="copy-status-select" data-copy-id="${c.copy_id}">
                          ${["Available", "Borrowed", "Reserved", "Lost", "Damaged", "Under Maintenance"]
                            .map((s) => `<option value="${s}" ${s === c.status ? "selected" : ""}>${s}</option>`)
                            .join("")}
                        </select>
                      </td>
                      <td>${escapeHtml(c.shelf_location || "—")}</td>
                      <td>${c.price ? `₱${Number(c.price).toFixed(2)}` : "—"}</td>
                      <td><button class="danger copy-delete-btn" data-copy-id="${c.copy_id}">Remove</button></td>
                    </tr>`
                  )
                  .join("")}
              </tbody>
            </table>`
          : `<p style="color:var(--ink-soft);font-size:0.86rem;">No physical copies yet — add one below.</p>`
      }

      <form class="add-copy-form" id="add-copy-form-${bookId}">
        <div class="mini-field">
          <label>Accession #</label>
          <input type="text" name="accession_number" value="${escapeHtml(suggestedAccession)}" required />
        </div>
        <div class="mini-field">
          <label>Barcode</label>
          <input type="text" name="barcode" />
        </div>
        <div class="mini-field">
          <label>Condition</label>
          <select name="condition">
            <option>New</option><option>Good</option><option>Fair</option><option>Worn</option>
          </select>
        </div>
        <div class="mini-field">
          <label>Shelf Location</label>
          <input type="text" name="shelf_location" />
        </div>
        <div class="mini-field">
          <label>Price</label>
          <input type="number" name="price" step="0.01" min="0" />
        </div>
        <button type="submit" class="btn btn-primary" style="padding:0.5em 1em;font-size:0.85rem;">+ Add Copy</button>
      </form>
    `;

    cell.querySelectorAll(".copy-status-select").forEach((sel) => {
      sel.addEventListener("change", () => handleCopyStatusChange(sel.dataset.copyId, sel.value, bookId));
    });
    cell.querySelectorAll(".copy-delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => handleCopyDelete(btn.dataset.copyId, bookId));
    });
    document.getElementById(`add-copy-form-${bookId}`).addEventListener("submit", (e) => handleAddCopy(e, bookId));
  } catch (error) {
    cell.innerHTML = `<div class="empty-state">Couldn't load copies.</div>`;
    showToast(friendlyError(error), "error");
  }
}

async function handleCopyStatusChange(copyId, status, bookId) {
  try {
    await updateCopy(copyId, { status });
    showToast("Copy status updated.", "success");
    await refreshBooksKeepFilters();
    await renderCopiesPanel(bookId);
  } catch (error) {
    showToast(friendlyError(error), "error");
  }
}

async function handleCopyDelete(copyId, bookId) {
  if (!confirm("Remove this copy? This can't be undone.")) return;
  try {
    await deleteCopy(copyId);
    showToast("Copy removed.", "success");
    await refreshBooksKeepFilters();
    await renderCopiesPanel(bookId);
  } catch (error) {
    showToast(friendlyError(error), "error");
  }
}

async function handleAddCopy(e, bookId) {
  e.preventDefault();
  const form = e.target;
  const fields = {
    accession_number: form.accession_number.value.trim(),
    barcode: form.barcode.value.trim() || null,
    condition: form.condition.value,
    shelf_location: form.shelf_location.value.trim() || null,
    price: form.price.value ? Number(form.price.value) : null,
    status: "Available",
  };
  try {
    await createCopy(bookId, fields);
    showToast("Copy added.", "success");
    await refreshBooksKeepFilters();
    await renderCopiesPanel(bookId);
  } catch (error) {
    showToast(friendlyError(error), "error");
  }
}

// ---------------------------------------------------------------------- //
// Add / Edit modal
// ---------------------------------------------------------------------- //
function openModal(bookId = null) {
  editingBookId = bookId;
  const form = document.getElementById("book-form");
  form.reset();
  document.getElementById("modal-alert").innerHTML = "";
  document.querySelectorAll(".author-checkbox").forEach((cb) => (cb.checked = false));

  if (bookId) {
    document.getElementById("modal-title").textContent = "Edit Book";
    const book = allBooks.find((b) => b.bookId === bookId);
    if (book) {
      document.getElementById("f-title").value = book.title || "";
      document.getElementById("f-subtitle").value = book.subtitle || "";
      document.getElementById("f-isbn").value = book.isbn || "";
      document.getElementById("f-year").value = book.publicationYear || "";
      document.getElementById("f-category").value = book.categoryId || "";
      document.getElementById("f-publisher").value = book.publisherId || "";
      document.getElementById("f-edition").value = book.edition || "";
      document.getElementById("f-language").value = book.language || "English";
      document.getElementById("f-pages").value = book.pages || "";
      document.getElementById("f-status").value = book.availabilityStatus || "Available";
      document.getElementById("f-shelf").value = book.shelfLocation || "";
      document.getElementById("f-cover").value = book.coverImageUrl || "";
      document.getElementById("f-description").value = book.description || "";
      const authorIds = new Set(book.authors.map((a) => a.author_id));
      document.querySelectorAll(".author-checkbox").forEach((cb) => {
        cb.checked = authorIds.has(cb.value);
      });
    }
  } else {
    document.getElementById("modal-title").textContent = "Add Book";
  }

  document.getElementById("book-modal").classList.add("open");
}

function closeModal() {
  document.getElementById("book-modal").classList.remove("open");
  editingBookId = null;
}

async function handleBookFormSubmit(e) {
  e.preventDefault();
  const alertBox = document.getElementById("modal-alert");
  alertBox.innerHTML = "";

  const title = document.getElementById("f-title").value.trim();
  if (!title) {
    alertBox.innerHTML = `<div class="alert alert-error">Title is required.</div>`;
    return;
  }

  const fields = {
    title,
    subtitle: document.getElementById("f-subtitle").value.trim() || null,
    isbn: document.getElementById("f-isbn").value.trim() || null,
    publication_year: document.getElementById("f-year").value ? Number(document.getElementById("f-year").value) : null,
    category_id: document.getElementById("f-category").value || null,
    publisher_id: document.getElementById("f-publisher").value || null,
    edition: document.getElementById("f-edition").value.trim() || null,
    language: document.getElementById("f-language").value.trim() || "English",
    pages: document.getElementById("f-pages").value ? Number(document.getElementById("f-pages").value) : null,
    availability_status: document.getElementById("f-status").value,
    shelf_location: document.getElementById("f-shelf").value.trim() || null,
    cover_image_url: document.getElementById("f-cover").value.trim() || null,
    description: document.getElementById("f-description").value.trim() || null,
  };

  const authorIds = [...document.querySelectorAll(".author-checkbox:checked")].map((cb) => cb.value);

  const saveBtn = document.getElementById("save-book-btn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  try {
    if (editingBookId) {
      await updateBook(editingBookId, fields, authorIds);
      showToast("Book updated.", "success");
    } else {
      await createBook(fields, authorIds);
      showToast("Book added.", "success");
    }
    closeModal();
    await refreshBooksKeepFilters();
  } catch (error) {
    alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(friendlyError(error))}</div>`;
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Book";
  }
}

async function handleToggleStatus(bookId, currentStatus) {
  const next = currentStatus === "Available" ? "Unavailable" : "Available";
  try {
    await setBookAvailability(bookId, next);
    showToast(`Book marked ${next}.`, "success");
    await refreshBooksKeepFilters();
  } catch (error) {
    showToast(friendlyError(error), "error");
  }
}

async function handleDelete(bookId) {
  if (!confirm("Delete this book permanently? This also removes its copies and borrowing history. This can't be undone.")) return;
  try {
    await deleteBook(bookId);
    showToast("Book deleted.", "success");
    await refreshBooksKeepFilters();
  } catch (error) {
    showToast(friendlyError(error), "error");
  }
}

// ---------------------------------------------------------------------- //
// Data loading
// ---------------------------------------------------------------------- //
async function refreshBooksKeepFilters() {
  try {
    allBooks = await fetchBooks();
    renderTable();
  } catch (error) {
    showToast(friendlyError(error), "error");
  }
}

document.getElementById("add-book-btn").addEventListener("click", () => openModal(null));
document.getElementById("cancel-modal-btn").addEventListener("click", closeModal);
document.getElementById("book-modal").addEventListener("click", (e) => {
  if (e.target.id === "book-modal") closeModal();
});
document.getElementById("book-form").addEventListener("submit", handleBookFormSubmit);
document.getElementById("search-input").addEventListener("input", renderTable);
document.getElementById("category-filter").addEventListener("change", renderTable);
document.getElementById("availability-filter").addEventListener("change", renderTable);

await loadLookups();
await refreshBooksKeepFilters();
