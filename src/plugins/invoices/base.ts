import { definePluginBase } from '../sdk';

export default definePluginBase({
  id: 'buildtrack.invoices',
  name: 'Invoices',
  description: 'Progress billing to customers against approved budgets, with payments received.',
  requires: ['buildtrack.budgets'],
  collections: ['invoices', 'payments'],
  skills: [
    {
      name: 'progress-billing',
      description: 'How customer invoices work in BuildTrack: billing by percent complete against approved budgets, locking, payments, outstanding and overdue. Use for any question about what a customer has been billed, paid or owes.',
      body: `# Progress billing

Invoices (\`invoices\`) bill the customer for work done, as a **percent complete** of the lines of the job's approved proposals and change orders.

## How an invoice's amount is worked out
- For each budget line the invoice records the percent complete **to date**.
- This invoice bills the difference between that and what earlier invoices already billed.
- The invoice shows the contract, previously billed, this invoice and the balance to finish.

## Statuses
- **Draft**: editable.
- **Sent**: locked; what was billed before is frozen so its numbers never change.
- **Paid**: set automatically when payments cover it.
- **Void**: its amounts become billable again on the next draft.
- An unpaid sent invoice past its due date is **Overdue**; one with some payments is **Partially paid**.

## Payments
Money received is in \`payments\` with an \`invoiceId\`. (Payments with a \`billId\` are money paid out to vendors, not received.)

## Answering questions
- \`job_billing\`: one job's contract, billed, received, outstanding, overdue and left to bill.
- \`open_invoices\`: every unpaid sent invoice across all jobs, with what's still due and whether it's overdue.
- Retainage is handled by hand outside BuildTrack; don't calculate it.`,
    },
  ],
});
