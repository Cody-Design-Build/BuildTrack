// Converts data saved by the old account/contact model into the people/accounts model.
//
// Old model: customer and vendor ACCOUNTS were containers, and every CONTACT belonged to
// exactly one of them (so one real person could exist twice). Jobs, documents, to-dos and
// activity each pointed at one account.
//
// New model: PEOPLE are standalone records. They can belong to any number of ACCOUNTS
// (through memberships with a title), and both people and accounts link to jobs with a role.
import type { Account, Db, JobLink, Membership, Person } from './data';

interface LegacyAccount {
  id: string;
  type: 'customer' | 'vendor';
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  color: string;
  trade?: string;
}

interface LegacyContact {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  phone: string;
  primary: boolean;
  color?: string;
}

interface LegacyLocation {
  id: string;
  accountId: string;
  name: string;
  address: string;
}

interface LegacyDb {
  accounts: LegacyAccount[];
  contacts: LegacyContact[];
  locations?: LegacyLocation[];
  jobs: ({ accountId: string; locationId: string } & Record<string, unknown>)[];
  docs?: ({ accountId: string } & Record<string, unknown>)[];
  todos?: ({ accountId: string } & Record<string, unknown>)[];
  activity?: ({ accountId: string } & Record<string, unknown>)[];
  [key: string]: unknown;
}

export const isLegacy = (raw: unknown): raw is LegacyDb =>
  !!raw && typeof raw === 'object' && Array.isArray((raw as LegacyDb).contacts) && !Array.isArray((raw as Db).people);

const fullName = (c: { firstName: string; lastName: string }) => `${c.firstName} ${c.lastName}`.trim();

export function migrateLegacy(old: LegacyDb): Db {
  // People: one record per real person. Contacts with the same full name are the same person.
  const people: Person[] = [];
  const personFor = new Map<string, string>(); // legacy contact id -> person id
  const byName = new Map<string, Person>();
  for (const c of old.contacts) {
    const key = fullName(c).toLowerCase();
    const existing = key ? byName.get(key) : undefined;
    if (existing) {
      if (!existing.email) existing.email = c.email;
      if (!existing.phone) existing.phone = c.phone;
      personFor.set(c.id, existing.id);
      continue;
    }
    const p: Person = { id: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, address: '', notes: '', color: c.color };
    people.push(p);
    if (key) byName.set(key, p);
    personFor.set(c.id, p.id);
  }

  const accounts: Account[] = old.accounts.map((a) => ({
    id: a.id,
    name: a.name,
    types: [a.type === 'customer' ? 'Customer' : 'Vendor'],
    phone: a.phone,
    email: a.email,
    address: a.address,
    notes: a.notes,
    color: a.color,
    trade: a.trade || undefined,
  }));

  const memberships: Membership[] = old.contacts.map((c) => ({
    id: `m-${c.id}`,
    personId: personFor.get(c.id)!,
    accountId: c.accountId,
    title: c.title,
    primary: c.primary,
  }));

  // Jobs: the customer account and every person in it are linked with the Customer role,
  // and the job keeps its site address directly instead of through a location record.
  const locations = new Map((old.locations ?? []).map((l) => [l.id, l] as const));
  const jobLinks: JobLink[] = [];
  const jobs = old.jobs.map((j) => {
    const { accountId, locationId, ...rest } = j;
    if (accountId) {
      jobLinks.push({ id: `l-${j.id}-${accountId}`, jobId: j.id as string, partyId: accountId, role: 'Customer' });
      const seen = new Set<string>();
      for (const m of memberships.filter((m) => m.accountId === accountId)) {
        if (seen.has(m.personId)) continue;
        seen.add(m.personId);
        jobLinks.push({ id: `l-${j.id}-${m.personId}`, jobId: j.id as string, partyId: m.personId, role: 'Customer' });
      }
    }
    const loc = locations.get(locationId);
    return { ...rest, address: loc?.address || loc?.name || '' };
  });

  // Documents, to-dos and activity keep pointing at the same account (account ids are unchanged).
  const repoint = <T extends { accountId: string }>(xs: T[] = []) =>
    xs.map(({ accountId, ...rest }) => ({ ...rest, partyId: accountId }));

  const { contacts: _c, locations: _l, ...others } = old;
  return {
    ...(others as unknown as Db),
    people,
    accounts,
    memberships,
    jobLinks,
    jobs: jobs as unknown as Db['jobs'],
    docs: repoint(old.docs) as unknown as Db['docs'],
    todos: repoint(old.todos) as unknown as Db['todos'],
    activity: repoint(old.activity) as unknown as Db['activity'],
  };
}
