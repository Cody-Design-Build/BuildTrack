// The app's data model and sample data.
//
// Key rule (the person's main change): customers and vendors are ACCOUNTS.
// People are CONTACTS that belong to exactly one account. A contact record
// can never be shared between accounts, so the same real person who works
// with a vendor and is also a customer gets two separate contact records.

export type AccountType = 'customer' | 'vendor';

export interface Account {
  id: string;
  type: AccountType;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  color: string;
  trade?: string; // vendors only, e.g. "Tile"
}

export interface Contact {
  id: string;
  accountId: string; // exactly one account, never more
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  phone: string;
  primary: boolean;
  color?: string; // avatar colour
}

export interface Location {
  id: string;
  accountId: string;
  name: string;
  address: string;
}

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
  accountId: string; // customer account
  locationId: string;
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
  accountId: string;
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

export interface Todo {
  id: string;
  name: string;
  accountId: string;
  jobId: string;
  due: string;
  type: string;
  assignees: string[];
  done: boolean;
}

export interface Task {
  id: string;
  jobId: string;
  name: string;
  start: string;
  end: string;
  progress: number;
}

export interface Message {
  id: string;
  // sender: a contact id or a team member id
  fromContactId?: string;
  fromTeamId?: string;
  toContactIds: string[];
  accountId: string;
  jobId: string;
  topic: string; // document or to-do the thread is about
  body: string;
  date: string; // ISO datetime
  read: boolean;
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
  vendorId: string; // vendor account, optional
  actual: number; // money spent so far
}

/** Something that happened to a document, shown in the Home activity feed. */
export interface Activity {
  id: string;
  date: string; // ISO datetime
  accountId: string;
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
  accounts: Account[];
  contacts: Contact[];
  locations: Location[];
  jobs: Job[];
  docs: Doc[];
  team: TeamMember[];
  todos: Todo[];
  tasks: Task[];
  messages: Message[];
  companyName: string;
}

export const AVATAR_COLORS = ['#c026d3', '#d97706', '#16a34a', '#e11d48', '#ea580c', '#0284c7', '#65a30d', '#7c3aed', '#0d9488'];

const acc = (id: string, type: AccountType, name: string, color: string, extra: Partial<Account> = {}): Account => ({
  id,
  type,
  name,
  color,
  phone: '',
  email: '',
  address: '',
  notes: '',
  ...extra,
});

const con = (id: string, accountId: string, firstName: string, lastName: string, extra: Partial<Contact> = {}): Contact => ({
  id,
  accountId,
  firstName,
  lastName,
  title: '',
  email: '',
  phone: '',
  primary: false,
  ...extra,
});

const bi = (id: string, jobId: string, group: string, name: string, costType: CostType, quantity: number, unit: string, unitCost: number, markup: number, vendorId: string, actual: number): BudgetItem => ({
  id, jobId, group, name, costType, quantity, unit, unitCost, markup, vendorId, actual,
});

