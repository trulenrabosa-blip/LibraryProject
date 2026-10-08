// ============================================================================
// TEACHER_DASHBOARD_DATA.JS
// Every function queries Supabase directly. RLS already restricts
// borrowings to rows the signed-in user owns, so no
// extra filtering is needed for security — only for shaping the data.
// Structurally identical to student_dashboard_data.js, except stats pull
// the teacher borrow limit and announcements target Teachers instead of
// Students — teachers get their own configurable limits per the spec.
// ============================================================================

import { supabase } from "./supabase_client.js";

function isOverdue(row) {
  if (row.status === "Overdue") return true;
  if (row.status === "Borrowed" && row.due_date) {
    return new Date(row.due_date) < new Date();
  }
  return false;
}

function isDueSoon(row, withinDays = 3) {
  if (row.status !== "Borrowed" || !row.due_date) return false;
  const due = new Date(row.due_date);
  const now = new Date();
  if (due < now) return false;
  const diffDays = (due - now) / 86400000;
  return diffDays <= withinDays;
}

/** Stat cards for the dashboard header. */
export async function fetchTeacherStats(profileId) {
  const [borrowings, settings] = await Promise.all([
    supabase.from("borrowings").select("status, due_date").eq("user_id", profileId),
    supabase.from("library_settings").select("teacher_borrow_limit").limit(1).single(),
  ]);

  if (borrowings.error) throw borrowings.error;

  const rows = borrowings.data || [];

  return {
    currentlyBorrowed: rows.filter((r) => r.status === "Borrowed").length,
    dueSoon: rows.filter((r) => isDueSoon(r)).length,
    overdue: rows.filter(isOverdue).length,
    pendingRequests: rows.filter((r) => r.status === "Pending").length,
    borrowLimit: settings.data?.teacher_borrow_limit ?? null,
  };
}

/** Currently-borrowed books with due dates, for the dashboard table. */
export async function fetchCurrentBorrowings(profileId) {
  const { data, error } = await supabase
    .from("borrowings")
    .select("borrowing_id, due_date, status, book_copies(books(title, cover_image_url))")
    .eq("user_id", profileId)
    .eq("status", "Borrowed")
    .order("due_date", { ascending: true });

  if (error) throw error;

  return (data || []).map((row) => ({
    borrowingId: row.borrowing_id,
    title: row.book_copies?.books?.title || "Untitled",
    dueDate: row.due_date,
    overdue: isOverdue(row),
    dueSoon: isDueSoon(row),
  }));
}
