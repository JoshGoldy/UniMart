-- Admin workflow support for UniMart.
-- Run this after docs/role-access-schema.sql so public.is_admin() exists.

create table if not exists public.facility_config (
  config_id text primary key default 'default' check (config_id = 'default'),
  operating_days text[] not null default array['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  opens_at time not null default '09:00',
  closes_at time not null default '17:00',
  slot_minutes integer not null default 30 check (slot_minutes between 10 and 240),
  slot_capacity integer not null default 4 check (slot_capacity > 0),
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.facility_config (config_id)
values ('default')
on conflict (config_id) do nothing;

create table if not exists public.role_permissions (
  role text not null check (role in ('student', 'staff', 'admin')),
  permission text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (role, permission)
);

insert into public.role_permissions (role, permission, enabled)
values
  ('student', 'marketplace_browsing', true),
  ('student', 'listing_management', true),
  ('student', 'messaging', true),
  ('student', 'trade_facility_workflow', false),
  ('student', 'admin_configuration', false),
  ('student', 'moderation', false),
  ('staff', 'marketplace_browsing', false),
  ('staff', 'listing_management', false),
  ('staff', 'messaging', false),
  ('staff', 'trade_facility_workflow', true),
  ('staff', 'admin_configuration', false),
  ('staff', 'moderation', false),
  ('admin', 'marketplace_browsing', false),
  ('admin', 'listing_management', false),
  ('admin', 'messaging', false),
  ('admin', 'trade_facility_workflow', false),
  ('admin', 'admin_configuration', true),
  ('admin', 'moderation', true)
on conflict (role, permission) do nothing;

create table if not exists public.reviews (
  review_id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(listing_id) on delete cascade,
  reviewer_id uuid references public.users(id) on delete set null,
  reviewee_id uuid references public.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.content_reports (
  report_id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.users(id) on delete set null,
  target_type text not null check (target_type in ('listing', 'review', 'message', 'user')),
  target_id uuid,
  listing_id uuid references public.listings(listing_id) on delete set null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolution_note text,
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_actions (
  action_id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.users(id) on delete set null,
  target_type text not null check (target_type in ('listing', 'review', 'message', 'user', 'report', 'facility_config', 'role_permission')),
  target_id uuid,
  action text not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.moderation_actions drop constraint if exists moderation_actions_target_type_check;
alter table public.moderation_actions
add constraint moderation_actions_target_type_check
check (target_type in ('listing', 'review', 'message', 'user', 'report', 'facility_config', 'role_permission'));

create index if not exists idx_reviews_reviewee on public.reviews(reviewee_id, created_at desc);
create index if not exists idx_content_reports_status on public.content_reports(status);
create index if not exists idx_content_reports_listing on public.content_reports(listing_id);
create index if not exists idx_moderation_actions_created on public.moderation_actions(created_at desc);

alter table public.facility_config enable row level security;
alter table public.role_permissions enable row level security;
alter table public.reviews enable row level security;
alter table public.content_reports enable row level security;
alter table public.moderation_actions enable row level security;

drop policy if exists "Admins manage facility config" on public.facility_config;
create policy "Admins manage facility config"
on public.facility_config
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Staff can read facility config" on public.facility_config;
create policy "Staff can read facility config"
on public.facility_config
for select
using (public.is_staff() or public.is_admin());

drop policy if exists "Admins manage role permissions" on public.role_permissions;
create policy "Admins manage role permissions"
on public.role_permissions
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Students can read reviews" on public.reviews;
create policy "Students can read reviews"
on public.reviews
for select
using (public.is_student() or public.is_admin());

drop policy if exists "Students can create reviews" on public.reviews;
create policy "Students can create reviews"
on public.reviews
for insert
with check (public.is_student() and auth.uid() = reviewer_id and reviewer_id <> reviewee_id);

drop policy if exists "Admins can remove reviews" on public.reviews;
create policy "Admins can remove reviews"
on public.reviews
for delete
using (public.is_admin());

drop policy if exists "Admins read all content reports" on public.content_reports;
create policy "Admins read all content reports"
on public.content_reports
for select
using (public.is_admin());

drop policy if exists "Students can create content reports" on public.content_reports;
create policy "Students can create content reports"
on public.content_reports
for insert
with check (auth.uid() = reporter_id);

drop policy if exists "Reporters can read own content reports" on public.content_reports;
create policy "Reporters can read own content reports"
on public.content_reports
for select
using (auth.uid() = reporter_id or public.is_admin());

drop policy if exists "Admins update content reports" on public.content_reports;
create policy "Admins update content reports"
on public.content_reports
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins manage moderation actions" on public.moderation_actions;
create policy "Admins manage moderation actions"
on public.moderation_actions
for all
using (public.is_admin())
with check (public.is_admin());
