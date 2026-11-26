import { migrateBudgets, type LegacyBudgetItem, type PreBudgetDb } from './migrate';

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

/** Shown on documents. */
export const COMPANY_LICENSE = '1118207';

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
  invoiceId?: string; // likewise for invoices
}

export interface Db {
  activity: Activity[];
  costCodes: CostCode[];
  budgets: Budget[];
  budgetLines: BudgetLine[];
  expenses: Expense[];
  invoices: Invoice[];
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
    companyName: 'Cody Design Build Inc.',
    activity: [
      { id: 'a1', date: '2026-11-25T15:28:00', partyId: 'c6', jobId: 'j8', title: 'Sam Ortiz', doc: 'Proposal 135-4', amount: 58460, text: 'Marked as approved by Sam Ortiz for Sam Ortiz at 538 Market St', color: '#00c950' },
      { id: 'a2', date: '2026-11-25T14:59:00', partyId: 'c6', jobId: 'j8', title: 'Sam Ortiz', doc: 'Proposal 135-4', amount: 0, text: 'Marked as pending by Dana Cole for Sam Ortiz at 538 Market St', color: '#f0b100' },
      { id: 'a3', date: '2026-11-25T14:03:00', partyId: 'c6', jobId: 'j8', title: 'Sam Ortiz', doc: 'Proposal 135-4', amount: 0, text: 'Marked as draft by Dana Cole for Sam Ortiz at 538 Market St', color: '#2b7fff' },
      { id: 'a4', date: '2026-11-25T13:01:00', partyId: 'v3', jobId: 'j7', title: 'Payment applied to Bayline Drywall', doc: 'Bill 134-50', amount: 3000, text: 'Applied by Dana Cole for Patel Household at 1079 87th St', color: '#fb2c36' },
      { id: 'a5', date: '2026-11-24T21:53:00', partyId: 'v1', jobId: 'j12', title: 'Stoneworks Tile Co.', doc: 'Bid Request 133-85', amount: 0, text: 'Marked as pending by Kai Brooks for Harper Household at 2243 Lincoln Way', color: '#f0b100' },
      { id: 'a6', date: '2026-11-24T21:31:00', partyId: 'v1', jobId: 'j12', title: 'Stoneworks Tile Co.', doc: 'Bid Request 133-85', amount: 0, text: 'Created by Kai Brooks for Harper Household at 2243 Lincoln Way', color: '#2b7fff' },
    ],
    items: [
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
      { id: 'd1', jobId: 'j9', partyId: 'c3', kind: 'Invoice', number: '142-1', amount: 4500, status: 'Open' },
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
  return withSampleInvoices(withSampleBudgets(migrateBudgets(raw, '2026-11-20T10:00:00')));
}

/** Sample progress invoices: a paid deposit, a sent progress bill and an empty draft. */
function withSampleInvoices(db: Db): Db {
  const linesOf = (budgetId: string) => db.budgetLines.filter((l) => l.budgetId === budgetId);
  const pct = (budgetId: string, f: (l: BudgetLine) => number) => Object.fromEntries(linesOf(budgetId).map((l) => [l.id, f(l)]));
  const inv = (p: Omit<Invoice, 'title' | 'notes' | 'detail' | 'updated'> & Partial<Invoice>): Invoice => ({ title: '', notes: '', detail: 'lines', updated: p.created, ...p });
  // progress on 2243 Lincoln by mid-November: demo done, framing mostly done, PM a quarter
  const lincoln = (l: BudgetLine) => ({ Demolition: 100, Framing: 60, 'Project Management': 25, Credits: 100 } as Record<string, number>)[l.group] ?? 10;
  const invoices: Invoice[] = [
    inv({ id: 'inv-j12-1', jobId: 'j12', number: '12-1', title: 'Deposit', status: 'Paid', partyId: 'c1', date: '2026-10-12', due: '2026-10-26', budgetIds: ['bud-j12'], progress: pct('bud-j12', () => 10), billedFrom: {}, created: '2026-10-12T09:00:00', statusDates: { Sent: '2026-10-12T09:30:00', Paid: '2026-10-20T15:00:00' }, detail: 'groups', notes: '10% deposit on the construction contract.' }),
    inv({ id: 'inv-j12-2', jobId: 'j12', number: '12-2', title: 'Progress billing — November', status: 'Sent', partyId: 'c1', date: '2026-11-15', due: '2026-11-29', budgetIds: ['bud-j12', 'co-j12-1'], progress: { ...pct('bud-j12', lincoln), ...pct('co-j12-1', () => 50) }, billedFrom: pct('bud-j12', () => 10), created: '2026-11-15T09:00:00', statusDates: { Sent: '2026-11-15T10:00:00' } }),
    inv({ id: 'inv-j12-3', jobId: 'j12', number: '12-3', status: 'Draft', partyId: 'c1', date: '2026-11-26', due: '2026-12-10', budgetIds: ['bud-j12', 'co-j12-1'], progress: {}, created: '2026-11-26T08:00:00' }),
    inv({ id: 'inv-j8-1', jobId: 'j8', number: '8-1', title: 'Progress billing', status: 'Paid', partyId: 'c6', date: '2026-11-02', due: '2026-11-16', budgetIds: ['d9'], progress: pct('d9', (l) => (l.group === 'Demolition' ? 100 : 50)), billedFrom: {}, created: '2026-11-02T09:00:00', statusDates: { Sent: '2026-11-02T09:00:00', Paid: '2026-11-09T11:00:00' } }),
  ];
  return { ...db, invoices };
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
