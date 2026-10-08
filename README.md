# Riverside University Library — Library Management System

A complete library management system for three roles — Admin, Student, and
Teacher — built with plain HTML/CSS/JavaScript and Supabase (PostgreSQL +
Auth). No frameworks, no build step: every file in this folder is served
as-is.

## What's here

One flat folder, one HTML/CSS/JS file set per page (see `PROJECT_NOTES.md`
for the handful of intentionally-shared files and why). SQL migrations are
numbered `01`–`05` and must be run in order, once each, in the Supabase SQL
Editor.

## First-time setup

### 1. Create a Supabase project

At [supabase.com](https://supabase.com), create a new project. Note its
**Project URL** and **anon/public API key** (Project Settings → API) — you'll
need both in step 3.

### 2. Run the SQL migrations, in order

In the Supabase SQL Editor, run each of these once, top to bottom, waiting
for each to finish before the next:

1. `01_schema.sql` — tables, types, indexes, RLS policies, seed data (26 books, categories, authors, publishers)
2. `02_auth_hardening.sql` — locks public signup to Student/Teacher only
3. `03_borrowing_functions.sql` — request/approve/reject/checkout/return functions
4. `04_reservation_functions.sql` — reservation fulfillment function
5. `05_rls_hardening.sql` — closes two RLS gaps found during security review (see `RLS_TESTING_GUIDE.md`)

### 3. Connect the app to your project

Open `supabase_client.js` and replace the two placeholder values:

```js
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

It's safe for the anon key to be visible in this file — it's designed to be
public, and every table is protected by the RLS policies from step 2, not by
keeping this key secret.

### 4. Create your Admin account

Admin accounts are never created through public registration, by design
(see `02_auth_hardening.sql`). One-time manual steps:

1. Supabase Dashboard → Authentication → Users → **Add user**. Use the
   library's admin email, set a password, and check **Auto Confirm User**.
2. In the SQL Editor:
   ```sql
   update public.profiles set role = 'Admin' where email = 'your-admin-email@example.com';
   ```
3. Sign in at `login.html` with that email/password.

### 5. Run it locally

These are ES modules, which browsers block on `file://` — you need a local
server, not a double-clicked HTML file:

```bash
# either of these works
npx serve .
python -m http.server 8000
```

Then open `http://localhost:<port>/index.html`.

### 6. Create test accounts

Register a Student and a Teacher through `register.html` to have realistic
test data across all three roles.

## Deploying

See `DEPLOYMENT.md` for step-by-step hosting instructions and — importantly
— a Supabase configuration step that's easy to miss and will otherwise break
password reset/signup emails once you're live on a real domain.

## Testing before you rely on this

See `RLS_TESTING_GUIDE.md` (security/database-level tests) and
`FINAL_TESTING_CHECKLIST.md` (feature-by-feature walkthrough of every role).

## Known gaps

A few sidebar links lead to intentionally simple placeholder pages rather
than full features — this was a deliberate scope decision, not an oversight,
and is documented in detail in `PROJECT_NOTES.md`:

- **Admin → Users / Students / Teachers**: no dedicated management UI yet
  (add/edit/deactivate accounts). Manageable directly via the Supabase
  Table Editor on `profiles` in the meantime.
- **Admin → Announcements**: no compose/edit UI yet. Add rows directly via
  the Supabase Table Editor on `announcements` — the Student/Teacher-facing
  display already works fully.

Student and Teacher **Announcements** (read-only) and **Profile** (edit
details + change password), and Admin **Settings** (borrow limits,
durations, fine rate, reservation duration, library info) are fully built.
