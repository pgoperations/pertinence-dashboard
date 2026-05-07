-- Migration 001: extensions and shared helper functions.
-- Foundation only — reference and fact tables come in later migrations.

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- Standard updated_at trigger function. Attach to tables that carry an updated_at column:
--   create trigger set_updated_at before update on <table>
--     for each row execute function public.set_updated_at();
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Parse a "Month YYYY" or "Mon YYYY" label (e.g. "May 2026", "may 2026", "Sept 2026")
-- into year + month. Used to anchor Marketing Expense ingest from the source-tab name,
-- since in-cell dates are unreliable.
--
-- Returns one row. month is null when the input cannot be parsed (caller decides whether
-- to flag or reject); year is null in that case as well.
--
-- Accepts the 12 full English month names and their common 3-4 char abbreviations
-- (Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Sept, Oct, Nov, Dec). Case-insensitive.
-- Tolerates leading/trailing whitespace and one or more separator chars between the
-- month token and the year. Year must be a 4-digit integer.
create or replace function public.parse_month_year(label text)
returns table(year int, month int)
language plpgsql
immutable
as $$
declare
  trimmed text;
  month_token text;
  year_token text;
  parsed_year int;
  parsed_month int;
  m text[];
begin
  if label is null then
    return query select null::int, null::int;
    return;
  end if;

  trimmed := btrim(label);
  m := regexp_match(trimmed, '^([A-Za-z]+)[\s,/.-]+(\d{4})$');

  if m is null then
    return query select null::int, null::int;
    return;
  end if;

  month_token := lower(m[1]);
  year_token := m[2];

  parsed_month := case month_token
    when 'january'   then 1  when 'jan'   then 1
    when 'february'  then 2  when 'feb'   then 2
    when 'march'     then 3  when 'mar'   then 3
    when 'april'     then 4  when 'apr'   then 4
    when 'may'       then 5
    when 'june'      then 6  when 'jun'   then 6
    when 'july'      then 7  when 'jul'   then 7
    when 'august'    then 8  when 'aug'   then 8
    when 'september' then 9  when 'sep'   then 9  when 'sept' then 9
    when 'october'   then 10 when 'oct'   then 10
    when 'november'  then 11 when 'nov'   then 11
    when 'december'  then 12 when 'dec'   then 12
    else null
  end;

  if parsed_month is null then
    return query select null::int, null::int;
    return;
  end if;

  parsed_year := year_token::int;
  return query select parsed_year, parsed_month;
end;
$$;
