-- Add public usernames for display in marketplace cards and message threads.
-- UUID seller/buyer ids remain the source of truth for ownership and security.

alter table public.users
add column if not exists username text;

create unique index if not exists users_username_unique_idx
on public.users (lower(username))
where username is not null;
