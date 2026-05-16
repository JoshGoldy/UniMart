-- Offer and transaction domain for UniMart.
-- Run after the conversations/messages and trade facility booking schemas.

create table if not exists public.offers (
  offer_id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(conversation_id) on delete cascade,
  listing_id uuid not null references public.listings(listing_id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  offer_type text not null default 'purchase' check (offer_type in ('purchase', 'trade')),
  amount numeric,
  note text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offers_participants_differ check (buyer_id <> seller_id),
  constraint offers_purchase_amount_check check (
    (offer_type = 'purchase' and amount is not null and amount >= 0)
    or (offer_type = 'trade')
  )
);

create table if not exists public.transactions (
  transaction_id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(offer_id) on delete restrict,
  conversation_id uuid not null references public.conversations(conversation_id) on delete cascade,
  listing_id uuid not null references public.listings(listing_id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  amount numeric,
  status text not null default 'accepted' check (status in ('accepted', 'facility_booked', 'completed', 'cancelled')),
  facility_booking_id uuid references public.facility_bookings(booking_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_participants_differ check (buyer_id <> seller_id)
);

create index if not exists offers_conversation_idx on public.offers(conversation_id, created_at desc);
create index if not exists offers_seller_status_idx on public.offers(seller_id, status, created_at desc);
create index if not exists offers_buyer_status_idx on public.offers(buyer_id, status, created_at desc);
create unique index if not exists transactions_offer_unique_idx on public.transactions(offer_id);
create index if not exists transactions_conversation_idx on public.transactions(conversation_id, created_at desc);

alter table public.facility_bookings
add column if not exists transaction_id uuid references public.transactions(transaction_id);

alter table public.facility_bookings
alter column collection_scheduled_at drop not null;

alter table public.facility_bookings
drop constraint if exists facility_bookings_schedule_check;

alter table public.facility_bookings
add constraint facility_bookings_schedule_check
check (collection_scheduled_at is null or collection_scheduled_at >= dropoff_scheduled_at);

create index if not exists facility_bookings_transaction_idx on public.facility_bookings(transaction_id);

alter table public.offers enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "Participants can read offers" on public.offers;
create policy "Participants can read offers"
on public.offers
for select
using (auth.uid() = buyer_id or auth.uid() = seller_id);

drop policy if exists "Buyers can create offers" on public.offers;
create policy "Buyers can create offers"
on public.offers
for insert
with check (
  auth.uid() = buyer_id
  and buyer_id <> seller_id
  and status = 'pending'
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
using (auth.uid() = seller_id)
with check (auth.uid() = seller_id);

drop policy if exists "Participants can read transactions" on public.transactions;
create policy "Participants can read transactions"
on public.transactions
for select
using (auth.uid() = buyer_id or auth.uid() = seller_id);

drop policy if exists "Sellers can create transactions from accepted offers" on public.transactions;
create policy "Sellers can create transactions from accepted offers"
on public.transactions
for insert
with check (
  auth.uid() = seller_id
  and exists (
    select 1
    from public.offers
    where offers.offer_id = transactions.offer_id
      and offers.status = 'accepted'
      and offers.seller_id = auth.uid()
  )
);

drop policy if exists "Buyers can attach facility bookings to their transactions" on public.transactions;
create policy "Buyers can attach facility bookings to their transactions"
on public.transactions
for update
using (auth.uid() = buyer_id)
with check (auth.uid() = buyer_id);

drop policy if exists "Buyers can create facility bookings" on public.facility_bookings;
drop policy if exists "Sellers can create facility dropoff bookings" on public.facility_bookings;
create policy "Sellers can create facility dropoff bookings"
on public.facility_bookings
for insert
with check (
  auth.uid() = seller_id
  and buyer_id <> seller_id
  and transaction_id is not null
  and collection_scheduled_at is null
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
