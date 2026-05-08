-- Trade Facility Staff Workflow schema and RLS.
-- Run after users, listings, and role-access-schema.sql exist.

create table if not exists public.facility_bookings (
  booking_id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(listing_id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'booked'
    check (status in ('booked', 'dropoff_scheduled', 'received', 'ready_for_collection', 'released', 'cancelled')),
  dropoff_scheduled_at timestamptz,
  collection_scheduled_at timestamptz,
  item_received_at timestamptz,
  ready_for_collection_at timestamptz,
  released_at timestamptz,
  received_by uuid references auth.users(id),
  ready_by uuid references auth.users(id),
  released_by uuid references auth.users(id),
  released_to_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facility_booking_participants_differ check (buyer_id <> seller_id),
  constraint facility_booking_release_to_buyer check (released_to_user_id is null or released_to_user_id = buyer_id)
);

create table if not exists public.facility_staff_actions (
  action_id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.facility_bookings(booking_id) on delete cascade,
  staff_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  from_status text,
  to_status text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.facility_notifications (
  notification_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  booking_id uuid references public.facility_bookings(booking_id) on delete cascade,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists facility_bookings_dropoff_idx on public.facility_bookings(dropoff_scheduled_at);
create index if not exists facility_bookings_collection_idx on public.facility_bookings(collection_scheduled_at);
create index if not exists facility_bookings_status_idx on public.facility_bookings(status);
create index if not exists facility_staff_actions_booking_idx on public.facility_staff_actions(booking_id, created_at desc);
create index if not exists facility_notifications_user_idx on public.facility_notifications(user_id, read_at, created_at desc);

create or replace function public.prevent_non_staff_facility_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    coalesce(new.status, '') is distinct from coalesce(old.status, '')
    or new.item_received_at is distinct from old.item_received_at
    or new.ready_for_collection_at is distinct from old.ready_for_collection_at
    or new.released_at is distinct from old.released_at
    or new.received_by is distinct from old.received_by
    or new.ready_by is distinct from old.ready_by
    or new.released_by is distinct from old.released_by
    or new.released_to_user_id is distinct from old.released_to_user_id
  ) and not (public.is_staff() or public.is_admin()) then
    raise exception 'Only trade facility staff can update facility workflow status';
  end if;

  if new.status = 'released' and new.released_to_user_id is distinct from new.buyer_id then
    raise exception 'Item can only be released to the expected buyer';
  end if;

  return new;
end;
$$;

drop trigger if exists facility_bookings_staff_status_guard on public.facility_bookings;
create trigger facility_bookings_staff_status_guard
before update on public.facility_bookings
for each row
execute function public.prevent_non_staff_facility_status_change();

alter table public.facility_bookings enable row level security;
alter table public.facility_staff_actions enable row level security;
alter table public.facility_notifications enable row level security;

drop policy if exists "Facility bookings visible to participants and facility roles" on public.facility_bookings;
create policy "Facility bookings visible to participants and facility roles"
on public.facility_bookings
for select
using (
  public.is_staff()
  or public.is_admin()
  or auth.uid() = buyer_id
  or auth.uid() = seller_id
);

drop policy if exists "Participants can request facility bookings" on public.facility_bookings;
create policy "Participants can request facility bookings"
on public.facility_bookings
for insert
with check (
  auth.uid() = buyer_id
  or auth.uid() = seller_id
  or public.is_staff()
  or public.is_admin()
);

drop policy if exists "Staff can update facility bookings" on public.facility_bookings;
create policy "Staff can update facility bookings"
on public.facility_bookings
for update
using (public.is_staff() or public.is_admin())
with check (public.is_staff() or public.is_admin());

drop policy if exists "Staff can log facility actions" on public.facility_staff_actions;
create policy "Staff can log facility actions"
on public.facility_staff_actions
for insert
with check ((public.is_staff() or public.is_admin()) and auth.uid() = staff_id);

drop policy if exists "Staff and admins can read facility action logs" on public.facility_staff_actions;
create policy "Staff and admins can read facility action logs"
on public.facility_staff_actions
for select
using (public.is_staff() or public.is_admin());

drop policy if exists "Staff can create facility notifications" on public.facility_notifications;
create policy "Staff can create facility notifications"
on public.facility_notifications
for insert
with check (public.is_staff() or public.is_admin());

drop policy if exists "Users can read own facility notifications" on public.facility_notifications;
create policy "Users can read own facility notifications"
on public.facility_notifications
for select
using (auth.uid() = user_id or public.is_staff() or public.is_admin());

drop policy if exists "Users can mark own facility notifications read" on public.facility_notifications;
create policy "Users can mark own facility notifications read"
on public.facility_notifications
for update
using (auth.uid() = user_id or public.is_staff() or public.is_admin())
with check (auth.uid() = user_id or public.is_staff() or public.is_admin());
