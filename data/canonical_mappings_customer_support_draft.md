# Customer Support — canonical mapping (APPROVED 2026-05-14)

**Status: locked in migration 015.** Supervisor decisions captured at the bottom under "Decisions for the supervisor" (now answered).

**Purpose.** Boil the 329 raw "Nature of Complaint" values (across 10,214 populated CS rows) down to a manageable canonical list that drives the Customer Support panel. Raw input lives in [`customer_support_canonical_inputs.md`](customer_support_canonical_inputs.md).

**Workflow.**

1. Supervisor reviews this draft. Possible reactions per row: ✅ approve as-is / ✏️ rename / ➕ add raw values I missed / ➖ split this canonical / ❌ drop entirely.
2. Supervisor answers the **"Decisions for the supervisor"** block at the bottom.
3. The approved list becomes migration 015 (`complaint_categories` + `complaint_aliases`) and the dashboard's CS-by-category panel renders against it.
4. Anything not aliased here will arrive in the DB as `unknown_complaint_category` and show up in the data-quality view — easy to spot and fix in a follow-up.

**Notes on the format.** Each canonical lists every raw value that should `alias` to it. The "alias" column on `complaint_aliases` is matched case-insensitively (the unique index is on `lower(alias)`), so case variants like `RESOLVED` vs `Resolved` collapse automatically — only meaningfully different strings need to be listed. The canonical name on the left is what the supervisor sees on the dashboard panel.

---

## Approved-as-typo merges (no supervisor judgment needed — these are obvious)

