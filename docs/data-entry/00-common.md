# Common Rules — Read This First

**Audience:** Anyone entering or editing data in any of the Google Sheets that feed the Pertinence Dashboard.
**Purpose:** Keep the dashboard accurate and prevent it from breaking when staff change.
**How to use:** Read this document once. Then read your team's document (see [README.md](README.md)). When something out of the ordinary happens, check Sections 4 and 5 here.

---

## 1. Why this document exists

The Pertinence Dashboard does not type any numbers into the source sheets — it only **reads** them. Every chart, KPI, and total on the dashboard is derived from the cells your team fills in. That means:

- A column renamed in a sheet = that column missing on the dashboard.
- A new sheet tab added with the wrong name = ignored by the dashboard.
- An amount typed as "₦2,500,000" instead of `2500000` = read as zero.
- A date typed as plain text instead of a real date cell = unparseable, the row drops out of every monthly chart.

None of these problems produce an error message in the dashboard. The data just quietly disappears or shows the wrong total. This document is the contract between the people entering data and the dashboard that reads it. If everyone follows it, the dashboard stays accurate without anyone needing to touch the code.

---

## 2. The big picture — how the dashboard reads sheets

1. **Read-only access.** The dashboard's service account is shared on each sheet as a **Viewer**. It cannot change any cell. Whatever your team types is exactly what the dashboard sees.
2. **Scheduled pulls.** The dashboard re-reads every connected sheet on a scheduled cadence (every ~15 minutes once Step 9 of the roadmap is live; until then, pulls happen when an admin clicks **Re-pull from Sheets**). Edits you make appear on the dashboard at the next pull, not instantly.
3. **Idempotent.** Re-pulling does not duplicate data. Each row is uniquely identified by `(sheet, tab, row number)` — so editing row 47 just updates the existing record on the dashboard side.
4. **Surfaces problems, never hides them.** When a row has something the dashboard can't interpret (unknown location, unparseable date, missing category), the row is **still saved** but **tagged with a "quality flag"**. The dashboard shows you these tagged rows on the Data Quality view so you can fix them at the source. The dashboard never silently substitutes a guess for bad data.
5. **One source of truth per number.** Sales revenue comes from Bank Deposit `2026 LAND`. Plot counts come from Weekly Sales. The two will sometimes disagree, and that disagreement is shown on the dashboard on purpose — do not "fix" one sheet to match the other.

---

## 3. Universal rules — these apply to every sheet

### 3.1 Sheet structure rules — do not change

| Rule | Why |
| --- | --- |
| **Do not rename tabs.** | The dashboard looks for tabs by their exact name. `2026 LAND`, `CATHERINE`, `May 2026`, `2026 Customer File`, `2026 Weekly Sales Report`, `2026 Realtors Managers Weekly Report` are all looked up by name. Renaming a tab makes it invisible to the dashboard. |
| **Do not rename, reorder, or delete header columns.** | The dashboard reads each column by its header name. If `AMOUNT` becomes `Amount Paid`, the amount column is missing on the dashboard. |
| **Do not insert blank rows in the middle of a data range.** | Some ingests stop at the first blank row. A blank row in the middle silently truncates the data. |
| **Do not merge cells inside the data range.** | Merged cells return blank for every cell after the first. Use a single cell per value. |
| **Do not add summary rows ("Total", "Balance c/f") between data rows.** | The Marketing ingest auto-filters specific summary descriptions, but other ingests do not. Put totals at the bottom only, never in the middle. |
| **Adding a new tab requires the matching naming convention.** | Marketing month tabs must be named `Month YYYY` (e.g., `June 2026`). Anything else is ignored. |
| **Adding a new column at the end is safe; inserting between existing columns is not.** | Inserting shifts every column to the right of the insert, which silently relabels data on the dashboard side. If you need a new column, add it after the last existing column and notify the dashboard owner so they can wire it up. |

