-- Migration 012: seed expense_categories with the 11 H1 canonicals.
--
-- These are the exact values the supervisor put on the `_Categories` tab of the
-- Marketing Fund Expense source sheet (verified 2026-05-14 via
-- scripts/inspect-sheet-structure.mjs). They match the H1 PDF report's
-- "distribution by activity" donut categories.
--
-- display_order mirrors the order on the _Categories tab and the H1 PDF so the
-- Marketing panel's donut + table sort consistently with what the supervisor
-- already sees. Idempotent: `on conflict (name) do nothing` so re-applying this
-- migration is a no-op even after manual edits via the admin panel.
--
-- No alias table for expense_categories: the source dropdown enforces exact
-- values, so any text that needs normalization is either (a) a typo on a
-- pre-dropdown legacy row — handled by the TypeScript keyword fallback in the
-- ingest function emitting `fallback_category`, NOT by a DB alias table — or
-- (b) a value typed into a row before the supervisor backfills the dropdown,
-- which also routes through the fallback. Adding an alias table would split
-- the canonical-mapping logic between SQL and TS; keeping it in TS where the
-- keyword rules already live is the simpler shape.

insert into public.expense_categories (name, display_order) values
  ('Stakeholders Meeting',     1),
  ('MSME Campaign',            2),
  ('Digital Ad Campaign',      3),
  ('Corporate Marketing',      4),
  ('Realtor Activity',         5),
  ('SettleQuick',              6),
  ('Realtor Manager Airtime',  7),
  ('SMS Purchase',             8),
  ('Genius',                   9),
  ('Social Media',            10),
  ('Miscellaneous',           11)
on conflict (name) do nothing;
