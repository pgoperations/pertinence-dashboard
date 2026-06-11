# Customer Support — Data Entry Rules

> **Before reading this, read [00-common.md](00-common.md).** It covers universal rules (date formatting, sheet structure) that apply to every sheet, including yours. This document only covers what's specific to your sheet.

**Sheet you own:** MASTER SHEET - CUSTOMER SUPPORT.

**Source of truth for:** every customer enquiry, complaint, and log per CS rep.

---

## Tab structure

One tab per active CS rep, named in ALL-CAPS with the rep's first name. Today:

`CATHERINE`, `MARIAM`, `MARY`, `YETUNDE`, `LOVINAL`

Tab names are case-sensitive and exact. Each rep is mapped to their brand (PPL or RealVest) in the dashboard's roster, not in this sheet.

---

## Required columns (in order)

| Col | Header | Type | Notes |
| --- | --- | --- | --- |
| A | (blank) | — | Spacer column. |
| B | `S/N` | Number | Serial number. |
| C | `Date` | Real date | Date of the log. |
| D | `Time` | Time | Time the log was made. |
| E | `Type of Customer` | Text | E.g., `Existing`, `Prospect`. |
| F | `Customer/ Realtor Name` | Text | Note the space after the slash — header has it. |
| G | `Location/Product` | Text | What product or location the log concerns. |
| H | `Nature of Complaint` | Text — canonical-mapped | The category. Multiple categories on one log are comma-separated (see below). |
| I | `Status Update` | Text | Latest action note. |
| J | `Channel` | Text | E.g., `Call`, `WhatsApp`, `Email`, `In-Person`. |
| K | `Team Escalated` | Text | Which team it was routed to. |
| L | `Means of Escalation` | Text | How it was escalated. |
| M | `Feedback` | Text | Customer feedback / outcome. |
| N | `Status of Complaint` | Text | E.g., `Resolved`, `Pending`. Used by the dashboard to count Resolution Rate. |

---

## Composite complaints — one log, multiple categories

If a single log covers more than one complaint category, enter all the categories in column H separated by commas — for example:

- `Documentation, Site Allocation`
- `Refund, Termination and Movement`
- `Semi-finished Delivery, Conversion to Land, Refund`

The dashboard splits these automatically into one record per category. **Do not** duplicate the row by hand for the same conversation.

This is the supervisor's intended pattern (decision 2026-05-14): one log with multiple complaint types should be counted once per type on the dashboard, but stay as one row in the sheet so the rep's log book matches the customer conversation.

---

## Team rules

- **Use canonical complaint categories** for column H. Examples already in use: `Documentation`, `Site Allocation`, `Refund`, `Termination`, `Movement`, `Conversion to Land`, `Semi-finished Delivery`. If your log doesn't fit any, type your best description — the dashboard tags it `unknown_complaint_category` and the supervisor adds the alias. See [00-common §4](00-common.md#4-when-a-new-value-appears).
- **Every log with a date counts as one ticket** — by the date in column C, matching the supervisor's Customer Service Portal (reconciled 2026-06-05). A blank `Nature of Complaint` is fine; the row still counts as a ticket. The dashboard no longer splits out "enquiries" — everything rolls into one **Total Customer Logs** figure.
- **`Status of Complaint` (column N) drives the Resolved / Unresolved split**, matched **exactly** (case-insensitive, spaces tolerated):
  - **Resolved** = `Resolved` or `Responded`
  - **Unresolved** = `Pending` or `In Progress`
  - Anything else — blank, `Escalated`, or a combined value like `Responded, Pending` — counts in the Total but in **neither** bucket ("Other"), which lowers the resolution rate.
  - So be consistent: use exactly `Resolved`, `Responded`, `Pending`, or `In Progress`. Invented variants (`Done`, `Closed`, `Resolved.`) land in "Other".
- **`Channel` (column J) is still recorded** on each log for your own records, but the dashboard's old "Logs by Channel" chart was **replaced on 2026-06-05** by a **Performance by Representative** chart (resolved vs unresolved per rep). Channel is no longer charted, so its exact spelling no longer affects the dashboard — though keeping it consistent is still good practice.

---

## Adding or removing a rep

**New rep — now automatic (2026-06-05):**

1. Create the tab in MASTER SHEET - CUSTOMER SUPPORT, named in ALL-CAPS (e.g., `IFEOMA`). Easiest is to **duplicate an existing rep's tab** and clear its data, so the column layout (A:N) matches exactly.
2. Make sure the rep is listed in the **`Staff_Reference`** tab with their work email — `…@pertinenceproperties.com` for PPL or `…@realvest.ng` for RealVest. The dashboard reads this to assign the rep's brand automatically.
3. That's it. On the next pull the dashboard **auto-detects the new rep tab**, creates the rep, and assigns their brand from the email domain — **no notification or code change needed**.
   - If the rep is **not** in `Staff_Reference` (or the email domain isn't recognized), the dashboard can't determine their brand, so it **skips that tab** and lists it as an "unmapped rep" for the owner. Add the email to `Staff_Reference` and re-sync to fix.
4. Non-rep tabs are ignored automatically — `Staff_Reference`, `Rep ID`, `New Customer File`, `_Categories`, and the inactive `ABIDEMI` / `VICTORIA`. Any tab missing the standard `Date` + `Status of Complaint` headers is also skipped (this is why a stray tab like an audit log never pollutes the numbers).

**Departing rep:** do **not** delete the tab — their historical logs are still part of the brand's totals. Tell the dashboard owner so they can remove the rep from current-period views while keeping the history.

---

## Starting a new year

This sheet has **no year tabs** — it's one continuous log per rep, so there is **nothing to create** for 2027. Keep logging; the dashboard's date-range selector separates the years. (See [00-common §6](00-common.md#6-starting-a-new-year-2027-and-beyond).)

---

*Owner: Customer Support team. Last reviewed: 2026-06-05.*
