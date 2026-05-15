-- Backend role security hardening for UniMart.
-- Run after the base schema plus listing/offers/facility/reviews migrations.

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select users.user_role from public.users where users.id = auth.uid()),
    'student'
  );
$$;

create or replace function public.current_account_type()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select users.account_type from public.users where users.id = auth.uid()),
    'buyer'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'admin';
$$;

create or replace function public.is_staff_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('staff', 'admin');
$$;

create or replace function public.is_student_buyer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'student'
    and public.current_account_type() in ('buyer', 'seller_buyer');
$$;

create or replace function public.is_student_seller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'student'
    and public.current_account_type() in ('seller', 'seller_buyer');
$$;

create or replace function public.prevent_non_admin_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.user_role is distinct from new.user_role and not public.is_admin() then
    raise exception 'Only admins can change user roles.';
  end if;

  if new.user_role not in ('student', 'staff', 'admin') then
    raise exception 'Invalid user role.';
  end if;

  if new.user_role = 'student' and new.account_type not in ('buyer', 'seller', 'seller_buyer') then
    raise exception 'Invalid student account type.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_non_admin_role_change on public.users;
create trigger prevent_non_admin_role_change
before update on public.users
for each row
execute function public.prevent_non_admin_role_change();

alter table public.users enable row level security;
alter table public.listings enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.role_permissions enable row level security;

drop policy if exists "Users can read own profile" on public.users;
create policy "Users can read own profile"
on public.users
for select
using (auth.uid() = id or public.is_staff_or_admin());

drop policy if exists "Users can insert own profile" on public.users;
create policy "Users can insert own profile"
on public.users
for insert
with check (
  auth.uid() = id
  and user_role in ('student', 'staff')
  and (user_role <> 'student' or account_type in ('buyer', 'seller', 'seller_buyer'))
);

drop policy if exists "Users can update own non-role profile" on public.users;
create policy "Users can update own non-role profile"
on public.users
for update
using (auth.uid() = id)
with check (
  auth.uid() = id
  and user_role = public.current_user_role()
  and (public.current_user_role() <> 'student' or account_type in ('buyer', 'seller', 'seller_buyer'))
);

drop policy if exists "Admins can manage user roles" on public.users;
create policy "Admins can manage user roles"
on public.users
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Authenticated users can read role permissions" on public.role_permissions;
create policy "Authenticated users can read role permissions"
on public.role_permissions
for select
using (auth.uid() is not null);

drop policy if exists "Admins can manage role permissions" on public.role_permissions;
create policy "Admins can manage role permissions"
on public.role_permissions
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Authenticated users can read active listings" on public.listings;
create policy "Authenticated users can read active listings"
on public.listings
for select
using (status = 'active' or seller_id = auth.uid() or public.is_admin());

drop policy if exists "Student sellers can create listings" on public.listings;
create policy "Student sellers can create listings"
on public.listings
for insert
with check (
  seller_id = auth.uid()
  and public.is_student_seller()
  and status in ('active', 'draft')
);

drop policy if exists "Student sellers can update own listings" on public.listings;
create policy "Student sellers can update own listings"
on public.listings
for update
using (seller_id = auth.uid() and public.is_student_seller())
with check (seller_id = auth.uid() and public.is_student_seller());

drop policy if exists "Student sellers can delete own listings" on public.listings;
create policy "Student sellers can delete own listings"
on public.listings
for delete
using (seller_id = auth.uid() and public.is_student_seller());

drop policy if exists "Admins can read all listings" on public.listings;
create policy "Admins can read all listings"
on public.listings
for select
using (public.is_admin());

drop policy if exists "Admins can moderate listings" on public.listings;
create policy "Admins can moderate listings"
on public.listings
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Participants can read conversations" on public.conversations;
create policy "Participants can read conversations"
on public.conversations
for select
using (auth.uid() in (buyer_id, seller_id) or public.is_admin());

drop policy if exists "Student buyers can start conversations" on public.conversations;
create policy "Student buyers can start conversations"
on public.conversations
for insert
with check (
  auth.uid() = buyer_id
  and buyer_id <> seller_id
  and public.is_student_buyer()
  and exists (
    select 1
    from public.listings
    where listings.listing_id = conversations.listing_id
      and listings.seller_id = conversations.seller_id
      and listings.status = 'active'
  )
);

drop policy if exists "Participants can update conversation timestamps" on public.conversations;
create policy "Participants can update conversation timestamps"
on public.conversations
for update
using (auth.uid() in (buyer_id, seller_id))
with check (auth.uid() in (buyer_id, seller_id));

drop policy if exists "Participants can read messages" on public.messages;
create policy "Participants can read messages"
on public.messages
for select
using (
  exists (
    select 1
    from public.conversations
    where conversations.conversation_id = messages.conversation_id
      and (auth.uid() in (conversations.buyer_id, conversations.seller_id) or public.is_admin())
  )
);

drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages"
on public.messages
for insert
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.conversations
    where conversations.conversation_id = messages.conversation_id
      and auth.uid() in (conversations.buyer_id, conversations.seller_id)
  )
);

drop policy if exists "Recipients can mark messages read" on public.messages;
create policy "Recipients can mark messages read"
on public.messages
for update
using (
  exists (
    select 1
    from public.conversations
    where conversations.conversation_id = messages.conversation_id
      and auth.uid() in (conversations.buyer_id, conversations.seller_id)
      and messages.sender_id <> auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.conversations
    where conversations.conversation_id = messages.conversation_id
      and auth.uid() in (conversations.buyer_id, conversations.seller_id)
      and messages.sender_id <> auth.uid()
  )
);

drop policy if exists "Participants can read offers" on public.offers;
create policy "Participants can read offers"
on public.offers
for select
using (auth.uid() in (buyer_id, seller_id) or public.is_admin());

drop policy if exists "Buyers can create offers" on public.offers;
create policy "Buyers can create offers"
on public.offers
for insert
with check (
  auth.uid() = buyer_id
  and buyer_id <> seller_id
  and status = 'pending'
  and public.is_student_buyer()
  and exists (
    select 1
    from public.conversations
    where conversations.conversation_id = offers.conversation_id
      and conversations.listing_id = offers.listing_id
      and conversations.buyer_id = offers.buyer_id
      and conversations.seller_id = offers.seller_id
  )
);

drop policy if exists "Sellers can respond to offers" on public.offers;
create policy "Sellers can respond to offers"
on public.offers
for update
using (auth.uid() = seller_id and public.is_student_seller())
with check (auth.uid() = seller_id and public.is_student_seller());

drop policy if exists "Participants can read transactions" on public.transactions;
create policy "Participants can read transactions"
on public.transactions
for select
using (auth.uid() in (buyer_id, seller_id) or public.is_staff_or_admin());

drop policy if exists "Sellers can create transactions from accepted offers" on public.transactions;
create policy "Sellers can create transactions from accepted offers"
on public.transactions
for insert
with check (
  auth.uid() = seller_id
  and public.is_student_seller()
  and exists (
    select 1
    from public.offers
    where offers.offer_id = transactions.offer_id
      and offers.status = 'accepted'
      and offers.seller_id = auth.uid()
  )
);

drop policy if exists "Participants can update their transaction handover" on public.transactions;
drop policy if exists "Buyers can attach facility bookings to their transactions" on public.transactions;
create policy "Participants can update their transaction handover"
on public.transactions
for update
using (auth.uid() in (buyer_id, seller_id))
with check (auth.uid() in (buyer_id, seller_id));

drop policy if exists "Facility bookings visible to participants and staff" on public.facility_bookings;
drop policy if exists "Authenticated users can read facility bookings" on public.facility_bookings;
create policy "Facility bookings visible to participants and staff"
on public.facility_bookings
for select
using (auth.uid() in (buyer_id, seller_id) or public.is_staff_or_admin());

drop policy if exists "Staff and admins can update facility bookings" on public.facility_bookings;
create policy "Staff and admins can update facility bookings"
on public.facility_bookings
for update
using (public.is_staff_or_admin())
with check (public.is_staff_or_admin());

drop policy if exists "Admins can manage facility config" on public.facility_config;
create policy "Admins can manage facility config"
on public.facility_config
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can read moderation actions" on public.moderation_actions;
create policy "Admins can read moderation actions"
on public.moderation_actions
for select
using (public.is_admin());

drop policy if exists "Admins can create moderation actions" on public.moderation_actions;
create policy "Admins can create moderation actions"
on public.moderation_actions
for insert
with check (public.is_admin());

drop policy if exists "Admins can update content reports" on public.content_reports;
create policy "Admins can update content reports"
on public.content_reports
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can moderate reviews" on public.reviews;
create policy "Admins can moderate reviews"
on public.reviews
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Students can upload own listing images" on storage.objects;
create policy "Students can upload own listing images"
on storage.objects
for insert
with check (
  bucket_id = 'listing-images'
  and auth.uid() is not null
  and public.is_student_seller()
  and owner = auth.uid()
);

drop policy if exists "Listing images are publicly readable" on storage.objects;
create policy "Listing images are publicly readable"
on storage.objects
for select
using (bucket_id = 'listing-images');

drop policy if exists "Students can manage own listing images" on storage.objects;
create policy "Students can manage own listing images"
on storage.objects
for update
using (bucket_id = 'listing-images' and owner = auth.uid() and public.is_student_seller())
with check (bucket_id = 'listing-images' and owner = auth.uid() and public.is_student_seller());

drop policy if exists "Students can delete own listing images" on storage.objects;
create policy "Students can delete own listing images"
on storage.objects
for delete
using (bucket_id = 'listing-images' and owner = auth.uid() and public.is_student_seller());
