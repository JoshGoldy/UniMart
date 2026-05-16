-- Trade facility booking flow for student handovers.
-- Run after the base listings/users schema exists.

create table if not exists public.facility_config (
  config_id text primary key default 'default',
  opens_at time not null default '09:00',
  closes_at time not null default '17:00',
  slot_minutes integer not null default 30 check (slot_minutes between 10 and 240),
  slot_capacity integer not null default 1 check (slot_capacity > 0),
  operating_days text[] not null default array['monday','tuesday','wednesday','thursday','friday'],
  updated_at timestamptz not null default now(),
  constraint facility_config_singleton check (config_id = 'default'),
  constraint facility_config_hours_check check (opens_at < closes_at)
);

insert into public.facility_config (config_id)
values ('default')
on conflict (config_id) do nothing;

create table if not exists public.facility_bookings (
  booking_id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(listing_id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  dropoff_scheduled_at timestamptz not null,
  collection_scheduled_at timestamptz,
  status text not null default 'pending_dropoff' check (status in ('pending_dropoff', 'received', 'ready_for_collection', 'released', 'cancelled')),
  note text,
  received_at timestamptz,
  received_by uuid references auth.users(id),
  ready_at timestamptz,
  marked_ready_by uuid references auth.users(id),
  released_at timestamptz,
  released_by uuid references auth.users(id),
  released_to uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facility_bookings_participants_differ check (buyer_id <> seller_id),
  constraint facility_bookings_schedule_check check (collection_scheduled_at is null or collection_scheduled_at >= dropoff_scheduled_at)
);

alter table public.facility_bookings
alter column collection_scheduled_at drop not null;

alter table public.facility_bookings
drop constraint if exists facility_bookings_schedule_check;

alter table public.facility_bookings
add constraint facility_bookings_schedule_check
check (collection_scheduled_at is null or collection_scheduled_at >= dropoff_scheduled_at);

alter table public.facility_bookings
drop constraint if exists facility_bookings_status_check;

alter table public.facility_bookings
add constraint facility_bookings_status_check
check (status in ('pending_dropoff', 'pending', 'booked', 'confirmed', 'scheduled', 'received', 'dropoff_confirmed', 'at_facility', 'ready_for_collection', 'ready', 'collection_ready', 'released', 'completed', 'collected', 'closed', 'cancelled'));

create unique index if not exists facility_bookings_one_active_per_buyer_listing
on public.facility_bookings (listing_id, buyer_id)
where status in ('pending_dropoff', 'pending', 'booked', 'confirmed', 'scheduled', 'received', 'dropoff_confirmed', 'at_facility', 'ready_for_collection', 'ready', 'collection_ready');

create index if not exists facility_bookings_dropoff_idx on public.facility_bookings(dropoff_scheduled_at);
create index if not exists facility_bookings_collection_idx on public.facility_bookings(collection_scheduled_at);
create index if not exists facility_bookings_staff_status_idx on public.facility_bookings(status, dropoff_scheduled_at, collection_scheduled_at);

alter table public.facility_config enable row level security;
alter table public.facility_bookings enable row level security;

drop policy if exists "Authenticated users can read facility config" on public.facility_config;
create policy "Authenticated users can read facility config"
on public.facility_config
for select
using (auth.uid() is not null);

drop policy if exists "Admins can manage facility config" on public.facility_config;
create policy "Admins can manage facility config"
on public.facility_config
for all
using (
  exists (
    select 1 from public.users
    where users.id = auth.uid()
      and users.user_role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.users
    where users.id = auth.uid()
      and users.user_role = 'admin'
  )
);

drop policy if exists "Authenticated users can read facility bookings" on public.facility_bookings;
create policy "Authenticated users can read facility bookings"
on public.facility_bookings
for select
using (auth.uid() is not null);

drop policy if exists "Buyers can create facility bookings" on public.facility_bookings;
drop policy if exists "Sellers can create facility dropoff bookings" on public.facility_bookings;
create policy "Sellers can create facility dropoff bookings"
on public.facility_bookings
for insert
with check (
  auth.uid() = seller_id
  and buyer_id <> seller_id
  and collection_scheduled_at is null
  and transaction_id is not null
  and exists (
    select 1
    from public.transactions
    where transactions.transaction_id = facility_bookings.transaction_id
      and transactions.buyer_id = facility_bookings.buyer_id
      and transactions.seller_id = facility_bookings.seller_id
      and transactions.listing_id = facility_bookings.listing_id
      and transactions.status = 'accepted'
  )
);

drop policy if exists "Buyers can confirm facility collection" on public.facility_bookings;
create policy "Buyers can confirm facility collection"
on public.facility_bookings
for update
using (auth.uid() = buyer_id)
with check (auth.uid() = buyer_id);

drop policy if exists "Staff and admins can update facility bookings" on public.facility_bookings;
create policy "Staff and admins can update facility bookings"
on public.facility_bookings
for update
using (
  exists (
    select 1 from public.users
    where users.id = auth.uid()
      and users.user_role in ('staff', 'admin')
  )
)
with check (
  exists (
    select 1 from public.users
    where users.id = auth.uid()
      and users.user_role in ('staff', 'admin')
  )
);
