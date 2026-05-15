-- Saved listings / watchlist support.
-- Run this once before relying on saved listings across devices.

create table if not exists public.saved_listings (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(listing_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

alter table public.saved_listings enable row level security;

drop policy if exists "saved_listings_select_own" on public.saved_listings;
create policy "saved_listings_select_own"
on public.saved_listings for select
using (auth.uid() = user_id);

drop policy if exists "saved_listings_insert_own" on public.saved_listings;
create policy "saved_listings_insert_own"
on public.saved_listings for insert
with check (auth.uid() = user_id);

drop policy if exists "saved_listings_delete_own" on public.saved_listings;
create policy "saved_listings_delete_own"
on public.saved_listings for delete
using (auth.uid() = user_id);
