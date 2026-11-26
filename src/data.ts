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

export type DocKind =
  | 'Proposal'
  | 'Change Order'
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

/** One line of a job's budget / estimate. */
export interface BudgetItem {
  id: string;
  jobId: string;
  group: string; // e.g. "Demolition", "Framing"
  name: string;
  costType: CostType;
  quantity: number;
  unit: string; // "ea", "hr", "sqft", "lump"
  unitCost: number;
  markup: number; // percent
  vendorId: string; // account doing or supplying the work, optional
  actual: number; // money spent so far
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
}

export interface Db {
  activity: Activity[];
  items: BudgetItem[];
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

const bi = (id: string, jobId: string, group: string, name: string, costType: CostType, quantity: number, unit: string, unitCost: number, markup: number, vendorId: string, actual: number): BudgetItem => ({
  id, jobId, group, name, costType, quantity, unit, unitCost, markup, vendorId, actual,
});

export function seed(): Db {
  return {
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
      { id: 'd2', jobId: 'j12', partyId: 'c1', kind: 'Change Order', number: '133-58', amount: 6772, status: 'Pending' },
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
}
