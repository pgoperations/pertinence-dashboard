# Sales & Finance — Data Entry Rules

> **Before reading this, read [00-common.md](00-common.md).** It covers universal rules (date formatting, money formatting, sheet structure) that apply to every sheet, including yours. This document only covers what's specific to your sheets.

**Sheet you own:** Bank Deposit Mirror.

**Tabs you own:**

| Tab | Purpose | Section |
| --- | --- | --- |
| `2026 LAND` | All deposits — source of truth for sales **revenue** | [§1](#1-tab-2026-land) |
| `2026 Weekly Sales Report` | Weekly plot transactions — source of truth for **plot counts** | [§2](#2-tab-2026-weekly-sales-report) |
| `2026 Customer File` | Customer master records (one row per onboarded customer) | [§3](#3-tab-2026-customer-file) |

> **Two sources, two purposes — by design.** Bank Deposit `2026 LAND` is the source of truth for revenue (₦). Weekly Sales is the source of truth for plot counts. The two will sometimes disagree on the same month's total — the dashboard surfaces that disagreement on purpose. **Do not edit either sheet to make them match.** The supervisor reconciles.

---

## 1. Tab: `2026 LAND`

**Source of truth for:** sales revenue. Every chart that shows ₦ on the Sales page comes from this tab.

**Tab name:** `2026 LAND` — case-sensitive, exact.

### Required columns (in order)

| Col | Header | Type | Notes |
| --- | --- | --- | --- |
| A | (DATE) | Bank auto-paste | The bank's mirror writes this column. **Do not edit it.** The dashboard uses Column L as the real date and only falls back to A for rows the supervisor hasn't dated yet. |
| B | `BANK STATEMENT DETAILS` | Text | Free text — preserved as-is. |
| C | `AMOUNT` | Number | Plain number — no ₦, no commas. See [00-common §3.3](00-common.md#33-money--amounts--numbers-only). |
| D | `BANK ACCOUNT` | Text | Which Pertinence bank account received the funds. |
| E | `PURPOSE` | Text — canonical-mapped | Must match a known PURPOSE. Examples: `INITIAL PAYMENT`, `INSTALMENTAL PAYMENT`, `LEGAL FEE`, `SECURITY FEE`. |
| F | `LOCATION` | Text — canonical-mapped | Must match a known LOCATION. Examples: `IRE MOWE`, `LAVIDA HILLS`. |
| G | `ACCOUNT PAYMENT NAME` | Text | The depositor's account name as it appeared on the deposit slip. |
| H | `TRANS CODE` | Text | Optional reference / receipt code. |
| I | `CLIENT  NAME` (two spaces) | Text | The customer the payment is allocated to. **Header is intentionally double-spaced — do not fix it.** |
| J | `SALES PERSON` | Text | The realtor or sales person credited. Blank is tolerated but reported on Data Quality as `null_sales_person`. |
| K | (blank) | — | Intentional spacer column. |
| L | `DATE` | Real date | **This is the source of truth for transaction date.** The supervisor's clean working column. |
| M | (status) | — | Out of scope. The dashboard ignores this column. |

### Why column L and not column A?

Column A is the bank's auto-paste. Finance has historically written `M/D/YYYY` strings into a sheet whose regional setting is `D/M/Y`, which caused day-month swaps on dates like `01/06/2026` (typed for Jan 6, read as June 1) and occasional year typos (`3036` instead of `2026`). Column L is the supervisor's clean ledger and the dashboard uses it. Column A is used **only** when L is blank for recent rows the supervisor hasn't dated yet.

### Team rules

- **Do not** delete or edit column A — it's the bank's audit trail.
- **Do** type dates into column L for every new row.
- **Blank L is allowed** only for the most recent few rows (supervisor will fill them in shortly). Long blanks in the middle of L break date-based ordering.
- For canonical fields (PURPOSE, LOCATION), use exactly the canonical spelling. If you have a genuinely new variant, see [00-common §4](00-common.md#4-when-a-new-value-appears) — type the value as you would normally and the supervisor will register it.
- A blank `SALES PERSON` is tolerated. The dashboard groups those rows into an "Unattributed" bucket — visible, not hidden. About 56% of 2026 rows currently fall here.

---

## 2. Tab: `2026 Weekly Sales Report`

**Source of truth for:** plot counts. The Sales page uses this for "plots sold" — Bank Deposit is used for ₦.

**Tab name:** `2026 Weekly Sales Report` — case-sensitive, exact.

### Required columns (in order)

| Col | Header | Type | Notes |
| --- | --- | --- | --- |
| A | (blank) | — | Always-empty spacer column. |
| B | `NAMES` | Text | Customer name. |
| C | `LOCATION` | Text — canonical-mapped | Same canonical list as Bank Deposit. |
| D | `PLOT TYPE` | Text | Free text; the parser recognizes `1 EXECUTIVE`, `600SQM`, `1 ACRE`, etc. Unrecognized values are flagged `unparseable_plot_type` but still count toward total plots. |
| E | `AMOUNT` | Number | Plain number — no ₦, no commas. |
| F | `INITIAL` | Number | The initial deposit, if applicable. |
| G | `DATE` | Real date | Transaction date. |
| H | `SALES PERSON` | Text | The realtor credited. |

### Team rules

- **One row per plot sold.** If a customer buys two plots in one transaction, create two rows.
- The dashboard will sometimes show a different total here than on the Bank Deposit page for the same month. **That is the point** — Bank Deposit measures money, Weekly Sales measures plots. Do not edit either to reconcile.

---

## 3. Tab: `2026 Customer File`

**Source of truth for:** customer master records — one row per onboarded customer.

**Tab name:** `2026 Customer File` — case-sensitive, exact.

### Required columns (in order)

| Col | Header | Type | Notes |
| --- | --- | --- | --- |
| A | `Date` | Real date | Onboarding date. |
| B | `S/N` | Number | Serial number. |
| C | `CLIENT NAME` | Text | Single space, unlike Bank Deposit. |
| D | `PHONE NUMBER` | Text | Free text format. |
| E | `DOB` | Real date | Date of birth, if known. |
| F | `LOCATION` | Text — canonical-mapped | Same canonical list. |
| G | `PLOT SIZE` | Text | E.g., `1 PLOT`, `600SQM`. |
| H | `NUMBER OF PLOT` | Number | Count. |
| I | `EMAIL ADDRESS` | Text | Customer email. |
| J | `SALES PERSON` | Text | The realtor who closed the sale. |
| K | `SALES PERSON EMAIL` | Text | Their email. |
| L | `APPROVED BY` | Text | Who signed off. |
| M | `FURTHER PAYMENT ASSIGNED TO ` (trailing space) | Text | **Header has a trailing space — leave it as-is.** |
| N | `TOTAL AMOUNT PAYABLE` | Number | The contracted total. |
| O | `INITIAL PAYMENT` | Number | What's been paid so far. |

### Team rules

- **One row per customer onboarded.** Do not create a second row when the customer pays again — payments live in Bank Deposit `2026 LAND`, not here.
- The trailing space in column M's header is intentional. Do not trim it.

---

*Owner: Sales & Finance team. Last reviewed: 2026-05-29.*
