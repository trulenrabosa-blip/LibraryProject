// ============================================================================
// CATALOG_DATA.JS
// Shared by admin_books.js, student_books.js, and teacher_books.js — the
// query for "books with their category, publisher, authors, and copy
// counts" is identical business logic for all three roles, not page styling,
// so it lives here once rather than being copied three times (same
// reasoning as auth_service.js being shared). Mutation functions
// (create/update/delete) are only ever called from admin pages — RLS
// enforces that at the database level regardless.
// ============================================================================

import { supabase } from "./supabase_client.js";
import { logActivity } from "./auth_service.js";

/** All categories, sorted by name — used for filter dropdowns and the admin form. */
export async function fetchCategories() {
  const { data, error } = await supabase.from("categories").select("*").order("category_name");
  if (error) throw error;
  return data || [];
}

/** All publishers, sorted by name. */
export async function fetchPublishers() {
  const { data, error } = await supabase.from("publishers").select("*").order("publisher_name");
  if (error) throw error;
  return data || [];
}

/** All authors, sorted by name. */
export async function fetchAuthors() {
  const { data, error } = await supabase.from("authors").select("*").order("author_name");
  if (error) throw error;
  return data || [];
}

/**
 * All books shaped for display: category/publisher names flattened, authors
 * as a name array, and copy counts computed from the embedded copies list.
 * No server-side filtering — the catalog is small enough (tens of books) to
 * fetch once and filter client-side with filterBooks(), same approach as
 * the admin dashboard's chart data.
 */
export async function fetchBooks() {
  const { data, error } = await supabase.from("books").select(`
    book_id, isbn, title, subtitle, description, cover_image_url, shelf_location,
    availability_status, publication_year, edition, language, pages,
    category_id, publisher_id,
    categories(category_name),
    publishers(publisher_name),
    book_authors(authors(author_id, author_name)),
    book_copies(copy_id, status)
  `);
  if (error) throw error;

  return (data || []).map((row) => ({
    bookId: row.book_id,
    isbn: row.isbn,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    coverImageUrl: row.cover_image_url,
    shelfLocation: row.shelf_location,
    availabilityStatus: row.availability_status,
    publicationYear: row.publication_year,
    edition: row.edition,
    language: row.language,
    pages: row.pages,
    categoryId: row.category_id,
    publisherId: row.publisher_id,
    categoryName: row.categories?.category_name || "Uncategorized",
    publisherName: row.publishers?.publisher_name || "—",
    authors: (row.book_authors || []).map((ba) => ba.authors).filter(Boolean),
    totalCopies: (row.book_copies || []).length,
    availableCopies: (row.book_copies || []).filter((c) => c.status === "Available").length,
  }));
}

/** Client-side filter over the shape fetchBooks() returns. */
export function filterBooks(books, { search = "", categoryId = "", availability = "", year = "" } = {}) {
  const q = search.trim().toLowerCase();

  return books.filter((book) => {
    if (q) {
      const haystack = [
        book.title,
        book.isbn,
        book.publisherName,
        ...book.authors.map((a) => a.author_name),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (categoryId && book.categoryId !== categoryId) return false;
    if (availability === "available" && book.availableCopies < 1) return false;
    if (availability === "unavailable" && book.availableCopies > 0) return false;
    if (year && String(book.publicationYear) !== String(year)) return false;
    return true;
  });
}

/** Single book with its full copy list — used by the admin's copy manager and book detail views. */
export async function fetchBookDetail(bookId) {
  const { data, error } = await supabase
    .from("books")
    .select(`
      book_id, isbn, title, subtitle, description, cover_image_url, shelf_location,
      availability_status, publication_year, edition, language, pages,
      category_id, publisher_id,
      book_authors(author_id),
      book_copies(copy_id, accession_number, barcode, condition, status, shelf_location, acquisition_date, price)
    `)
    .eq("book_id", bookId)
    .single();

  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------- //
// Mutations — admin only. RLS rejects these for Student/Teacher regardless
// of what the UI shows, but pages should only expose them to Admin.
// ---------------------------------------------------------------------- //

export async function createBook(fields, authorIds = []) {
  const { data, error } = await supabase.from("books").insert(fields).select().single();
  if (error) throw error;

  if (authorIds.length) {
    const rows = authorIds.map((author_id) => ({ book_id: data.book_id, author_id }));
    const { error: linkError } = await supabase.from("book_authors").insert(rows);
    if (linkError) throw linkError;
  }

  await logActivity("Book added", `Added "${fields.title}" to the catalog.`).catch(() => {});
  return data;
}

export async function updateBook(bookId, fields, authorIds = []) {
  const { error } = await supabase.from("books").update(fields).eq("book_id", bookId);
  if (error) throw error;

  const { error: clearError } = await supabase.from("book_authors").delete().eq("book_id", bookId);
  if (clearError) throw clearError;

  if (authorIds.length) {
    const rows = authorIds.map((author_id) => ({ book_id: bookId, author_id }));
    const { error: linkError } = await supabase.from("book_authors").insert(rows);
    if (linkError) throw linkError;
  }

  await logActivity("Book updated", `Updated "${fields.title}".`).catch(() => {});
}

export async function setBookAvailability(bookId, status) {
  const { error } = await supabase.from("books").update({ availability_status: status }).eq("book_id", bookId);
  if (error) throw error;
}

/** Hard delete — cascades to that book's copies and any borrowing history via FK. Use sparingly. */
export async function deleteBook(bookId) {
  const { data: book } = await supabase.from("books").select("title").eq("book_id", bookId).single();
  const { error } = await supabase.from("books").delete().eq("book_id", bookId);
  if (error) throw error;

  await logActivity("Book deleted", `Deleted "${book?.title || bookId}" from the catalog.`).catch(() => {});
}

export async function createCopy(bookId, fields) {
  const { data, error } = await supabase
    .from("book_copies")
    .insert({ ...fields, book_id: bookId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCopy(copyId, fields) {
  const { error } = await supabase.from("book_copies").update(fields).eq("copy_id", copyId);
  if (error) throw error;
}

export async function deleteCopy(copyId) {
  const { error } = await supabase.from("book_copies").delete().eq("copy_id", copyId);
  if (error) throw error;
}

/** Every copy across every book, for the admin's global Book Copies page. */
export async function fetchAllCopies() {
  const { data, error } = await supabase
    .from("book_copies")
    .select("copy_id, accession_number, barcode, condition, status, shelf_location, acquisition_date, price, book_id, books(title, isbn)")
    .order("accession_number");
  if (error) throw error;

  return (data || []).map((row) => ({
    copyId: row.copy_id,
    accessionNumber: row.accession_number,
    barcode: row.barcode,
    condition: row.condition,
    status: row.status,
    shelfLocation: row.shelf_location,
    acquisitionDate: row.acquisition_date,
    price: row.price,
    bookId: row.book_id,
    bookTitle: row.books?.title || "Unknown",
    bookIsbn: row.books?.isbn || "",
  }));
}

/** Suggests the next accession number (ACC-00034 style) based on the current highest one. */
export async function suggestNextAccessionNumber() {
  const { data, error } = await supabase
    .from("book_copies")
    .select("accession_number")
    .order("accession_number", { ascending: false })
    .limit(1);
  if (error) throw error;

  const last = data?.[0]?.accession_number;
  const match = last && last.match(/(\d+)$/);
  const nextNum = match ? parseInt(match[1], 10) + 1 : 1;
  return `ACC-${String(nextNum).padStart(4, "0")}`;
}
