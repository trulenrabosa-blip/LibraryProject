-- ============================================================================
-- LIBRARY MANAGEMENT SYSTEM — PHASE 7: BORROWING & RETURN FUNCTIONS
-- Run this once, after 01_schema.sql and 02_auth_hardening.sql, in the
-- Supabase SQL Editor.
--
-- WHY FUNCTIONS INSTEAD OF CLIENT-SIDE LOGIC:
-- Requesting a book needs to (a) pick one specific available copy and
-- (b) mark it no longer available, as a single atomic step. If that logic
-- lived in the browser as separate "read copies, then insert borrowing"
-- calls, two students clicking "Borrow" on the last copy at the same
-- moment could both succeed — a real double-booking bug, not a
-- hypothetical one. Postgres's row locking (FOR UPDATE SKIP LOCKED below)
-- closes that gap; plain client-side reads and writes cannot.
--
-- It also solves a permissions problem: students can't UPDATE book_copies
-- directly (Phase 1 RLS reserves that for Admin), but requesting a book
-- necessarily needs to change a copy's status. These functions run as
-- SECURITY DEFINER — they execute with the privileges of the function's
-- owner, not the calling user — so they can make that change, but only
-- after checking (in plain SQL, right here) that the request is legitimate.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. REQUEST TO BORROW — called by a signed-in Student or Teacher
-- ----------------------------------------------------------------------------
create or replace function public.request_borrow(p_book_id uuid)
returns public.borrowings
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile record;
  v_limit int;
  v_active_count int;
  v_existing_count int;
  v_copy_id uuid;
  v_result public.borrowings;
begin
  select profile_id, role, status into v_profile
  from public.profiles where auth_user_id = auth.uid();

  if v_profile.profile_id is null then
    raise exception 'not_signed_in';
  end if;
  if v_profile.status <> 'Active' then
    raise exception 'account_not_active';
  end if;
  if v_profile.role not in ('Student', 'Teacher') then
    raise exception 'role_not_eligible';
  end if;

  select case when v_profile.role = 'Teacher' then teacher_borrow_limit else student_borrow_limit end
  into v_limit
  from public.library_settings limit 1;

  select count(*) into v_active_count
  from public.borrowings
  where user_id = v_profile.profile_id and status in ('Pending', 'Approved', 'Borrowed');

  if v_active_count >= coalesce(v_limit, 0) then
    raise exception 'borrow_limit_reached';
  end if;

  select count(*) into v_existing_count
  from public.borrowings b
  join public.book_copies bc on bc.copy_id = b.copy_id
  where b.user_id = v_profile.profile_id
    and bc.book_id = p_book_id
    and b.status in ('Pending', 'Approved', 'Borrowed');

  if v_existing_count > 0 then
    raise exception 'already_requested';
  end if;

  -- Lock one available copy of this book so a concurrent request can't grab
  -- the same row before this transaction commits. SKIP LOCKED means a
  -- second simultaneous caller moves on to the next available copy (or
  -- finds none) instead of waiting and then double-claiming.
  select copy_id into v_copy_id
  from public.book_copies
  where book_id = p_book_id and status = 'Available'
  order by copy_id
  limit 1
  for update skip locked;

  if v_copy_id is null then
    raise exception 'no_copies_available';
  end if;

  update public.book_copies set status = 'Reserved' where copy_id = v_copy_id;

  insert into public.borrowings (user_id, copy_id, status)
  values (v_profile.profile_id, v_copy_id, 'Pending')
  returning * into v_result;

  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. APPROVE / REJECT — Admin only
-- ----------------------------------------------------------------------------
create or replace function public.approve_borrow_request(p_borrowing_id uuid)
returns public.borrowings
language plpgsql
security definer set search_path = public
as $$
declare
  v_admin_id uuid;
  v_result public.borrowings;
  v_book_title text;
begin
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;
  select profile_id into v_admin_id from public.profiles where auth_user_id = auth.uid();

  update public.borrowings
  set status = 'Approved', approval_date = now(), approved_by = v_admin_id
  where borrowing_id = p_borrowing_id and status = 'Pending'
  returning * into v_result;

  if v_result.borrowing_id is null then
    raise exception 'request_not_pending';
  end if;

  select bk.title into v_book_title
  from public.book_copies bc join public.books bk on bk.book_id = bc.book_id
  where bc.copy_id = v_result.copy_id;

  insert into public.notifications (user_id, title, message, type)
  values (v_result.user_id, 'Request approved',
          format('Your request for "%s" was approved. Visit the library to pick it up.', v_book_title),
          'Approval');

  return v_result;
end;
$$;

create or replace function public.reject_borrow_request(p_borrowing_id uuid, p_notes text default null)
returns public.borrowings
language plpgsql
security definer set search_path = public
as $$
declare
  v_admin_id uuid;
  v_result public.borrowings;
  v_book_title text;