| Canonical name | Raw aliases |
| --- | --- |
| **Documentation** | `Documentation`, `Documentaion` |
| **General Enquiry** | `General Enquiry`, `General enquiries`, `Enquirires`, `Enquirires ` (trailing space), `Enquiry about plot status` |
| **Audit** | `Adit`, `Addit` |
| **Special Task** | `Special Task`, `Special task` |
| **Refund** | `Refund`, `Refund of money` |
| **Commission Payout** | `commission/payout` |
| **Follow-Up** | `Follow -Up` |
| **Authorisation** | `Authorisation` *(supervisor preference — UK spelling. Change to `Authorization` if you'd rather use US spelling.)* |
| **Further Payment on Property** | `Futher payment on proprerty` |
| **Product Pricing Complaint** | `Product Pricing Complaint`, `price Increase Complaint` |
| **Collection of Document / Receipt** | `Collection of document/ receipt`, `Pick Up Of  Doucments/Recipts` |

---

## Customer complaint canonicals (each is its own distinct category)

| Canonical name | Raw aliases | Volume |
| --- | --- | ---: |
| **Site Allocation** | `Site Allocation` | 519 |
| **Allocation Letter** | `Allocation Letter` | 190 |
| **Payment Approval Delays** | `Payment Approval Delays` | 477 |
| **Delayed Investment and Commission Payout** | `Delayed Investment and Commission Payout` | 367 |
| **Conversion to Land** | `Conversion to Land` | 254 |
| **Change of Ownership** | `Change of Ownership` | 229 |
| **Delay on Home Delivery** | `Delay on Home Delivery` | 198 |
| **Escalated Legal Matters** | `Escalated Legal Matters` | 132 |
| **Semi-finished Delivery** | `Semi-finished Delivery` | 128 |
| **Termination and Movement** | `Termination and Movement` | 125 |
| **Site Inspection** | `Site Inspection` | 117 |
| **Scheduled Meeting** | `Scheduled Meeting` | 108 |
| **Change of Location** | `Change of Location`, `Change of Location Complaint` | 107 + 41 |
| **Account Reconciliation** | `Account Reconciliation` | 95 |
| **OneApp Complaint** | `OneApp Complaint` | 89 |
| **Realvest App Complaint** | `Realvest App Complaint` | 12 |
| **Zoho** | `Zoho` | 52 |
| **Technical issues** | `Technical issues` | 48 |
| **New Client Generated** | `New Client Generated` | 42 |
| **Change of Name** | `Change of Name` | 36 |
| **Change of Email Address** | `Change of Email Address` | 9 |
| **Change of Plot** | `Change of plot` | 7 |
| **Change of Plot Size** | `Change of plot size` | 3 |
| **Site Updates** | `Site Updates` | 34 |
| **Proof of Payment for Receipt Processing** | `Proof of payment for receipt processing` | 28 |
| **Merging of Accounts** | `Merging of Accounts` | 25 |
| **Delayed or No Communication** | `Delayed or No Communication` | 23 |
| **Misplaced Document** | `Misplaced Document` | 17 |
| **Extension** | `Extension`, `Request for extension` | 16 + 3 |
| **Birthday Messages** | `Birthday Messages`, `Birthday Messages ` (trailing space) | 10 |
| **Theft** | `Theft` | 9 |
| **New Account Details** | `New Account Details` | 37 |
| **Resale** | `Resale` | 8 |
| **New Contract** | `New Contract`, `New  Contract` (double space) | 7 |
| **Contract of Sale Letter / Document** | `Contract of sale letter/document` | 6 |
| **Thank You Email** | `Thank you email` | 6 |
| **Lack of Development** | `Lack of Development` | 5 |
| **Realtorship** | `Realtorship` | 5 |
| **Waiver** | `Waiver` | 4 |
| **Site Issues / Complaint** | `site issues/complaint` | 8 |

---

## "Special Request" family

The supervisor used several long quoted strings for Special Request variants. They're conceptually different things, so I'm proposing three distinct canonicals — flag if you'd rather collapse them.

| Canonical name | Raw aliases | Volume |
| --- | --- | ---: |
| **Special Request — Documents** | `"Special Request- Sent Payment receipts, Contract of Sale or Deed of Assignment"`, `"Special Request- Sent Payment Receipts, Contract of Sale, or Deed of Assignement"` (typo variant) | 1492 + 1 |
| **Special Request — Change of Name/Email/Location** | `"Special Request- Change of Name,  Email or Location"`, `"Special Request- Change of Email, Name, or Location"` | 42 + 16 |
| **Special Request (general)** | `Special Request` | 9 |

---

## Decisions for the supervisor (ANSWERED 2026-05-14)

1. **Authorisation vs Authorization.** → **UK spelling** (`Authorisation`).
2. **"Change of Plot" vs "Change of Plot Size".** → No explicit answer; defaulting to the proposal (**kept separate**). Easy to merge in a follow-up migration if the supervisor changes their mind — conceptually they are distinct (which plot vs. how much area), and the dashboard donut can collapse them visually if needed.
3. **"OneApp Complaint" vs "Realvest App Complaint".** → **Kept separate.**
4. **"Special Request — Documents" canonical name.** → **Accepted.**
5. **"Birthday Messages".** → **Kept** — part of CS communications to customers.
6. **Long-tail singletons** (`Default`, `Default Waiver`, `Downtime`, `ETRAC`, `Farmwey`, `Edificio`). → **Each becomes its own canonical.** Default Waiver kept separate from Waiver per the same instruction.
7. **Anything missing.** → **No** — the proposed list is complete.

---

## Long-tail single-occurrence values that I excluded

These appear once each and look like one-off entries (some are typos, some look location-tagged). Easier for you to triage in one block than for me to guess each. If any deserve their own canonical, list them under "Anything missing" above.

`Default`, `Default Waiver`, `Downtime`, `ETRAC`, `Edificio`, `Farmwey`, plus everything that's already part of a composite cell will be covered by the splits.

---

## Summary stats (for reference)

- **Raw unique values scanned:** 329 (across 10,214 populated CS rows from CATHERINE / MARIAM / MARY / YETUNDE / LOVINAL).
- **Proposed canonicals:** ~45 (some are clear single-source, some are typo clusters with multiple aliases).
- **Composite cells** like `"Documentaion, Site Allocation"` will be split at ingest into multiple `customer_support_logs` rows (one per category) per supervisor's earlier decision — they're not in the canonical list because each part already gets aliased independently.
