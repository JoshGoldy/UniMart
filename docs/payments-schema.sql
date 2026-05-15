-- Payments for accepted UniMart transactions.
-- Run after offer-transaction-schema.sql.

alter table public.transactions
add column if not exists payment_status text not null default 'unpaid';

alter table public.transactions
add column if not exists online_paid_amount numeric not null default 0;

alter table public.transactions
add column if not exists cash_due_amount numeric not null default 0;

alter table public.transactions
add column if not exists cash_settled_at timestamptz;

alter table public.transactions
add column if not exists cash_settled_by uuid references auth.users(id);

alter table public.transactions
add column if not exists payment_gateway text;

alter table public.transactions
add column if not exists payment_reference text;

alter table public.transactions
drop constraint if exists transactions_payment_status_check;

alter table public.transactions
add constraint transactions_payment_status_check
check (payment_status in ('not_required', 'unpaid', 'pending', 'partial_pending', 'partial_paid', 'paid', 'failed', 'cancelled'));

update public.transactions
set cash_due_amount = coalesce(amount, 0),
    payment_status = case when coalesce(amount, 0) > 0 then 'unpaid' else 'not_required' end
where online_paid_amount = 0
  and cash_due_amount = 0;

create table if not exists public.payment_records (
  payment_id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(transaction_id) on delete cascade,
  offer_id uuid references public.offers(offer_id) on delete set null,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  gateway text not null default 'paystack',
  gateway_checkout_id text,
  gateway_payment_id text,
  amount numeric not null check (amount > 0),
  cash_due_amount numeric not null default 0 check (cash_due_amount >= 0),
  currency text not null default 'ZAR',
  status text not null default 'checkout_created' check (status in ('checkout_created', 'pending', 'paid', 'failed', 'cancelled')),
  checkout_url text,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_records_participants_differ check (buyer_id <> seller_id)
);

create index if not exists payment_records_transaction_idx on public.payment_records(transaction_id, created_at desc);
create index if not exists payment_records_gateway_checkout_idx on public.payment_records(gateway_checkout_id);

alter table public.payment_records enable row level security;

drop policy if exists "Participants can read payment records" on public.payment_records;
create policy "Participants can read payment records"
on public.payment_records
for select
using (auth.uid() in (buyer_id, seller_id) or public.is_staff() or public.is_admin());

drop policy if exists "Buyers can create payment records" on public.payment_records;
create policy "Buyers can create payment records"
on public.payment_records
for insert
with check (
  auth.uid() = buyer_id
  and exists (
    select 1
    from public.transactions
    join public.offers on offers.offer_id = transactions.offer_id
    where transactions.transaction_id = payment_records.transaction_id
      and transactions.buyer_id = auth.uid()
      and transactions.seller_id = payment_records.seller_id
      and offers.status = 'accepted'
  )
);

drop policy if exists "Staff can update payment records" on public.payment_records;
create policy "Staff can update payment records"
on public.payment_records
for update
using (public.is_staff() or public.is_admin())
with check (public.is_staff() or public.is_admin());

drop policy if exists "Participants can update payment tracking" on public.transactions;
create policy "Participants can update payment tracking"
on public.transactions
for update
using (auth.uid() = buyer_id or public.is_staff() or public.is_admin())
with check (auth.uid() = buyer_id or public.is_staff() or public.is_admin());
