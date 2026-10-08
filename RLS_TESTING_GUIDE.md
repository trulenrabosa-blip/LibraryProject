# RLS Testing Guide

How to verify the Row Level Security policies actually do what they're
supposed to, using two complementary methods.

Run this **after** applying `05_rls_hardening.sql`, so the tests below check
the corrected policies, not the two gaps that patch closed.

---

## Method A — Supabase SQL Editor (role impersonation)

Supabase's Postgres exposes `auth.uid()` by reading a session variable that
normally comes from a request's JWT. You can set that variable by hand in
the SQL Editor to make the database briefly "think" you're a specific user
— without needing their password. This tests the database policies
directly, independent of the app's JavaScript.

**Get two real profile IDs to test with**, one Student and one Admin:

```sql
select profile_id, auth_user_id, full_name, role, status
from public.profiles
order by role;
```

Copy a Student's `profile_id` and a second Student's `profile_id` (you need
two different students to test cross-user isolation), plus the Admin's.

**The impersonation pattern** — every test below follows this shape:

```sql
do $$
declare
  v_auth_id uuid;
begin
  select auth_user_id into v_auth_id from public.profiles where profile_id = '<PROFILE_ID_HERE>';
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- your test query goes here

  reset role;
end $$;
```

`set_config(..., true)` means **local to the current transaction** — it
reverts automatically. Still, always end with `reset role;` as a safety net,
and if a script ever errors out partway through, open a fresh SQL Editor tab
rather than continuing in the same one.

---

## Test 1 — A student cannot see another student's data

Replace `STUDENT_A_ID` and `STUDENT_B_ID` with two real Student `profile_id`s.

```sql
do $$
declare
  v_auth_id uuid;
  v_count int;
begin
  select auth_user_id into v_auth_id from public.profiles where profile_id = 'STUDENT_A_ID';
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_count from public.borrowings where user_id = 'STUDENT_B_ID';
  if v_count > 0 then
    raise exception 'FAIL: Student A could see Student B''s borrowings (% rows)', v_count;
  end if;
  raise notice 'PASS: borrowings isolated';

  select count(*) into v_count from public.fines where user_id = 'STUDENT_B_ID';
  if v_count > 0 then raise exception 'FAIL: fines leaked across users'; end if;
  raise notice 'PASS: fines isolated';

  select count(*) into v_count from public.reservations where user_id = 'STUDENT_B_ID';
  if v_count > 0 then raise exception 'FAIL: reservations leaked across users'; end if;
  raise notice 'PASS: reservations isolated';

  select count(*) into v_count from public.notifications where user_id = 'STUDENT_B_ID';
  if v_count > 0 then raise exception 'FAIL: notifications leaked across users'; end if;
  raise notice 'PASS: notifications isolated';

  reset role;
end $$;
```

Expect four `PASS` notices. Any `FAIL` (the block will stop and raise an
exception) means RLS isn't isolating that table correctly — stop and check
that table's policies before going further.

---

## Test 2 — A student cannot write to catalog data

```sql
do $$
declare
  v_auth_id uuid;
begin
  select auth_user_id into v_auth_id from public.profiles where profile_id = 'STUDENT_A_ID';
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    insert into public.categories (category_name) values ('Should Not Work');
    raise exception 'FAIL: student inserted a category';
  exception when insufficient_privilege or others then
    raise notice 'PASS: category insert blocked';
  end;

  begin
    update public.books set title = 'Tampered' where book_id = (select book_id from public.books limit 1);
    raise exception 'FAIL: student updated a book';
  exception when insufficient_privilege or others then
    raise notice 'PASS: book update blocked';
  end;

  begin
    update public.book_copies set status = 'Lost' where copy_id = (select copy_id from public.book_copies limit 1);
    raise exception 'FAIL: student updated a book copy';
  exception when insufficient_privilege or others then
    raise notice 'PASS: book copy update blocked';
  end;

  reset role;
end $$;
```

Note: an RLS-blocked UPDATE/INSERT with a `WITH CHECK` clause usually just
silently affects 0 rows rather than raising `insufficient_privilege` — so
also check the row count if you want to be extra sure:

```sql
-- run this right after an update above, still impersonating the student
get diagnostics ...
```

In practice, simplest is: run the raw `update`/`insert` statement by itself
(not wrapped in a `begin/exception` block) while impersonating the student,
and confirm it either errors or reports "0 rows affected" — either is a
pass, a successful write is a fail.

---

## Test 3 — Direct borrowing insert is blocked (regression test for Finding 1)

This confirms `05_rls_hardening.sql` actually removed the bypass.

```sql
do $$
declare
  v_auth_id uuid;
  v_copy_id uuid;
begin
  select auth_user_id into v_auth_id from public.profiles where profile_id = 'STUDENT_A_ID';
  select copy_id into v_copy_id from public.book_copies where status = 'Available' limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_auth_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    insert into public.borrowings (user_id, copy_id, status) values ('STUDENT_A_ID', v_copy_id, 'Pending');
    raise exception 'FAIL: direct borrowing insert succeeded — Finding 1 is not patched';
  exception when insufficient_privilege or others then
    raise notice 'PASS: direct borrowing insert blocked, only request_borrow() works';
  end;

  reset role;
end $$;
```

---

## Test 4 — Suspended account cannot reserve a book (regression test for Finding 2)

Requires a test account with `status = 'Suspended'`. You can temporarily set
one for this test and revert it after:

```sql
update public.profiles set status = 'Suspended' where profile_id = 'STUDENT_A_ID';
```

