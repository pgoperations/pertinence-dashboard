# Realtor Management — Data Entry Rules

> **Before reading this, read [00-common.md](00-common.md).** It covers universal rules (date formatting, sheet structure) that apply to every sheet, including yours. This document only covers what's specific to your sheet.

**Sheet you own:** Marketing Team Reporting Template.

**Tab you own:** `2026 Realtors Managers Weekly Report` — case-sensitive, exact.

**Source of truth for:** realtor recruitment metrics, activity measurement, and sales-performance metrics, per month.

---

## Tab structure

The tab is organized as **month blocks** stacked vertically. Each month has a band of ~30 rows containing:

- **6 recruitment metrics** (e.g., New Referrals, New Business Reps)
- **3 activity metrics** (Master Class 1, Master Class 2, Stakeholders Meeting)
- **10 sales-performance metrics**

Each metric row has weekly columns (Week 1 – Week 5) and a Total column.

The dashboard scans columns A through Z, rows 1 through 300, and detects each month block automatically. You can add the next month's block below the previous one; no code change is needed.

---

## Required column structure (per row)

| Position | What it holds |
| --- | --- |
| Left column | Metric label (e.g., `New Referrals`, `Master Class 1`) |
| Week 1 – Week 5 | Numeric values per week |
| Total | Sum of Week 1 – Week 5 |

The dashboard recognizes each metric by its **label text** against a known list (`realtor_metric_aliases`), so labels must be **consistent** between months. A new typo or rewording creates a new metric on the dashboard — the supervisor decides whether it's a variant of an existing one or genuinely new.

---

## Team rules

### Metric labels

- **Keep metric label spellings identical month-to-month.** `New Referrals` and `New Referral` are two different metrics to the dashboard. If you spot an existing label with a typo (e.g., the known `Referrals +Business Reps` with missing space), keep typing the same typo — it's already aliased to the canonical metric. Don't "fix" it in the sheet.
- **A truly new metric** (one the supervisor wants tracked going forward) should be coordinated with the dashboard owner before the first month uses it, so the canonical and its aliases can be registered. Otherwise the row will be skipped on the dashboard.

### Total vs Weekly columns

- **The Total column should equal Week 1 + Week 2 + Week 3 + Week 4 + Week 5.** If you override the Total to a different value (e.g., the supervisor's adjusted figure), the dashboard flags `total_mismatch` and shows both numbers on the Data Quality view.
- **The dashboard always uses the computed week sum** for its charts. The entered Total is preserved as a traceback figure so the supervisor can see the discrepancy. **This is intentional** — do not "fix" the weekly cells to match a manually-entered Total. If the entered Total is correct, the weekly cells need fixing instead; if the weekly cells are correct, the supervisor will accept the dashboard's computed total.

### Non-numeric values

- **Use blank cells or `NIL`** for "no activity that week" — both are treated as zero.
- Other text values (`-`, `n/a`, `pending`, `?`) are flagged `non_numeric_value` and treated as zero. The raw text is preserved for traceback. If your team uses one of these as a convention, ask the dashboard owner to register it as an alias of zero so the flag doesn't fire.

### Master Class merge

- Per supervisor 2026-05-25: `Master Class 1` and `Master Class 2` are merged on the dashboard into a single **Weekly Realtor Meeting** row. The supervisor can drill into the merged row to see the 1-vs-2 split.
- **Both source rows must continue to exist** in this sheet. Do not collapse them into a single row in the sheet — the merge happens on the dashboard side. If you delete one, you lose the ability to see the split.

### Adding a new year

The dashboard reads **one tab per year, discovered automatically by name** (changed 2026-06-05 — an earlier version of this document said the owner had to register each new tab; that is no longer true).

- For 2027, **duplicate** `2026 Realtors Managers Weekly Report` → rename the copy `2027 Realtors Managers Weekly Report` (keep the month-block layout identical), then clear the copy's data and start entering 2027 months.
- **No notification or code change is needed** — the dashboard finds any `YYYY Realtors Managers Weekly Report` tab by name on the next pull. The owner can confirm with the read-only `pnpm check:carryover`.
- **Keep the 2026 tab** — don't rename or delete it. See [00-common §6](00-common.md#6-starting-a-new-year-2027-and-beyond) for the universal year-rollover rules.

### Other tabs in this workbook (Digital Marketing & Media)

This same spreadsheet (Marketing Team Reporting Template) also holds the **Digital Marketing** and **Media Team Reporting** tabs that feed the Marketing and Media & Content dashboard pages. They have their own data-entry rules — see **[02-marketing.md §Digital Marketing](02-marketing.md#digital-marketing)** and **[05-media-content.md](05-media-content.md)**. Year-rollover: **Digital Marketing** adds a new **section inside** its tab (a literal `2027` marker, not a new tab); **Media** adds a **new tab per year** (`2027 Media Team Reporting`) just like this Realtor tab. The universal rules are in [00-common §6](00-common.md#6-starting-a-new-year-2027-and-beyond).

---

## What's not yet on the dashboard

Three views from the Realtor Management page are intentionally greyed out as out-of-v1 scope:

- **Per-manager realtor performance** — the dashboard ships aggregate-only metrics in v1. Per-manager comes in Phase 2.
- **Digital-ad newly onboarded** — pending data source.
- **OneApp** — pending AWS data integration.

None of these block what you enter today. Continue entering metrics as you normally would; when the data sources land in Phase 2 they will be combined with your existing entries.

---

*Owner: Realtor Management team. Last reviewed: 2026-06-05.*
