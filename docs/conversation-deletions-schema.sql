-- Per-user inbox deletion for conversations.
-- This hides a conversation for the user who deleted it without destroying
-- messages, offers, payments, or transaction audit history for the other user.

create table if not exists public.conversation_deletions (
  conversation_id uuid not null references public.conversations(conversation_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  deleted_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_deletions_user_idx
on public.conversation_deletions(user_id, deleted_at desc);

alter table public.conversation_deletions enable row level security;

drop policy if exists "Users can read their deleted conversations" on public.conversation_deletions;
create policy "Users can read their deleted conversations"
on public.conversation_deletions
for select
using (auth.uid() = user_id);

drop policy if exists "Users can hide their own conversations" on public.conversation_deletions;
create policy "Users can hide their own conversations"
on public.conversation_deletions
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.conversations
    where conversations.conversation_id = conversation_deletions.conversation_id
      and auth.uid() in (conversations.buyer_id, conversations.seller_id)
  )
);

drop policy if exists "Users can update their own deleted conversations" on public.conversation_deletions;
create policy "Users can update their own deleted conversations"
on public.conversation_deletions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