```sql
do $$
declare
  v_auth_id uuid;
  v_book_id uuid;
begin
  select auth_user_id into v_auth_id from public.profiles where profile_id = 'STUDENT_A_ID';
  select book_id into v_book_id from public.books limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_auth_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    insert into public.reservations (user_id, book_id, status) values ('STUDENT_A_ID', v_book_id, 'Pending');
    raise exception 'FAIL: suspended account reserved a book — Finding 2 is not patched';
  exception when insufficient_privilege or others then
    raise notice 'PASS: suspended account blocked from reserving';
  end;

  reset role;
end $$;
```

**Revert the test account afterward:**

```sql
update public.profiles set status = 'Active' where profile_id = 'STUDENT_A_ID';
```

---

## Test 5 — Admin can do everything

```sql
do $$
declare
  v_auth_id uuid;
  v_count int;
begin
  select auth_user_id into v_auth_id from public.profiles where profile_id = 'ADMIN_ID';
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_count from public.borrowings;
  raise notice 'Admin sees % total borrowings (should be all of them, not just their own)', v_count;

  select count(*) into v_count from public.activity_logs;
  raise notice 'Admin sees % activity log rows', v_count;

  reset role;
end $$;
```

Cross-check the borrowings count against `select count(*) from public.borrowings;`
run as the table owner (outside impersonation) — they should match.

---

## Test 6 — Anonymous (signed-out) access is blocked

```sql
do $$
declare
  v_count int;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);

  select count(*) into v_count from public.books;
  if v_count > 0 then
    raise exception 'FAIL: anonymous role could read books (% rows) — every page should require login', v_count;
  end if;
  raise notice 'PASS: anonymous access blocked';

  reset role;
end $$;
```

---

## Test 7 — Admin role can't be self-granted at signup (regression test for `02_auth_hardening.sql`)

This one's easiest to check by inspecting the function rather than
impersonating a session:

```sql
select prosrc from pg_proc where proname = 'handle_new_user';
```

Confirm the output still contains the `if requested_role = 'Teacher' then ... else 'Student'` logic — i.e. `'Admin'` is never reachable from `raw_user_meta_data->>'role'`.

For a live end-to-end check: open your browser's dev tools on `register.html`,
submit the form, and in the Network tab find the `signup` request. Edit
and replay it (or use `fetch` directly in the console) with
`"data": {"role": "Admin", ...}` in the body. Then check:

```sql
select role from public.profiles where email = '<the test email you used>';
```

It should say `Student`, never `Admin`.

---

## Method B — Multi-session smoke test through the actual app

SQL-level tests confirm the database is safe even against something that
skips the app entirely. This method confirms the *app* behaves correctly
day-to-day.

1. Open three browser profiles (or one normal + two Incognito windows).
2. Sign in as a Student in window 1, a Teacher in window 2, the Admin in window 3.
3. **As the Student:** confirm you land on `student_dashboard.html`, and
   that manually navigating to `admin_dashboard.html` redirects you back to
   your own dashboard (this is `requireAuth()` from `auth_service.js`, not
   RLS — but it's the first line of defense and worth confirming).
4. **As the Student:** open dev tools → Console, and run:
   ```js
   const { data } = await window.supabase.from('borrowings').select('*');
   console.log(data);
   ```
   (You'll need the page's `supabase` instance in scope — easiest is to add
   `window.supabase = supabase;` temporarily to the bottom of
   `supabase_client.js` while testing, then remove it after.) Confirm every
   row's `user_id` belongs to you, never another student.
5. **As the Teacher:** repeat step 4 — same expectation.
6. **As the Admin:** run the same query — confirm you see rows from
   multiple different users.
7. **As the Student:** try requesting a book with 0 available copies via
   the UI (Browse Books) — confirm you get "Reserve" instead of "Request to
   Borrow", and that a direct `requestBorrow()` call for an unavailable book
   fails with a clear error rather than silently succeeding.

---

## Full Policy Matrix (for reference)

| Table | Student/Teacher SELECT | Student/Teacher INSERT | Student/Teacher UPDATE | Student/Teacher DELETE | Admin |
|---|---|---|---|---|---|
| profiles | own row only | — | own row only | — | full |
| categories/authors/publishers/books/book_copies/book_authors | all rows (read-only catalog) | — | — | — | full |
| borrowings | own rows only | **blocked** (Finding 1 — use `request_borrow()`) | — | — | full |
| reservations | own rows only | own rows, **only if Active** (Finding 2) | own rows, **cancel only** (Finding 3) | — | full |
| fines | own rows only | — | — | — | full |
| notifications | own rows only | — | own rows (mark read) | own rows | full |
| announcements | all rows (read-only) | — | — | — | full |
| library_settings | all rows (read-only) | — | — | — | full |
| activity_logs | — (admin only) | any authenticated (writes their own action) | — | — | full |

Dashes mean "no policy grants this — the operation is rejected by default,"
which is Postgres RLS's fail-closed behavior: a table with RLS enabled and
no matching policy denies the operation entirely.

---

## Known, accepted limitation

A Suspended/Inactive account's existing JWT (if not yet expired) can still
**read** their own borrowings/fines/reservations/notifications — RLS's
`_select_own_or_admin` policies check ownership, not `status`. This is left
as-is deliberately: someone should generally be able to see *why* they're
suspended (e.g. an unpaid fine) rather than being locked out of that
information too. `requireAuth()` still signs them out of the app itself the
next time they load any page. If you'd rather suspended accounts lose read
access entirely, that's a reasonable call to make differently — just say so
and I'll patch it.
