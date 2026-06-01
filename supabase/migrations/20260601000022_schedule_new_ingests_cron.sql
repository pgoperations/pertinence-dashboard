-- Migration 022: extend the pg_cron schedule (added in migration 019) to
-- include the two ingests landed in this same session — ingest-digital-marketing
-- and ingest-media-weekly. Cadence matches the existing six: every 15 minutes,
-- staggered by 1 minute past the previous ingest so all 8 ingests don't hit
-- the Sheets API simultaneously.
--
-- Idempotent: cron.unschedule is wrapped defensively (skip when not present)
-- and cron.schedule overwrites by name. Re-applying this migration replaces
-- the schedules cleanly.
--
-- Prerequisite: migration 019 must already have been applied (it creates
-- public.invoke_ingest_function and stores the Vault secrets).

do $$
declare
  job record;
begin
  for job in
    select jobname from cron.job
    where jobname in (
      'ingest-digital-marketing-15min',
      'ingest-media-weekly-15min'
    )
  loop
    perform cron.unschedule(job.jobname);
  end loop;
end
$$;

select cron.schedule(
  'ingest-digital-marketing-15min',
  '6,21,36,51 * * * *',
  $$select public.invoke_ingest_function('ingest-digital-marketing');$$
);

select cron.schedule(
  'ingest-media-weekly-15min',
  '7,22,37,52 * * * *',
  $$select public.invoke_ingest_function('ingest-media-weekly');$$
);
