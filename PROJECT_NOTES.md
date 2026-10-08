# Project Notes

## Why some files are shared

The project follows a one-file-per-page convention (`admin_books.html` has
its own `.css` and `.js`, not shared generic ones) — but a small number of
files are deliberately shared across pages, each for a specific reason:

| File | Shared by | Why |
|---|---|---|
| `supabase_client.js` | every page | One Supabase client instance must exist per app — two would cause inconsistent auth state between pages. |
| `auth_service.js` | every page | Sign-in/out/session logic must be one implementation, not copies that could drift out of sync. |
| `ui_helpers.js` | every page | Toast/alert/loading-state helpers, harmless to share, no reason to duplicate. |
| `theme.css` | every page | Genuinely global tokens (colors, type, buttons, form fields) — not one page's look. |
| `admin_layout.js` | every `admin_*.html` | The sidebar is identical across all 17 admin pages. |
| `student_layout.js` / `teacher_layout.js` | every `student_*.html` / `teacher_*.html` | Same reasoning, per role. |
| `admin_dashboard.css` | every `admin_*.html` | Doubles as the admin shell stylesheet (sidebar/topbar/card system), not just the dashboard page's own look — named for where it was first built (Phase 3), not its final scope. |
| `student_dashboard.css` / `teacher_dashboard.css` | every `student_*.html` / `teacher_*.html` | Same double-duty, per role. |
| `catalog_data.js` | admin, student, teacher book pages | The book/copy/category/author/publisher query logic is identical business logic for all three roles. |
| `borrowing_data.js` | admin + student + teacher borrowing pages | Same reasoning — the borrow/approve/reject/checkout/return logic is one implementation calling the SQL functions in `03_borrowing_functions.sql`. |
| `reservation_data.js` | admin + student + teacher reservation pages | Same reasoning, reservations. |
| `fines_data.js` | admin + student + teacher fine pages | Same reasoning, fines. |
| `notifications_data.js` | student + teacher notification pages, both layout files (unread badge) | Same reasoning, notifications. |
| `profile_data.js` | student + teacher profile pages | Same operation (update own profile row) for both roles. |

Everything else — even visually near-identical pages like `login.css` vs
`register.css` — has its own file with its own (sometimes duplicated)
content, by design, to keep each page independently editable.

## Why some business logic lives in SQL functions, not JavaScript

`request_borrow()`, `approve_borrow_request()`, `reject_borrow_request()`,
`mark_borrowed()`, `process_return()` (`03_borrowing_functions.sql`) and
`complete_reservation()` (`04_reservation_functions.sql`) exist because two
things needed to happen atomically that plain client-side JavaScript can't
guarantee:

1. **Claiming one specific copy out of several available ones** has to be
   a single indivisible database operation (`FOR UPDATE SKIP LOCKED`), or
   two people clicking "Borrow" on the last copy at the same instant could
   both succeed.
2. **Changing `book_copies.status`** is something Students/Teachers aren't
   otherwise allowed to do directly (Phase 1 RLS reserves that for Admin) —
   but requesting a book legitimately needs to. `SECURITY DEFINER`
   functions solve this by running with the function owner's privileges
   for that one specific, vetted operation, rather than loosening the
   general RLS policy.

Everything else in the app (categories, authors, publishers, fines,
reservation creation/cancellation, profile updates) is a plain
insert/select/update, because none of those needed either property — the
existing RLS policies were already sufficient.

## Known gaps (as of Phase 12)

Referenced in the sidebar but not fully built:

- **Admin → Users / Students / Teachers**: placeholder pages. A real
  implementation would need list/search/filter, an edit form, and
  activate/deactivate actions — a similar shape to `admin_books.js` but
  for `profiles`. Not built due to scope, not difficulty.
- **Admin → Announcements**: placeholder page for composing/editing.
  The read side (Student/Teacher dashboards and their own Announcements
  pages) is fully built and reads real data — only the admin authoring UI
  is missing.

Fully built despite not having their own numbered phase in the original
12-phase plan: Student/Teacher **Profile** (edit details, change password)
and Admin **Settings** (the `library_settings` form — borrow limits,
durations, fine rate, reservation duration, library info). These were
added in Phase 12 once "final testing" surfaced that the sidebar linked to
them but they didn't exist.

## Design choices worth knowing about

- **Suspended accounts can still read their own data** if their session
  hasn't expired yet (documented in `RLS_TESTING_GUIDE.md`) — deliberate,
  so someone can see why they're suspended (e.g. an unpaid fine) rather
  than losing access to that information too.
- **Reservations are book-level, not copy-level** (no `copy_id` column on
  `reservations`) — "Ready for Pickup" is a staff signal, not a hard
  database lock on one physical copy, until `complete_reservation()` runs
  and actually claims one.
- **Book deletion is a hard delete**, cascading to that book's copies and
  borrowing history via foreign keys — the UI warns about this in its
  confirmation dialog. Deactivating (setting `availability_status`) is the
  non-destructive alternative and is the primary action offered.
