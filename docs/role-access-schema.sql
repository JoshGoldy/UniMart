-- Role-based access support for UniMart.
-- Roles: student, staff, admin. Account type remains separate for student buyer/seller features.

alter table public.users
add column if not exists user_role text not null default 'student'
check (user_role in ('student', 'staff', 'admin'));

alter table public.users drop constraint if exists users_account_type_check;
alter table public.users
add constraint users_account_type_check
check (account_type in ('buyer', 'seller', 'seller_buyer'));

create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select users.user_role from public.users where users.id = auth.uid()),
    'student'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_user_role() = 'admin';
$$;

create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_user_role() = 'staff';
$$;

create or replace function public.is_student()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_user_role() = 'student';
$$;

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

create or replace function public.prevent_non_admin_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.user_role, 'student') is distinct from coalesce(old.user_role, 'student')
     and not public.is_admin() then
    raise exception 'Only admins can change user roles';
  end if;
  return new;
end;
$$;

drop trigger if exists users_prevent_non_admin_role_change on public.users;
create trigger users_prevent_non_admin_role_change
before update of user_role on public.users
for each row
execute function public.prevent_non_admin_role_change();

-- Users can read/update their own profile. Admins can read/update profiles for configuration.
alter table public.users enable row level security;

drop policy if exists "Users can read own profile" on public.users;
create policy "Users can read own profile"
on public.users
for select
using (auth.uid() = id or public.is_admin());

drop policy if exists "Users can update own profile" on public.users;
create policy "Users can update own profile"
on public.users
for update
using (auth.uid() = id or public.is_admin())
with check (
  auth.uid() = id or public.is_admin()
);

-- Marketplace listings are student-facing. Staff/admin can inspect records, but students own write actions.
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

-- Conversations/messages remain participant-only; students can use marketplace messaging.
-- Staff/admin do not automatically get private thread access unless they are participants.
drop policy if exists "Participants can read conversations" on public.conversations;
create policy "Participants can read conversations"
on public.conversations
for select
using (public.is_student() and (auth.uid() = buyer_id or auth.uid() = seller_id));

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

drop policy if exists "Participants can update conversation status" on public.conversations;
create policy "Participants can update conversation status"
on public.conversations
for update
using (public.is_student() and (auth.uid() = buyer_id or auth.uid() = seller_id))
with check (public.is_student() and (auth.uid() = buyer_id or auth.uid() = seller_id));

drop policy if exists "Participants can read messages" on public.messages;
create policy "Participants can read messages"
on public.messages
for select
using (
  public.is_student()
  and exists (
    select 1
    from public.conversations
    where conversations.conversation_id = messages.conversation_id
      and (auth.uid() = conversations.buyer_id or auth.uid() = conversations.seller_id)
  )
);

drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages"
on public.messages
for insert
with check (
  public.is_student()
  and auth.uid() = sender_id
  and exists (
    select 1
    from public.conversations
    where conversations.conversation_id = messages.conversation_id
      and (auth.uid() = conversations.buyer_id or auth.uid() = conversations.seller_id)
  )
);

drop policy if exists "Participants can mark messages read" on public.messages;
create policy "Participants can mark messages read"
on public.messages
for update
using (
  public.is_student()
  and exists (
    select 1
    from public.conversations
    where conversations.conversation_id = messages.conversation_id
      and (auth.uid() = conversations.buyer_id or auth.uid() = conversations.seller_id)
  )
)
with check (
  public.is_student()
  and exists (
    select 1
    from public.conversations
    where conversations.conversation_id = messages.conversation_id
      and (auth.uid() = conversations.buyer_id or auth.uid() = conversations.seller_id)
  )
);
