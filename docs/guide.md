# How BuildTrack works

The rules behind each part of the app, in more detail than the [README](../README.md).

## People and accounts

People are standalone records that can belong to several accounts (households, companies, vendors…), and both people and accounts are linked to jobs with a role such as Customer, Architect or Subcontractor.

## Budgets

A job has no single budget table. Instead, each **proposal** or **change order** is its own budget with its own line items and its own document. A job can have several (e.g. two alternate proposals and three change orders), and the job's contract is the sum of the approved ones.

- Change status with the **status dropdown** next to the back link on a budget's page (statuses that aren't allowed yet are greyed out). **Draft** budgets are editable. Setting **Sent** locks a budget so it always matches what the customer saw; to change it, **Clone** it and send the copy. Sent budgets can be approved, declined or voided; approved ones can only be voided.
- Setting **Approved** records who signed and when, and can attach the signed copy (PDF or photo). When one of several proposals on a job is signed, it offers to decline the others. A signed copy can also be attached, replaced or viewed later. Signed copies are kept in this browser's file storage (IndexedDB), not in Settings → backups.
- Each budget page shows its own history: created, cloned, sent, approved, signed copy attached.
- Lines can be negative, e.g. a credit for a design fee paid under another contract.
- Every line has a **cost code**. Job costing is by cost code: expenses are recorded against a job and cost code, and linking an expense to a specific budget line is optional.

- Each budget is its own customer **document** (`src/plugins/budgets/BudgetDocument.tsx`). A budget page has three tabs: **Lines** (the line editor), **Document** (what the customer gets, updated as you edit) and **Details** (title, recipient, notes, signed copy, totals and history). The document shows prices only, never cost or markup. You choose how much the customer sees: every line priced, group totals only, or one total for the whole scope, with or without quantities. Change orders also show what was previously approved on the job and the new approved total. **Print / PDF** prints just the document, so you can save it as a PDF from the print dialog.

Budgets live on each job's **Budgets** tab (grouped by status, so the Approved row is the job's signed total) and in the top-level **Budgets** page. Both lists can be sorted and grouped (by status, type or, on the Budgets page, job). A job can have any number of approved proposals, e.g. a separate piece of work that isn't a change order, and they all count toward its approved total. The rules are in `src/plugins/budgets/budgets.ts`.

## Invoices

Invoices are progress bills against approved budgets (`src/plugins/invoices/invoices.ts`). A new invoice includes every approved proposal and change order on the job (you can untick any), and shows one section per budget. For each line, or a whole group at once, you enter the **percent complete to date**; the invoice bills the difference from what was billed before, and works out the amount due, billed to date and balance to finish. **Bill to 100%** finishes a budget in one click.

- Draft invoices are editable. Setting the status to **Sent** (same dropdown) locks the invoice and freezes what had been billed before it, so its amounts never change afterwards. Sent invoices can be marked paid or voided; a voided invoice's amounts become billable again on the next draft.
- The invoice document shows every line or group totals only, with contract, previously billed, percent complete and this invoice, and prints or saves as a PDF like budgets.
- Each job has an **Invoices** tab (contract, billed, paid, outstanding, left to bill) and the top-level **Invoices** page lists them all, with an Overdue filter.
- Older invoice records from the documents list (no line items) are left as they are and still count on the Home page.

## Bids

A **bid package** (`src/plugins/bids/bids.ts`) is a scope of work on a job sent to subcontractors for pricing, e.g. "Electrical — rough and finish". It has a trade (cost code), a bids-due date, the written scope, optional items to price (written fresh or **imported from a budget** — copied, never live-linked, and never showing your costs), and files such as plans and specs.

- **Delivery is by email.** The package prints as a *Bid request* PDF. Each invited sub has an **Email** button that opens a ready-to-send message in your mail app and records the date it went out (or, with no email on file, shows the text to copy). **Mark as sent** records it for everyone you emailed yourself. There's no portal.
- Bids come back by email and are entered by hand: a total (required), optional prices per item, inclusions, exclusions, how long the price is good for, notes and their quote file. Subs who decline are marked as such.
- **Compare bids** lines the subs up side by side, highlights the lowest price in each row, and shows each against the job's budgeted cost for the package's cost code.
- **Award** marks the bid Awarded (and, optionally, the others Not selected) and creates a **draft bill** from that sub for the bid amount, coded to the package's cost code. More bills can be made against the same award for progress billing; the package shows awarded, billed and paid. An award can be undone while its bills are still drafts. More than one bid can be awarded for a split scope.
- The **Bids** page lists open packages (out for bid, ready to award, due this week); each job has a **Bids** tab and each vendor's account page lists their bids.

## Job costing

Each job has a **Costs** tab (`src/plugins/costing/`) with one row per cost code. Click a row to see the budget lines, awarded bids, bills and expenses in it.

- **Budget**: cost (not price) of the job's approved proposal and change-order lines.
- **Committed**: awarded bids.
- **Actual**: approved vendor bills (open or paid) plus recorded expenses; **paid out** is what's been paid on those bills.
- **Projected**: the committed amount once a bid is awarded, otherwise the budget, and never less than actual. **Variance** is budget minus projected.

The totals give the projected cost, profit and margin, which also show on the job's Overview.

## Bills

Bills are what we owe vendors and subcontractors on a job (`src/plugins/bills/bills.ts`). Each one is entered from the vendor's invoice: their invoice number, dates, and one or more charges, each with a **cost code** so job costing can total what each part of the job cost. Files such as the vendor's invoice or a lien release can be attached.

- A bill starts as **Draft** while it's checked, then **Approve to pay** makes it **Open** and locks the amounts. An open bill can go back to draft or be voided until a payment is made on it.
- **Record payment** logs each payment (date, amount, method, check or reference number). The bill turns **Paid** automatically when payments cover it, and reopens if a payment is removed. Lists show when it was paid, and an open bill past its due date shows as **Overdue**.
- Payments made on bills share the payments table with payments received on invoices (`billId` instead of `invoiceId`).
- The **Bills** page lists every bill (owed, overdue, due this week, paid this month, drafts to review); each job has a **Bills** tab and each vendor's account page lists its bills. A bill prints or saves as a PDF record of what was paid.

## Plugins

Every feature is a plugin in `src/plugins/`: each adds its own menu items, pages, job tabs, company-page sections and Overview rows. **Settings → Plugins** turns them on and off for the whole company (their data is kept) and, where several plugins do the same job, chooses between them. Plugins share data through small contracts instead of reading each other's records; job costing, for example, adds up cost entries that Budgets, Bids, Bills and Expenses provide. See [`src/plugins/README.md`](../src/plugins/README.md) to change or replace one.

