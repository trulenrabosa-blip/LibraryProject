// ============================================================================
// ADMIN_DASHBOARD_DATA.JS
// Real Supabase queries behind admin_dashboard.html's stat cards and charts.
// Kept as its own file (rather than folded into admin_dashboard.js) purely
// for readability — this file is only ever used by admin_dashboard.html.
// ============================================================================

import { supabase } from "./supabase_client.js";

const MS_PER_DAY = 86400000;

function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "short" });
}

/** Returns the last `count` month keys in chronological order, e.g. ["2026-03", ..., "2026-08"]. */
function lastMonthKeys(count) {
  const keys = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKey(d));
  }
  return keys;
}

function isOverdue(borrowing) {
  if (borrowing.status === "Overdue") return true;
  if (borrowing.status === "Borrowed" && borrowing.due_date) {
    return new Date(borrowing.due_date) < new Date();
  }
  return false;
}

/** Top-line stat cards. */
export async function fetchStatCards() {
  const [
    booksTotal,
    copiesAvailable,
    copiesBorrowed,
    studentsTotal,
    teachersTotal,
    pendingRequests,
    overdueBorrowings,
  ] = await Promise.all([
    supabase.from("books").select("*", { count: "exact", head: true }),
    supabase.from("book_copies").select("*", { count: "exact", head: true }).eq("status", "Available"),
    supabase.from("book_copies").select("*", { count: "exact", head: true }).eq("status", "Borrowed"),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "Student"),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "Teacher"),
    supabase.from("borrowings").select("*", { count: "exact", head: true }).eq("status", "Pending"),
    supabase.from("borrowings").select("status, due_date").in("status", ["Borrowed", "Overdue"]),
  ]);

  const errors = [booksTotal, copiesAvailable, copiesBorrowed, studentsTotal, teachersTotal, pendingRequests, overdueBorrowings]
    .map((r) => r.error)
    .filter(Boolean);
  if (errors.length) throw errors[0];

  return {
    totalBooks: booksTotal.count || 0,
    availableBooks: copiesAvailable.count || 0,
    borrowedBooks: copiesBorrowed.count || 0,
    overdueBooks: (overdueBorrowings.data || []).filter(isOverdue).length,
    totalStudents: studentsTotal.count || 0,
    totalTeachers: teachersTotal.count || 0,
    pendingRequests: pendingRequests.count || 0,
  };
}

/** Monthly borrowed vs returned counts, last 6 months. */
export async function fetchMonthlyBorrowingTrend() {
  const keys = lastMonthKeys(6);
  const earliest = new Date();
  earliest.setMonth(earliest.getMonth() - 5, 1);

  const { data, error } = await supabase
    .from("borrowings")
    .select("borrowed_date, returned_date")
    .gte("borrowed_date", earliest.toISOString());
  if (error) throw error;

  const borrowedByMonth = Object.fromEntries(keys.map((k) => [k, 0]));
  const returnedByMonth = Object.fromEntries(keys.map((k) => [k, 0]));

  (data || []).forEach((row) => {
    if (row.borrowed_date) {
      const k = monthKey(row.borrowed_date);
      if (k in borrowedByMonth) borrowedByMonth[k] += 1;
    }
    if (row.returned_date) {
      const k = monthKey(row.returned_date);
      if (k in returnedByMonth) returnedByMonth[k] += 1;
    }
  });

  return {
    labels: keys.map(monthLabel),
    borrowed: keys.map((k) => borrowedByMonth[k]),
    returned: keys.map((k) => returnedByMonth[k]),
  };
}

/** Top 5 most-borrowed book titles of all time. */
export async function fetchMostBorrowedBooks() {
  const { data, error } = await supabase
    .from("borrowings")
    .select("copy_id, book_copies(book_id, books(title))");
  if (error) throw error;

  const counts = new Map();
  (data || []).forEach((row) => {
    const title = row.book_copies?.books?.title;
    if (!title) return;
    counts.set(title, (counts.get(title) || 0) + 1);
  });

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return {
    labels: sorted.map(([title]) => title),
    counts: sorted.map(([, count]) => count),
  };
}

/** Book count per category. */
export async function fetchBooksByCategory() {
  const { data, error } = await supabase.from("books").select("category_id, categories(category_name)");
  if (error) throw error;

  const counts = new Map();
  (data || []).forEach((row) => {
    const name = row.categories?.category_name || "Uncategorized";
    counts.set(name, (counts.get(name) || 0) + 1);
  });

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return { labels: sorted.map(([name]) => name), counts: sorted.map(([, count]) => count) };
}

/** Borrowing counts split Student vs Teacher. */
export async function fetchBorrowingByRole() {
  const { data, error } = await supabase.from("borrowings").select("user_id, profiles!user_id(role)");
  if (error) throw error;

  let students = 0;
  let teachers = 0;
  (data || []).forEach((row) => {
    if (row.profiles?.role === "Student") students += 1;
    else if (row.profiles?.role === "Teacher") teachers += 1;
  });

  return { labels: ["Students", "Teachers"], counts: [students, teachers] };
}

/** New user signups per month, last 6 months. */
export async function fetchNewUsersTrend() {
  const keys = lastMonthKeys(6);
  const earliest = new Date();
  earliest.setMonth(earliest.getMonth() - 5, 1);

  const { data, error } = await supabase
    .from("profiles")
    .select("created_at")
    .gte("created_at", earliest.toISOString());
  if (error) throw error;

  const byMonth = Object.fromEntries(keys.map((k) => [k, 0]));
  (data || []).forEach((row) => {
    const k = monthKey(row.created_at);
    if (k in byMonth) byMonth[k] += 1;
  });

  return { labels: keys.map(monthLabel), counts: keys.map((k) => byMonth[k]) };
}

/** Currently-overdue borrowings, split Student vs Teacher. */
export async function fetchOverdueByRole() {
  const { data, error } = await supabase
    .from("borrowings")
    .select("status, due_date, profiles!user_id(role)")
    .in("status", ["Borrowed", "Overdue"]);
  if (error) throw error;

  let students = 0;
  let teachers = 0;
  (data || []).forEach((row) => {
    if (!isOverdue(row)) return;
    if (row.profiles?.role === "Student") students += 1;
    else if (row.profiles?.role === "Teacher") teachers += 1;
  });

  return { labels: ["Students", "Teachers"], counts: [students, teachers] };
}
