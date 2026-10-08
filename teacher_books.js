import { requireAuth } from "./auth_service.js";
import { renderTeacherShell } from "./teacher_layout.js";
import { showToast, friendlyError } from "./ui_helpers.js";
import { fetchBooks, filterBooks, fetchCategories } from "./catalog_data.js";
import { requestBorrow, friendlyBorrowingError } from "./borrowing_data.js";

const profile = await requireAuth(["Teacher"]);
const { mainEl } = renderTeacherShell({ activeKey: "books", profile });

let allBooks = [];
let categories = [];

mainEl.innerHTML = `
  <div class="student-welcome">
    <h1>Browse Books</h1>
    <p>Search the catalog and see what's available to borrow.</p>
  </div>

  <div class="catalog-toolbar">
    <input type="text" id="search-input" placeholder="Search title, ISBN, author, publisher…" />
    <select id="category-filter"><option value="">All categories</option></select>
    <select id="availability-filter">
      <option value="">All availability</option>
      <option value="available">Available now</option>
      <option value="unavailable">Currently unavailable</option>
    </select>
  </div>

  <div class="book-grid" id="book-grid">
    <div class="empty-state"><span class="spinner spinner-dark"></span></div>
  </div>

  <div class="modal-backdrop" id="detail-modal">
    <div class="detail-card" id="detail-card"></div>
  </div>
`;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function optionsHtml(list, valueKey, labelKey) {
  return list.map((item) => `<option value="${item[valueKey]}">${escapeHtml(item[labelKey])}</option>`).join("");
}

async function loadLookups() {
  categories = await fetchCategories();
  document.getElementById("category-filter").innerHTML += optionsHtml(categories, "category_id", "category_name");
}

function currentFilters() {
  return {
    search: document.getElementById("search-input").value,
    categoryId: document.getElementById("category-filter").value,
    availability: document.getElementById("availability-filter").value,
  };
}

function renderGrid() {
  const grid = document.getElementById("book-grid");
  const filtered = filterBooks(allBooks, currentFilters());

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No books match those filters.</div>`;
    return;
  }

  grid.innerHTML = filtered
    .map((book) => {
      const initials = book.title.slice(0, 2).toUpperCase();
      const available = book.availableCopies > 0;
      const authorNames = book.authors.map((a) => a.author_name).join(", ") || "Unknown author";

      return `
        <div class="book-card" data-book-id="${book.bookId}">
          <div class="book-card-cover">${escapeHtml(initials)}</div>
          <div class="book-card-title">${escapeHtml(book.title)}</div>
          <div class="book-card-author">${escapeHtml(authorNames)}</div>
          <div class="book-card-footer">
            <span class="category-pill">${escapeHtml(book.categoryName)}</span>
            <span class="avail-pill ${available ? "yes" : "no"}">${available ? `${book.availableCopies} available` : "Unavailable"}</span>
          </div>
        </div>`;
    })
    .join("");

  grid.querySelectorAll(".book-card").forEach((card) => {
    card.addEventListener("click", () => openDetail(card.dataset.bookId));
  });
}

function openDetail(bookId) {
  const book = allBooks.find((b) => b.bookId === bookId);
  if (!book) return;

  const initials = book.title.slice(0, 2).toUpperCase();
  const available = book.availableCopies > 0;
  const authorNames = book.authors.map((a) => a.author_name).join(", ") || "Unknown author";

  document.getElementById("detail-card").innerHTML = `
    <div class="detail-header">
      <div class="detail-cover">${escapeHtml(initials)}</div>
      <div>
        <h2 style="margin-bottom:0.2em;">${escapeHtml(book.title)}</h2>
        ${book.subtitle ? `<p style="color:var(--ink-soft);font-size:0.88rem;margin:0 0 0.4em;">${escapeHtml(book.subtitle)}</p>` : ""}
        <div class="detail-meta">
          By ${escapeHtml(authorNames)}<br />
          ${escapeHtml(book.categoryName)} · ${escapeHtml(book.publisherName)}<br />
          ${book.publicationYear ? `Published ${book.publicationYear}` : ""} ${book.edition ? `· ${escapeHtml(book.edition)} ed.` : ""}<br />
          ISBN ${escapeHtml(book.isbn || "—")} · Shelf ${escapeHtml(book.shelfLocation || "—")}
        </div>
      </div>
    </div>
    ${book.description ? `<p class="detail-description">${escapeHtml(book.description)}</p>` : ""}
    <div class="detail-actions">
      <span class="avail-pill ${available ? "yes" : "no"}">${book.availableCopies} of ${book.totalCopies} copies available</span>
      ${
        available
          ? `<button class="btn btn-primary" id="request-btn">Borrow This Book</button>`
          : `<button class="btn btn-primary" disabled>Currently Unavailable</button>`
      }
    </div>
  `;

  if (available) {
    document.getElementById("request-btn").addEventListener("click", () => handleRequestBorrow(book.bookId));
  }

  document.getElementById("detail-modal").classList.add("open");
}

async function handleRequestBorrow(bookId) {
  const btn = document.getElementById("request-btn");
  btn.disabled = true;
  btn.textContent = "Requesting…";
  try {
    await requestBorrow(bookId);
    showToast("Request submitted — an admin will review it.", "success");
    document.getElementById("detail-modal").classList.remove("open");
    allBooks = await fetchBooks();
    renderGrid();
  } catch (error) {
    showToast(friendlyBorrowingError(error), "error");
    btn.disabled = false;
    btn.textContent = "Borrow This Book";
  }
}


document.getElementById("detail-modal").addEventListener("click", (e) => {
  if (e.target.id === "detail-modal") document.getElementById("detail-modal").classList.remove("open");
});

document.getElementById("search-input").addEventListener("input", renderGrid);
document.getElementById("category-filter").addEventListener("change", renderGrid);
document.getElementById("availability-filter").addEventListener("change", renderGrid);

try {
  await loadLookups();
  allBooks = await fetchBooks();
  renderGrid();
} catch (error) {
  showToast(friendlyError(error), "error");
  document.getElementById("book-grid").innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Couldn't load the catalog.</div>`;
}
