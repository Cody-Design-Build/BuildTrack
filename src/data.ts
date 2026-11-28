import { migrateBudgets, type LegacyBudgetItem, type PreBudgetDb } from './migrate';
import type { Look, Preferences } from './theming/types';

// The app's data model and sample data.
//
// PEOPLE are standalone records. ACCOUNTS are any organisation or household we deal with
// (customers, vendors, subcontractors, architects…), tagged with one or more types.
// A person can belong to any number of accounts through a MEMBERSHIP (with a title), and
// both people and accounts are linked to jobs through JOB LINKS, each with a role.
// Documents, tasks and activity point at a "party": the id of a person or an account.

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  color?: string; // avatar colour
}

export interface Account {
  id: string;
  name: string;
  types: string[]; // e.g. ["Customer"], ["Vendor", "Subcontractor"]
  phone: string;
  email: string;
  address: string;
  notes: string;
  color: string;
  trade?: string; // e.g. "Tile"
}

/** A person's place in an account, e.g. Ana Mendes is the Estimator at Stoneworks Tile Co. */
export interface Membership {
  id: string;
  personId: string;
  accountId: string;
  title: string;
  primary: boolean; // the main person to contact at this account
}

/** A person or account involved in a job, e.g. Maya Harper is the Customer on 2243 Lincoln. */
export interface JobLink {
  id: string;
  jobId: string;
  partyId: string; // person id or account id
  role: string;
}

export const ACCOUNT_TYPES = ['Customer', 'Vendor', 'Subcontractor', 'Supplier', 'Architect', 'Designer', 'Engineer', 'Lender', 'Other'];

export const JOB_ROLES = ['Customer', 'Decision Maker', 'Site Contact', 'Billing Contact', 'Architect', 'Designer', 'Engineer', 'Subcontractor', 'Supplier', 'Inspector', 'Other'];

export type JobStatus =
  | 'Lead'
  | 'Estimating'
  | 'Negotiating'
  | 'Pre-Construction'
  | 'In Progress'
  | 'Punch List'
  | 'Completed';

export const JOB_STATUSES: { name: JobStatus; color: string }[] = [
  { name: 'Lead', color: '#dc2626' },
  { name: 'Estimating', color: '#ea580c' },
  { name: 'Negotiating', color: '#ca8a04' },
  { name: 'Pre-Construction', color: '#16a34a' },
  { name: 'In Progress', color: '#0284c7' },
  { name: 'Punch List', color: '#9333ea' },
  { name: 'Completed', color: '#4b5563' },
];

export interface Job {
  id: string;
  name: string;
  address: string; // job site
  status: JobStatus;
  total: number;
  projectedCost: number;
  start: string; // yyyy-mm-dd
  end: string;
  progress: number; // 0..100
}

// Proposals and change orders are budgets (see Budget below), not documents.
export type DocKind =
  | 'Invoice'
  | 'Bid Request'
  | 'Subcontractor Agreement'
  | 'Purchase Order'
  | 'Bill';

export interface Doc {
  id: string;
  jobId: string;
  partyId: string; // person or account the document is with
  kind: DocKind;
  number: string;
  amount: number;
  status: 'Draft' | 'Pending' | 'Approved' | 'Open' | 'Paid';
}

export interface TeamMember {
  id: string;
  name: string;
  initials: string;
  color: string;
  email?: string; // the account that signs in as this person (shared data only)
}

export interface Task {
  id: string;
  name: string;
  partyId: string; // person or account, optional
  jobId: string;
  due: string;
  type: string;
  assignees: string[];
  done: boolean;
}

export interface ScheduleEntry {
  id: string;
  jobId: string;
  name: string;
  start: string;
  end: string;
  crewIds: string[];
  progress: number;
}

export const COST_TYPES = ['Labor', 'Materials', 'Subcontractor', 'Other'] as const;
export type CostType = (typeof COST_TYPES)[number];

/** A job-costing bucket, e.g. "08 Plumbing". Budget lines and expenses both point at one. */
export interface CostCode {
  id: string;
  number: string; // "08"
  name: string; // "Plumbing"
}

export const BUDGET_KINDS = ['Proposal', 'Change Order'] as const;
export type BudgetKind = (typeof BUDGET_KINDS)[number];

/** Draft is editable. Sending locks it; approved, declined and void stay locked. */
export const BUDGET_STATUSES = ['Draft', 'Sent', 'Approved', 'Declined', 'Void'] as const;
export type BudgetStatus = (typeof BUDGET_STATUSES)[number];

/** How much detail the customer sees on the document. */
export type BudgetDetailLevel = 'lines' | 'groups' | 'total';
export interface BudgetDisplay {
  detail: BudgetDetailLevel; // every line priced, one price per group, or one total for the whole scope
  quantities: boolean; // show quantity and unit next to each line
}
export const DEFAULT_DISPLAY: BudgetDisplay = { detail: 'lines', quantities: true };

/** A file the user uploaded. The bytes live in the browser's file store (src/files.ts). */
export interface StoredFile {
  fileId: string;
  name: string;
  type: string;
  size: number;
  uploaded: string; // ISO datetime
}

/**
 * A priced set of line items for a job: a proposal or a change order. Each one is its own
 * document with its own lines. A job can have any number of them, and the job's contract
 * is the sum of the approved ones.
 */
export interface Budget {
  id: string;
  jobId: string;
  kind: BudgetKind;
  number: string; // e.g. "12-3"
  title: string; // e.g. "Kitchen remodel — Option B"
  status: BudgetStatus;
  partyId: string; // who it's addressed to, usually the job's customer
  notes: string; // shown on the document, e.g. scope notes or terms
  created: string; // ISO datetime
  updated: string; // ISO datetime
  clonedFromId?: string;
  display?: BudgetDisplay; // missing means DEFAULT_DISPLAY
  statusDates?: Partial<Record<BudgetStatus, string>>; // when it was sent, approved, …
  approval?: { signedBy: string; date: string }; // who signed and when (yyyy-mm-dd)
  signedCopy?: StoredFile; // the signed document, once uploaded
}

/** One line of a budget. Lines may be negative, e.g. a credit for a fee already paid. */
export interface BudgetLine {
  id: string;
  budgetId: string;
  group: string; // section heading on the document, e.g. "Demolition"
  costCodeId: string;
  name: string;
  description: string;
  costType: CostType;
  quantity: number;
  unit: string; // "ea", "hr", "sqft", "lump"
  unitCost: number;
  markup: number; // percent
  vendorId: string; // account doing or supplying the work, optional
}

