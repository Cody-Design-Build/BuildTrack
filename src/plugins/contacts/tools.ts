// Agent tools for people and accounts (server only, see src/agent/sdk.ts).
import { z } from 'zod';
import { commit, defineTool, find, type PluginTools } from '../../agent/sdk';
import { ACCOUNT_TYPES, type Account, type Person } from '../../data';
import { colorFor, uid } from '../../model';

const COLORS = ['#0284c7', '#d97706', '#16a34a', '#c026d3', '#e11d48', '#ea580c', '#7c3aed', '#0d9488'];

export default {
  plugin: 'buildtrack.contacts',
  tools: [
    defineTool({
      name: 'create_account',
      title: 'Add a company or household',
      description: `Adds an account: a customer household, a vendor, a subcontractor, an architect… Types: ${ACCOUNT_TYPES.join(', ')}.`,
      input: z.object({
        name: z.string().min(1),
        types: z.array(z.string()).min(1),
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        trade: z.string().optional().describe('For subcontractors and suppliers, e.g. "Tile"'),
        notes: z.string().optional(),
      }),
      writes: true,
      run: async (ctx, a) => {
        const dup = ctx.db.accounts.find((x) => x.name.trim().toLowerCase() === a.name.trim().toLowerCase());
        if (dup) throw new Error(`There's already an account called "${dup.name}" (id ${dup.id}).`);
        const acc: Account = { id: uid('a'), name: a.name.trim(), types: a.types, email: a.email ?? '', phone: a.phone ?? '', address: a.address ?? '', notes: a.notes ?? '', trade: a.trade || undefined, color: COLORS[ctx.db.accounts.length % COLORS.length] };
        await commit(ctx, { ...ctx.db, accounts: [...ctx.db.accounts, acc] }, '');
        return acc;
      },
    }),
    defineTool({
      name: 'create_person',
      title: 'Add a person',
      description: 'Adds a person, optionally as part of an account (with their title there, e.g. "Estimator").',
      input: z.object({
        firstName: z.string().min(1),
        lastName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        notes: z.string().optional(),
        accountId: z.string().optional(),
        title: z.string().optional().describe('Their title at the account'),
      }),
      writes: true,
      run: async (ctx, a) => {
        if (a.accountId) find(ctx.db.accounts, a.accountId, 'account');
        const last = a.lastName ?? '';
        if (a.email && ctx.db.people.some((p) => p.email.toLowerCase() === a.email!.toLowerCase())) throw new Error(`Someone with the email ${a.email} is already in contacts.`);
        const person: Person = { id: uid('p'), firstName: a.firstName.trim(), lastName: last.trim(), email: a.email ?? '', phone: a.phone ?? '', address: a.address ?? '', notes: a.notes ?? '', color: colorFor(`${a.firstName} ${last}`) };
        const memberships = a.accountId
          ? [...ctx.db.memberships, { id: uid('m'), personId: person.id, accountId: a.accountId, title: a.title ?? '', primary: !ctx.db.memberships.some((m) => m.accountId === a.accountId) }]
          : ctx.db.memberships;
        await commit(ctx, { ...ctx.db, people: [...ctx.db.people, person], memberships }, '');
        return person;
      },
    }),
  ],
} satisfies PluginTools;