begin
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;
  select profile_id into v_admin_id from public.profiles where auth_user_id = auth.uid();

  update public.borrowings
  set status = 'Rejected', approved_by = v_admin_id, notes = p_notes
  where borrowing_id = p_borrowing_id and status = 'Pending'
  returning * into v_result;

  if v_result.borrowing_id is null then
    raise exception 'request_not_pending';
  end if;

  -- Release the hold this request placed on the copy back to the shelf.
  update public.book_copies set status = 'Available' where copy_id = v_result.copy_id;

  select bk.title into v_book_title
  from public.book_copies bc join public.books bk on bk.book_id = bc.book_id
  where bc.copy_id = v_result.copy_id;

  insert into public.notifications (user_id, title, message, type)
  values (v_result.user_id, 'Request declined',
          format('Your request for "%s" was not approved.%s', v_book_title,
                 case when p_notes is not null then ' Note: ' || p_notes else '' end),
          'Approval');

  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. MARK AS BORROWED (physical checkout) — Admin only
-- ----------------------------------------------------------------------------
create or replace function public.mark_borrowed(p_borrowing_id uuid)
returns public.borrowings
language plpgsql
security definer set search_path = public
as $$
declare
  v_result public.borrowings;
  v_role user_role;
  v_days int;
  v_book_title text;
begin
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;

  select p.role into v_role
  from public.borrowings b join public.profiles p on p.profile_id = b.user_id
  where b.borrowing_id = p_borrowing_id;

  select case when v_role = 'Teacher' then teacher_borrow_days else student_borrow_days end
  into v_days
  from public.library_settings limit 1;

  update public.borrowings
  set status = 'Borrowed', borrowed_date = now(), due_date = now() + (coalesce(v_days, 7) || ' days')::interval
  where borrowing_id = p_borrowing_id and status = 'Approved'
  returning * into v_result;

  if v_result.borrowing_id is null then
    raise exception 'request_not_approved';
  end if;

  update public.book_copies set status = 'Borrowed' where copy_id = v_result.copy_id;

  select bk.title into v_book_title
  from public.book_copies bc join public.books bk on bk.book_id = bc.book_id
  where bc.copy_id = v_result.copy_id;

  insert into public.notifications (user_id, title, message, type)
  values (v_result.user_id, 'Book checked out',
          format('"%s" is checked out to you. Due back %s.', v_book_title, to_char(v_result.due_date, 'Mon DD, YYYY')),
          'Info');

  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. PROCESS RETURN — Admin only. Computes overdue fine automatically.
-- ----------------------------------------------------------------------------
create or replace function public.process_return(p_borrowing_id uuid)
returns public.borrowings
language plpgsql
security definer set search_path = public
as $$
declare
  v_result public.borrowings;
  v_overdue_days int;
  v_fine_per_day numeric(10,2);
  v_fine_amount numeric(10,2);
  v_book_title text;
begin
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;

  update public.borrowings
  set status = 'Returned', returned_date = now()
  where borrowing_id = p_borrowing_id and status in ('Borrowed', 'Overdue')
  returning * into v_result;

  if v_result.borrowing_id is null then
    raise exception 'not_currently_borrowed';
  end if;

  update public.book_copies set status = 'Available' where copy_id = v_result.copy_id;

  select bk.title into v_book_title
  from public.book_copies bc join public.books bk on bk.book_id = bc.book_id
  where bc.copy_id = v_result.copy_id;

  v_overdue_days := greatest(0, extract(day from (v_result.returned_date - v_result.due_date))::int);

  if v_overdue_days > 0 then
    select fine_per_day into v_fine_per_day from public.library_settings limit 1;
    v_fine_amount := v_overdue_days * coalesce(v_fine_per_day, 0);

    insert into public.fines (borrowing_id, user_id, amount, reason, status)
    values (v_result.borrowing_id, v_result.user_id, v_fine_amount,
            format('%s day(s) overdue return of "%s"', v_overdue_days, v_book_title), 'Unpaid');

    insert into public.notifications (user_id, title, message, type)
    values (v_result.user_id, 'Book returned — fine issued',
            format('"%s" was returned %s day(s) late. A fine of $%s has been added to your account.',
                   v_book_title, v_overdue_days, v_fine_amount),
            'Fine');
  else
    insert into public.notifications (user_id, title, message, type)
    values (v_result.user_id, 'Book returned',
            format('"%s" was returned on time. Thanks!', v_book_title), 'Info');
  end if;

  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Permissions — only signed-in users may call these; the functions
--    themselves enforce who's allowed to do what.
-- ----------------------------------------------------------------------------
revoke all on function public.request_borrow(uuid) from public;
revoke all on function public.approve_borrow_request(uuid) from public;
revoke all on function public.reject_borrow_request(uuid, text) from public;
revoke all on function public.mark_borrowed(uuid) from public;
revoke all on function public.process_return(uuid) from public;

grant execute on function public.request_borrow(uuid) to authenticated;
grant execute on function public.approve_borrow_request(uuid) to authenticated;
grant execute on function public.reject_borrow_request(uuid, text) to authenticated;
grant execute on function public.mark_borrowed(uuid) to authenticated;
grant execute on function public.process_return(uuid) to authenticated;
