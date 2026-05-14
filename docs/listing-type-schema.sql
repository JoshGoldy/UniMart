-- Adds explicit sale/trade/both support to listings.
-- Run in the Supabase SQL editor before relying on trade-only persistence.

alter table public.listings
add column if not exists listing_type text not null default 'sale';

update public.listings
set listing_type = case
  when coalesce(is_tradeable, false) then 'both'
  else 'sale'
end
where listing_type is null
   or listing_type not in ('sale', 'trade', 'both');

alter table public.listings
drop constraint if exists listings_listing_type_check;

alter table public.listings
add constraint listings_listing_type_check
check (listing_type in ('sale', 'trade', 'both'));

update public.listings
set is_tradeable = listing_type in ('trade', 'both');
