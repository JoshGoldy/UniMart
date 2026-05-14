-- Ratings, reviews, and moderation backend for UniMart.
-- Run after offer-transaction-schema.sql.

create table if not exists public.reviews (
  review_id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(transaction_id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  reviewee_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(listing_id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text,
  status text not null default 'visible' check (status in ('visible', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_participants_differ check (reviewer_id <> reviewee_id),
  constraint reviews_unique_direction unique (transaction_id, reviewer_id, reviewee_id)
);

create table if not exists public.content_reports (
  report_id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('listing', 'review')),
  target_id uuid not null,
  listing_id uuid references public.listings(listing_id) on delete set null,
  reason text not null check (length(trim(reason)) > 0),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moderation_actions (
  action_id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists reviews_reviewee_visible_idx on public.reviews(reviewee_id, status, created_at desc);
create index if not exists reviews_listing_visible_idx on public.reviews(listing_id, status, created_at desc);
create index if not exists content_reports_status_idx on public.content_reports(status, created_at desc);
create index if not exists moderation_actions_created_idx on public.moderation_actions(created_at desc);

alter table public.reviews enable row level security;
alter table public.content_reports enable row level security;
alter table public.moderation_actions enable row level security;

drop policy if exists "Admins can moderate listings" on public.listings;
create policy "Admins can moderate listings"
on public.listings
for update
using (exists (select 1 from public.users where users.id = auth.uid() and users.user_role = 'admin'))
with check (exists (select 1 from public.users where users.id = auth.uid() and users.user_role = 'admin'));

drop policy if exists "Visible reviews are readable" on public.reviews;
create policy "Visible reviews are readable"
on public.reviews
for select
using (
  status = 'visible'
  or auth.uid() = reviewer_id
  or auth.uid() = reviewee_id
  or exists (select 1 from public.users where users.id = auth.uid() and users.user_role = 'admin')
);

drop policy if exists "Participants can create transaction reviews" on public.reviews;
create policy "Participants can create transaction reviews"
on public.reviews
for insert
with check (
  auth.uid() = reviewer_id
  and reviewer_id <> reviewee_id
  and exists (
    select 1
    from public.transactions
    where transactions.transaction_id = reviews.transaction_id
      and transactions.listing_id = reviews.listing_id
      and transactions.status in ('facility_booked', 'completed')
      and auth.uid() in (transactions.buyer_id, transactions.seller_id)
      and reviewee_id in (transactions.buyer_id, transactions.seller_id)
  )
);

drop policy if exists "Review authors can edit their reviews" on public.reviews;
create policy "Review authors can edit their reviews"
on public.reviews
for update
using (auth.uid() = reviewer_id and status = 'visible')
with check (auth.uid() = reviewer_id and status = 'visible');

drop policy if exists "Admins can moderate reviews" on public.reviews;
create policy "Admins can moderate reviews"
on public.reviews
for update
using (exists (select 1 from public.users where users.id = auth.uid() and users.user_role = 'admin'))
with check (exists (select 1 from public.users where users.id = auth.uid() and users.user_role = 'admin'));

drop policy if exists "Users can create content reports" on public.content_reports;
create policy "Users can create content reports"
on public.content_reports
for insert
with check (auth.uid() = reporter_id);

drop policy if exists "Reporters and admins can read content reports" on public.content_reports;
create policy "Reporters and admins can read content reports"
on public.content_reports
for select
using (
  auth.uid() = reporter_id
  or exists (select 1 from public.users where users.id = auth.uid() and users.user_role = 'admin')
);

drop policy if exists "Admins can update content reports" on public.content_reports;
create policy "Admins can update content reports"
on public.content_reports
for update
using (exists (select 1 from public.users where users.id = auth.uid() and users.user_role = 'admin'))
with check (exists (select 1 from public.users where users.id = auth.uid() and users.user_role = 'admin'));

drop policy if exists "Admins can read moderation actions" on public.moderation_actions;
create policy "Admins can read moderation actions"
on public.moderation_actions
for select
using (exists (select 1 from public.users where users.id = auth.uid() and users.user_role = 'admin'));

drop policy if exists "Admins can create moderation actions" on public.moderation_actions;
create policy "Admins can create moderation actions"
on public.moderation_actions
for insert
with check (exists (select 1 from public.users where users.id = auth.uid() and users.user_role = 'admin'));
