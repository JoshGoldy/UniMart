-- Incremental UAT completion SQL.
-- Run after the existing role, messaging, facility workflow, and admin workflow SQL files.

alter table public.users drop constraint if exists users_account_type_check;
alter table public.users
add constraint users_account_type_check
check (account_type in ('buyer', 'seller', 'seller_buyer'));

create or replace function public.current_account_type()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select users.account_type from public.users where users.id = auth.uid()),
    'buyer'
  );
$$;

create or replace function public.is_buyer_account()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_account_type() in ('buyer', 'seller_buyer');
$$;

create or replace function public.is_seller_account()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_account_type() in ('seller', 'seller_buyer');
$$;

drop policy if exists "Students can read active listings" on public.listings;
create policy "Students can read active listings"
on public.listings
for select
using (
  public.is_admin()
  or public.is_staff()
  or (public.is_student() and (
    (public.is_buyer_account() and status = 'active')
    or (public.is_seller_account() and seller_id = auth.uid())
  ))
);

drop policy if exists "Student sellers can create listings" on public.listings;
create policy "Student sellers can create listings"
on public.listings
for insert
with check (public.is_student() and public.is_seller_account() and seller_id = auth.uid());

drop policy if exists "Student sellers can update own listings" on public.listings;
create policy "Student sellers can update own listings"
on public.listings
for update
using ((public.is_student() and public.is_seller_account() and seller_id = auth.uid()) or public.is_admin())
with check ((public.is_student() and public.is_seller_account() and seller_id = auth.uid()) or public.is_admin());

drop policy if exists "Student sellers can delete own listings" on public.listings;
create policy "Student sellers can delete own listings"
on public.listings
for delete
using ((public.is_student() and public.is_seller_account() and seller_id = auth.uid()) or public.is_admin());

drop policy if exists "Buyers can create listing conversations" on public.conversations;
create policy "Buyers can create listing conversations"
on public.conversations
for insert
with check (
  public.is_student()
  and public.is_buyer_account()
  and auth.uid() = buyer_id
  and buyer_id <> seller_id
  and exists (
    select 1
    from public.listings
    where listings.listing_id = conversations.listing_id
      and listings.seller_id = conversations.seller_id
      and listings.status = 'active'
  )
);

create table if not exists public.reviews (
  review_id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(listing_id) on delete cascade,
  reviewer_id uuid references public.users(id) on delete set null,
  reviewee_id uuid references public.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.reviews enable row level security;

drop policy if exists "Students can read reviews" on public.reviews;
create policy "Students can read reviews"
on public.reviews
for select
using (public.is_student() or public.is_admin());

drop policy if exists "Students can create reviews" on public.reviews;
create policy "Students can create reviews"
on public.reviews
for insert
with check (public.is_student() and auth.uid() = reviewer_id and reviewer_id <> reviewee_id);

drop policy if exists "Admins can remove reviews" on public.reviews;
create policy "Admins can remove reviews"
on public.reviews
for delete
using (public.is_admin());

alter table public.moderation_actions drop constraint if exists moderation_actions_target_type_check;
alter table public.moderation_actions
add constraint moderation_actions_target_type_check
check (target_type in ('listing', 'review', 'message', 'user', 'report', 'facility_config', 'role_permission'));

create index if not exists idx_reviews_reviewee on public.reviews(reviewee_id, created_at desc);
