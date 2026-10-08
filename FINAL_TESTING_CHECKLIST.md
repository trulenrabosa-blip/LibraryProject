# Final Testing Checklist

A feature-by-feature walkthrough to run once before considering this ready
for real use — ideally on the deployed URL, not just localhost (see
`DEPLOYMENT.md`'s note on redirect URLs).

Use three separate browser sessions (e.g. one normal window + two
Incognito windows) so you can be signed in as Admin, a Student, and a
Teacher simultaneously and watch actions in one show up for another.

---

## Setup sanity check

- [ ] `supabase_client.js` has real values, not the `YOUR_SUPABASE_...` placeholders
- [ ] All 5 SQL files have been run, in order, with no errors
- [ ] Admin account exists and its `role` is `Admin` in the `profiles` table
- [ ] At least one Student and one Teacher test account exist

## Authentication

- [ ] Register a new Student — lands on Student Dashboard after
- [ ] Register a new Teacher — lands on Teacher Dashboard after
- [ ] Log out, log back in as each of the three roles — each lands on the correct dashboard
- [ ] Visiting `admin_dashboard.html` while signed in as a Student redirects you back to the Student dashboard (not an error page)
- [ ] Forgot password → check email → link lands on `reset_password.html` → set new password → can log in with it
- [ ] Wrong password shows a clear error, not a blank page or console-only error

## Admin — Catalog Management

- [ ] Add a new book with authors, category, publisher — appears in the catalog immediately
- [ ] Edit a book's details — changes persist after refresh
- [ ] Add a physical copy to a book via the expandable copies panel
- [ ] Deactivate a book — its availability badge changes; reactivate — changes back
- [ ] Delete a book with copies — confirm dialog warns about cascading, deletion succeeds
- [ ] Add/edit/delete a category, author, and publisher each
- [ ] Admin → Book Copies shows copies across every book, filterable by status

## Student & Teacher — Browsing

- [ ] Browse Books shows the seeded catalog with cover initials, authors, availability
- [ ] Search by title, ISBN, and author each return correct results
- [ ] Filtering by category and availability works
- [ ] A book with available copies shows "Request to Borrow"; a book with zero shows "Reserve This Book" instead

## Borrowing lifecycle (do this as a Student, watch it as Admin)

- [ ] Request to borrow an available book — appears in Admin → Borrowing Requests → Pending
- [ ] Admin approves it — moves to the Approved tab; Student sees "Approved" in My Requests
- [ ] Admin clicks "Mark as Borrowed" — Student sees it in My Borrowed Books with a due date
- [ ] Try requesting the same book again while already Pending/Approved/Borrowed — blocked with a clear message
- [ ] Try requesting past your borrow limit (check the limit in Admin → Settings) — blocked with a clear message
- [ ] Admin → Returns → process the return — Student sees it move to Borrowing History
- [ ] Manually backdate a `due_date` in the database to yesterday, then process that return — confirm a fine is auto-created and appears in both Admin → Fines and the Student's My Fines

## Reservations (book with 0 available copies)

- [ ] Reserve an unavailable book as a Student — appears in Admin → Reservations → Pending
- [ ] Admin marks it "Ready for Pickup" — Student sees the status change and a notification
- [ ] Admin clicks "Hand Out Book" — a real loan appears in Admin → Borrowed Books, and the reservation shows Completed
- [ ] Cancel a Pending reservation as the Student — disappears from their list

## Fines

- [ ] Admin manually adds a fine to a test account (not tied to a return) — appears in that user's My Fines
- [ ] Mark a fine Paid — status updates for both Admin and the patron
- [ ] Waive a fine — status updates; Reopen brings it back to Unpaid

## Notifications

- [ ] After an approve/reject/checkout/return/reservation action, the affected user has a new notification
- [ ] Unread count badge appears next to "Notifications" in the nav
- [ ] Clicking an unread notification marks it read (badge decrements on next page load)
- [ ] "Mark all as read" clears the badge

## Reports & Activity Logs

- [ ] Admin → Reports shows non-zero numbers matching what you've done above
- [ ] Changing the date range on Reports updates the Borrowing Activity numbers
- [ ] Print Report opens a print preview with the sidebar hidden
- [ ] Admin → Activity Logs shows entries for the book/borrowing/fine/reservation actions performed above, with correct user attribution
- [ ] Filtering Activity Logs by action type works

## Profile & Settings

- [ ] Student/Teacher → Profile: edit name/phone/address, save, refresh — changes persisted
- [ ] Change password on the Profile page — can log in with the new password after
- [ ] Admin → Settings: change the student borrow limit, save, refresh — new value shown
- [ ] Confirm the changed limit actually affects a new borrow request test (Test the "past your borrow limit" case above again with the new number)

## Announcements

- [ ] Add a row to the `announcements` table directly in Supabase (target_role: All, status: Published)
- [ ] It appears on both the Student and Teacher dashboards' announcement panel
- [ ] It also appears in full on Student/Teacher → Announcements

## Cross-cutting

- [ ] No page shows a raw JavaScript error or infinite spinner anywhere in this checklist
- [ ] Every sidebar/nav link on every role leads somewhere — no dead links (already verified programmatically, but worth a manual click-through once)
- [ ] Resize the browser narrow (or use a phone) — sidebar/nav collapses usably on Admin, Student, and Teacher shells
