-- Migration 017: extend location_aliases for Weekly Sales 2026 unmapped values
-- + add `IRE MOWE [EXT]` alongside the existing `IRE MOVE [EXT]` typo alias.
--
-- Supervisor-approved 2026-05-20 after the first Weekly Sales ingest fired
-- `unknown_location` on 5 raw values (8 of 46 rows). Decisions:
--
--   IRE MOWE       (4 rows) → Ire Mowe              -- no-comma variant
--   IRE, MOWE 1    (1 row)  → Ire Mowe              -- trailing-suffix variant
--   IRE 2          (1 row)  → Ire Mowe Extension    -- "Ire ext" per supervisor
--   EWEKORO 1      (1 row)  → Ewekoro               -- block-number suffix
--   EWEKORO 2      (1 row)  → Ewekoro               -- block-number suffix
--
-- Plus a correct-spelling pair for the Ire Mowe Extension alias:
--   IRE MOWE [EXT]          → Ire Mowe Extension
--
-- Kept alongside the existing `IRE MOVE [EXT]` alias from migration 009 — that
-- one matches the literal sheet typo on `2026 LAND` rows already ingested.
-- Adding rather than replacing keeps historical bank_deposits rows resolvable
-- while the source sheet may now use the corrected spelling on new entries.
--
-- Idempotency: `on conflict (lower(alias)) do nothing` matches the pattern from
-- migrations 009 and 015; safe to re-run.
--
-- After applying: re-run `ingest-weekly-sales` so existing rows pick up the new
-- aliases and the `unknown_location` quality flags clear. The ingest also calls
-- `refresh_plot_sales_monthly` at the end, which rebuilds the aggregate so the
-- "Unknown / unmapped" row disappears from the dashboard.


insert into public.location_aliases (location_id, alias)
select l.id, v.alias
from (values
  -- Weekly Sales 2026 unmapped values
  ('Ire Mowe',           'IRE MOWE'),
  ('Ire Mowe',           'IRE, MOWE 1'),
  ('Ire Mowe Extension', 'IRE 2'),
  ('Ewekoro',            'EWEKORO 1'),
  ('Ewekoro',            'EWEKORO 2'),

  -- Correct-spelling pair for Ire Mowe Extension (alongside IRE MOVE [EXT])
  ('Ire Mowe Extension', 'IRE MOWE [EXT]')
) as v(canonical, alias)
join public.locations l on l.name = v.canonical
on conflict (lower(alias)) do nothing;
