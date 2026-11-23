-- =============================================================
-- freekku — Supabase Schema  (security-hardened)
-- Run in: Supabase Dashboard → SQL Editor → New query
-- =============================================================

-- ── 1. Enable UUID generation ─────────────────────────────────
create extension if not exists "pgcrypto";

-- ── 2. Create offerings table ─────────────────────────────────
create table if not exists public.offerings (
  id               uuid             primary key default gen_random_uuid(),
  image_url        text             not null,
  location         text             not null,
  note             text             check (char_length(note) <= 200),
  status           text             not null default 'Available'
                                    check (status in ('Available', 'AlmostGone', 'OutOfStock')),
  proof_image_url  text,
  lat              double precision check (lat  between -90  and 90),
  lng              double precision check (lng  between -180 and 180),
  created_at       timestamptz      not null default now()
);

-- ── 3. Indexes ────────────────────────────────────────────────
-- Feed query: filter by created_at
create index if not exists offerings_created_at_idx
  on public.offerings (created_at desc);

-- Realtime subscription filters by status often
create index if not exists offerings_status_idx
  on public.offerings (status);

-- ── 4. Row-Level Security ─────────────────────────────────────
alter table public.offerings enable row level security;

-- ▸ Anyone can read (public board)
create policy "public read"
  on public.offerings
  for select
  using (true);

-- ▸ Anyone can insert a new offering
--   Server Action enforces CAPTCHA + GPS before calling this.
create policy "public insert"
  on public.offerings
  for insert
  with check (
    status = 'Available'           -- new posts must start as Available
    and char_length(location) > 0
    and char_length(location) <= 100
    and (note is null or char_length(note) <= 200)
  );

-- ▸ Status transitions: only the two valid forward moves are allowed.
--   Available   → AlmostGone  (simple crowdsource tap)
--   AlmostGone  → OutOfStock  (requires proof + geofence, enforced in Server Action)
--
--   This policy makes it IMPOSSIBLE to skip statuses or go backwards
--   even if someone calls the Supabase REST API directly.
create policy "status transition only"
  on public.offerings
  for update
  using (true)
  with check (
    (
      -- Available → AlmostGone
      current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
      and status = 'AlmostGone'
      and (select o.status from public.offerings o where o.id = id) = 'Available'
    )
    or
    (
      -- AlmostGone → OutOfStock (Server Action uses service_role key)
      status = 'OutOfStock'
      and proof_image_url is not null
    )
  );

-- ── 5. Realtime ───────────────────────────────────────────────
alter publication supabase_realtime add table public.offerings;

-- ── 6. Storage buckets ────────────────────────────────────────

-- Offering images (posted by creator)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'offering-images',
  'offering-images',
  true,
  512000,                          -- 500 KB max (client compresses to ~300 KB)
  array['image/webp']              -- only WebP — client converts before upload
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Proof images (uploaded when reporting OutOfStock)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'proofs',
  'proofs',
  true,
  512000,
  array['image/webp']
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── 7. Storage RLS policies ───────────────────────────────────

-- offering-images: upload
drop policy if exists "public upload" on storage.objects;
create policy "offering-images upload"
  on storage.objects
  for insert
  to public
  with check (
    bucket_id = 'offering-images'
    and octet_length(encode(name::bytea, 'escape')) < 200   -- filename length guard
  );

-- offering-images: read
drop policy if exists "public read images" on storage.objects;
create policy "offering-images read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'offering-images');

-- proofs: upload
create policy "proofs upload"
  on storage.objects
  for insert
  to public
  with check (
    bucket_id = 'proofs'
    and octet_length(encode(name::bytea, 'escape')) < 200
  );

-- proofs: read
create policy "proofs read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'proofs');
