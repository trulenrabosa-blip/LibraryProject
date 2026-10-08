-- ============================================================================
-- LIBRARY MANAGEMENT SYSTEM — PHASE 11: RLS HARDENING
-- Run this once, after 01/02/03/04, in the Supabase SQL Editor.
--
-- This isn't a new feature — it closes two gaps found by re-reading every
-- RLS policy from Phase 1 against every code path added since. Both are
-- real: something using the Supabase REST API directly (not necessarily
-- through this app's UI) could currently do more than intended.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- FINDING 1 — borrowings could be inserted directly, bypassing every rule
--
-- Phase 7's request_borrow() function enforces the borrow limit, blocks
-- duplicate requests, checks the account is Active, and atomically claims
-- one specific copy — but it only runs when the app calls it. The RLS
-- policy "borrowings_insert_own" (from Phase 1) separately allows ANY
-- signed-in Student/Teacher to INSERT a borrowings row directly, for any
-- copy_id at all, with none of those checks. That policy was written
-- before request_borrow() existed and was never removed.
--
-- Since every legitimate insert now goes through request_borrow() — which
-- runs as SECURITY DEFINER and so isn't affected by RLS at all — this
-- policy has no remaining purpose except as a bypass. Removing it means
-- the ONLY way to create a borrowing is through the function that actually
-- enforces the rules.
-- ----------------------------------------------------------------------------
drop policy if exists "borrowings_insert_own" on public.borrowings;

-- ----------------------------------------------------------------------------
-- FINDING 2 — a Suspended/Inactive account could still create a reservation
--
-- Unlike borrowings, reservations are inserted directly from the client
-- (createReservation() in reservation_data.js) rather than through a
-- function — that was a deliberate simplicity choice in Phase 8, since
-- creating a reservation doesn't need the same atomic-copy-claiming logic
-- borrowing does. But that also means the "reservations_insert_own" policy
-- was the only gate, and it never checked profiles.status. A suspended
-- account whose browser session hadn't been signed out yet (or a direct
-- API call) could still reserve books.
--
-- Fix: require the account to be Active as part of the same policy check.
-- ----------------------------------------------------------------------------
drop policy if exists "reservations_insert_own" on public.reservations;

create policy "reservations_insert_own_active"
  on public.reservations for insert
  with check (
    user_id = public.current_profile_id()
    and exists (
      select 1 from public.profiles
      where profile_id = user_id and status = 'Active'
    )
  );

-- ----------------------------------------------------------------------------
-- FINDING 3 — a reservation's own-row UPDATE policy allowed changing
-- anything, not just cancelling
--
-- "reservations_update_own_or_admin" (Phase 1) let a user UPDATE any column
-- on their own reservation — including setting status straight to
-- 'Ready for Pickup' or 'Completed' themselves. It couldn't be used to
-- actually take a book (only complete_reservation() can do that, and it's
-- Admin-only), so this was a data-integrity issue rather than a way to
-- obtain a book improperly — but it should still only allow what the app
-- actually offers self-service users: cancelling.
-- ----------------------------------------------------------------------------
drop policy if exists "reservations_update_own_or_admin" on public.reservations;

create policy "reservations_update_own_cancel_only"
  on public.reservations for update
  using (user_id = public.current_profile_id())
  with check (user_id = public.current_profile_id() and status = 'Cancelled');

create policy "reservations_update_admin"
  on public.reservations for update
  using (public.is_admin());

-- ============================================================================
-- What was checked and found to already be correct (no change needed):
--
-- - book_copies / books / categories / authors / publishers / book_authors:
--   write access is admin-only across the board; no direct-write gap.
-- - borrowings UPDATE/DELETE: already admin-only ("borrowings_update_admin_only",
--   "borrowings_delete_admin_only") — untouched by this patch.
-- - fines: all writes are admin-only; no self-service insert path exists to check.
-- - notifications: insert is admin-only; the "own row" update policy only
--   allows the columns the mark-as-read flow touches — no separate check
--   needed since is_read is the only field the app ever changes this way,
--   though note this policy does NOT restrict *which* columns change (only
--   RLS gates rows, not columns) — the app just never sends anything else.
-- - request_borrow() / approve_borrow_request() / reject_borrow_request() /
--   mark_borrowed() / process_return() / complete_reservation(): each
--   re-checks is_admin() or ownership internally before doing anything,
--   independent of RLS (since SECURITY DEFINER bypasses it) — reviewed
--   line by line, no missing checks found.
-- ============================================================================
