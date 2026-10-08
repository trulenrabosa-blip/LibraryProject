-- ============================================================================
-- LIBRARY MANAGEMENT SYSTEM — PHASE 2: AUTH HARDENING
-- Run this AFTER 01_schema.sql, once, in the Supabase SQL Editor.
--
-- Why this file exists: register.js sends `role` in the signUp() metadata
-- so the handle_new_user() trigger from Phase 1 knows whether to create a
-- Student or Teacher profile. But that metadata is client-supplied, and a
-- motivated user could edit the network request and send role: "Admin".
-- This patch closes that gap at the database level — the only place it can
-- actually be enforced — by rejecting anything except Student/Teacher from
-- public signup, no matter what the client sends.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requested_role text;
  safe_role user_role;
begin
  requested_role := new.raw_user_meta_data->>'role';

  -- Public signup may only ever produce Student or Teacher profiles.
  -- Anything else (including an attempted "Admin") silently falls back
  -- to Student rather than erroring, so a malformed request can't be used
  -- to probe the difference between "rejected" and "downgraded".
  if requested_role = 'Teacher' then
    safe_role := 'Teacher';
  else
    safe_role := 'Student';
  end if;

  insert into public.profiles (auth_user_id, id_number, full_name, email, phone_number, role, status)
  values (
    new.id,
    new.raw_user_meta_data->>'id_number',
    coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
    new.email,
    new.raw_user_meta_data->>'phone_number',
    safe_role,
    'Active'
  );

  return new;
end;
$$;

-- ============================================================================
-- CREATING THE ADMIN ACCOUNT (do this once, manually — never via register.html)
--
-- 1. Supabase Dashboard → Authentication → Users → "Add user"
--    Create the account with the library's admin email + a strong password.
--    Check "Auto Confirm User" so no email verification step is required.
--
-- 2. The handle_new_user() trigger fires automatically and creates a
--    matching `profiles` row with role = 'Student' (the safe default above).
--    Promote that one row to Admin:
--
--    update public.profiles
--    set role = 'Admin'
--    where email = 'admin@riverside.edu';   -- replace with the real email
--
-- 3. Sign in at login.html with that email/password — you'll land on
--    admin/dashboard.html.
--
-- This is intentionally a manual, dashboard-driven process: it's the
-- "controlled setup process" the spec calls for, and it means Admin
-- privilege can never be granted through a public-facing form.
-- ============================================================================