### 3.2 Dates — always use real date cells

- Type dates as **real dates** (`5/29/2026` entered into a date-formatted cell), not as text strings.
- Sheets shows a real date right-aligned by default; text dates are left-aligned. If your dates are left-aligned, they're text — re-enter them.
- **Do not** mix conventions on the same sheet (e.g., some cells D/M/Y, some cells M/D/Y). Pick one and use it consistently.
- The dashboard reads dates as Google Sheets' internal serial numbers, so once a cell is a real date, the regional convention does not matter.
- **Do not** leave a date cell blank in the middle of a chronological list unless instructed to (the Bank Deposit ledger convention allows blank dates for repeat-deposits on the same day — see the Sales & Finance document).

### 3.3 Money / amounts — numbers only

- Amounts must be plain numbers: `2500000` or `2500000.50`.
- **Do not** include the ₦ symbol, commas, spaces, or quote marks. `"₦2,500,000"` will be read as zero or junk.
- Format the cell for display (right-aligned, comma-separated) using Google Sheets number formatting — the underlying value must remain a number.
- No negative numbers for refunds unless the column was designed for them (today, none are).
- Decimals are fine (`2500000.50`) — precision is preserved to two decimal places.

### 3.4 Names and text fields

- Spellings must be **consistent**. "Mr. John Doe", "Mr John Doe", and "John Doe" are three different people to the dashboard unless they match a known alias.
- **Do not** add extra spaces around values, especially in canonical fields (PURPOSE, LOCATION, Category). Trailing or leading spaces are tolerated by case-insensitive matching, but mid-string double spaces are not — `Lavida  Hills` (two spaces) will not match `Lavida Hills`.
- One exception, **kept on purpose**: the header `CLIENT  NAME` on the Bank Deposit `2026 LAND` tab is intentionally a double space. The supervisor created it that way and the dashboard is configured to match it exactly. **Do not "fix" this header.**

### 3.5 One row = one record

- Every row in a data range represents one transaction, one customer, one expense, one log. Do not combine two payments into one row, even if they share a date.
- If a Customer Support log covers multiple complaint categories (e.g., "Refund, Termination"), enter all of them in the Nature of Complaint cell separated by commas — the dashboard automatically splits these into one record per category. Do not create a second row by hand for the same conversation.

---

## 4. When a new value appears

The dashboard works against a "canonical list" for these fields:

| Field | Sheet(s) | Canonical list | If unmatched |
| --- | --- | --- | --- |
| LOCATION | Bank Deposit, Weekly Sales, Customer File | `locations` + `location_aliases` | Flag `unknown_location`; row saved with no location, missing from location-based charts. |
| PURPOSE | Bank Deposit | `purposes` + `purpose_aliases` | Flag `unknown_purpose`; row saved with no purpose, missing from purpose-based charts. |
| Category | Marketing Fund Expense | `expense_categories` | Flag `fallback_category`; keyword-matched on description as a safety net. |
| Nature of Complaint | Customer Support | `complaint_categories` + `complaint_aliases` | Flag `unknown_complaint_category`; row saved with no category, missing from complaint-category charts. |
| Realtor metric label | Realtors Managers Weekly | `realtor_metric_canonicals` + `realtor_metric_aliases` | Row skipped (unknown labels are not auto-added as new metrics). |
| Realtor manager / Sales person | Bank Deposit, Weekly Sales, Customer File | `realtor_managers` roster | Flag `missing_realtor`; counted as "Unattributed" on dashboard. |

**Workflow when a new value appears:**

