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
- **Empty `Nature of Complaint` is allowed** — it represents an enquiry rather than a complaint. The dashboard does **not** flag empty Nature cells; absence is its own valid state.
- **`Status of Complaint` drives the Resolution Rate KPI.** Be consistent: use `Resolved` (not `Resolved.`, `RESOLVED`, `Done`). Case-insensitive matching helps, but inventing new variants doesn't.
- **Channel** values feed the "Logs by Channel" bar chart. Stick to the standard set: `Call`, `WhatsApp`, `Email`, `In-Person`, `Walk-In`, `SMS`. New channels are fine but consistency matters across reps.

---

## Adding or removing a rep

**New rep:**

1. Create the tab in MASTER SHEET - CUSTOMER SUPPORT, named in ALL-CAPS (e.g., `IFEOMA`).
2. Add the standard column headers (A:N as above).
3. Notify the dashboard owner with:
   - The rep's name (as it should appear on the dashboard, mixed case e.g., `Ifeoma`)
   - Their brand assignment: PPL, RealVest, or Both
   - Start date
4. The owner adds the rep to the dashboard's `customer_service_reps` roster.
5. Logs the rep enters before the roster is updated are saved on the dashboard side but counted as "unmapped rep" until the roster row exists. After the roster is updated, the next pull resolves them correctly.

**Departing rep:** do **not** delete the tab. Their historical logs are still part of the brand's totals. Tell the dashboard owner to mark them inactive in the roster — they'll stop appearing in current-period rep lists but stay in historical aggregates.

---

*Owner: Customer Support team. Last reviewed: 2026-05-29.*
