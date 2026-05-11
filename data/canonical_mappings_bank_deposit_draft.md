# Canonical mapping draft — Bank Deposit (`2026 LAND`)

**For supervisor review.** Drafted from 601 transaction rows on the live `2026 LAND` tab, pulled 2026-05-11. The canonical names become the rows in our `locations` and `purposes` reference tables; the variants become rows in `location_aliases` and `purpose_aliases`. The dashboard matches every incoming transaction against the alias list (case-insensitive) so typos and punctuation differences all roll up into one canonical bucket — but **only the variants you approve below will be matched**. Anything we miss gets flagged as `unknown_location` / `unknown_purpose` on the row, never silently bucketed.

Please tick or correct each row. Three explicit questions are flagged with **❓** below — these block the seed.

---

## PURPOSE — 27 source variants → 19 proposed canonical

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
| 15 | Security/Clearing Fee | `SECURITY FEE` (1), `SECURITY FEE / CLEARING FEE` (1) | **❓ Q2**: same charge or two different charges that happen to be paid together? Should they be one canonical or two? |
| 16 | Client Deposit | `CLIENT DEPOSIT` (2) | |
| 17 | Property Flex | `PROPERTY FLEX` (2) | |
| 18 | Default Charge | `DEFAULT CHARGE` (2) | |
| 19 | Book Purchase | `BOOK PURCHASE` (1) | |

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

## How to give feedback

The fastest path: just reply with the question numbers (Q1, Q2, Q3) answered, and any specific row corrections — e.g.:

> Q1: keep OUTRIGHT DOC separate, it's doc-levy only.
> Q2: same charge, collapse into one canonical called "Security & Clearing Fee".
> Q3: merge — IRE MOVE [EXT] is a typo of MOWE EXT, same estate.
> Row #22: prefer "Boys Town" with a space.
> Otherwise the rest looks good.

Once you confirm I'll write migration 009 to seed `locations` / `location_aliases` / `purposes` / `purpose_aliases` from this approved list.