1. **Type the new value into the sheet as the team would normally write it.** Don't avoid typing a real new location just because it's not on the canonical list — the row should be entered correctly.
2. **The dashboard ingests the row** at the next pull. The row is saved with the unknown-value flag (`unknown_location`, `unknown_purpose`, etc.).
3. **The Data Quality view on the dashboard surfaces the flagged row** so the supervisor can see what's new.
4. **The supervisor decides:**
   - **It's a new canonical** (e.g., a new estate location Pertinence is now selling) → add it to the canonical list **and** add the spelling used in the sheet as its first alias.
   - **It's a misspelling of an existing canonical** (e.g., `Lavida Hilss` for `Lavida Hills`) → add the misspelling as an alias of the existing canonical. Do **not** "fix" the spelling in the source sheet historically — the alias handles it forward and back.
   - **It's ambiguous** (e.g., `Lavida` could mean Lavida Hills or Lavida Prime) → the supervisor clarifies with the entering team before adding either an alias or a new canonical.
5. **The change takes effect on the next ingest pull.** No data is lost between the row being entered and the canonical being added — the row was already saved with the raw value, and the next pull resolves it to the correct canonical id.

**Until the admin UI is built (Step 9–10 of the roadmap), canonical additions are done by the dashboard owner through the Supabase dashboard SQL editor.** Once the admin panel is in place, this becomes a button-click in the dashboard itself. Either way:

- The **rule** is to never silently overwrite a sheet's value to match a canonical. The sheet stays as the operator's record.
- The **alias table** is the bridge: it maps "what the operator typed" → "what the dashboard counts it as."

---

## 5. What to do when something looks wrong

| Symptom | First thing to check | Then |
| --- | --- | --- |
| A row I just entered is not on the dashboard. | Did the scheduled pull run yet? Pulls happen every ~15 minutes (or on admin button). Wait one pull cycle. | If still missing after a pull, check the Data Quality view for a flagged row matching yours. |
| A whole tab is missing from the dashboard. | Has the tab been renamed? Compare against the names in your team's document. | If the name is right, the dashboard owner needs to check the ingest function. |
| A whole column is missing from the dashboard. | Has the column header been changed, reordered, or had a new column inserted before it? | Restore the original header / column order. |
| Amounts on the dashboard are zero or wildly different. | Are the amounts entered as plain numbers (no ₦, no commas, no quotes)? | Reformat the underlying values. Cell display formatting is fine; the underlying value must be a number. |
| All my dates are missing from the dashboard. | Are the dates real date cells (right-aligned in Sheets) or text strings (left-aligned)? | Re-enter as real dates. |
| The dashboard owner cannot read our new sheet. | Has the service account been added as a Viewer on the sheet? The address is `dashboard-sheets-reader@pertinence-dashboard.iam.gserviceaccount.com`. | Share with that address as Viewer. |
| Two numbers disagree on the dashboard (e.g., Bank Deposit vs Weekly Sales). | This is by design — the dashboard surfaces these discrepancies for the supervisor to act on. | Do **not** edit either sheet to "fix" it. The supervisor will reconcile. |

**Who to contact:** the dashboard owner / tech lead at Pertinence. (Roles and contact details should be filled in here when handover is complete.)

---

## 6. Glossary

- **Canonical** — the single official spelling for a value (e.g., `Lavida Hills` is the canonical name for that estate). All operator variations are mapped to it via aliases.
- **Alias** — an alternative spelling that maps to a canonical. Adding an alias is how the dashboard "learns" a new way of writing the same thing without changing the source sheet.
- **Ingest** — the dashboard's read-and-import step that pulls data from a Google Sheet into the dashboard's database.
- **Quality flag** — a marker the dashboard attaches to a row when something was unexpected (unknown location, blank date, etc.). The row is still saved. Flags appear on the Data Quality view.
- **Service account** — the special Google account the dashboard uses to read sheets. It's a Viewer on each shared sheet. It cannot edit anything.
- **Source of truth** — for any given number, the one sheet that is authoritative. Bank Deposit `2026 LAND` is the source of truth for sales revenue. Weekly Sales is the source of truth for plot counts. The two are not averaged or reconciled.

---

*Owner: Pertinence Group Operations. Last reviewed: 2026-05-29.*