export const INVOICE_STATUSES = ['Draft', 'Sent', 'Paid', 'Void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * A progress bill to the customer. It bills percentages of the lines of one or more approved
 * budgets (e.g. the original proposal and two change orders). For each line it stores the
 * percent complete TO DATE; what this invoice bills is that minus what earlier invoices billed.
 */
export interface Invoice {
  id: string;
  jobId: string;
  number: string; // e.g. "12-2"
  title: string;
  status: InvoiceStatus;
  partyId: string;
  date: string; // yyyy-mm-dd, the invoice date
  due: string; // yyyy-mm-dd
  notes: string;
  budgetIds: string[]; // approved budgets this invoice bills against, in order
  progress: Record<string, number>; // budget line id → percent complete to date (0–100)
  billedFrom?: Record<string, number>; // percent billed before this invoice, frozen when it was sent
  detail: 'lines' | 'groups'; // how much the customer sees on the document
  created: string; // ISO datetime
  updated: string; // ISO datetime
  statusDates?: Partial<Record<InvoiceStatus, string>>;
}

export const PAYMENT_METHODS = ['Check', 'ACH', 'Credit card', 'Cash', 'Wire', 'Other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Money moving against one document: received from a customer against an invoice (invoiceId),
 * or paid out to a vendor against a bill (billId). Exactly one of the two is set. A document
 * can take any number of payments; once they cover its amount it becomes Paid.
 */
export interface Payment {
  id: string;
  jobId: string;
  invoiceId?: string; // money in
  billId?: string; // money out
  date: string; // yyyy-mm-dd, when the money came in or went out
  amount: number;
  method: PaymentMethod;
  reference: string; // check number, transaction id, …
  notes: string;
  created: string; // ISO datetime
}

export const BILL_STATUSES = ['Draft', 'Open', 'Paid', 'Void'] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

/** One charge on a vendor bill. The cost code is what job costing will total by. */
export interface BillLine {
  id: string;
  description: string;
  costCodeId: string;
  amount: number;
}

/**
 * A bill from a vendor or subcontractor that we owe on a job: entered from their invoice
 * (or, later, created by awarding a bid). Draft while it's being checked, Open once it's
 * approved to pay, Paid automatically when payments cover it.
 */
export interface Bill {
  id: string;
  jobId: string;
  vendorId: string; // the account we owe
  number: string; // our number, e.g. "12-3"
  vendorRef: string; // the vendor's own invoice number
  title: string;
  status: BillStatus;
  date: string; // yyyy-mm-dd, the date on the vendor's bill
  due: string; // yyyy-mm-dd
  lines: BillLine[];
  notes: string;
  attachments: StoredFile[]; // the vendor's invoice, lien release, …
  created: string; // ISO datetime
  updated: string; // ISO datetime
  statusDates?: Partial<Record<BillStatus, string>>;
  bidId?: string; // the awarded bid this bill is for, if any
}

export const BID_PACKAGE_STATUSES = ['Draft', 'Out for bid', 'Awarded', 'Cancelled'] as const;
export type BidPackageStatus = (typeof BID_PACKAGE_STATUSES)[number];

/** One item of a bid package's scope. Copied (not linked) when imported from a budget line. */
export interface BidItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  budgetLineId?: string; // where it was imported from, for reference only
}

/**
 * A scope of work on a job sent to subcontractors for pricing, e.g. "Electrical — whole house".
 * Its cost code is what bids are compared against (the job's budgeted cost for that code) and
 * what an awarded bid's bill is coded to.
 */
export interface BidPackage {
  id: string;
  jobId: string;
  number: string; // e.g. "12-2"
  title: string;
  costCodeId: string;
  status: BidPackageStatus;
  due: string; // yyyy-mm-dd, when bids are due back
  scope: string; // the written scope of work subs read
  items: BidItem[];
  attachments: StoredFile[]; // plans, specs, photos
  created: string;
  updated: string;
  statusDates?: Partial<Record<BidPackageStatus, string>>;
}

export const BID_STATUSES = ['Invited', 'Received', 'Declined', 'Awarded', 'Not selected'] as const;
export type BidStatus = (typeof BID_STATUSES)[number];

/** One subcontractor's bid on a package: invited, then their price as it came back (usually by email). */
export interface Bid {
  id: string;
  packageId: string;
  jobId: string;
  vendorId: string;
  status: BidStatus;
  invited: string; // yyyy-mm-dd the package was sent to them; '' = not sent yet
  received: string; // yyyy-mm-dd their bid came back
  amount: number; // their total
  itemPrices: Record<string, number>; // optional price per scope item
  inclusions: string;
  exclusions: string;
  notes: string;
  validUntil: string; // yyyy-mm-dd, ''
  attachments: StoredFile[]; // their quote
  awarded?: string; // yyyy-mm-dd
}

/** Money spent on a job. Job costing is by cost code; linking a budget line is optional. */
export interface Expense {
  id: string;
  jobId: string;
  costCodeId: string;
  date: string; // yyyy-mm-dd
  amount: number;
  vendorId: string;
  description: string;
  budgetLineId?: string;
}

/** Something that happened to a document, shown in the Home activity feed. */
export interface Activity {
  id: string;
  date: string; // ISO datetime
  partyId: string;
  jobId: string;
  title: string; // who / which account
  doc: string; // e.g. "Proposal 135-4"
  amount: number;
  text: string; // e.g. "Marked as approved by Sam Ortiz"
  color: string; // icon colour
  budgetId?: string; // set for budget events, so a budget can show its own history
  invoiceId?: string; // likewise for invoices (payments too, under the invoice they paid)
  billId?: string; // and for vendor bills and the payments made on them
  bidPackageId?: string; // and for bid packages and their bids
}

/** Which plugins the company has turned off, and which it chose where several do the same job. */
export interface PluginChoices {
  off: string[];
  roles: Record<string, string>; // role id → plugin id
}

/**
 * A company's own version of a skill (Settings → Agents): a changed copy of a plugin's default
 * skill, a default it has turned off, or a skill of its own. See src/skills.ts.
 */
export interface SkillRecord {
  id: string; // the skill's name, so there's one record per skill
  name: string;
  description: string;
  body: string; // Markdown
  plugin?: string; // set when it changes (or turns off) a plugin's default skill
  off?: boolean; // a default skill the company doesn't want agents to use
  updated: string; // local date and time
  updatedBy: string; // who changed it last, e.g. "Dana Cole" or "Dana Cole's agent"
}

export interface Db {
  activity: Activity[];
  costCodes: CostCode[];
  budgets: Budget[];
  budgetLines: BudgetLine[];
  expenses: Expense[];
  invoices: Invoice[];
  payments: Payment[];
  bills: Bill[];
  bidPackages: BidPackage[];
  bids: Bid[];
  people: Person[];
  accounts: Account[];
  memberships: Membership[];
  jobLinks: JobLink[];
  jobs: Job[];
  docs: Doc[];
  team: TeamMember[];
  tasks: Task[];
  scheduleEntries: ScheduleEntry[];
  companyName: string;
  /** Contractor's licence number, shown on documents when set (Settings → General). */
  companyLicense?: string;
  plugins?: PluginChoices; // missing means everything is on (company-wide, so it syncs)
  /** Each person's saved look and presets (Settings → Appearance), so they follow them between devices. */
  preferences?: Preferences[];
  /** The company theme: the look people start with until they change their own. */
  companyLook?: Look;
  /** The company's changes to agent skills (missing until the first change). */
  skills?: SkillRecord[];
}

export const AVATAR_COLORS = ['#c026d3', '#d97706', '#16a34a', '#e11d48', '#ea580c', '#0284c7', '#65a30d', '#7c3aed', '#0d9488'];

const acc = (id: string, types: string[], name: string, color: string, extra: Partial<Account> = {}): Account => ({
  id,
  types,
  name,
  color,
  phone: '',
  email: '',
  address: '',
  notes: '',
  ...extra,
});

const per = (id: string, firstName: string, lastName: string, extra: Partial<Person> = {}): Person => ({
  id,
  firstName,
  lastName,
  email: '',
  phone: '',
  address: '',
  notes: '',
  ...extra,
});

const mem = (personId: string, accountId: string, title = '', primary = false): Membership => ({ id: `m-${personId}-${accountId}`, personId, accountId, title, primary });

const link = (jobId: string, partyId: string, role: string): JobLink => ({ id: `l-${jobId}-${partyId}`, jobId, partyId, role });

const bi = (id: string, jobId: string, group: string, name: string, costType: CostType, quantity: number, unit: string, unitCost: number, markup: number, vendorId: string, actual: number): LegacyBudgetItem => ({
  id, jobId, group, name, costType, quantity, unit, unitCost, markup, vendorId, actual,
});

export function seed(): Db {
  // Written in the old one-budget-per-job shape and converted, so the sample data and saved
  // data go through the same migration.
  const raw: PreBudgetDb = {
    // A made-up company: sample data ships with every install and appears in screenshots.
    companyName: 'Acme Design Build Co.',
    companyLicense: '123456',
    activity: [
      { id: 'a1', date: '2026-11-25T15:28:00', partyId: 'c6', jobId: 'j8', title: 'Sam Ortiz', doc: 'Proposal 135-4', amount: 58460, text: 'Marked as approved by Sam Ortiz for Sam Ortiz at 538 Market St', color: '#00c950' },
      { id: 'a2', date: '2026-11-25T14:59:00', partyId: 'c6', jobId: 'j8', title: 'Sam Ortiz', doc: 'Proposal 135-4', amount: 0, text: 'Marked as pending by Dana Cole for Sam Ortiz at 538 Market St', color: '#f0b100' },
      { id: 'a3', date: '2026-11-25T14:03:00', partyId: 'c6', jobId: 'j8', title: 'Sam Ortiz', doc: 'Proposal 135-4', amount: 0, text: 'Marked as draft by Dana Cole for Sam Ortiz at 538 Market St', color: '#2b7fff' },
      { id: 'a4', date: '2026-11-25T13:01:00', partyId: 'v3', jobId: 'j7', title: 'Payment applied to Bayline Drywall', doc: 'Bill 134-50', amount: 3000, text: 'Applied by Dana Cole for Patel Household at 1079 87th St', color: '#fb2c36' },
      { id: 'a5', date: '2026-11-24T21:53:00', partyId: 'v1', jobId: 'j12', title: 'Stoneworks Tile Co.', doc: 'Bid Request 133-85', amount: 0, text: 'Marked as pending by Kai Brooks for Harper Household at 2243 Lincoln Way', color: '#f0b100' },
      { id: 'a6', date: '2026-11-24T21:31:00', partyId: 'v1', jobId: 'j12', title: 'Stoneworks Tile Co.', doc: 'Bid Request 133-85', amount: 0, text: 'Created by Kai Brooks for Harper Household at 2243 Lincoln Way', color: '#2b7fff' },
    ],
    items: [
      bi('j6-1', 'j6', 'Demolition', 'Demo existing bathrooms', 'Labor', 40, 'hr', 65, 25, '', 2600),
      bi('j6-2', 'j6', 'Plumbing', 'Rough & finish plumbing', 'Subcontractor', 1, 'lump', 14000, 15, '', 0),
      bi('j6-3', 'j6', 'Tile', 'Tile install, two baths', 'Subcontractor', 1, 'lump', 15500, 15, 'v1', 0),
      bi('j6-4', 'j6', 'Fixtures', 'Vanities, toilets & fixtures', 'Materials', 1, 'lump', 9800, 20, '', 0),
      bi('j6-5', 'j6', 'Electrical', 'Lighting & fans', 'Subcontractor', 1, 'lump', 4200, 15, 'v4', 0),
      bi('j6-6', 'j6', 'Painting', 'Paint both baths', 'Labor', 60, 'hr', 60, 25, '', 0),
      bi('j6-7', 'j6', 'Project Management', 'Project management', 'Labor', 80, 'hr', 75, 20, '', 600),
      bi('j7-1', 'j7', 'Foundation & Structure', 'Foundation & slab', 'Subcontractor', 1, 'lump', 38000, 15, '', 3800),
      bi('j7-2', 'j7', 'Framing', 'Framing labor', 'Labor', 360, 'hr', 70, 25, '', 0),
      bi('j7-3', 'j7', 'Framing', 'Lumber package', 'Materials', 1, 'lump', 22000, 20, '', 0),
      bi('j7-4', 'j7', 'Roofing', 'Roof', 'Subcontractor', 1, 'lump', 18500, 15, '', 0),
      bi('j7-5', 'j7', 'Electrical', 'Electrical', 'Subcontractor', 1, 'lump', 16000, 15, 'v4', 0),
      bi('j7-6', 'j7', 'Plumbing', 'Plumbing', 'Subcontractor', 1, 'lump', 17500, 15, '', 0),
      bi('j7-7', 'j7', 'HVAC', 'Mini-split heating & cooling', 'Subcontractor', 1, 'lump', 12000, 15, '', 0),
      bi('j7-8', 'j7', 'Drywall', 'Drywall', 'Subcontractor', 1, 'lump', 11000, 15, '', 0),
      bi('j7-9', 'j7', 'Cabinets & Finishes', 'Kitchenette & finishes', 'Materials', 1, 'lump', 14000, 20, '', 0),
      bi('j7-10', 'j7', 'Project Management', 'Project management', 'Labor', 160, 'hr', 75, 20, '', 1800),
      bi('j9-1', 'j9', 'Foundation & Structure', 'Foundation & slab', 'Subcontractor', 1, 'lump', 21000, 15, '', 21000),
      bi('j9-2', 'j9', 'Framing', 'Framing labor', 'Labor', 200, 'hr', 70, 25, '', 9800),
      bi('j9-3', 'j9', 'Framing', 'Lumber package', 'Materials', 1, 'lump', 12000, 20, '', 11400),
      bi('j9-4', 'j9', 'Roofing', 'Roof', 'Subcontractor', 1, 'lump', 9500, 15, '', 4750),
      bi('j9-5', 'j9', 'Electrical', 'Electrical', 'Subcontractor', 1, 'lump', 8800, 15, 'v4', 2200),
      bi('j9-6', 'j9', 'Plumbing', 'Plumbing', 'Subcontractor', 1, 'lump', 9200, 15, '', 2300),
      bi('j9-7', 'j9', 'Drywall', 'Drywall', 'Subcontractor', 1, 'lump', 6500, 15, '', 0),
      bi('j9-8', 'j9', 'Project Management', 'Project management', 'Labor', 120, 'hr', 75, 20, '', 4000),
      bi('j11-1', 'j11', 'Demolition', 'Demolition', 'Labor', 220, 'hr', 65, 25, '', 14300),
      bi('j11-2', 'j11', 'Demolition', 'Dumpsters & haul-away', 'Other', 8, 'ea', 650, 15, '', 5200),
      bi('j11-3', 'j11', 'Foundation & Structure', 'Foundation & structural work', 'Subcontractor', 1, 'lump', 62000, 15, '', 62000),
      bi('j11-4', 'j11', 'Framing', 'Framing labor', 'Labor', 600, 'hr', 70, 25, '', 40000),
      bi('j11-5', 'j11', 'Framing', 'Lumber package', 'Materials', 1, 'lump', 38000, 20, '', 38000),
      bi('j11-6', 'j11', 'Electrical', 'Rough & finish electrical', 'Subcontractor', 1, 'lump', 46000, 15, 'v4', 32000),
      bi('j11-7', 'j11', 'Plumbing', 'Rough & finish plumbing', 'Subcontractor', 1, 'lump', 52000, 15, '', 36000),
      bi('j11-8', 'j11', 'HVAC', 'New heating & cooling', 'Subcontractor', 1, 'lump', 38000, 15, '', 30000),
      bi('j11-9', 'j11', 'Roofing', 'Re-roof', 'Subcontractor', 1, 'lump', 34000, 15, '', 34000),
      bi('j11-10', 'j11', 'Drywall', 'Drywall', 'Subcontractor', 1, 'lump', 24000, 15, '', 18000),
      bi('j11-11', 'j11', 'Cabinets & Finishes', 'Cabinets & finish materials', 'Materials', 1, 'lump', 48000, 20, 'v2', 12000),
      bi('j11-12', 'j11', 'Painting', 'Interior & exterior paint', 'Subcontractor', 1, 'lump', 22000, 15, '', 0),
      bi('j11-13', 'j11', 'Project Management', 'Project management', 'Labor', 400, 'hr', 75, 20, '', 21000),
      bi('b1', 'j12', 'Demolition', 'Demo existing kitchen & bath', 'Labor', 48, 'hr', 65, 25, '', 3120),
      bi('b2', 'j12', 'Demolition', 'Dumpster & haul-away', 'Other', 3, 'ea', 650, 15, '', 1950),
      bi('b3', 'j12', 'Framing', 'Framing labor', 'Labor', 120, 'hr', 70, 25, '', 4900),
      bi('b4', 'j12', 'Framing', 'Lumber package', 'Materials', 1, 'lump', 9800, 20, '', 9100),
      bi('b5', 'j12', 'Tile', 'Bathroom tile install', 'Subcontractor', 1, 'lump', 18500, 15, 'v1', 0),
      bi('b6', 'j12', 'Tile', 'Tile material allowance', 'Materials', 420, 'sqft', 12, 15, '', 0),
      bi('b7', 'j12', 'Painting', 'Interior paint', 'Subcontractor', 1, 'lump', 33000, 15, 'v2', 0),
      bi('b8', 'j12', 'Electrical', 'Rough & finish electrical', 'Subcontractor', 1, 'lump', 24500, 15, 'v4', 0),
      bi('b19', 'j12', 'Foundation & Structure', 'Foundation & structural work', 'Subcontractor', 1, 'lump', 98000, 15, '', 98000),
      bi('b20', 'j12', 'Plumbing', 'Rough & finish plumbing', 'Subcontractor', 1, 'lump', 46000, 15, 'v5', 12000),
      bi('b21', 'j12', 'HVAC', 'New heating & cooling', 'Subcontractor', 1, 'lump', 38000, 15, '', 0),
      bi('b22', 'j12', 'Roofing', 'Re-roof', 'Subcontractor', 1, 'lump', 41000, 15, '', 0),
      bi('b23', 'j12', 'Windows & Doors', 'Window & door package', 'Materials', 1, 'lump', 54000, 18, '', 27000),
      bi('b24', 'j12', 'Drywall', 'Hang, tape & finish', 'Subcontractor', 1, 'lump', 29000, 15, 'v3', 0),
      bi('b25', 'j12', 'Cabinets & Finishes', 'Cabinets & millwork', 'Materials', 1, 'lump', 72000, 18, '', 0),
      bi('b26', 'j12', 'Cabinets & Finishes', 'Flooring', 'Materials', 2100, 'sqft', 15, 18, '', 0),
      bi('b27', 'j12', 'Cabinets & Finishes', 'Finish carpentry', 'Labor', 400, 'hr', 75, 25, '', 0),
      bi('b28', 'j12', 'Project Management', 'Supervision & management', 'Labor', 500, 'hr', 85, 30, '', 14000),
      bi('b29', 'j8', 'Walls', 'Drywall repair & paint', 'Subcontractor', 1, 'lump', 7500, 15, 'v2', 0),
      bi('b30', 'j8', 'Electrical', 'Lighting & fan', 'Subcontractor', 1, 'lump', 5800, 15, 'v4', 2900),
      bi('b31', 'j8', 'Fixtures', 'Glass shower door', 'Materials', 1, 'ea', 2400, 20, '', 0),
      bi('b9', 'j8', 'Demolition', 'Remove existing bathroom', 'Labor', 16, 'hr', 65, 25, '', 1040),
      bi('b10', 'j8', 'Plumbing', 'Rough & finish plumbing', 'Subcontractor', 1, 'lump', 9200, 15, 'v5', 4600),
      bi('b11', 'j8', 'Tile', 'Shower & floor tile', 'Subcontractor', 1, 'lump', 8700, 15, 'v1', 0),
      bi('b12', 'j8', 'Fixtures', 'Vanity, toilet, fixtures', 'Materials', 1, 'lump', 6400, 20, '', 2100),
      bi('b13', 'j8', 'Fixtures', 'Install fixtures', 'Labor', 24, 'hr', 70, 25, '', 0),
      bi('b14', 'j2', 'Demolition', 'Selective demolition', 'Labor', 40, 'hr', 65, 25, '', 0),
      bi('b15', 'j2', 'Kitchen', 'Cabinets', 'Materials', 1, 'lump', 14500, 20, '', 0),
      bi('b16', 'j2', 'Kitchen', 'Countertops', 'Subcontractor', 1, 'lump', 7200, 15, '', 0),
      bi('b17', 'j3', 'Doors', 'Pocket door frame kit & slab', 'Materials', 1, 'ea', 650, 20, '', 0),
      bi('b18', 'j3', 'Doors', 'Install & patch drywall', 'Labor', 18, 'hr', 70, 25, '', 0),
    ],

    team: [
      { id: 'u1', name: 'Dana Cole', initials: 'DC', color: '#ea580c' },
      { id: 'u2', name: 'Jordan Ellis', initials: 'JE', color: '#e11d48' },
      { id: 'u3', name: 'Alex Chen', initials: 'AC', color: '#ea580c' },
      { id: 'u4', name: 'Kai Brooks', initials: 'K', color: '#d97706' },
    ],
    accounts: [
      acc('c1', ['Customer'], 'Harper Household', '#0284c7', { phone: '(415) 555-0141', email: 'maya.harper@example.com', address: '2243 Lincoln Way' }),
      acc('c2', ['Customer'], 'Rivera Household', '#d97706', { phone: '(415) 555-0172', address: '40 Oak Avenue' }),
      acc('c3', ['Customer'], 'Northgate Homes', '#16a34a', { phone: '(510) 555-0110', email: 'office@example.com', address: '900 Bay Street', notes: 'Developer \u2014 several ADU projects.' }),
      acc('c4', ['Customer'], 'Patel Household', '#65a30d', { address: '1079 87th Street' }),
      acc('c5', ['Customer'], 'Kim & Lee', '#7c3aed', { address: '1448 Elm Street' }),
      acc('c6', ['Customer'], 'Sam Ortiz', '#0d9488', { address: '538 Market Street' }),
      acc('c7', ['Customer'], 'Brooks Family', '#e11d48', { address: '77 Juniper Street' }),
      acc('c8', ['Customer'], 'Nguyen Household', '#ea580c', { address: '235 Cedar Street' }),
      acc('c9', ['Customer'], 'Morgan & Pat', '#c026d3', { address: '344 Hill Street' }),
      acc('c10', ['Customer'], 'Bright Lights Inc.', '#ca8a04', { address: '739 Bay Road' }),
      acc('c11', ['Customer'], 'Romero Household', '#0284c7', { address: '12 Vista Court' }),
      acc('v1', ['Vendor', 'Subcontractor'], 'Stoneworks Tile Co.', '#c026d3', { phone: '(650) 555-0186', email: 'sales@example.com', trade: 'Tile' }),
      acc('v2', ['Vendor', 'Subcontractor'], 'Fresh Coat Painting', '#ea580c', { phone: '(415) 555-0133', trade: 'Painting' }),
      acc('v3', ['Vendor', 'Subcontractor'], 'Bayline Drywall', '#16a34a', { trade: 'Drywall' }),
      acc('v4', ['Vendor', 'Subcontractor'], 'Summit Electric', '#0284c7', { trade: 'Electrical' }),
      acc('v5', ['Vendor', 'Subcontractor'], 'Valley Plumbing', '#e11d48', { trade: 'Plumbing' }),
      ...SAMPLE_VENDORS,
      acc('a1', ['Architect'], 'Lumen Architecture', '#7c3aed', { phone: '(415) 555-0190', email: 'studio@example.com', address: '18 Brannan Street' }),
    ],
    people: [
      per('p1', 'Maya', 'Harper', { email: 'maya.harper@example.com', phone: '(415) 555-0141' }),
      per('p2', 'Jon', 'Harper', { email: 'jon.harper@example.com', color: '#16a34a' }),
      per('p3', 'Elena', 'Rivera', { phone: '(415) 555-0172' }),
      per('p4', 'Grace', 'Wu', { email: 'grace@example.com' }),
      per('p5', 'Ravi', 'Patel'),
      per('p6', 'Nora', 'Kim'),
      per('p7', 'Ben', 'Lee', { color: '#ea580c' }),
      per('p8', 'Sam', 'Ortiz'),
      per('p9', 'Gabe', 'Brooks'),
      per('p10', 'Lan', 'Nguyen'),
      per('p11', 'Morgan', 'Price'),
      per('p12', 'Tim', 'Shaw'),
      per('p13', 'Luis', 'Romero', { email: 'luis.home@example.com' }),
      per('p20', 'Ana', 'Mendes', { email: 'sales@example.com', phone: '(650) 555-0186' }),
      per('p21', 'Daniel', 'Lima'),
      per('p23', 'Owen', 'Marsh'),
      per('p24', 'Priya', 'Nair'),
      per('p25', 'Neil', 'Baker'),
      per('p30', 'Iris', 'Okafor', { email: 'iris@example.com' }),
    ],
    memberships: [
      mem('p1', 'c1', '', true),
      mem('p2', 'c1'),
      mem('p3', 'c2', '', true),
      mem('p4', 'c3', 'Project Manager', true),
      mem('p5', 'c4', '', true),
      mem('p6', 'c5', '', true),
      mem('p7', 'c5'),
      mem('p8', 'c6', '', true),
      mem('p9', 'c7', '', true),
      mem('p10', 'c8', '', true),
      mem('p11', 'c9', '', true),
      mem('p12', 'c10', 'Owner', true),
      mem('p13', 'c11', '', true),
      mem('p20', 'v1', 'Estimator', true),
      mem('p21', 'v1', 'Project Lead'),
      mem('p13', 'v2', 'Owner', true),
      mem('p23', 'v3', '', true),
      mem('p24', 'v4', '', true),
      mem('p25', 'v5', '', true),
      mem('p30', 'a1', 'Principal Architect', true),
    ],
    jobLinks: [
      link('j1', 'c7', 'Customer'),
      link('j1', 'p9', 'Customer'),
      link('j2', 'c6', 'Customer'),
      link('j2', 'p8', 'Customer'),
      link('j3', 'c8', 'Customer'),
      link('j3', 'p10', 'Customer'),
      link('j4', 'c9', 'Customer'),
      link('j4', 'p11', 'Customer'),
      link('j5', 'c10', 'Customer'),
      link('j5', 'p12', 'Customer'),
      link('j6', 'c2', 'Customer'),
      link('j6', 'p3', 'Customer'),
      link('j7', 'c4', 'Customer'),
      link('j7', 'p5', 'Customer'),
      link('j8', 'c6', 'Customer'),
      link('j8', 'p8', 'Customer'),
      link('j9', 'c3', 'Customer'),
      link('j9', 'p4', 'Customer'),
      link('j10', 'c3', 'Customer'),
      link('j10', 'p4', 'Customer'),
      link('j11', 'c5', 'Customer'),
      link('j11', 'p6', 'Customer'),
      link('j11', 'p7', 'Customer'),
      link('j12', 'c1', 'Customer'),
      link('j12', 'p1', 'Customer'),
      link('j12', 'p2', 'Customer'),
      link('j12', 'a1', 'Architect'),
      link('j12', 'p30', 'Architect'),
      link('j12', 'v1', 'Subcontractor'),
      link('j12', 'v2', 'Subcontractor'),
      link('j12', 'v4', 'Subcontractor'),
      link('j8', 'v5', 'Subcontractor'),
      link('j11', 'v2', 'Subcontractor'),
    ],
    jobs: [
      { id: 'j1', name: '77 Juniper - Addition & Remodel', address: '77 Juniper Street', status: 'Lead', total: 0, projectedCost: 0, start: '2027-01-11', end: '2027-05-28', progress: 0 },
      { id: 'j2', name: '697 Ridge - Remodel', address: '697 Ridge Road', status: 'Estimating', total: 0, projectedCost: 42000, start: '2026-12-07', end: '2027-02-26', progress: 0 },
      { id: 'j3', name: '235 Cedar - Pocket Door', address: '235 Cedar Street', status: 'Estimating', total: 0, projectedCost: 3800, start: '2026-12-14', end: '2026-12-18', progress: 0 },
      { id: 'j4', name: '344 Hill - Hillside Addition', address: '344 Hill Street', status: 'Negotiating', total: 0, projectedCost: 0, start: '2027-02-01', end: '2027-08-27', progress: 0 },
      { id: 'j5', name: '739 Bay - HVAC', address: '739 Bay Road', status: 'Negotiating', total: 0, projectedCost: 0, start: '2027-01-04', end: '2027-01-22', progress: 0 },
      { id: 'j6', name: 'Oak Avenue Bathrooms', address: '40 Oak Avenue', status: 'Pre-Construction', total: 64250, projectedCost: 48000, start: '2026-12-01', end: '2027-02-12', progress: 5 },
      { id: 'j7', name: '87th St. ADU', address: '1079 87th Street', status: 'Pre-Construction', total: 214621, projectedCost: 171000, start: '2026-11-02', end: '2027-06-30', progress: 10 },
      { id: 'j8', name: '538 Market - Bathroom', address: '538 Market Street', status: 'In Progress', total: 58460, projectedCost: 44100, start: '2026-10-19', end: '2026-12-23', progress: 60 },
      { id: 'j9', name: '2200 Mesa - Northgate ADU', address: '2200 Mesa Street', status: 'In Progress', total: 107900, projectedCost: 82300, start: '2026-09-14', end: '2027-03-19', progress: 45 },
      { id: 'j10', name: '315 Pine St - Northgate ADU', address: '315 Pine Street', status: 'Pre-Construction', total: 0, projectedCost: 96000, start: '2027-01-18', end: '2027-07-30', progress: 0 },
      { id: 'j11', name: '1448 Elm - Full Remodel', address: '1448 Elm Street', status: 'In Progress', total: 508473, projectedCost: 402000, start: '2026-06-01', end: '2027-04-30', progress: 70 },
      { id: 'j12', name: '2243 Lincoln - Remodel', address: '2243 Lincoln Way', status: 'In Progress', total: 686933, projectedCost: 540000, start: '2026-10-10', end: '2027-05-14', progress: 25 },
    ],
    docs: [
      { id: 'd3', jobId: 'j5', partyId: 'c10', kind: 'Proposal', number: '144-1', amount: 14837, status: 'Pending' },
      { id: 'd4', jobId: 'j12', partyId: 'v2', kind: 'Subcontractor Agreement', number: '133-69', amount: 33000, status: 'Pending' },
      { id: 'd5', jobId: 'j12', partyId: 'v2', kind: 'Subcontractor Agreement', number: '133-68', amount: 17000, status: 'Pending' },
      { id: 'd6', jobId: 'j11', partyId: 'v2', kind: 'Subcontractor Agreement', number: '133-67', amount: 2000, status: 'Pending' },
      { id: 'd7', jobId: 'j12', partyId: 'v1', kind: 'Bid Request', number: '133-60', amount: 0, status: 'Pending' },
      { id: 'd8', jobId: 'j12', partyId: 'v1', kind: 'Bid Request', number: '133-80', amount: 0, status: 'Pending' },
      { id: 'd9', jobId: 'j8', partyId: 'c6', kind: 'Proposal', number: '135-4', amount: 58460, status: 'Approved' },
    ],
    tasks: [
      { id: 't1', name: 'Follow up with client about the next steps for the project', partyId: 'c2', jobId: 'j6', due: '', type: 'Project Management', assignees: ['u1'], done: false },
      { id: 't2', name: 'Make an appointment with clients to be able to walk the project before starting it', partyId: 'c3', jobId: 'j9', due: '2026-12-02', type: 'Site Visit', assignees: ['u1', 'u2'], done: false },
      { id: 't3', name: 'Make an appointment with clients to be able to walk the project before starting it', partyId: 'c3', jobId: 'j10', due: '2026-12-09', type: 'Site Visit', assignees: ['u1'], done: false },
      { id: 't4', name: 'Order tile samples', partyId: 'c4', jobId: 'j7', due: '2026-12-04', type: 'Purchasing', assignees: ['u1'], done: false },
      { id: 't5', name: 'Vendor intake', partyId: 'v1', jobId: '', due: '', type: '', assignees: ['u1', 'u2', 'u3', 'u4'], done: false },
    ],
    scheduleEntries: [
      { id: 'k1', jobId: 'j12', name: 'Demolition', start: '2026-10-12', end: '2026-10-23', crewIds: ['u2', 'u3'], progress: 100 },
      { id: 'k2', jobId: 'j12', name: 'Framing', start: '2026-10-26', end: '2026-11-20', crewIds: ['u2', 'u3'], progress: 60 },
      { id: 'k3', jobId: 'j12', name: 'Rough plumbing & electrical', start: '2026-11-23', end: '2026-12-18', crewIds: ['u4'], progress: 0 },
      { id: 'k4', jobId: 'j12', name: 'Drywall', start: '2027-01-04', end: '2027-01-29', crewIds: ['u3'], progress: 0 },
      { id: 'k5', jobId: 'j8', name: 'Tile', start: '2026-11-16', end: '2026-12-04', crewIds: ['u4'], progress: 40 },
      { id: 'k6', jobId: 'j8', name: 'Fixtures', start: '2026-12-07', end: '2026-12-18', crewIds: ['u2'], progress: 0 },
    ],
  };
  const db = withSampleBudgets(migrateBudgets(raw, '2026-11-20T10:00:00'));
  const billing = { ...db, ...sampleBilling(db) };
  const bills = samplePayables(billing);
  const withBills = { ...billing, bills: bills.bills, payments: [...billing.payments, ...bills.payments] };
  return { ...withBills, ...sampleBids(withBills) };
}

/** Extra subcontractors so sample bid packages have competing bids. */
export const SAMPLE_VENDORS: Account[] = [
  acc('v6', ['Vendor', 'Subcontractor'], 'Brightline Electric', '#ca8a04', { phone: '(510) 555-0164', email: 'bids@example.com', trade: 'Electrical' }),
  acc('v7', ['Vendor', 'Subcontractor'], 'Pacific Plumbing Co.', '#0d9488', { phone: '(415) 555-0119', email: 'estimating@example.com', trade: 'Plumbing' }),
  acc('v8', ['Vendor', 'Subcontractor'], 'Coastal Drywall', '#7c3aed', { phone: '(650) 555-0177', trade: 'Drywall' }),
];

/**
 * Sample bid packages: two awarded on 2243 Lincoln (their bills are the sample bills 12-1 and
 * 12-2), and on 87th St. ADU one with bids back to compare, one out for bid and one draft.
 * Returns the bills too, with the awarded ones linked to their bids. Skips what isn't there.
 */
export function sampleBids(db: Pick<Db, 'jobs' | 'accounts' | 'costCodes' | 'bills'>): Pick<Db, 'bidPackages' | 'bids' | 'bills'> {
  const cc = (name: string) => db.costCodes.find((c) => c.name === name)?.id ?? '';
  const has = (id: string) => db.accounts.some((a) => a.id === id);
  const bidPackages: BidPackage[] = [];
  const bids: Bid[] = [];
  const links: Record<string, string> = {}; // bill id → bid id
  type B = { vendorId: string; status: BidStatus; invited: string; received?: string; amount?: number; prices?: number[]; inc?: string; exc?: string; notes?: string; valid?: string; awarded?: string; bill?: string };
  const pkg = (jobId: string, n: number, code: string, title: string, status: BidPackageStatus, created: string, due: string, scope: string, items: [string, number, string][], list: B[]) => {
    if (!db.jobs.some((j) => j.id === jobId)) return;
    const id = `bp-${jobId}-${n}`;
    const bidItems: BidItem[] = items.map(([description, quantity, unit], i) => ({ id: `${id}-i${i + 1}`, description, quantity, unit }));
    bidPackages.push({
      id, jobId, number: `${jobId.replace(/\D/g, '')}-${n}`, title, costCodeId: cc(code), status, due, scope, items: bidItems, attachments: [],
      created: `${created}T09:00:00`, updated: `${created}T09:00:00`,
      statusDates: status === 'Draft' ? undefined : { 'Out for bid': `${created}T10:00:00`, ...(status === 'Awarded' ? { Awarded: `${list.find((b) => b.awarded)?.awarded}T11:00:00` } : {}) },
    });
    list.filter((b) => has(b.vendorId)).forEach((b, i) => {
      const bidId = `${id}-b${i + 1}`;
      bids.push({
        id: bidId, packageId: id, jobId, vendorId: b.vendorId, status: b.status, invited: b.invited, received: b.received ?? '', amount: b.amount ?? 0,
        itemPrices: Object.fromEntries((b.prices ?? []).map((p, k) => [bidItems[k]?.id, p]).filter(([k]) => k)),
        inclusions: b.inc ?? '', exclusions: b.exc ?? '', notes: b.notes ?? '', validUntil: b.valid ?? '', attachments: [], awarded: b.awarded,
      });
      if (b.bill) links[b.bill] = bidId;
    });
  };

  pkg('j12', 1, 'Electrical', 'Electrical — rough and finish', 'Awarded', '2026-10-14', '2026-10-28',
    'Complete electrical for the kitchen, primary suite and hall per the plans: new circuits, rough-in, devices, fixture install and final inspection. Panel is existing; confirm capacity.',
    [['Rough-in wiring, kitchen and primary suite', 1, 'lump'], ['Devices and fixture trim-out', 1, 'lump'], ['Permit and inspections', 1, 'lump']],
    [
      { vendorId: 'v4', status: 'Awarded', invited: '2026-10-14', received: '2026-10-24', amount: 26100, prices: [17800, 6900, 1400], inc: 'Permit, all wire and boxes, install of owner-supplied fixtures.', exc: 'Fixtures, patch and paint.', valid: '2026-12-31', awarded: '2026-10-29', bill: 'bill-j12-1' },
      { vendorId: 'v6', status: 'Not selected', invited: '2026-10-14', received: '2026-10-27', amount: 28400, prices: [19500, 7300, 1600], inc: 'Permit and inspections.', exc: 'Fixtures, trenching, low-voltage.' },
    ]);
  pkg('j12', 2, 'Plumbing', 'Plumbing — rough and finish', 'Awarded', '2026-10-14', '2026-10-30',
    'Rough and finish plumbing for the kitchen and two baths, including relocating the gas line for the new range. Fixtures supplied by owner.',
    [['Rough plumbing, kitchen and two baths', 1, 'lump'], ['Gas line relocation', 1, 'lump'], ['Fixture set and trim-out', 1, 'lump']],
    [
      { vendorId: 'v5', status: 'Awarded', invited: '2026-10-14', received: '2026-10-29', amount: 44800, prices: [31200, 3600, 10000], inc: 'Permit, PEX supply, ABS drains, gas line.', exc: 'Fixtures and water heater.', awarded: '2026-11-02', bill: 'bill-j12-2' },
      { vendorId: 'v7', status: 'Not selected', invited: '2026-10-14', received: '2026-10-30', amount: 47900, inc: 'Permit and testing.', exc: 'Gas line.' },
    ]);
  pkg('j7', 1, 'Electrical', 'ADU electrical', 'Out for bid', '2026-11-12', '2026-11-26',
    'Full electrical for the new 640 sq ft ADU: 100A subpanel fed from the main house, all rough wiring, devices, lighting install, EV-ready circuit and final inspection.',
    [['100A subpanel and feeder from main panel', 1, 'lump'], ['Rough wiring', 640, 'sqft'], ['Devices and light fixture install', 1, 'lump'], ['EV-ready 240V circuit', 1, 'ea']],
    [
      { vendorId: 'v4', status: 'Received', invited: '2026-11-12', received: '2026-11-21', amount: 15400, prices: [3900, 7600, 2900, 1000], inc: 'Permit, trenching for feeder up to 60 ft.', exc: 'Fixtures, EV charger unit.', valid: '2027-01-15' },
      { vendorId: 'v6', status: 'Received', invited: '2026-11-12', received: '2026-11-25', amount: 17250, prices: [4200, 8400, 3450, 1200], inc: 'Permit, trenching, Title 24 lighting controls.', exc: 'Fixtures.', notes: 'Can start the week of Jan 11.', valid: '2026-12-31' },
    ]);
  pkg('j7', 2, 'Plumbing', 'ADU plumbing', 'Out for bid', '2026-11-20', '2026-12-09',
    'Water, waste and vent for the ADU kitchenette and bath; tie-in to the existing sewer lateral; tankless water heater install.',
    [['Underground and rough plumbing', 1, 'lump'], ['Sewer tie-in', 1, 'lump'], ['Tankless water heater install', 1, 'ea'], ['Fixture set and trim-out', 1, 'lump']],
    [
      { vendorId: 'v5', status: 'Invited', invited: '2026-11-20' },
      { vendorId: 'v7', status: 'Declined', invited: '2026-11-20', notes: 'Booked through February.' },
    ]);
  pkg('j7', 3, 'Drywall', 'ADU drywall', 'Draft', '2026-11-26', '2026-12-16',
    'Hang, tape and finish the ADU to level 4, with moisture-resistant board in the bath. Approx. 2,400 sq ft of board.',
    [['Hang, tape and finish, level 4', 2400, 'sqft'], ['Moisture-resistant board, bath', 1, 'lump']],
    [
      { vendorId: 'v3', status: 'Invited', invited: '' },
      { vendorId: 'v8', status: 'Invited', invited: '' },
    ]);
  const bills = db.bills.map((b) => (links[b.id] ? { ...b, bidId: links[b.id] } : b));
  return { bidPackages, bids, bills };
}

type SampleBill = {
  n: number;
  jobId: string;
  vendorId: string;
  ref: string;
  title: string;
  date: string;
  terms: number; // days until due
  lines: [code: string, description: string, amount: number][];
  status: 'Draft' | 'Open';
  pays?: [date: string, method: PaymentMethod, reference: string, amount: number | 'rest'][];
  notes?: string;
};

/**
 * Sample vendor bills: paid, partly paid, overdue, open and one draft still being checked.
 * Exported so saved data from before bills existed can be given the same samples. Bills for
 * jobs or vendors that aren't there are skipped.
 */
export function samplePayables(db: Pick<Db, 'jobs' | 'accounts' | 'costCodes'>): Pick<Db, 'bills' | 'payments'> {
  const cc = (name: string) => db.costCodes.find((c) => c.name === name)?.id ?? '';
  const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const samples: SampleBill[] = [
    { n: 1, jobId: 'j12', vendorId: 'v4', ref: 'SE-2291', title: 'Rough electrical — progress 1', date: '2026-11-10', terms: 30, status: 'Open',
      lines: [['Electrical', 'Rough-in: kitchen, primary suite and hall circuits', 7600], ['Electrical', 'Temporary power and panel prep', 800]],
      pays: [['2026-11-20', 'Check', '5012', 4000]] },
    { n: 2, jobId: 'j12', vendorId: 'v5', ref: 'VP-10477', title: 'Rough plumbing', date: '2026-11-18', terms: 30, status: 'Open',
      lines: [['Plumbing', 'Rough plumbing: kitchen and two baths', 8650], ['Plumbing', 'Gas line relocation', 1200]] },
    { n: 3, jobId: 'j12', vendorId: 'v3', ref: 'BD-3318', title: 'Drywall — hang and tape', date: '2026-11-25', terms: 30, status: 'Draft',
      lines: [['Drywall', 'Hang, tape and finish, level 4', 11200]], notes: 'Check square footage against the plans before approving.' },
    { n: 1, jobId: 'j8', vendorId: 'v1', ref: 'ST-5520', title: 'Bathroom tile installation', date: '2026-11-05', terms: 15, status: 'Open',
      lines: [['Tile', 'Shower walls and niche', 4400], ['Tile', 'Floor tile with heated mat', 1800]],
      pays: [['2026-11-19', 'Check', '5007', 'rest']] },
    { n: 2, jobId: 'j8', vendorId: 'v5', ref: 'VP-10391', title: 'Fixture set and trim-out', date: '2026-10-28', terms: 15, status: 'Open',
      lines: [['Plumbing', 'Set toilet, vanity and shower valve trim', 3150]] },
    { n: 1, jobId: 'j9', vendorId: 'v3', ref: 'BD-3204', title: 'ADU drywall', date: '2026-10-20', terms: 30, status: 'Open',
      lines: [['Drywall', 'Hang, tape and finish', 10900], ['Drywall', 'Moisture-resistant board, bath', 1700]],
      pays: [['2026-10-30', 'ACH', 'ACH-7781', 6000], ['2026-11-15', 'ACH', 'ACH-7902', 'rest']] },
    { n: 2, jobId: 'j9', vendorId: 'v4', ref: 'SE-2240', title: 'Electrical rough and panel', date: '2026-11-02', terms: 30, status: 'Open',
      lines: [['Electrical', 'Rough wiring', 6200], ['Electrical', '100A subpanel', 1700]] },
    { n: 1, jobId: 'j11', vendorId: 'v1', ref: 'ST-5388', title: 'Kitchen and bath tile', date: '2026-09-28', terms: 15, status: 'Open',
      lines: [['Tile', 'Kitchen backsplash', 5300], ['Tile', 'Primary bath floor and shower', 13000]],
      pays: [['2026-10-15', 'Check', '4988', 'rest']] },
    { n: 2, jobId: 'j11', vendorId: 'v2', ref: 'FC-0912', title: 'Interior paint — 50% progress', date: '2026-11-01', terms: 30, status: 'Open',
      lines: [['Painting', 'Interior walls and ceilings, first half', 14500]],
      pays: [['2026-11-16', 'Check', '5004', 7250]] },
  ];
  const bills: Bill[] = [];
  const payments: Payment[] = [];
  for (const b of samples) {
    if (!db.jobs.some((j) => j.id === b.jobId) || !db.accounts.some((a) => a.id === b.vendorId)) continue;
    const id = `bill-${b.jobId}-${b.n}`;
    const lines: BillLine[] = b.lines.map(([code, description, amount], i) => ({ id: `${id}-l${i + 1}`, description, costCodeId: cc(code), amount }));
    const amount = r2(lines.reduce((s, l) => s + l.amount, 0));
    let paid = 0;
    for (const [i, [date, method, reference, amt]] of (b.pays ?? []).entries()) {
      const a = amt === 'rest' ? r2(amount - paid) : amt;
      paid = r2(paid + a);
      payments.push({ id: `pay-${id}-${i + 1}`, jobId: b.jobId, billId: id, date, amount: a, method, reference, notes: '', created: `${date}T12:00:00` });
    }
    const isPaid = b.status === 'Open' && paid >= amount - 0.005;
    const lastPay = b.pays?.[b.pays.length - 1]?.[0];
    bills.push({
      id, jobId: b.jobId, vendorId: b.vendorId, number: `${b.jobId.replace(/\D/g, '')}-${b.n}`, vendorRef: b.ref, title: b.title,
      status: isPaid ? 'Paid' : b.status, date: b.date, due: addDays(b.date, b.terms), lines, notes: b.notes ?? '', attachments: [],
      created: `${b.date}T15:00:00`, updated: `${lastPay ?? b.date}T15:00:00`,
      statusDates: b.status === 'Open' ? { Open: `${b.date}T16:00:00`, ...(isPaid && lastPay ? { Paid: `${lastPay}T12:00:00` } : {}) } : undefined,
    });
  }
  return { bills, payments };
}

type SampleStep = {
  n: number;
  date: string;
  title?: string;
  notes?: string;
  budgets: string[];
  pct: (l: BudgetLine) => number; // percent complete to date
  status: 'Draft' | 'Sent';
  pays?: [date: string, method: PaymentMethod, reference: string, amount: number | 'rest'][];
};

/**
 * Sample billing history: deposits, monthly progress bills, partial and overdue payments.
 * Exported so saved data from before payments existed can be given the same samples.
 * Jobs whose sample budgets aren't there (or aren't approved) are skipped.
 */
export function sampleBilling(db: Db): Pick<Db, 'invoices' | 'payments'> {
  const approved = (id: string) => db.budgets.some((b) => b.id === id && b.status === 'Approved');
  const price = (l: BudgetLine) => l.quantity * l.unitCost * (1 + l.markup / 100);
  const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];

  const job = (jobId: string, partyId: string, steps: SampleStep[]) => {
    if (!steps.every((st) => st.budgets.every(approved))) return;
    let billed: Record<string, number> = {}; // percent billed so far, by line
    for (const st of steps) {
      const lines = db.budgetLines.filter((l) => st.budgets.includes(l.budgetId));
      const progress = Object.fromEntries(lines.map((l) => [l.id, st.pct(l)]));
      const amount = r2(lines.reduce((s, l) => s + (price(l) * ((progress[l.id] ?? 0) - (billed[l.id] ?? 0))) / 100, 0));
      const id = `inv-${jobId}-${st.n}`;
      let paid = 0;
      for (const [i, [date, method, reference, amt]] of (st.pays ?? []).entries()) {
        const a = amt === 'rest' ? r2(amount - paid) : amt;
        paid = r2(paid + a);
        payments.push({ id: `pay-${jobId}-${st.n}-${i + 1}`, jobId, invoiceId: id, date, amount: a, method, reference, notes: '', created: `${date}T12:00:00` });
      }
      const sent = st.status === 'Sent';
      const isPaid = sent && paid >= amount - 0.005;
      const lastPay = st.pays?.[st.pays.length - 1]?.[0];
      invoices.push({
        id, jobId, number: `${jobId.replace(/\D/g, '')}-${st.n}`, title: st.title ?? '', notes: st.notes ?? '',
        status: isPaid ? 'Paid' : st.status, partyId, date: st.date, due: addDays(st.date, 14),
        budgetIds: st.budgets, progress, billedFrom: sent ? { ...billed } : undefined, detail: st.n === 1 ? 'groups' : 'lines',
        created: `${st.date}T09:00:00`, updated: `${lastPay ?? st.date}T12:00:00`,
        statusDates: sent ? { Sent: `${st.date}T10:00:00`, ...(isPaid && lastPay ? { Paid: `${lastPay}T12:00:00` } : {}) } : undefined,
      });
      if (sent) billed = { ...billed, ...progress };
    }
  };
  const flat = (n: number) => () => n;
  const deposit = '10% deposit on the construction contract.';

  // 2243 Lincoln: deposit paid; November bill partly paid; December draft in progress
  const lincolnNov = (l: BudgetLine) => (l.budgetId !== 'bud-j12' ? 50 : ({ Demolition: 100, Framing: 60, 'Project Management': 25, Credits: 100 } as Record<string, number>)[l.group] ?? 10);
  const lincolnDec = (l: BudgetLine) => (l.budgetId !== 'bud-j12' ? 100 : ({ Demolition: 100, Framing: 90, Electrical: 30, Plumbing: 30, 'Project Management': 35, Credits: 100 } as Record<string, number>)[l.group] ?? 10);
  job('j12', 'c1', [
    { n: 1, date: '2026-10-12', title: 'Deposit', notes: deposit, budgets: ['bud-j12'], pct: flat(10), status: 'Sent', pays: [['2026-10-20', 'Check', '1042', 'rest']] },
    { n: 2, date: '2026-11-15', title: 'Progress billing — November', budgets: ['bud-j12', 'co-j12-1'], pct: lincolnNov, status: 'Sent', pays: [['2026-11-24', 'ACH', 'HX-55120', 15000]] },
    { n: 3, date: '2026-11-26', title: 'Progress billing — December', budgets: ['bud-j12', 'co-j12-1'], pct: lincolnDec, status: 'Draft' },
  ]);
  // 538 Market: first bill paid, second sent and not yet due
  job('j8', 'c6', [
    { n: 1, date: '2026-11-02', title: 'Progress billing — demo & rough-in', budgets: ['d9'], pct: (l) => (l.group === 'Demolition' ? 100 : 50), status: 'Sent', pays: [['2026-11-09', 'Check', '3310', 'rest']] },
    { n: 2, date: '2026-11-20', title: 'Progress billing — tile', budgets: ['d9'], pct: (l) => (l.group === 'Demolition' ? 100 : 75), status: 'Sent' },
  ]);
  // 2200 Mesa ADU: two paid, the third overdue with a partial payment
  job('j9', 'c3', [
    { n: 1, date: '2026-09-14', title: 'Deposit', notes: deposit, budgets: ['bud-j9'], pct: flat(10), status: 'Sent', pays: [['2026-09-18', 'Check', '2207', 'rest']] },
    { n: 2, date: '2026-10-15', title: 'Progress billing — October', budgets: ['bud-j9'], pct: flat(30), status: 'Sent', pays: [['2026-10-28', 'ACH', 'NG-88231', 'rest']] },
    { n: 3, date: '2026-11-01', title: 'Progress billing — November', budgets: ['bud-j9'], pct: flat(45), status: 'Sent', pays: [['2026-11-20', 'Check', '2231', 5000]] },
  ]);
  // 1448 Elm: a long-running job billed monthly, latest bill just sent
  job('j11', 'c5', [
    { n: 1, date: '2026-06-01', title: 'Deposit', notes: deposit, budgets: ['bud-j11'], pct: flat(10), status: 'Sent', pays: [['2026-06-05', 'Wire', 'FW-40021', 'rest']] },
    { n: 2, date: '2026-07-31', title: 'Progress billing — July', budgets: ['bud-j11'], pct: flat(30), status: 'Sent', pays: [['2026-08-12', 'ACH', 'EL-10834', 'rest']] },
    { n: 3, date: '2026-09-30', title: 'Progress billing — September', budgets: ['bud-j11'], pct: flat(50), status: 'Sent', pays: [['2026-10-10', 'ACH', 'EL-11290', 50000], ['2026-10-24', 'ACH', 'EL-11402', 'rest']] },
    { n: 4, date: '2026-10-31', title: 'Progress billing — October', budgets: ['bud-j11'], pct: flat(65), status: 'Sent', pays: [['2026-11-12', 'ACH', 'EL-11877', 'rest']] },
    { n: 5, date: '2026-11-25', title: 'Progress billing — November', budgets: ['bud-j11'], pct: flat(70), status: 'Sent' },
  ]);
  // 87th St. ADU: deposit sent and overdue
  job('j7', 'c4', [{ n: 1, date: '2026-11-03', title: 'Deposit', notes: deposit, budgets: ['bud-j7'], pct: flat(10), status: 'Sent' }]);
  // Oak Avenue Bathrooms: deposit paid by card
  job('j6', 'c2', [{ n: 1, date: '2026-11-20', title: 'Deposit', notes: deposit, budgets: ['bud-j6'], pct: flat(10), status: 'Sent', pays: [['2026-11-24', 'Credit card', 'Visa ••4417', 'rest']] }]);

  return { invoices, payments };
}

