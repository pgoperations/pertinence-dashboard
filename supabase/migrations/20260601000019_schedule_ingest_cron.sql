-- Migration 019: schedule the six ingest Edge Functions on a 15-min cadence
-- via pg_cron + pg_net.
--
-- This closes the cron half of step 9 of the build roadmap (the dashboard's
-- on-demand "Sync Sheets" button covers the manual half). Before this lands
-- the dashboard never reflects a Google Sheet edit until a human manually
-- invokes the ingest functions; with this in place, fresh edits are visible
-- within ≤15 minutes of being saved on the sheet.
--
-- ────────────────────────────────────────────────────────────────────────────
-- PREREQUISITE (one-time, do these in the Supabase SQL editor BEFORE running
-- this migration — vault create_secret can't be in the migration body because
-- the values are environment-specific):
--
--   -- 1. Enable pg_cron + pg_net under Database → Extensions in the
--   --    Supabase dashboard. (They install into the `extensions` schema.)
--
--   -- 2. Store the project's functions base URL + anon key in Vault.
--   --    These are NOT secrets in the cryptographic sense (the anon key ships
--   --    in the frontend bundle) — Vault just keeps them out of the migration
--   --    history and lets ops rotate without an ALTER MIGRATION dance.
--   select vault.create_secret(
--     'https://hrmrqpkcvyjwxrehrgvq.supabase.co/functions/v1',
--     'supabase_functions_base_url'
--   );
--   select vault.create_secret(
--     '<paste VITE_SUPABASE_ANON_KEY from .env.local>',
--     'supabase_anon_key'
--   );
-- ────────────────────────────────────────────────────────────────────────────
--
-- Auth path: every ingest Edge Function is deployed `--no-verify-jwt`, so the
-- gateway accepts the anon key in the `apikey` header — the function itself
-- still authenticates to Sheets via the service account and to Postgres via
-- the service-role key (both held in `supabase secrets`, not in the database).
--
-- Cadence: each ingest fires every 15 minutes, staggered by 1 minute so they
-- don't all hit the Sheets API simultaneously and Supabase function CPU
-- doesn't spike all at once. Net result: 4 × 6 = 24 invocations / hour.
--
-- Idempotency:
--   * `create extension if not exists` — safe to re-run.
--   * `create or replace function` — safe to re-run.
--   * `cron.unschedule` before each schedule call — re-applying this migration
--     replaces the schedules cleanly instead of failing on the unique-name
--     constraint of `cron.job`. The `where exists` guard skips the unschedule
--     when the row is absent (first-time apply).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Helper that resolves the vault secrets and POSTs to a named Edge Function.
-- SECURITY DEFINER because pg_cron runs as a non-superuser by default; vault
-- access needs elevated privileges. Search path pinned for safety per the
-- pattern from migration 003.
create or replace function public.invoke_ingest_function(fn_name text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  base_url text;
  api_key text;
  request_id bigint;
begin
  select decrypted_secret into base_url
    from vault.decrypted_secrets
    where name = 'supabase_functions_base_url'
    limit 1;
  select decrypted_secret into api_key
    from vault.decrypted_secrets
    where name = 'supabase_anon_key'
    limit 1;

  if base_url is null or api_key is null then
    raise warning '[invoke_ingest_function] vault secrets missing (supabase_functions_base_url / supabase_anon_key) — skipping invocation of %', fn_name;
    return null;
  end if;

  select net.http_post(
    url := base_url || '/' || fn_name,
    headers := jsonb_build_object(
      'apikey', api_key,
      'Authorization', 'Bearer ' || api_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_ingest_function(text) from public, anon, authenticated;
grant execute on function public.invoke_ingest_function(text) to postgres, service_role;

-- Helper that wraps cron.unschedule defensively so re-applying this migration
-- (or scripting it locally) doesn't error when a job doesn't exist yet.
do $$
declare
  job record;
begin
  for job in
    select jobname from cron.job
    where jobname in (
      'ingest-bank-deposit-15min',
      'ingest-marketing-expense-15min',
      'ingest-customer-support-15min',
      'ingest-weekly-sales-15min',
      'ingest-customer-file-15min',
      'ingest-realtor-managers-weekly-15min'
    )
  loop
    perform cron.unschedule(job.jobname);
  end loop;
end
$$;

select cron.schedule(
  'ingest-bank-deposit-15min',
  '0,15,30,45 * * * *',
  $$select public.invoke_ingest_function('ingest-bank-deposit');$$
);

select cron.schedule(
  'ingest-marketing-expense-15min',
  '1,16,31,46 * * * *',
  $$select public.invoke_ingest_function('ingest-marketing-expense');$$
);

select cron.schedule(
  'ingest-customer-support-15min',
  '2,17,32,47 * * * *',
  $$select public.invoke_ingest_function('ingest-customer-support');$$
);

select cron.schedule(
  'ingest-weekly-sales-15min',
  '3,18,33,48 * * * *',
  $$select public.invoke_ingest_function('ingest-weekly-sales');$$
);

select cron.schedule(
  'ingest-customer-file-15min',
  '4,19,34,49 * * * *',
  $$select public.invoke_ingest_function('ingest-customer-file');$$
);

select cron.schedule(
  'ingest-realtor-managers-weekly-15min',
  '5,20,35,50 * * * *',
  $$select public.invoke_ingest_function('ingest-realtor-managers-weekly');$$
);

-- Verification queries to run in the SQL editor after applying:
--
--   -- Confirm the 6 jobs exist and are active:
--   select jobid, jobname, schedule, active from cron.job
--    where jobname like 'ingest-%' order by jobname;
--
--   -- Inspect recent runs (after waiting ~15 min for the first tick):
--   select jobid, runid, status, return_message, start_time
--     from cron.job_run_details
--    where jobid in (select jobid from cron.job where jobname like 'ingest-%')
--    order by start_time desc limit 20;
--
--   -- Inspect the actual HTTP responses from net.http_post:
--   select id, status_code, content_type, left(content::text, 200) as body_head, created
--     from net._http_response order by created desc limit 20;
