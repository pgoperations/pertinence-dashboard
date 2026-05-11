-- Migration 009: seed canonical locations + purposes + aliases for Bank Deposit ingest.
--
-- Sourced from data/canonical_mappings_bank_deposit_draft.md, supervisor-approved
-- 2026-05-11. Final canonical: 24 locations + 20 purposes + their aliases.
--
-- Idempotency:
--   * Canonical INSERTs use `on conflict (name) do nothing`.
--   * Alias INSERTs use `on conflict (lower(alias)) do nothing` — the unique
--     expression index from migration 002 (location_aliases_lower_alias_uidx /
--     purpose_aliases_lower_alias_uidx) is the arbiter.
--   * Aliases resolve their canonical FK via a join on `name`, so this migration
--     is safe to re-run and order-independent.
--
-- Source variants are stored EXACTLY as they appear on `2026 LAND` (including the
-- `IRE MOVE [EXT]` typo and the `OUTRGHT D&D` typo), since the ingest does a
-- case-insensitive exact match — any deviation from these strings would push the
-- row into the `unknown_purpose` / `unknown_location` quality flag bucket.
--
-- Security vs Clearing resolution (supervisor, 2026-05-11):
--   * Both 2026 source rows (`SECURITY FEE` and `SECURITY FEE / CLEARING FEE`)
--     alias to canonical "Security Fee" — same entity for this instance.
--   * Canonical "Clearing Fee" exists separately for future Clearing-only rows;
--     `CLEARANCE FEE` is pre-seeded as an alias to cover that spelling variant.


-- ============================================================================
-- LOCATIONS (24 canonical)
-- ============================================================================
insert into public.locations (name) values
  ('Ire Mowe'),
  ('Ire Mowe Extension'),
  ('Ire Ilara Epe'),
  ('Eden Coker'),
  ('Lavida Hills'),
  ('Lavida Prime'),
  ('Atan Lemomu'),
  ('Ewekoro'),
  ('Greenland'),
  ('Ifo Phase 2'),
  ('Mgbirichi'),
  ('Ofada'),
  ('Ogbomoso'),
  ('Asadam'),
  ('Eyenkorin'),
  ('Milliard Court'),
  ('Agbala'),
  ('Imota Ikorodu'),
  ('Agbabiaka'),
  ('Charisville'),
  ('Gwagwalada'),
  ('Boystown'),
  ('Trademoore'),
  ('Owerri')
on conflict (name) do nothing;


-- ============================================================================
-- LOCATION_ALIASES (one source variant per canonical for now — list will grow
-- as new typos appear; ingest emits `unknown_location` for any unmatched value)
-- ============================================================================
insert into public.location_aliases (location_id, alias)
select l.id, v.alias
from (values
  ('Ire Mowe',           'IRE, MOWE'),
  ('Ire Mowe Extension', 'IRE MOVE [EXT]'),
  ('Ire Ilara Epe',      'IRE, ILARA EPE'),
  ('Eden Coker',         'EDEN COKER'),
  ('Lavida Hills',       'LAVIDA HILLS'),
  ('Lavida Prime',       'LAVIDA PRIME'),
  ('Atan Lemomu',        'ATAN LEMOMU'),
  ('Ewekoro',            'EWEKORO'),
  ('Greenland',          'GREENLAND'),
  ('Ifo Phase 2',        'IFO PHASE 2'),
  ('Mgbirichi',          'MGBIRICHI'),
  ('Ofada',              'OFADA'),
  ('Ogbomoso',           'OGBOMOSO'),
  ('Asadam',             'ASADAM'),
  ('Eyenkorin',          'EYENKORIN'),
  ('Milliard Court',     'MILLIARD COURT'),
  ('Agbala',             'AGBALA'),
  ('Imota Ikorodu',      'IMOTA IKORODU'),
  ('Agbabiaka',          'AGBABIAKA'),
  ('Charisville',        'CHARISVILLE'),
  ('Gwagwalada',         'GWAGWALADA'),
  ('Boystown',           'BOYSTOWN'),
  ('Trademoore',         'TRADEMOORE'),
  ('Owerri',             'OWERRI')
) as v(canonical, alias)
join public.locations l on l.name = v.canonical
on conflict (lower(alias)) do nothing;


-- ============================================================================
-- PURPOSES (20 canonical)
-- ============================================================================
insert into public.purposes (name) values
  ('Initial Land'),
  ('Balance Land'),
  ('Further Land'),
  ('Outright Land'),
  ('Initial D&D'),
  ('Balance D&D'),
  ('Further D&D'),
  ('Outright D&D'),
  ('Initial Doc Levy'),
  ('Balance Doc Levy'),
  ('Further Doc Levy'),
  ('Allocation Fee'),
  ('Change of Ownership'),
  ('Business Rep Registration'),
  ('Security Fee'),
  ('Clearing Fee'),
  ('Client Deposit'),
  ('Property Flex'),
  ('Default Charge'),
  ('Book Purchase')
on conflict (name) do nothing;


-- ============================================================================
-- PURPOSE_ALIASES
-- ============================================================================
insert into public.purpose_aliases (purpose_id, alias)
select p.id, v.alias
from (values
  -- Single-variant canonicals
  ('Initial Land',              'INITIAL LAND'),
  ('Balance Land',              'BALANCE LAND'),
  ('Further Land',              'FURTHER LAND'),
  ('Outright Land',             'OUTRIGHT LAND'),
  ('Initial D&D',               'INITIAL D&D'),
  ('Balance D&D',               'BALANCE D&D'),
  ('Further D&D',               'FURTHER D&D'),
  ('Initial Doc Levy',          'INITIAL DOC LEVY'),
  ('Balance Doc Levy',          'BALANCE DOC LEVY'),
  ('Further Doc Levy',          'FURTHER DOC LEVY'),
  ('Allocation Fee',            'ALLOCATION FEE'),
  ('Client Deposit',            'CLIENT DEPOSIT'),
  ('Property Flex',             'PROPERTY FLEX'),
  ('Default Charge',            'DEFAULT CHARGE'),
  ('Book Purchase',             'BOOK PURCHASE'),

  -- Outright D&D — 4 source variants collapsed (supervisor Q1, 2026-05-11)
  ('Outright D&D',              'OUTRIGHT D&D'),
  ('Outright D&D',              'OUTRGHT D&D'),
  ('Outright D&D',              'OUTRIGHT DEV AND DOC'),
  ('Outright D&D',              'OUTRIGHT DOC'),

  -- Change of Ownership — 2 source variants collapsed
  ('Change of Ownership',       'CHANGE OF OWNERSHIP'),
  ('Change of Ownership',       'CHANGE OF OWNERSHIP FEE'),

  -- Business Rep Registration — 4 punctuation variants collapsed
  ('Business Rep Registration', 'BUSINESS REP. REG.'),
  ('Business Rep Registration', 'BUSINESS REP. REG'),
  ('Business Rep Registration', 'BUSINESS RE. REG'),
  ('Business Rep Registration', 'BUSINESS RE. REG.'),

  -- Security Fee — supervisor 2026-05-11: the bare row AND the combined
  -- security/clearing row both alias to Security Fee for this 2026 instance.
  ('Security Fee',              'SECURITY FEE'),
  ('Security Fee',              'SECURITY FEE / CLEARING FEE'),

  -- Clearing Fee — no source variant in 2026 YTD; CLEARANCE FEE pre-seeded
  -- as an alias per supervisor preference (catches the spelling variant).
  ('Clearing Fee',              'CLEARANCE FEE')
) as v(canonical, alias)
join public.purposes p on p.name = v.canonical
on conflict (lower(alias)) do nothing;