/** Extra sample budgets: change orders, a credit line, and two alternate proposals. */
function withSampleBudgets(db: Db): Db {
  const cc = (name: string) => db.costCodes.find((c) => c.name === name)?.id ?? '';
  let n = 0;
  const line = (budgetId: string, group: string, code: string, name: string, costType: CostType, quantity: number, unit: string, unitCost: number, markup: number, vendorId = '', description = ''): BudgetLine => ({
    id: `sl${++n}`, budgetId, group, costCodeId: cc(code), name, description, costType, quantity, unit, unitCost, markup, vendorId,
  });
  const at = (date: string) => ({ created: `${date}T10:00:00`, updated: `${date}T10:00:00` });
  const budgets: Budget[] = [
    { id: 'co-j12-1', jobId: 'j12', kind: 'Change Order', number: '12-2', title: 'Pantry cabinets', status: 'Approved', partyId: 'c1', notes: 'Adds a full-height pantry wall next to the refrigerator.', ...at('2026-11-06') },
    { id: 'co-j12-2', jobId: 'j12', kind: 'Change Order', number: '12-3', title: 'Heated bathroom floor and shower niches', status: 'Sent', partyId: 'c1', notes: '', ...at('2026-11-18') },
    { id: 'co-j12-3', jobId: 'j12', kind: 'Change Order', number: '12-4', title: 'Garage outlet relocation', status: 'Draft', partyId: 'c1', notes: '', ...at('2026-11-25') },
    { id: 'alt-j2-b', jobId: 'j2', kind: 'Proposal', number: '2-2', title: '697 Ridge - Remodel — Option B (custom cabinets)', status: 'Draft', partyId: 'c6', notes: 'Same scope as Option A with custom cabinetry and quartz counters.', clonedFromId: 'bud-j2', ...at('2026-11-24') },
  ];
  const lines: BudgetLine[] = [
    line('co-j12-1', 'Cabinets & Finishes', 'Cabinets & Finishes', 'Pantry cabinets, full height', 'Materials', 1, 'lump', 8600, 18),
    line('co-j12-1', 'Cabinets & Finishes', 'Cabinets & Finishes', 'Install pantry cabinets', 'Labor', 24, 'hr', 75, 25),
    line('co-j12-2', 'Tile', 'Tile', 'Radiant floor heat mat & thermostat', 'Materials', 1, 'lump', 1450, 20),
    line('co-j12-2', 'Electrical', 'Electrical', 'Dedicated circuit for floor heat', 'Subcontractor', 1, 'lump', 1200, 15, 'v4'),
    line('co-j12-2', 'Tile', 'Tile', 'Two recessed shower niches', 'Labor', 16, 'hr', 70, 25),
    line('co-j12-2', 'Tile', 'Tile', 'Tile labor adjustment', 'Subcontractor', 1, 'lump', 1960, 15, 'v1'),
    line('co-j12-3', 'Electrical', 'Electrical', 'Move two garage outlets', 'Subcontractor', 1, 'lump', 650, 15, 'v4'),
    // A credit on the original scope for a design fee already paid under another contract.
    line('bud-j12', 'Credits', 'Design & Permits', 'Credit: design fee paid under design agreement', 'Other', 1, 'lump', -5000, 0, '', 'Applied toward the construction contract.'),
    line('alt-j2-b', 'Demolition', 'Demolition', 'Selective demolition', 'Labor', 40, 'hr', 65, 25),
    line('alt-j2-b', 'Kitchen', 'Kitchen', 'Custom cabinets', 'Materials', 1, 'lump', 26500, 20),
    line('alt-j2-b', 'Kitchen', 'Kitchen', 'Quartz countertops', 'Subcontractor', 1, 'lump', 9800, 15),
  ];
  const out: Db = {
    ...db,
    budgets: [
      ...db.budgets.map((b) => (b.id === 'bud-j2' ? { ...b, title: `${b.title} — Option A (stock cabinets)`, ...at('2026-11-22') } : b)),
      ...budgets,
    ],
    budgetLines: [...db.budgetLines, ...lines],
  };
  // Signed jobs' contract totals come from their approved budgets.
  const price = (l: BudgetLine) => l.quantity * l.unitCost * (1 + l.markup / 100);
  out.jobs = out.jobs.map((j) => {
    const approved = new Set(out.budgets.filter((b) => b.jobId === j.id && b.status === 'Approved').map((b) => b.id));
    if (approved.size === 0) return j;
    return { ...j, total: Math.round(out.budgetLines.filter((l) => approved.has(l.budgetId)).reduce((s, l) => s + price(l), 0)) };
  });
  return out;
}
