// ============================================================================
// BORROWING_DATA.JS
// Shared by admin_borrowings.js, admin_borrowed.js, admin_returns.js,
// student_requests.js, student_borrowed.js, student_history.js, and their
// teacher equivalents — same reasoning as catalog_data.js: this is business
// logic (what counts as "active", how overdue is computed), not styling.
//
// Every mutation here calls one of the SQL functions from
// 03_borrowing_functions.sql via supabase.rpc(). Reads are plain selects —
// RLS already scopes them correctly (a student's select only ever returns
// their own rows; Admin's is unrestricted).
// ============================================================================

import { supabase } from "./supabase_client.js";
import { logActivity } from "./auth_service.js";

function isOverdue(row) {
  if (row.status === "Overdue") return true;
  if (row.status === "Borrowed" && row.due_date) {
    return new Date(row.due_date) < new Date();
  }
  return false;
}

function shapeBorrowingRow(row) {
  return {
    borrowingId: row.borrowing_id,
    status: row.status,
    requestDate: row.request_date,
    approvalDate: row.approval_date,
    borrowedDate: row.borrowed_date,
    dueDate: row.due_date,
    returnedDate: row.returned_date,
    notes: row.notes,
    bookTitle: row.book_copies?.books?.title || "Untitled",
    bookId: row.book_copies?.books?.book_id,
    accessionNumber: row.book_copies?.accession_number,
    borrowerName: row.profiles?.full_name,
    borrowerRole: row.profiles?.role,
    overdue: isOverdue(row),
  };
}

// ---------------------------------------------------------------------- //
// Mutations — call the SQL functions. Each throws with the function's
// raised exception message (e.g. "borrow_limit_reached") on failure.
// ---------------------------------------------------------------------- //

export async function requestBorrow(bookId) {
  const { data, error } = await supabase.rpc("request_borrow", { p_book_id: bookId });
  if (error) throw error;
  await logActivity("Borrowing request created", `Requested a book (borrowing ${data.borrowing_id}).`).catch(() => {});
  return data;
}

export async function approveRequest(borrowingId) {
  const { data, error } = await supabase.rpc("approve_borrow_request", { p_borrowing_id: borrowingId });
  if (error) throw error;
  await logActivity("Borrowing approved", `Approved borrowing ${borrowingId}.`).catch(() => {});
  return data;
}

export async function rejectRequest(borrowingId, notes = null) {
  const { data, error } = await supabase.rpc("reject_borrow_request", {
    p_borrowing_id: borrowingId,
    p_notes: notes,
  });
  if (error) throw error;
  await logActivity("Borrowing rejected", `Rejected borrowing ${borrowingId}.`).catch(() => {});
  return data;
}

export async function markBorrowed(borrowingId) {
  const { data, error } = await supabase.rpc("mark_borrowed", { p_borrowing_id: borrowingId });
  if (error) throw error;
  await logActivity("Book checked out", `Checked out borrowing ${borrowingId}.`).catch(() => {});
  return data;
}

export async function processReturn(borrowingId) {
  const { data, error } = await supabase.rpc("process_return", { p_borrowing_id: borrowingId });
  if (error) throw error;
  await logActivity("Book returned", `Processed return for borrowing ${borrowingId}.`).catch(() => {});
  return data;
}

/** Turns a raised SQL exception name into a sentence a person can read. */
export function friendlyBorrowingError(error) {
  const code = error?.message || "";
  const map = {
    borrow_limit_reached: "You've reached your borrowing limit. Return a book before requesting another.",
    already_requested: "You already have an active request or loan for this book.",
    no_copies_available: "No copies are available right now. Please check back later.",
    account_not_active: "Your account isn't active. Contact the library admin.",
    role_not_eligible: "This account type can't borrow books.",
    request_not_pending: "That request has already been handled.",
    request_not_approved: "That request hasn't been approved yet.",
    not_currently_borrowed: "That book isn't currently checked out.",
    admin_only: "Only an admin can do that.",
  };
  for (const key of Object.keys(map)) {
    if (code.includes(key)) return map[key];
  }
  return code || "Something went wrong. Please try again.";
}

// ---------------------------------------------------------------------- //
// Reads — plain selects, scoped by RLS automatically.
// ---------------------------------------------------------------------- //

const BORROWING_SELECT = `
  borrowing_id, status, request_date, approval_date, borrowed_date, due_date, returned_date, notes,
  user_id, copy_id,
  book_copies(accession_number, books(book_id, title)),
  profiles!user_id(full_name, role)
`;

/** Current user's borrowings in the given statuses, most recent first. */
export async function fetchMyBorrowings(profileId, statuses) {
  const { data, error } = await supabase
    .from("borrowings")
    .select(BORROWING_SELECT)
    .eq("user_id", profileId)
    .in("status", statuses)
    .order("request_date", { ascending: false });

  if (error) throw error;
  return (data || []).map(shapeBorrowingRow);
}

/** Admin: all borrowings in the given statuses, across every user. */
export async function fetchAllBorrowings(statuses) {
  const { data, error } = await supabase
    .from("borrowings")
    .select(BORROWING_SELECT)
    .in("status", statuses)
    .order("request_date", { ascending: false });

  if (error) throw error;
  return (data || []).map(shapeBorrowingRow);
}

export async function fetchLibrarySettings() {
  const { data, error } = await supabase.from("library_settings").select("*").limit(1).single();
  if (error) throw error;
  return data;
}
