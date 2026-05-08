-- UniMart in-app messaging schema for Supabase.
-- Run this in the Supabase SQL editor before enabling the messaging UI in production.

create table if not exists public.conversations (
  conversation_id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(listing_id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'archived')),
  buyer_unread_count integer not null default 0 check (buyer_unread_count >= 0),
  seller_unread_count integer not null default 0 check (seller_unread_count >= 0),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_participants_differ check (buyer_id <> seller_id),
  constraint conversations_unique_listing_buyer unique (listing_id, buyer_id, seller_id)
);

create table if not exists public.messages (
  message_id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(conversation_id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists conversations_buyer_idx on public.conversations(buyer_id, last_message_at desc);
create index if not exists conversations_seller_idx on public.conversations(seller_id, last_message_at desc);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at asc);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Participants can read conversations" on public.conversations;
create policy "Participants can read conversations"
on public.conversations
for select
using (auth.uid() = buyer_id or auth.uid() = seller_id);

drop policy if exists "Buyers can create listing conversations" on public.conversations;
create policy "Buyers can create listing conversations"
on public.conversations
for insert
with check (
  auth.uid() = buyer_id
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
using (auth.uid() = buyer_id or auth.uid() = seller_id)
with check (auth.uid() = buyer_id or auth.uid() = seller_id);

drop policy if exists "Participants can read messages" on public.messages;
create policy "Participants can read messages"
on public.messages
for select
using (
  exists (
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
  auth.uid() = sender_id
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
  exists (
    select 1
    from public.conversations
    where conversations.conversation_id = messages.conversation_id
      and (auth.uid() = conversations.buyer_id or auth.uid() = conversations.seller_id)
  )
)
with check (
  exists (
    select 1
    from public.conversations
    where conversations.conversation_id = messages.conversation_id
      and (auth.uid() = conversations.buyer_id or auth.uid() = conversations.seller_id)
  )
);
