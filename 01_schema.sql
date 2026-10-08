-- ============================================================================
-- LIBRARY MANAGEMENT SYSTEM — PHASE 1: DATABASE SCHEMA
-- Supabase (PostgreSQL)
-- Run this entire file in the Supabase SQL Editor (Project → SQL Editor → New query)
-- Run top to bottom in ONE execution. Order matters (extensions → types → tables → indexes → RLS → seed).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ----------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. ENUM TYPES
-- ----------------------------------------------------------------------------
create type user_role as enum ('Admin', 'Student', 'Teacher');
create type user_status as enum ('Active', 'Inactive', 'Suspended');

create type copy_status as enum ('Available', 'Borrowed', 'Reserved', 'Lost', 'Damaged', 'Under Maintenance');
create type book_availability as enum ('Available', 'Unavailable');

create type borrowing_status as enum ('Pending', 'Approved', 'Borrowed', 'Returned', 'Overdue', 'Rejected', 'Lost');
create type fine_status as enum ('Unpaid', 'Paid', 'Waived');
create type reservation_status as enum ('Pending', 'Ready for Pickup', 'Completed', 'Cancelled', 'Expired');

create type notification_type as enum ('Info', 'Approval', 'Due Reminder', 'Overdue', 'Fine', 'Reservation', 'System');
create type announcement_target as enum ('All', 'Students', 'Teachers');
create type announcement_status as enum ('Draft', 'Published', 'Archived');

-- ----------------------------------------------------------------------------
-- 2. CORE TABLES
-- ----------------------------------------------------------------------------