export function seed(): Db {
  return {
    companyName: 'Cody Design Build Inc.',
    activity: [
      { id: 'a1', date: '2026-11-25T15:28:00', accountId: 'c6', jobId: 'j8', title: 'Sam Ortiz', doc: 'Proposal 135-4', amount: 58460, text: 'Marked as approved by Sam Ortiz for Sam Ortiz at 538 Market St', color: '#00c950' },
      { id: 'a2', date: '2026-11-25T14:59:00', accountId: 'c6', jobId: 'j8', title: 'Sam Ortiz', doc: 'Proposal 135-4', amount: 0, text: 'Marked as pending by Dana Cole for Sam Ortiz at 538 Market St', color: '#f0b100' },
      { id: 'a3', date: '2026-11-25T14:03:00', accountId: 'c6', jobId: 'j8', title: 'Sam Ortiz', doc: 'Proposal 135-4', amount: 0, text: 'Marked as draft by Dana Cole for Sam Ortiz at 538 Market St', color: '#2b7fff' },
      { id: 'a4', date: '2026-11-25T13:01:00', accountId: 'v3', jobId: 'j7', title: 'Payment applied to Bayline Drywall', doc: 'Bill 134-50', amount: 3000, text: 'Applied by Dana Cole for Patel Household at 1079 87th St', color: '#fb2c36' },
      { id: 'a5', date: '2026-11-24T21:53:00', accountId: 'v1', jobId: 'j12', title: 'Stoneworks Tile Co.', doc: 'Bid Request 133-85', amount: 0, text: 'Marked as pending by Kai Brooks for Harper Household at 2243 Lincoln Way', color: '#f0b100' },
      { id: 'a6', date: '2026-11-24T21:31:00', accountId: 'v1', jobId: 'j12', title: 'Stoneworks Tile Co.', doc: 'Bid Request 133-85', amount: 0, text: 'Created by Kai Brooks for Harper Household at 2243 Lincoln Way', color: '#2b7fff' },
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
      acc('c1', 'customer', 'Harper Household', '#0284c7', { phone: '(415) 555-0141', email: 'maya.harper@example.com', address: '2243 Lincoln Way' }),
      acc('c2', 'customer', 'Rivera Household', '#d97706', { phone: '(415) 555-0172', address: '40 Oak Avenue' }),
      acc('c3', 'customer', 'Northgate Homes', '#16a34a', { phone: '(510) 555-0110', email: 'office@example.com', address: '900 Bay Street', notes: 'Developer — several ADU projects.' }),
      acc('c4', 'customer', 'Patel Household', '#65a30d', { address: '1079 87th Street' }),
      acc('c5', 'customer', 'Kim & Lee', '#7c3aed', { address: '1448 Elm Street' }),
      acc('c6', 'customer', 'Sam Ortiz', '#0d9488', { address: '538 Market Street' }),
      acc('c7', 'customer', 'Brooks Family', '#e11d48', { address: '77 Juniper Street' }),
      acc('c8', 'customer', 'Nguyen Household', '#ea580c', { address: '235 Cedar Street' }),
      acc('c9', 'customer', 'Morgan & Pat', '#c026d3', { address: '344 Hill Street' }),
      acc('c10', 'customer', 'Bright Lights Inc.', '#ca8a04', { address: '739 Bay Road' }),
      acc('c11', 'customer', 'Romero Household', '#0284c7', { address: '12 Vista Court', notes: 'Luis also runs Fresh Coat Painting (separate vendor contact).' }),
      acc('v1', 'vendor', 'Stoneworks Tile Co.', '#c026d3', { trade: 'Tile', phone: '(650) 555-0186', email: 'sales@example.com' }),
      acc('v2', 'vendor', 'Fresh Coat Painting', '#ea580c', { trade: 'Painting', phone: '(415) 555-0133' }),
      acc('v3', 'vendor', 'Bayline Drywall', '#16a34a', { trade: 'Drywall' }),
      acc('v4', 'vendor', 'Summit Electric', '#0284c7', { trade: 'Electrical' }),
      acc('v5', 'vendor', 'Valley Plumbing', '#e11d48', { trade: 'Plumbing' }),
    ],
    contacts: [
      con('p1', 'c1', 'Maya', 'Harper', { primary: true, email: 'maya.harper@example.com', phone: '(415) 555-0141' }),
      con('p2', 'c1', 'Jon', 'Harper', { email: 'jon.harper@example.com', color: '#16a34a' }),
      con('p3', 'c2', 'Elena', 'Rivera', { primary: true, phone: '(415) 555-0172' }),
      con('p4', 'c3', 'Grace', 'Wu', { primary: true, title: 'Project Manager', email: 'grace@example.com' }),
      con('p5', 'c4', 'Ravi', 'Patel', { primary: true }),
      con('p6', 'c5', 'Nora', 'Kim', { primary: true }),
      con('p7', 'c5', 'Ben', 'Lee', { color: '#ea580c' }),
      con('p8', 'c6', 'Sam', 'Ortiz', { primary: true }),
      con('p9', 'c7', 'Gabe', 'Brooks', { primary: true }),
      con('p10', 'c8', 'Lan', 'Nguyen', { primary: true }),
      con('p11', 'c9', 'Morgan', 'Price', { primary: true }),
      con('p12', 'c10', 'Tim', 'Shaw', { primary: true, title: 'Owner' }),
      con('p13', 'c11', 'Luis', 'Romero', { primary: true, email: 'luis.home@example.com' }),
      con('p20', 'v1', 'Ana', 'Mendes', { primary: true, title: 'Estimator', email: 'sales@example.com', phone: '(650) 555-0186' }),
      con('p21', 'v1', 'Daniel', 'Lima', { title: 'Project Lead' }),
      con('p22', 'v2', 'Luis', 'Romero', { primary: true, title: 'Owner', email: 'luis@example.com' }),
      con('p23', 'v3', 'Owen', 'Marsh', { primary: true }),
      con('p24', 'v4', 'Priya', 'Nair', { primary: true }),
      con('p25', 'v5', 'Neil', 'Baker', { primary: true }),
    ],
    locations: [
      { id: 'l1', accountId: 'c1', name: '2243 Lincoln Way', address: '2243 Lincoln Way' },
      { id: 'l2', accountId: 'c2', name: '40 Oak Avenue', address: '40 Oak Avenue' },
      { id: 'l3', accountId: 'c3', name: '2200 Mesa Street', address: '2200 Mesa Street' },
      { id: 'l4', accountId: 'c3', name: '315 Pine Street', address: '315 Pine Street' },
      { id: 'l5', accountId: 'c4', name: '1079 87th St', address: '1079 87th Street' },
      { id: 'l6', accountId: 'c5', name: '1448 Elm St', address: '1448 Elm Street' },
      { id: 'l7', accountId: 'c6', name: '538 Market St', address: '538 Market Street' },
      { id: 'l8', accountId: 'c7', name: '77 Juniper St', address: '77 Juniper Street' },
      { id: 'l9', accountId: 'c8', name: '235 Cedar Street', address: '235 Cedar Street' },
      { id: 'l10', accountId: 'c9', name: '344 Hill', address: '344 Hill Street' },
      { id: 'l11', accountId: 'c10', name: '739 Bay Rd', address: '739 Bay Road' },
    ],
    jobs: [
      { id: 'j1', name: '77 Juniper - Addition & Remodel', accountId: 'c7', locationId: 'l8', status: 'Lead', total: 0, projectedCost: 0, start: '2027-01-11', end: '2027-05-28', progress: 0 },
      { id: 'j2', name: '697 Ridge - Remodel', accountId: 'c6', locationId: 'l7', status: 'Estimating', total: 0, projectedCost: 42000, start: '2026-12-07', end: '2027-02-26', progress: 0 },
      { id: 'j3', name: '235 Cedar - Pocket Door', accountId: 'c8', locationId: 'l9', status: 'Estimating', total: 0, projectedCost: 3800, start: '2026-12-14', end: '2026-12-18', progress: 0 },
      { id: 'j4', name: '344 Hill - Hillside Addition', accountId: 'c9', locationId: 'l10', status: 'Negotiating', total: 0, projectedCost: 0, start: '2027-02-01', end: '2027-08-27', progress: 0 },
      { id: 'j5', name: '739 Bay - HVAC', accountId: 'c10', locationId: 'l11', status: 'Negotiating', total: 0, projectedCost: 0, start: '2027-01-04', end: '2027-01-22', progress: 0 },
      { id: 'j6', name: 'Oak Avenue Bathrooms', accountId: 'c2', locationId: 'l2', status: 'Pre-Construction', total: 64250, projectedCost: 48000, start: '2026-12-01', end: '2027-02-12', progress: 5 },
      { id: 'j7', name: '87th St. ADU', accountId: 'c4', locationId: 'l5', status: 'Pre-Construction', total: 214621, projectedCost: 171000, start: '2026-11-02', end: '2027-06-30', progress: 10 },
      { id: 'j8', name: '538 Market - Bathroom', accountId: 'c6', locationId: 'l7', status: 'In Progress', total: 58460, projectedCost: 44100, start: '2026-10-19', end: '2026-12-23', progress: 60 },
      { id: 'j9', name: '2200 Mesa - Northgate ADU', accountId: 'c3', locationId: 'l3', status: 'In Progress', total: 107900, projectedCost: 82300, start: '2026-09-14', end: '2027-03-19', progress: 45 },
      { id: 'j10', name: '315 Pine St - Northgate ADU', accountId: 'c3', locationId: 'l4', status: 'Pre-Construction', total: 0, projectedCost: 96000, start: '2027-01-18', end: '2027-07-30', progress: 0 },
      { id: 'j11', name: '1448 Elm - Full Remodel', accountId: 'c5', locationId: 'l6', status: 'In Progress', total: 508473, projectedCost: 402000, start: '2026-06-01', end: '2027-04-30', progress: 70 },
      { id: 'j12', name: '2243 Lincoln - Remodel', accountId: 'c1', locationId: 'l1', status: 'In Progress', total: 686933, projectedCost: 540000, start: '2026-10-10', end: '2027-05-14', progress: 25 },
    ],
    docs: [
      { id: 'd1', jobId: 'j9', accountId: 'c3', kind: 'Invoice', number: '142-1', amount: 4500, status: 'Open' },
      { id: 'd2', jobId: 'j12', accountId: 'c1', kind: 'Change Order', number: '133-58', amount: 6772, status: 'Pending' },
      { id: 'd3', jobId: 'j5', accountId: 'c10', kind: 'Proposal', number: '144-1', amount: 14837, status: 'Pending' },
      { id: 'd4', jobId: 'j12', accountId: 'v2', kind: 'Subcontractor Agreement', number: '133-69', amount: 33000, status: 'Pending' },
      { id: 'd5', jobId: 'j12', accountId: 'v2', kind: 'Subcontractor Agreement', number: '133-68', amount: 17000, status: 'Pending' },
      { id: 'd6', jobId: 'j11', accountId: 'v2', kind: 'Subcontractor Agreement', number: '133-67', amount: 2000, status: 'Pending' },
      { id: 'd7', jobId: 'j12', accountId: 'v1', kind: 'Bid Request', number: '133-60', amount: 0, status: 'Pending' },
      { id: 'd8', jobId: 'j12', accountId: 'v1', kind: 'Bid Request', number: '133-80', amount: 0, status: 'Pending' },
      { id: 'd9', jobId: 'j8', accountId: 'c6', kind: 'Proposal', number: '135-4', amount: 58460, status: 'Approved' },
    ],
    todos: [
      { id: 't1', name: 'Follow up with client about the next steps for the project', accountId: 'c2', jobId: 'j6', due: '', type: 'Project Management', assignees: ['u1'], done: false },
      { id: 't2', name: 'Make an appointment with clients to be able to walk the project before starting it', accountId: 'c3', jobId: 'j9', due: '2026-12-02', type: 'Site Visit', assignees: ['u1', 'u2'], done: false },
      { id: 't3', name: 'Make an appointment with clients to be able to walk the project before starting it', accountId: 'c3', jobId: 'j10', due: '2026-12-09', type: 'Site Visit', assignees: ['u1'], done: false },
      { id: 't4', name: 'Order tile samples', accountId: 'c4', jobId: 'j7', due: '2026-12-04', type: 'Purchasing', assignees: ['u1'], done: false },
      { id: 't5', name: 'Vendor intake', accountId: 'v1', jobId: '', due: '', type: '', assignees: ['u1', 'u2', 'u3', 'u4'], done: false },
    ],
    tasks: [
      { id: 'k1', jobId: 'j12', name: 'Demolition', start: '2026-10-12', end: '2026-10-23', progress: 100 },
      { id: 'k2', jobId: 'j12', name: 'Framing', start: '2026-10-26', end: '2026-11-20', progress: 60 },
      { id: 'k3', jobId: 'j12', name: 'Rough plumbing & electrical', start: '2026-11-23', end: '2026-12-18', progress: 0 },
      { id: 'k4', jobId: 'j12', name: 'Drywall', start: '2027-01-04', end: '2027-01-29', progress: 0 },
      { id: 'k5', jobId: 'j8', name: 'Tile', start: '2026-11-16', end: '2026-12-04', progress: 40 },
      { id: 'k6', jobId: 'j8', name: 'Fixtures', start: '2026-12-07', end: '2026-12-18', progress: 0 },
    ],
    messages: [
      {
        id: 'm1', fromContactId: 'p20', toContactIds: [], accountId: 'c1', jobId: 'j12', topic: 'Bid Request 133-60',
        body: 'Hi, how are you today?\n\nThank you so much for sending the bid request and the drawings!\n\nI will review everything and send you the quote asap.\n\nHave a great day!\n\nAna Mendes\nStoneworks Tile Co.\nLicense #0000000\nTILE INSTALLATION & STONE FABRICATION\nE: sales@example.com\nP: (650) 555-0186\nwww.example.com',
        date: '2026-11-25T18:35:00', read: false,
      },
      {
        id: 'm2', fromTeamId: 'u4', toContactIds: ['p3'], accountId: 'c2', jobId: 'j6', topic: 'Follow up with client about the next steps for the project',
        body: '👍', date: '2026-11-25T16:10:00', read: false,
      },
      {
        id: 'm3', fromContactId: 'p2', toContactIds: [], accountId: 'c1', jobId: 'j12', topic: 'Job walk 133-80',
        body: 'Hello,\n\nWould you be able to set up a job walk so we can get a better idea of the project? Also, I\'m not sure if I\'m missing the floorplans somewhere, but I can\'t seem to find them.',
        date: '2026-11-25T11:14:00', read: true,
      },
      {
        id: 'm4', fromTeamId: 'u1', toContactIds: ['p2'], accountId: 'c1', jobId: 'j12', topic: 'Job walk 133-80',
        body: 'Hey Jon! Just wanted to say hello again and that we are mostly available for a walkthrough next week, just let us know when you can come by.',
        date: '2026-11-25T15:44:00', read: true,
      },
      {
        id: 'm5', fromTeamId: 'u2', toContactIds: [], accountId: 'c4', jobId: 'j7', topic: 'Tile Bids',
        body: 'Stoneworks will be doing the tile.', date: '2026-11-24T09:20:00', read: true,
      },
      {
        id: 'm6', fromContactId: 'p7', toContactIds: [], accountId: 'c5', jobId: 'j11', topic: 'Progress Invoice 138-54',
        body: 'I submitted payment today. The invoice isn\'t marked yet, but it should go through shortly.', date: '2026-11-04T09:45:00', read: true,
      },
      {
        id: 'm7', fromContactId: 'p7', toContactIds: [], accountId: 'c5', jobId: 'j11', topic: 'Change Order 138-47',
        body: 'Also, were you able to ask why the change in price from 24k to 25k?', date: '2026-10-29T14:02:00', read: true,
      },
      {
        id: 'm8', fromContactId: 'p7', toContactIds: [], accountId: 'c5', jobId: 'j11', topic: 'Change Order 138-47',
        body: 'I thought we decided the range hood didn\'t need special work?', date: '2026-10-29T10:30:00', read: true,
      },
      {
        id: 'm9', fromContactId: 'p7', toContactIds: [], accountId: 'c5', jobId: 'j11', topic: 'Change Order 138-26',
        body: 'This is an amazing price, but not something we are interested in adding to the scope today. We understand that we are missing out on a great deal.', date: '2026-09-14T12:00:00', read: true,
      },
      {
        id: 'm10', fromContactId: 'p5', toContactIds: [], accountId: 'c4', jobId: 'j7', topic: 'Window selections',
        body: 'We picked the black frames. Let us know if you need anything else from us.', date: '2026-08-18T17:12:00', read: true,
      },
      {
        id: 'm11', fromContactId: 'p1', toContactIds: [], accountId: 'c1', jobId: 'j12', topic: 'Kickoff',
        body: 'Looking forward to getting started! Is there anything we need to move before demo day?', date: '2026-07-01T08:05:00', read: true,
      },
    ],
  };
}
