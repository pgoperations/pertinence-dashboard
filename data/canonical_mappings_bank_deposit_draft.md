# Canonical mapping draft — Bank Deposit (`2026 LAND`)

**Status: fully supervisor-approved 2026-05-11.** Final canonical: **20 PURPOSE** + **24 LOCATION**. The Security/Clearing sub-question was resolved by collapsing both `SECURITY FEE` and `SECURITY FEE / CLEARING FEE` source rows into a single canonical **"Security Fee"** for this 2026 instance, while keeping **"Clearing Fee"** as a distinct canonical for future Clearing-only rows (`CLEARANCE FEE` pre-seeded as alias). Migration 009 written: [supabase/migrations/20260511000009_seed_canonicals.sql](../supabase/migrations/20260511000009_seed_canonicals.sql).

## Supervisor decisions (2026-05-11)

- **Q1 — OUTRIGHT family:** `OUTRIGHT D&D`, `OUTRGHT D&D`, `OUTRIGHT DEV AND DOC`, `OUTRIGHT DOC` all collapse into one canonical **"Outright D&D"**. Confirmed as drafted.
- **Q2 — Security Fee vs Clearing Fee:** they are **different** charges. The PURPOSE table is now updated: split into two canonicals "Security Fee" and "Clearing Fee". Opens one sub-question — see Outstanding below.
- **Q3 — IRE MOVE [EXT]:** kept **separate** from "Ire Mowe". Confirmed as drafted.
- **Business Rep Registration:** all 4 punctuation variants collapse. Confirmed as drafted.
- **Lavida Prime vs Lavida Hills:** **different** locations. Confirmed as drafted.
- **Boystown:** one word. Confirmed as drafted.

## Resolved 2026-05-11 — Security/Clearing mapping

The supervisor's direction (final): Security Fee and Clearing Fee are **conceptually distinct** charges going forward, but in the current 2026 sheet there are exactly two related rows — one labelled `SECURITY FEE` and one labelled `SECURITY FEE / CLEARING FEE` — and both should be **treated as the same entity for this instance**. Resolution: both source variants alias to canonical **"Security Fee"**. Canonical **"Clearing Fee"** is created as a separate row (no source aliases from 2026 yet, but `CLEARANCE FEE` is pre-seeded as an alias per supervisor's spelling preference) so that future Clearing-only transactions land in their own bucket without a schema change.

Final purpose count: **20 canonical** (Security Fee absorbs the combined row; Clearing Fee is separate; no third "combined" canonical).

---

## Original draft (for reference — approved as-is except where annotated above)

The canonical names become the rows in our `locations` and `purposes` reference tables; the variants become rows in `location_aliases` and `purpose_aliases`. The dashboard matches every incoming transaction against the alias list (case-insensitive) so typos and punctuation differences all roll up into one canonical bucket — but **only the variants you approve below will be matched**. Anything we miss gets flagged as `unknown_location` / `unknown_purpose` on the row, never silently bucketed.

---

## PURPOSE — 27 source variants → 20 canonical (final)

