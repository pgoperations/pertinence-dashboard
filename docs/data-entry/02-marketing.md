# Marketing — Data Entry Rules

> **Before reading this, read [00-common.md](00-common.md).** It covers universal rules (date formatting, money formatting, sheet structure) that apply to every sheet, including yours. This document only covers what's specific to your sheet.

**Sheet you own:** Marketing Fund Expense Sheet.

**Source of truth for:** marketing spend by category and month.

---

## Tab structure

One tab per month. **Tab names must follow the format `Month YYYY`** — for example:

- ✓ `May 2026`
- ✓ `June 2026`
- ✓ `January 2027`
- ✗ `May` (no year — ignored)
- ✗ `May-2026` (wrong format — ignored)
- ✗ `5/2026` (wrong format — ignored)

A tab whose name doesn't match `Month YYYY` is **silently ignored** by the dashboard. No error appears; the month is just missing.

The `_Categories` tab is the dropdown source — keep it as-is.

---

## Required structure inside each tab

The dashboard auto-detects the header row by looking for a `Date | Description | Total | Category` quad in the first 10 rows of the tab. So you can keep title text, totals, and decorative rows above the data — just keep the four-column header intact.

| Col | Header | Type | Notes |
| --- | --- | --- | --- |
| E | `Date` | Real date | In-cell dates are tolerated even when they disagree with the tab name. Tab name is the source of truth for which month a row belongs to. |
| F | `Description` | Text | Used for keyword fallback (see below). |
| G | `Total` | Number | The expense amount. Plain number — no ₦, no commas. |
| H | `Category` | Text — canonical-mapped | Dropdown. Must match a canonical expense category. |

---

## How categorization works

The dashboard tries to categorize each expense row in two ways:

1. **Preferred path — Category dropdown (column H):** if you fill the Category dropdown and its value matches a canonical expense category, the dashboard uses that.
2. **Fallback path — keyword match on Description:** if column H is blank or non-canonical, the dashboard scans column F (Description) for keywords and assigns the closest matching category. These rows are **tagged with `fallback_category`** on the Data Quality view so the supervisor can see what was auto-categorized.

**As of 2026-05-14 almost all 2026 rows had Category blank** because the dropdown was added but not backfilled. The keyword fallback is therefore the default code path today. Filling the dropdown going forward improves accuracy and reduces the supervisor's review load.

---

## Team rules

- **Do** use the Category dropdown for every new expense row. The keyword fallback is a safety net, not the intended path.
- **Tab title text in rows 1–3 is tolerated** — the dashboard skips rows above the detected `Date | Description | Total | Category` header. You can rename the title in row 1 of a new month tab without breaking anything.
- **Summary rows** (`Total`, `Balance c/f`, `Balance b/f`, `Balance b/d`) are auto-filtered when they appear in the Description column. Keep these descriptions exact (case-insensitive) and put them at the bottom of the data, never between expense rows.
- **Adding the next month's tab:** create a new tab named `Month YYYY` for that month. No code change is needed. The dashboard will pick it up at the next pull.
- **Mixed date formats inside one tab are tolerated** but discouraged. The parser handles both serial-number dates and `D/M/YYYY` text dates, but blank in-cell dates are forward-filled from the previous parsed date on the same tab — so don't leave a date blank unless you genuinely mean "same date as the row above".
- **Income side (columns A–C)** is not yet read by the dashboard. Filling it is optional today; the supervisor's plan is to ingest it in a later phase.
- **Adding a new category** — if a recurring expense type doesn't fit an existing category, do not invent a new dropdown value yourself. Notify the dashboard owner so the canonical category is added and shows up in the dropdown. See [00-common §4](00-common.md#4-when-a-new-value-appears).

---

*Owner: Marketing team. Last reviewed: 2026-05-29.*
