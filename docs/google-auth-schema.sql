-- Google OAuth support.
-- Run this after the users table exists. It lets a newly authenticated Google
-- user create their own public profile row on first sign-in.

alter table public.users enable row level security;

drop policy if exists "Users can create own profile" on public.users;
create policy "Users can create own profile"
on public.users
for insert
with check (auth.uid() = id);