| # | Proposed canonical | Source variants (count) | Notes |
| - | ------------------ | ----------------------- | ----- |
| 1 | Initial Land | `INITIAL LAND` (41) | |
| 2 | Balance Land | `BALANCE LAND` (24) | |
| 3 | Further Land | `FURTHER LAND` (148) | |
| 4 | Outright Land | `OUTRIGHT LAND` (4) | |
| 5 | Initial D&D | `INITIAL D&D` (21) | |
| 6 | Balance D&D | `BALANCE D&D` (20) | |
| 7 | Further D&D | `FURTHER D&D` (47) | |
| 8 | Outright D&D | `OUTRIGHT D&D` (5), `OUTRGHT D&D` (1), `OUTRIGHT DEV AND DOC` (1), `OUTRIGHT DOC` (1)? | **❓ Q1**: should `OUTRIGHT DOC` collapse here, or is it actually distinct (just doc levy without the dev portion)? |
| 9 | Initial Doc Levy | `INITIAL DOC LEVY` (5) | |
| 10 | Balance Doc Levy | `BALANCE DOC LEVY` (4) | |
| 11 | Further Doc Levy | `FURTHER DOC LEVY` (7) | |
| 12 | Allocation Fee | `ALLOCATION FEE` (5) | |
| 13 | Change of Ownership | `CHANGE OF OWNERSHIP` (33), `CHANGE OF OWNERSHIP FEE` (1) | |
| 14 | Business Rep Registration | `BUSINESS REP. REG.` (1), `BUSINESS REP. REG` (1), `BUSINESS RE. REG` (1), `BUSINESS RE. REG.` (1) | All 4 look like the same thing — confirm? |
| 15 | Security Fee | `SECURITY FEE` (1), `SECURITY FEE / CLEARING FEE` (1) | Resolved 2026-05-11 — both rows treated as same entity for 2026. |
| 16 | Clearing Fee | `CLEARANCE FEE` (pre-seeded, no 2026 source match yet) | Canonical exists for future Clearing-only rows; `CLEARANCE FEE` pre-seeded per supervisor spelling preference. |
| 17 | Client Deposit | `CLIENT DEPOSIT` (2) | |
| 18 | Property Flex | `PROPERTY FLEX` (2) | |
| 19 | Default Charge | `DEFAULT CHARGE` (2) | |
| 20 | Book Purchase | `BOOK PURCHASE` (1) | |

---

## LOCATION — 24 source variants → 24 proposed canonical (1 possible merge, see Q3)

| # | Proposed canonical | Source variants (count) | Notes |
| - | ------------------ | ----------------------- | ----- |
| 1 | Ire Mowe | `IRE, MOWE` (75) | |
| 2 | Ire Mowe Extension | `IRE MOVE [EXT]` (2) | **❓ Q3**: is `IRE MOVE [EXT]` the extension/phase of Ire Mowe (typo of MOWE + EXT marker) and should merge into "Ire Mowe", or is it a genuinely separate location? Default in this draft: kept separate. |
| 3 | Ire Ilara Epe | `IRE, ILARA EPE` (4) | |
| 4 | Eden Coker | `EDEN COKER` (75) | |
| 5 | Lavida Hills | `LAVIDA HILLS` (43) | |
| 6 | Lavida Prime | `LAVIDA PRIME` (6) | Distinct from Lavida Hills — confirm? |
| 7 | Atan Lemomu | `ATAN LEMOMU` (39) | |
| 8 | Ewekoro | `EWEKORO` (37) | |
| 9 | Greenland | `GREENLAND` (15) | |
| 10 | Ifo Phase 2 | `IFO PHASE 2` (11) | |
| 11 | Mgbirichi | `MGBIRICHI` (10) | |
| 12 | Ofada | `OFADA` (9) | |
| 13 | Ogbomoso | `OGBOMOSO` (8) | |
| 14 | Asadam | `ASADAM` (6) | |
| 15 | Eyenkorin | `EYENKORIN` (5) | |
| 16 | Milliard Court | `MILLIARD COURT` (5) | |
| 17 | Agbala | `AGBALA` (4) | |
| 18 | Imota Ikorodu | `IMOTA IKORODU` (3) | |
| 19 | Agbabiaka | `AGBABIAKA` (3) | |
| 20 | Charisville | `CHARISVILLE` (3) | |
| 21 | Gwagwalada | `GWAGWALADA` (2) | |
| 22 | Boystown | `BOYSTOWN` (2) | Or "Boys Town" — let me know your preference. |
| 23 | Trademoore | `TRADEMOORE` (1) | |
| 24 | Owerri | `OWERRI` (1) | |

---

## Next steps

1. ~~Write migration 009 — seed `locations` + `location_aliases` + `purposes` + `purpose_aliases` from this approved list (24 locations, 20 purposes, plus the alias rows).~~ Done 2026-05-11.
2. ~~Apply migration 009 on the live Supabase project.~~ Done 2026-05-11; counts verified (24 / 24 / 20 / 28).
3. Phase 3: Bank Deposit ingest Edge Function — canonical lookup is now ready, so the ingest can match incoming `PURPOSE` + `LOCATION` values via the alias tables on first read.
