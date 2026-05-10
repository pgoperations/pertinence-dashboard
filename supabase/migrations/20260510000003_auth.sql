-- Migration 003: auth (profiles, role enum, role helpers, role-change protection).
--
-- Per DESIGN_DECISIONS.md, three roles on a profiles table extending auth.users:
--   admin  — manages reference data, all writes, can change other users' roles
--   editor — social media manual entry, resolving alerts
--   viewer — read-only (default for new signups)
--
-- Implementation notes:
-- * `user_role` is an enum (not text+CHECK). Fixed three-role set per the brief;
--   `alter type ... add value` is available if a fourth role is ever needed.
-- * A trigger on auth.users auto-creates a profile row on signup with role='viewer'.
-- * Role-change protection is enforced by a BEFORE UPDATE trigger, NOT by an RLS
--   WITH CHECK clause. Postgres RLS WITH CHECK evaluates against the post-update
--   row only — it has no OLD reference — so a self-promotion attempt by a viewer
--   ('viewer' → 'admin') would pass any naive RLS comparison. The trigger sees
--   OLD.role and NEW.role and rejects the change unless the caller is_admin().
-- * Helper functions are SECURITY DEFINER + STABLE + explicit search_path. The
--   SECURITY DEFINER context lets them read public.profiles even when RLS would
--   otherwise block the calling role; explicit search_path prevents the documented
--   search-path injection vector for SECURITY DEFINER functions.
--
-- First-admin bootstrap (run manually after the first user signs up):
--   update public.profiles set role = 'admin' where id = '<auth.users.id of that user>';
-- Cannot be done in this migration because no users exist yet at apply time.


-- ============================================================================
-- user_role enum
-- ============================================================================
create type public.user_role as enum ('admin', 'editor', 'viewer');


-- ============================================================================
-- profiles
-- Extends auth.users 1:1 (id is FK + PK). full_name is for UI display; email is
-- intentionally NOT duplicated here — fetch from auth.users on demand.
-- ============================================================================
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       public.user_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;


-- ============================================================================
-- handle_new_user — auto-create profile row on auth.users insert
-- SECURITY DEFINER so the trigger can write to public.profiles regardless of
-- which role is performing the insert (typically the auth admin role).
-- search_path is pinned to prevent search-path attacks against SECURITY DEFINER.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================================
-- prevent_role_self_change — BEFORE UPDATE trigger
-- Blocks non-admins from changing the role column on any profile. RLS WITH CHECK
-- can't enforce this cleanly because it has no OLD reference; this trigger does.
-- An admin demoting themselves is allowed (rare, but legitimate).
-- ============================================================================
create or replace function public.prevent_role_self_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'only admins can change user roles'
      using errcode = '42501';  -- insufficient_privilege
  end if;
  return new;
end;
$$;

-- Trigger created at the bottom of this file, after is_admin() is defined.


-- ============================================================================
-- Role helper functions
-- All SECURITY DEFINER + STABLE + pinned search_path. They return false (rather
-- than null) for unauthenticated callers so RLS policies that reference them
-- short-circuit cleanly without TRUE-by-null-comparison surprises.
-- ============================================================================
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) = 'admin',
    false
  );
$$;

create or replace function public.is_editor_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) in ('admin', 'editor'),
    false
  );
$$;


-- Now that is_admin() exists, attach the role-change protection trigger.
create trigger profiles_prevent_role_self_change
  before update on public.profiles
  for each row execute function public.prevent_role_self_change();


-- ============================================================================
-- RLS policies on public.profiles
-- ============================================================================

-- Read: users see their own profile.
create policy "users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Read: admins see every profile.
create policy "admins read all profiles"
  on public.profiles for select
  using (public.is_admin());

-- Update: users can update their own profile. Role-change attempts are caught
-- by prevent_role_self_change (above), not here.
create policy "users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Update: admins can update any profile (including role).
create policy "admins update any profile"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- No INSERT policy: profiles are created exclusively by the on_auth_user_created
-- trigger, which runs as SECURITY DEFINER and bypasses RLS.
--
-- No DELETE policy: profiles cascade-delete with auth.users. Admin-driven user
-- deletion happens via the service role (Supabase admin API or Edge Function).
