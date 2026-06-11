# Media & Content — Data Entry Rules

> **Before reading this, read [00-common.md](00-common.md).** It covers universal rules (date formatting, sheet structure) that apply to every sheet, including yours. This document only covers what's specific to your tab.

**Sheet you own:** the **`<year> Media Team Reporting`** tabs on the Marketing Team Reporting Template — **one tab per year** (`2026 Media Team Reporting`, `2027 Media Team Reporting`, …).

> This is the same spreadsheet that holds the `Realtors Managers Weekly Report` and `Digital Marketing` tabs, but a **different tab**. Each tab is documented separately ([04-realtor-management.md](04-realtor-management.md), [02-marketing.md §Digital Marketing](02-marketing.md#digital-marketing)).

**Source of truth for:** weekly social-media performance per brand per platform — the **Media & Content** page of the dashboard.

---

## How the tab is laid out

Each year has its **own tab** (`2026 Media Team Reporting`, etc.) holding that year's **weekly grid** — the months stacked vertically from the top. For each month:

- A **month header row** — the month name (`JANUARY`) plus **`WEEK 1` / `WEEK 2` / `WEEK 3` / `WEEK 4`** markers spread across the columns (one column-group per week).
- Under each week, three **platform sections** in order — **`Facebook`**, **`Instagram`**, **`YouTube Channel`** — each introduced by a platform header row.
- Each platform header row carries the **8 brand columns**, in this order: **PG, REALVEST, PPL, HOMEWORTH, PETTY SAVE, GENIUS, SETTLE QUICK, FARMWEY AFRICA**.
- Beneath each platform header, the **metric rows**, one value per brand column:
  - `Number of Interactions`
  - `Average Reach`
  - `Number of Page Visits`
  - `Number of New Followers`
  - `Total Number of Followers`
  - `No of Views`
  - `Number of Posts Delivered`

So a single value = (month, week, platform, brand, metric).

---

## Rules that keep it readable by the dashboard

- **Keep the platform header rows** (`Facebook` / `Instagram` / `YouTube Channel`) before each platform's metric rows. The dashboard reads them to learn which brand each column holds for that week — without the header, the values below have no brand.
- **Keep the 8 brand columns in the same order.** Minor spelling variants are tolerated (`HOMEWORTH` vs `HOMEWORTH HOTEL`) because they're aliased, but a brand the dashboard can't recognize is **dropped for that week and flagged**. If a brand is added or renamed, tell the dashboard owner so it's registered.
- **Keep metric labels consistent** (`Average Reach`, `Number of New Followers`, …). A reworded or misspelled label becomes an unknown metric and is skipped. For a genuinely new metric, coordinate with the dashboard owner first.
- **Keep the `WEEK 1`–`WEEK 4` markers** in each month's header row — they anchor every week column.
- **Values:**
  - Plain numbers.
  - **`NIL`** (or blank) = "posted/active, but the count was zero" → read as 0.
  - **`-`** (dash) = "not applicable" → read as no value.
  - Any other text is read as 0 and flagged for the supervisor.
- **Keep each year's data in its own `<year> Media Team Reporting` tab.** The dashboard reads the whole tab and tags everything with the year in the tab's **name** — so a single tab must never mix two years (see *Starting a new year*).
- The monthly **summary block** and the **YouTube Monetization Report** that sit *below* the weekly grid are **out of scope for v1** — the dashboard reads only the weekly grid. Keep maintaining them if you like; they're just not read yet.

---

## Starting a new year (2027 and beyond)

Media now works like the other sheets — **one tab per year, discovered automatically by name.**

1. **Duplicate** `2026 Media Team Reporting` → rename the copy **`2027 Media Team Reporting`** (keep the layout identical — month headers, platform rows, the 8 brand columns, metric rows).
2. **Clear the copied values**, then enter 2027's weekly numbers.
3. That's it — the dashboard finds any `YYYY Media Team Reporting` tab by name on the next pull. **No code change, no start-row to send.**

**The golden rule for Media:** each `<year> Media Team Reporting` tab must contain **only that one year**. The weekly grid has no year written inside it, so the dashboard trusts the tab name — a tab holding two years would tag both as the same year.

See [00-common §6](00-common.md#6-starting-a-new-year-2027-and-beyond) for the universal year-rollover rules.

---

*Owner: Media & Content team. Last reviewed: 2026-06-05.*
