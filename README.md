# BuildTrack

A simple job-management web app for a design-build company with a Home dashboard, Jobs, Tasks, a job and crew Schedule, Budgets, Invoices, and a small CRM of People and Accounts. People are standalone records that can belong to several accounts (households, companies, vendors…), and both people and accounts are linked to jobs with a role such as Customer, Architect or Subcontractor.

## Budgets

A job has no single budget table. Instead, each **proposal** or **change order** is its own budget with its own line items and its own document. A job can have several (e.g. two alternate proposals and three change orders), and the job's contract is the sum of the approved ones.

- Change status with the **status dropdown** next to the back link on a budget's page (statuses that aren't allowed yet are greyed out). **Draft** budgets are editable. Setting **Sent** locks a budget so it always matches what the customer saw; to change it, **Clone** it and send the copy. Sent budgets can be approved, declined or voided; approved ones can only be voided.
- Setting **Approved** records who signed and when, and can attach the signed copy (PDF or photo). When one of several proposals on a job is signed, it offers to decline the others. A signed copy can also be attached, replaced or viewed later. Signed copies are kept in this browser's file storage (IndexedDB), not in Settings → backups.
- Each budget page shows its own history: created, cloned, sent, approved, signed copy attached.
- Lines can be negative, e.g. a credit for a design fee paid under another contract.
- Every line has a **cost code**. Job costing is by cost code: expenses are recorded against a job and cost code, and linking an expense to a specific budget line is optional.

- Each budget is its own customer **document** (`src/components/BudgetDocument.tsx`). A budget page has three tabs: **Lines** (the line editor), **Document** (what the customer gets, updated as you edit) and **Details** (title, recipient, notes, signed copy, totals and history). The document shows prices only, never cost or markup. You choose how much the customer sees: every line priced, group totals only, or one total for the whole scope, with or without quantities. Change orders also show what was previously approved on the job and the new approved total. **Print / PDF** prints just the document, so you can save it as a PDF from the print dialog.

Budgets live on each job's **Budgets** tab (grouped by status, so the Approved row is the job's signed total) and in the top-level **Budgets** page. Both lists can be sorted and grouped (by status, type or, on the Budgets page, job). A job can have any number of approved proposals, e.g. a separate piece of work that isn't a change order, and they all count toward its approved total. The rules are in `src/budgets.ts`.

## Invoices

Invoices are progress bills against approved budgets (`src/invoices.ts`). A new invoice includes every approved proposal and change order on the job (you can untick any), and shows one section per budget. For each line, or a whole group at once, you enter the **percent complete to date**; the invoice bills the difference from what was billed before, and works out the amount due, billed to date and balance to finish. **Bill to 100%** finishes a budget in one click.

- Draft invoices are editable. Setting the status to **Sent** (same dropdown) locks the invoice and freezes what had been billed before it, so its amounts never change afterwards. Sent invoices can be marked paid or voided; a voided invoice's amounts become billable again on the next draft.
- The invoice document shows every line or group totals only, with contract, previously billed, percent complete and this invoice, and prints or saves as a PDF like budgets.
- Each job has an **Invoices** tab (contract, billed, paid, outstanding, left to bill) and the top-level **Invoices** page lists them all, with an Overdue filter.
- Older invoice records from the documents list (no line items) are left as they are and still count on the Home page.

## Develop

```
npm install
npm run dev
```

The UI is built with [shadcn/ui](https://ui.shadcn.com) components (in `src/components/ui/`) on Tailwind CSS v4. Theme colours live in `src/index.css`; the older hand-written styles in `src/styles.css` are loaded in a lower cascade layer, so Tailwind classes always win where they meet. Add more components with `npx shadcn@latest add <name>`.

## Themes and dark mode

**Settings → Appearance** picks a colour theme (BuildTrack, Graphite, Nord, Gruvbox, Catppuccin, Tokyo Night, Rosé Pine, Solarized) and Light, Dark or System mode. The choice is saved per browser (`bt-appearance` in localStorage), not in the company data, and `index.html` applies it before the first paint. Customer documents (budgets, invoices, PDFs) always stay black on white.

- Themes live in `src/themes.css`: each one sets a few base colours for light and dark, and the rest are worked out from them. To add one, add a pair of `[data-theme]` blocks there and an entry in `THEMES` in `src/appearance.ts`.
- `src/theme-legacy.css` swaps the few colours written directly into `src/styles.css` for theme colours.

## Build

```
npm run build
```

The finished site is written to `dist/`. Serve that folder with any static web server, for example:

```
npx serve dist
```

(Opening `index.html` straight from the disk won't work, because each page lives at its own address such as `/jobs`.)

All data is sample data stored in your browser (localStorage). Use **Settings → Reset sample data** to start over.

## Where things live

- **The app itself:** this folder. `src/` holds the code, and `npm run build` writes the finished site to `dist/`.
- **Your data:** your browser saves a local copy under `buildtrack-db-v6`. Older saves and restored backups are migrated automatically (`src/migrate.ts`). Existing to-dos become Tasks, and existing schedule records go into Schedule Entries with an unassigned crew. Each job's old budget table becomes one proposal (attached to the job's existing proposal document if it had one), its "spent so far" amounts become expenses, and other proposal and change-order documents become budgets with a single line for their total. The previous `buildtrack-db-v5` copy is left in place. To export or restore a copy, go to **Settings → Your data**.

Legacy message records are removed when the app loads saved data or restores an older backup. Other records are retained.