-- PROFILES — one row per authenticated user, linked 1:1 to auth.users
create table public.profiles (
  profile_id      uuid primary key default uuid_generate_v4(),
  auth_user_id    uuid not null unique references auth.users(id) on delete cascade,
  id_number       text,                         -- student/employee/teacher ID
  full_name       text not null,
  email           text not null unique,
  phone_number    text,
  address         text,
  date_of_birth   date,
  gender          text,
  profile_picture text,
  role            user_role not null default 'Student',
  status          user_status not null default 'Active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- CATEGORIES
create table public.categories (
  category_id   uuid primary key default uuid_generate_v4(),
  category_name text not null unique,
  description   text,
  created_at    timestamptz not null default now()
);

-- PUBLISHERS
create table public.publishers (
  publisher_id    uuid primary key default uuid_generate_v4(),
  publisher_name  text not null,
  address         text,
  contact_number  text,
  email           text,
  website         text,
  created_at      timestamptz not null default now()
);

-- AUTHORS
create table public.authors (
  author_id   uuid primary key default uuid_generate_v4(),
  author_name text not null,
  biography   text,
  created_at  timestamptz not null default now()
);

-- BOOKS
create table public.books (
  book_id             uuid primary key default uuid_generate_v4(),
  isbn                text unique,
  title               text not null,
  subtitle            text,
  description         text,
  category_id         uuid references public.categories(category_id) on delete set null,
  publisher_id        uuid references public.publishers(publisher_id) on delete set null,
  publication_year    int,
  edition             text,
  language            text default 'English',
  pages               int,
  cover_image_url     text,
  shelf_location       text,
  availability_status book_availability not null default 'Available',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- BOOK_AUTHORS (many-to-many)
create table public.book_authors (
  book_id   uuid not null references public.books(book_id) on delete cascade,
  author_id uuid not null references public.authors(author_id) on delete cascade,
  primary key (book_id, author_id)
);

-- BOOK_COPIES — physical copies of a book
create table public.book_copies (
  copy_id           uuid primary key default uuid_generate_v4(),
  book_id           uuid not null references public.books(book_id) on delete cascade,
  accession_number  text not null unique,
  barcode           text unique,
  condition         text default 'New',
  status            copy_status not null default 'Available',
  shelf_location    text,
  acquisition_date  date default current_date,
  price             numeric(10,2),
  created_at        timestamptz not null default now()
);

-- BORROWINGS
create table public.borrowings (
  borrowing_id    uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(profile_id) on delete cascade,
  copy_id         uuid not null references public.book_copies(copy_id) on delete cascade,
  request_date    timestamptz not null default now(),
  approval_date   timestamptz,
  borrowed_date   timestamptz,
  due_date        timestamptz,
  returned_date   timestamptz,
  status          borrowing_status not null default 'Pending',
  approved_by     uuid references public.profiles(profile_id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- FINES
create table public.fines (
  fine_id       uuid primary key default uuid_generate_v4(),
  borrowing_id  uuid references public.borrowings(borrowing_id) on delete cascade,
  user_id       uuid not null references public.profiles(profile_id) on delete cascade,
  amount        numeric(10,2) not null check (amount >= 0),
  reason        text,
  issued_date   timestamptz not null default now(),
  paid_date     timestamptz,
  status        fine_status not null default 'Unpaid',
  notes         text,
  created_at    timestamptz not null default now()
);

-- RESERVATIONS
create table public.reservations (
  reservation_id    uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references public.profiles(profile_id) on delete cascade,
  book_id           uuid not null references public.books(book_id) on delete cascade,
  reservation_date  timestamptz not null default now(),
  expiration_date   timestamptz,
  status            reservation_status not null default 'Pending',
  created_at        timestamptz not null default now()
);

-- NOTIFICATIONS
create table public.notifications (
  notification_id uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(profile_id) on delete cascade,
  title           text not null,
  message         text not null,
  type            notification_type not null default 'Info',
  is_read         boolean not null default false,
  created_at      timestamptz not null default now()
);

-- ANNOUNCEMENTS
create table public.announcements (
  announcement_id uuid primary key default uuid_generate_v4(),
  title           text not null,
  content         text not null,
  author_id       uuid references public.profiles(profile_id) on delete set null,
  target_role     announcement_target not null default 'All',
  status          announcement_status not null default 'Published',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- LIBRARY_SETTINGS — single-row configuration table
create table public.library_settings (
  setting_id                  uuid primary key default uuid_generate_v4(),
  library_name                text not null default 'Campus Library',
  library_address             text,
  contact_number              text,
  email                       text,
  opening_hours               text,
  student_borrow_limit        int not null default 3,
  teacher_borrow_limit        int not null default 5,
  student_borrow_days         int not null default 7,
  teacher_borrow_days         int not null default 14,
  fine_per_day                numeric(10,2) not null default 5.00,
  reservation_duration_days   int not null default 3,
  updated_at                  timestamptz not null default now()
);

-- ACTIVITY_LOGS
create table public.activity_logs (
  log_id      uuid primary key default uuid_generate_v4(),
  user_id     uuid references public.profiles(profile_id) on delete set null,
  action      text not null,
  description text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. INDEXES
-- ----------------------------------------------------------------------------
create index idx_profiles_role on public.profiles(role);
create index idx_profiles_status on public.profiles(status);
create index idx_profiles_auth_user_id on public.profiles(auth_user_id);

create index idx_books_category on public.books(category_id);
create index idx_books_publisher on public.books(publisher_id);
create index idx_books_title on public.books using gin (to_tsvector('english', title));
create index idx_books_isbn on public.books(isbn);

create index idx_book_copies_book on public.book_copies(book_id);
create index idx_book_copies_status on public.book_copies(status);

create index idx_book_authors_book on public.book_authors(book_id);
create index idx_book_authors_author on public.book_authors(author_id);

create index idx_borrowings_user on public.borrowings(user_id);
create index idx_borrowings_copy on public.borrowings(copy_id);
create index idx_borrowings_status on public.borrowings(status);
create index idx_borrowings_due_date on public.borrowings(due_date);

create index idx_fines_user on public.fines(user_id);
create index idx_fines_status on public.fines(status);
create index idx_fines_borrowing on public.fines(borrowing_id);

create index idx_reservations_user on public.reservations(user_id);
create index idx_reservations_book on public.reservations(book_id);
create index idx_reservations_status on public.reservations(status);

create index idx_notifications_user on public.notifications(user_id);
create index idx_notifications_unread on public.notifications(user_id, is_read);

create index idx_announcements_target on public.announcements(target_role);
create index idx_activity_logs_user on public.activity_logs(user_id);
create index idx_activity_logs_created on public.activity_logs(created_at desc);

-- ----------------------------------------------------------------------------
-- 4. UPDATED_AT TRIGGER HELPER
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_books_updated_at before update on public.books
  for each row execute function public.set_updated_at();
create trigger trg_borrowings_updated_at before update on public.borrowings
  for each row execute function public.set_updated_at();
create trigger trg_announcements_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. AUTO-CREATE PROFILE ON SIGNUP
-- New auth.users row → insert a matching profiles row.
-- Role defaults to 'Student'; Teacher accounts are upgraded post-signup by an
-- Admin (see Phase 2 notes), and Admin accounts are never created via public signup.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (auth_user_id, full_name, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'Student'),
    'Active'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 6. HELPER FUNCTIONS FOR RLS (avoid recursive RLS lookups on profiles)
-- ----------------------------------------------------------------------------
create or replace function public.current_profile_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select profile_id from public.profiles where auth_user_id = auth.uid();
$$;

create or replace function public.current_role()
returns user_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where auth_user_id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where auth_user_id = auth.uid() and role = 'Admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.categories        enable row level security;
alter table public.publishers        enable row level security;
alter table public.authors           enable row level security;
alter table public.books             enable row level security;
alter table public.book_authors      enable row level security;
alter table public.book_copies       enable row level security;
alter table public.borrowings        enable row level security;
alter table public.fines             enable row level security;
alter table public.reservations      enable row level security;
alter table public.notifications     enable row level security;
alter table public.announcements     enable row level security;
alter table public.library_settings  enable row level security;
alter table public.activity_logs     enable row level security;

-- ---- PROFILES ----
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (auth_user_id = auth.uid() or public.is_admin());

create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (auth_user_id = auth.uid() or public.is_admin());

create policy "profiles_insert_admin_only"
  on public.profiles for insert
  with check (public.is_admin());
-- Note: the handle_new_user() trigger runs as SECURITY DEFINER, so normal
-- signups bypass this policy safely; this policy only governs direct inserts.

create policy "profiles_delete_admin_only"
  on public.profiles for delete
  using (public.is_admin());

-- ---- CATALOG TABLES: everyone signed in can read, only Admin can write ----
create policy "categories_select_all" on public.categories for select using (auth.uid() is not null);
create policy "categories_write_admin" on public.categories for insert with check (public.is_admin());
create policy "categories_update_admin" on public.categories for update using (public.is_admin());
create policy "categories_delete_admin" on public.categories for delete using (public.is_admin());

create policy "publishers_select_all" on public.publishers for select using (auth.uid() is not null);
create policy "publishers_write_admin" on public.publishers for insert with check (public.is_admin());
create policy "publishers_update_admin" on public.publishers for update using (public.is_admin());
create policy "publishers_delete_admin" on public.publishers for delete using (public.is_admin());

create policy "authors_select_all" on public.authors for select using (auth.uid() is not null);
create policy "authors_write_admin" on public.authors for insert with check (public.is_admin());
create policy "authors_update_admin" on public.authors for update using (public.is_admin());
create policy "authors_delete_admin" on public.authors for delete using (public.is_admin());

create policy "books_select_all" on public.books for select using (auth.uid() is not null);
create policy "books_write_admin" on public.books for insert with check (public.is_admin());
create policy "books_update_admin" on public.books for update using (public.is_admin());
create policy "books_delete_admin" on public.books for delete using (public.is_admin());

create policy "book_authors_select_all" on public.book_authors for select using (auth.uid() is not null);
create policy "book_authors_write_admin" on public.book_authors for insert with check (public.is_admin());
create policy "book_authors_delete_admin" on public.book_authors for delete using (public.is_admin());

create policy "book_copies_select_all" on public.book_copies for select using (auth.uid() is not null);
create policy "book_copies_write_admin" on public.book_copies for insert with check (public.is_admin());
create policy "book_copies_update_admin" on public.book_copies for update using (public.is_admin());
create policy "book_copies_delete_admin" on public.book_copies for delete using (public.is_admin());

-- ---- BORROWINGS ----
-- Students/Teachers: see and create their own requests only.
-- Admin: sees and manages everything.
create policy "borrowings_select_own_or_admin"
  on public.borrowings for select
  using (user_id = public.current_profile_id() or public.is_admin());

create policy "borrowings_insert_own"
  on public.borrowings for insert
  with check (user_id = public.current_profile_id());

create policy "borrowings_update_admin_only"
  on public.borrowings for update
  using (public.is_admin());
-- Approval, status changes, due dates, returns are all Admin-driven per the
-- workflow in the spec, so regular users cannot update their own rows.

create policy "borrowings_delete_admin_only"
  on public.borrowings for delete
  using (public.is_admin());

-- ---- FINES ----
create policy "fines_select_own_or_admin"
  on public.fines for select
  using (user_id = public.current_profile_id() or public.is_admin());

create policy "fines_write_admin"
  on public.fines for insert
  with check (public.is_admin());

create policy "fines_update_admin"
  on public.fines for update
  using (public.is_admin());

create policy "fines_delete_admin"
  on public.fines for delete
  using (public.is_admin());

-- ---- RESERVATIONS ----
create policy "reservations_select_own_or_admin"
  on public.reservations for select
  using (user_id = public.current_profile_id() or public.is_admin());

create policy "reservations_insert_own"
  on public.reservations for insert
  with check (user_id = public.current_profile_id());

create policy "reservations_update_own_or_admin"
  on public.reservations for update
  using (user_id = public.current_profile_id() or public.is_admin());
-- Own-row update covers user-initiated cancellation; Admin covers full
-- lifecycle management (Ready for Pickup, Completed, Expired).

create policy "reservations_delete_admin"
  on public.reservations for delete
  using (public.is_admin());

-- ---- NOTIFICATIONS ----
create policy "notifications_select_own_or_admin"
  on public.notifications for select
  using (user_id = public.current_profile_id() or public.is_admin());

create policy "notifications_update_own"
  on public.notifications for update
  using (user_id = public.current_profile_id())
  with check (user_id = public.current_profile_id());
-- Covers marking a user's own notifications as read.

create policy "notifications_insert_admin_or_system"
  on public.notifications for insert
  with check (public.is_admin());
-- Server-side/trigger-driven inserts should use a SECURITY DEFINER function
-- (see Phase 7/9 notes) since regular users cannot insert notifications directly.

create policy "notifications_delete_own_or_admin"
  on public.notifications for delete
  using (user_id = public.current_profile_id() or public.is_admin());

-- ---- ANNOUNCEMENTS ----
create policy "announcements_select_all"
  on public.announcements for select
  using (auth.uid() is not null);

create policy "announcements_write_admin"
  on public.announcements for insert
  with check (public.is_admin());

create policy "announcements_update_admin"
  on public.announcements for update
  using (public.is_admin());

create policy "announcements_delete_admin"
  on public.announcements for delete
  using (public.is_admin());

-- ---- LIBRARY_SETTINGS ----
create policy "settings_select_all"
  on public.library_settings for select
  using (auth.uid() is not null);

create policy "settings_write_admin"
  on public.library_settings for insert
  with check (public.is_admin());

create policy "settings_update_admin"
  on public.library_settings for update
  using (public.is_admin());

-- ---- ACTIVITY_LOGS ----
create policy "activity_logs_select_admin_only"
  on public.activity_logs for select
  using (public.is_admin());

create policy "activity_logs_insert_authenticated"
  on public.activity_logs for insert
  with check (auth.uid() is not null);
-- Any authenticated action can be logged; only Admin can read the log.

-- ----------------------------------------------------------------------------
-- 8. SEED DATA — LIBRARY SETTINGS (single row)
-- ----------------------------------------------------------------------------
insert into public.library_settings (
  library_name, library_address, contact_number, email, opening_hours,
  student_borrow_limit, teacher_borrow_limit,
  student_borrow_days, teacher_borrow_days,
  fine_per_day, reservation_duration_days
) values (
  'Riverside University Library',
  '123 Campus Drive, Riverside City',
  '+1-555-0100',
  'library@riverside.edu',
  'Mon–Fri 7:00 AM–8:00 PM, Sat 9:00 AM–4:00 PM',
  3, 5, 7, 14, 5.00, 3
);

-- ----------------------------------------------------------------------------
-- 9. SEED DATA — CATEGORIES, PUBLISHERS, AUTHORS
-- ----------------------------------------------------------------------------
insert into public.categories (category_name, description) values
  ('Computer Science', 'Programming, algorithms, and computing theory'),
  ('Information Technology', 'IT systems, networks, and infrastructure'),
  ('Mathematics', 'Pure and applied mathematics'),
  ('Science', 'Physical and natural sciences'),
  ('History', 'World and regional history'),
  ('Literature', 'Classic and contemporary literary works'),
  ('Business', 'Management, economics, and finance'),
  ('Engineering', 'Mechanical, civil, and electrical engineering'),
  ('Education', 'Pedagogy and teaching methods'),
  ('Reference', 'Encyclopedias, dictionaries, and manuals'),
  ('Fiction', 'Novels and short stories'),
  ('Non-Fiction', 'Biographies, essays, and general non-fiction');

insert into public.publishers (publisher_name, address, contact_number, email, website) values
  ('Pearson Education', '221 River St, Boston, MA', '+1-555-0111', 'contact@pearson.example', 'https://pearson.example'),
  ('O''Reilly Media', '1005 Gravenstein Hwy, Sebastopol, CA', '+1-555-0112', 'contact@oreilly.example', 'https://oreilly.example'),
  ('Penguin Random House', '1745 Broadway, New York, NY', '+1-555-0113', 'contact@prh.example', 'https://prh.example'),
  ('MIT Press', '1 Broadway, Cambridge, MA', '+1-555-0114', 'contact@mitpress.example', 'https://mitpress.example'),
  ('Oxford University Press', 'Great Clarendon St, Oxford', '+1-555-0115', 'contact@oup.example', 'https://oup.example');

insert into public.authors (author_name, biography) values
  ('Robert C. Martin', 'Software engineer and author known for writing on software craftsmanship.'),
  ('Thomas H. Cormen', 'Computer scientist and co-author of a widely used algorithms textbook.'),
  ('Jane Austen', 'English novelist known for works of romantic fiction.'),
  ('George Orwell', 'English novelist and essayist, author of dystopian fiction.'),
  ('Stephen Hawking', 'Theoretical physicist known for work on black holes and cosmology.'),
  ('Yuval Noah Harari', 'Historian and author of popular works on human history.'),
  ('Chimamanda Ngozi Adichie', 'Novelist and essayist known for contemporary literary fiction.'),
  ('Isaac Newton', 'Mathematician and physicist, foundational figure in classical mechanics.'),
  ('Malala Yousafzai', 'Education activist and author.'),
  ('Michael Sandel', 'Political philosopher writing on justice and ethics.'),
  ('Walter Isaacson', 'Biographer and journalist.'),
  ('Chinua Achebe', 'Novelist and critic, a central figure in African literature.');

-- ----------------------------------------------------------------------------
-- 10. SEED DATA — BOOKS (20+) WITH AUTHORS & COPIES
-- ----------------------------------------------------------------------------
do $$
declare
  cat_cs uuid; cat_it uuid; cat_math uuid; cat_sci uuid; cat_hist uuid;
  cat_lit uuid; cat_bus uuid; cat_eng uuid; cat_edu uuid; cat_ref uuid;
  cat_fic uuid; cat_nf uuid;
  pub_pearson uuid; pub_oreilly uuid; pub_prh uuid; pub_mit uuid; pub_oup uuid;
  a_martin uuid; a_cormen uuid; a_austen uuid; a_orwell uuid; a_hawking uuid;
  a_harari uuid; a_adichie uuid; a_newton uuid; a_malala uuid; a_sandel uuid;
  a_isaacson uuid; a_achebe uuid;
  new_book uuid;
begin
  select category_id into cat_cs   from public.categories where category_name = 'Computer Science';
  select category_id into cat_it   from public.categories where category_name = 'Information Technology';
  select category_id into cat_math from public.categories where category_name = 'Mathematics';
  select category_id into cat_sci  from public.categories where category_name = 'Science';
  select category_id into cat_hist from public.categories where category_name = 'History';
  select category_id into cat_lit  from public.categories where category_name = 'Literature';
  select category_id into cat_bus  from public.categories where category_name = 'Business';
  select category_id into cat_eng  from public.categories where category_name = 'Engineering';
  select category_id into cat_edu  from public.categories where category_name = 'Education';
  select category_id into cat_ref  from public.categories where category_name = 'Reference';
  select category_id into cat_fic  from public.categories where category_name = 'Fiction';
  select category_id into cat_nf   from public.categories where category_name = 'Non-Fiction';

  select publisher_id into pub_pearson from public.publishers where publisher_name = 'Pearson Education';
  select publisher_id into pub_oreilly from public.publishers where publisher_name = 'O''Reilly Media';
  select publisher_id into pub_prh     from public.publishers where publisher_name = 'Penguin Random House';
  select publisher_id into pub_mit     from public.publishers where publisher_name = 'MIT Press';
  select publisher_id into pub_oup     from public.publishers where publisher_name = 'Oxford University Press';

  select author_id into a_martin    from public.authors where author_name = 'Robert C. Martin';
  select author_id into a_cormen    from public.authors where author_name = 'Thomas H. Cormen';
  select author_id into a_austen    from public.authors where author_name = 'Jane Austen';
  select author_id into a_orwell    from public.authors where author_name = 'George Orwell';
  select author_id into a_hawking   from public.authors where author_name = 'Stephen Hawking';
  select author_id into a_harari    from public.authors where author_name = 'Yuval Noah Harari';
  select author_id into a_adichie   from public.authors where author_name = 'Chimamanda Ngozi Adichie';
  select author_id into a_newton    from public.authors where author_name = 'Isaac Newton';
  select author_id into a_malala    from public.authors where author_name = 'Malala Yousafzai';
  select author_id into a_sandel    from public.authors where author_name = 'Michael Sandel';
  select author_id into a_isaacson  from public.authors where author_name = 'Walter Isaacson';
  select author_id into a_achebe    from public.authors where author_name = 'Chinua Achebe';

  -- Helper pattern repeated per book: insert book, link author, add 2-3 copies.

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9780132350884', 'Clean Code', cat_cs, pub_pearson, 2008, '1st', 464, 'CS-101') returning book_id into new_book;
  insert into public.book_authors values (new_book, a_martin);
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0001', 'BC0001', 'CS-101'), (new_book, 'ACC-0002', 'BC0002', 'CS-101');

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9780262033848', 'Introduction to Algorithms', cat_cs, pub_mit, 2009, '3rd', 1312, 'CS-102') returning book_id into new_book;
  insert into public.book_authors values (new_book, a_cormen);
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0003', 'BC0003', 'CS-102'), (new_book, 'ACC-0004', 'BC0004', 'CS-102'), (new_book, 'ACC-0005', 'BC0005', 'CS-102');

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9780134685991', 'Effective Java', cat_cs, pub_pearson, 2018, '3rd', 412, 'CS-103') returning book_id into new_book;
  insert into public.book_authors values (new_book, a_martin);
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0006', 'BC0006', 'CS-103');

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9781491950357', 'Building Microservices', cat_it, pub_oreilly, 2015, '1st', 280, 'IT-201') returning book_id into new_book;
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0007', 'BC0007', 'IT-201'), (new_book, 'ACC-0008', 'BC0008', 'IT-201');

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9781492078005', 'Learning SQL', cat_it, pub_oreilly, 2020, '3rd', 348, 'IT-202') returning book_id into new_book;
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0009', 'BC0009', 'IT-202');

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9780201896831', 'The Art of Computer Programming, Vol. 1', cat_math, pub_pearson, 1997, '3rd', 672, 'MA-301') returning book_id into new_book;
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0010', 'BC0010', 'MA-301');

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9780199536546', 'The Principia', cat_math, pub_oup, 1999, 'Reprint', 736, 'MA-302') returning book_id into new_book;
  insert into public.book_authors values (new_book, a_newton);
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0011', 'BC0011', 'MA-302');

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9780553380163', 'A Brief History of Time', cat_sci, pub_prh, 1998, '10th Anniv.', 212, 'SC-401') returning book_id into new_book;
  insert into public.book_authors values (new_book, a_hawking);
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0012', 'BC0012', 'SC-401'), (new_book, 'ACC-0013', 'BC0013', 'SC-401');

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9780553406991', 'The Grand Design', cat_sci, pub_prh, 2010, '1st', 208, 'SC-402') returning book_id into new_book;
  insert into public.book_authors values (new_book, a_hawking);
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0014', 'BC0014', 'SC-402');

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9780062316097', 'Sapiens: A Brief History of Humankind', cat_hist, pub_prh, 2015, '1st', 464, 'HI-501') returning book_id into new_book;
  insert into public.book_authors values (new_book, a_harari);
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0015', 'BC0015', 'HI-501'), (new_book, 'ACC-0016', 'BC0016', 'HI-501');

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9780062464316', 'Homo Deus: A Brief History of Tomorrow', cat_hist, pub_prh, 2017, '1st', 448, 'HI-502') returning book_id into new_book;
  insert into public.book_authors values (new_book, a_harari);
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0017', 'BC0017', 'HI-502');

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9780141439518', 'Pride and Prejudice', cat_lit, pub_prh, 2002, 'Reprint', 279, 'LI-601') returning book_id into new_book;
  insert into public.book_authors values (new_book, a_austen);
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0018', 'BC0018', 'LI-601'), (new_book, 'ACC-0019', 'BC0019', 'LI-601');

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9780451524935', '1984', cat_fic, pub_prh, 1961, 'Reprint', 328, 'FI-701') returning book_id into new_book;
  insert into public.book_authors values (new_book, a_orwell);
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0020', 'BC0020', 'FI-701'), (new_book, 'ACC-0021', 'BC0021', 'FI-701'), (new_book, 'ACC-0022', 'BC0022', 'FI-701');

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9780451526342', 'Animal Farm', cat_fic, pub_prh, 1996, 'Reprint', 141, 'FI-702') returning book_id into new_book;
  insert into public.book_authors values (new_book, a_orwell);
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0023', 'BC0023', 'FI-702');

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9780307455925', 'Americanah', cat_fic, pub_prh, 2013, '1st', 588, 'FI-703') returning book_id into new_book;
  insert into public.book_authors values (new_book, a_adichie);
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0024', 'BC0024', 'FI-703');

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9780385474542', 'Things Fall Apart', cat_fic, pub_prh, 1994, 'Reprint', 209, 'FI-704') returning book_id into new_book;
  insert into public.book_authors values (new_book, a_achebe);
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0025', 'BC0025', 'FI-704'), (new_book, 'ACC-0026', 'BC0026', 'FI-704');

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9780316322408', 'I Am Malala', cat_nf, pub_prh, 2013, '1st', 327, 'NF-801') returning book_id into new_book;
  insert into public.book_authors values (new_book, a_malala);
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0027', 'BC0027', 'NF-801');

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9780374532505', 'Justice: What''s the Right Thing to Do?', cat_bus, pub_oup, 2010, '1st', 320, 'BU-901') returning book_id into new_book;
  insert into public.book_authors values (new_book, a_sandel);
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0028', 'BC0028', 'BU-901');

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9781451648539', 'Steve Jobs', cat_nf, pub_prh, 2011, '1st', 656, 'NF-802') returning book_id into new_book;
  insert into public.book_authors values (new_book, a_isaacson);
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0029', 'BC0029', 'NF-802'), (new_book, 'ACC-0030', 'BC0030', 'NF-802');

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9780198832652', 'Concise Oxford English Dictionary', cat_ref, pub_oup, 2011, '12th', 1728, 'RE-001') returning book_id into new_book;
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0031', 'BC0031', 'RE-001');

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9780132119955', 'Design Patterns: Elements of Reusable OO Software', cat_eng, pub_pearson, 1994, '1st', 395, 'EN-101') returning book_id into new_book;
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0032', 'BC0032', 'EN-101');

  insert into public.books (isbn, title, category_id, publisher_id, publication_year, edition, pages, shelf_location)
    values ('9780471288999', 'How Learning Works', cat_edu, pub_oup, 2010, '1st', 336, 'ED-101') returning book_id into new_book;
  insert into public.book_copies (book_id, accession_number, barcode, shelf_location) values
    (new_book, 'ACC-0033', 'BC0033', 'ED-101');
end $$;

-- ----------------------------------------------------------------------------
-- NOTE ON auth.users / profiles SEED DATA (Admin, Students, Teachers)
-- ----------------------------------------------------------------------------
-- Supabase requires accounts to be created through auth.users (via
-- Supabase Auth), not by inserting rows directly into that table from SQL.
-- The handle_new_user() trigger above will auto-create the matching
-- `profiles` row the moment each account signs up.
--
-- Phase 2 will cover exactly how to create:
--   • 1 Admin account   (via Supabase Dashboard → Authentication → Add user,
--                         then a manual role update to 'Admin' — the ONLY
--                         supported way to create an Admin, per the "no public
--                         Admin registration" requirement)
--   • Several Student accounts (via the public registration page)
--   • Several Teacher accounts (via a Teacher signup path / Admin-created)
--
-- After those accounts exist, sample borrowings/fines/reservations/
-- notifications can be seeded against their real profile_id values —
-- included as part of the Phase 2 deliverable so the IDs are real, not
-- fabricated placeholders.
-- ============================================================================
-- END OF PHASE 1
-- ============================================================================
