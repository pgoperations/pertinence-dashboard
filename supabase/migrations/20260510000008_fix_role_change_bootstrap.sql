-- Migration 008: bootstrap-safe role change protection.
--
-- Fixes a chicken-and-egg in migration 003. The original
-- prevent_role_self_change trigger blocked the very first admin promotion:
-- with no users having role='admin' yet, is_admin() returns false for
-- everyone — including the postgres role running the bootstrap UPDATE in the
-- Supabase SQL editor (where auth.uid() is null) — so the trigger refused
-- to let the first admin be set.
--
-- Fix: skip the check when auth.uid() is null. That's the marker for a
-- non-user context (service-role JWT, direct postgres/supabase_admin
-- connection, or server-side code with no user session). All those contexts
-- are already trusted: anon clients can't reach this trigger because the
-- profiles UPDATE RLS policies in migration 003 require either
-- auth.uid() = id (own profile) or is_admin(), both of which fail for anon.
-- So the only callers reaching this trigger with auth.uid() null are trusted
-- infra paths, and they get to set roles freely.

create or replace function public.prevent_role_self_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'only admins can change user roles'
      using errcode = '42501';  -- insufficient_privilege
  end if;
  return new;
end;
$$;
