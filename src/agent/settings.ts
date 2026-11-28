// Settings as agent tools: the company's details, which plugins are on, the company theme and the
// team. The same rules as Settings in the app; team changes go through the database functions,
// which only let owners and admins invite or change roles.
import { z } from 'zod';
import type { PluginChoices } from '../data';
import { activeOf, chosenFor, normalizeChoices } from '../plugins/activation';
import { PLUGIN_BASES } from '../plugins/bases';
import { THEME_PACKS } from '../theming/packs';
import type { Look } from '../theming/types';
import { commit, defineTool, type AgentContext, type AgentTool } from './sdk';

type TeamEntry = { user_id: string | null; email: string; role: 'owner' | 'admin' | 'member'; since: string; pending: boolean; expires_at: string | null };

const plugin = (id: string) => {
  const p = PLUGIN_BASES.find((x) => x.id === id);
  if (!p) throw new Error(`No plugin "${id}". get_settings lists them.`);
  return p;
};

const themes = () => THEME_PACKS.flatMap((pack) => pack.themes.map((t) => ({ id: t.id, name: t.name, style: pack.name, note: t.note })));

function pluginStates(ctx: Pick<AgentContext, 'db'>) {
  const choices = normalizeChoices(ctx.db.plugins);
  const on = new Set(activeOf(PLUGIN_BASES, choices).map((p) => p.id));
  return PLUGIN_BASES.map((p) => ({
    id: p.id, name: p.name, description: p.description, on: on.has(p.id),
    switchedOn: p.core || !choices.off.includes(p.id),
    alwaysOn: !!p.core,
    needs: p.requires ?? [],
    role: p.role ? { id: p.role.id, label: p.role.label, chosen: chosenFor(p.role.id, PLUGIN_BASES, choices)?.id === p.id } : undefined,
  }));
}

/** Plugins that would stop working if `id` were off (directly or through another). */
function dependentsOf(id: string, choices: PluginChoices) {
  const before = new Set(activeOf(PLUGIN_BASES, choices).map((p) => p.id));
  const after = new Set(activeOf(PLUGIN_BASES, { ...choices, off: [...choices.off, id] }).map((p) => p.id));
  return PLUGIN_BASES.filter((p) => p.id !== id && before.has(p.id) && !after.has(p.id)).map((p) => p.name);
}

export function settingsTools(): AgentTool[] {
  return [
    defineTool({
      name: 'get_settings',
      title: 'Company settings',
      description: "The company's settings: name and licence number, every plugin (on or off, what it needs, and which is chosen where several do the same job), the company theme and the themes available.",
      input: z.object({}),
      run: (ctx) => ({
        companyName: ctx.db.companyName,
        licenceNumber: ctx.db.companyLicense ?? '',
        plugins: pluginStates(ctx),
        companyTheme: ctx.db.companyLook ?? null,
        themes: themes(),
      }),
    }),

    defineTool({
      name: 'set_plugin',
      title: 'Turn a plugin on or off',
      description: "Turns a plugin (feature) on or off for the whole company. Turning one off hides it everywhere, including other plugins that need it; its records are kept and come back when it's turned on again.",
      input: z.object({ pluginId: z.string(), on: z.boolean() }),
      writes: true,
      confirm: (ctx, { pluginId, on }) => {
        const p = plugin(pluginId);
        if (p.core) throw new Error(`${p.name} is always on.`);
        const choices = normalizeChoices(ctx.db.plugins);
        // turning one on just brings it (and its records) back: no need to ask
        if (on || choices.off.includes(pluginId)) return '';
        const also = dependentsOf(pluginId, choices);
        return `Turn ${p.name} off for everyone in the company?${also.length ? ` ${also.join(', ')} will stop working too, because they need it.` : ''} Its records are kept.`;
      },
      run: async (ctx, { pluginId, on }) => {
        const choices = normalizeChoices(ctx.db.plugins);
        const off = on ? choices.off.filter((x) => x !== pluginId) : [...new Set([...choices.off, pluginId])];
        if (off.length !== choices.off.length) await commit(ctx, { ...ctx.db, plugins: { ...choices, off } }, '');
        return { plugins: pluginStates({ db: { ...ctx.db, plugins: { ...choices, off } } }) };
      },
    }),

    defineTool({
      name: 'choose_plugin',
      title: 'Choose between plugins that do the same job',
      description: 'Where several plugins do the same job (they share a role, e.g. job costing), picks which one the company uses.',
      input: z.object({ role: z.string(), pluginId: z.string() }),
      writes: true,
      confirm: (ctx, { role, pluginId }) => {
        const p = plugin(pluginId);
        if (p.role?.id !== role) throw new Error(`${p.name} doesn't fill the "${role}" role.`);
        const current = chosenFor(role, PLUGIN_BASES, normalizeChoices(ctx.db.plugins));
        return current?.id === pluginId ? '' : `Switch ${p.role.label} from ${current?.name ?? 'none'} to ${p.name} for everyone in the company?`;
      },
      run: async (ctx, { role, pluginId }) => {
        const choices = normalizeChoices(ctx.db.plugins);
        const next: PluginChoices = { roles: { ...choices.roles, [role]: pluginId }, off: choices.off.filter((x) => x !== pluginId) };
        await commit(ctx, { ...ctx.db, plugins: next }, '');
        return { plugins: pluginStates({ db: { ...ctx.db, plugins: next } }) };
      },
    }),

    defineTool({
      name: 'set_company_details',
      title: "Change the company's name or licence number",
      description: 'Changes the company name and/or contractor licence number shown on proposals, invoices and bid requests.',
      input: z.object({ name: z.string().min(1).optional(), licenceNumber: z.string().optional().describe('Empty to remove it') }),
      writes: true,
      confirm: (ctx, { name, licenceNumber }) => {
        const parts = [name !== undefined && name !== ctx.db.companyName ? `the company name to "${name}"` : '', licenceNumber !== undefined ? (licenceNumber ? `the licence number to ${licenceNumber}` : 'remove the licence number') : ''].filter(Boolean);
        return parts.length ? `Change ${parts.join(' and ')}? It shows on every document.` : '';
      },
      run: async (ctx, { name, licenceNumber }) => {
        const next = { ...ctx.db, ...(name ? { companyName: name.trim() } : {}), ...(licenceNumber !== undefined ? { companyLicense: licenceNumber.trim() || undefined } : {}) };
        if (next.companyName !== ctx.db.companyName || next.companyLicense !== ctx.db.companyLicense) await ctx.save(next);
        return { companyName: next.companyName, licenceNumber: next.companyLicense ?? '' };
      },
    }),

    defineTool({
      name: 'set_company_theme',
      title: 'Set the company theme',
      description: "Sets the look everyone starts with until they choose their own (a theme from get_settings, light, dark or follow the device), or removes it. People's own choices aren't changed. Customer documents always print black on white.",
      input: z.object({ theme: z.string().optional().describe('Theme id; leave out with remove'), mode: z.enum(['light', 'dark', 'system']).optional(), remove: z.boolean().optional() }),
      writes: true,
      confirm: (ctx, { theme, mode, remove }) => {
        if (remove) return ctx.db.companyLook ? 'Remove the company theme? People who haven\'t chosen their own look go back to BuildTrack\'s.' : '';
        if (!theme) throw new Error('Give a theme id (get_settings lists them), or remove: true.');
        const t = themes().find((x) => x.id === theme);
        if (!t) throw new Error(`No theme "${theme}". get_settings lists them.`);
        return `Make ${t.name}${mode ? ` (${mode})` : ''} the company theme? Everyone who hasn't chosen their own look switches to it.`;
      },
      run: async (ctx, { theme, mode, remove }) => {
        if (remove) {
          await ctx.save({ ...ctx.db, companyLook: undefined });
          return { companyTheme: null };
        }
        const base: Look = ctx.db.companyLook ?? { theme: 'buildtrack', mode: 'light', accent: 'theme', corners: 'standard', font: 'theme' };
        // a different theme starts clean: colours customised for the old one don't carry over
        const look: Look = { ...base, theme: theme!, mode: mode ?? base.mode, ...(theme !== base.theme ? { accent: 'theme', colors: undefined } : {}) };
        await ctx.save({ ...ctx.db, companyLook: look });
        return { companyTheme: look };
      },
    }),

    defineTool({
      name: 'list_members',
      title: 'Who is in the company',
      description: 'Everyone who can sign in to the company, with their role (owner, admin or member), and invites not yet used, with when they expire.',
      input: z.object({}),
      run: async (ctx) => ({ team: await ctx.rpc<TeamEntry[]>('company_team') }),
    }),

    defineTool({
      name: 'invite_member',
      title: 'Invite someone to the company',
      description: 'Invites someone by email as an admin or member (owners and admins only). The invite works once and expires in 7 days; they sign in with that email to join. It does not email them: tell the person to share BuildTrack\'s address with them.',
      input: z.object({ email: z.string().email(), role: z.enum(['admin', 'member']).default('member') }),
      writes: true,
      confirm: (ctx, { email, role }) => `Invite ${email} to ${ctx.company.name} as ${role === 'admin' ? 'an admin' : 'a member'}? They'll be able to see and change all of the company's data.`,
      run: async (ctx, { email, role }) => ({ invited: email, role, expires: await ctx.rpc<string>('invite_member', { invite_email: email.trim().toLowerCase(), invite_role: role }) }),
    }),

    defineTool({
      name: 'set_member_role',
      title: "Change someone's role or remove them",
      description: "Changes a member's role (owner, admin or member), or removes them from the company with role \"remove\". Owners and admins only; only owners can make or change owners, and the last owner stays.",
      input: z.object({ email: z.string(), role: z.enum(['owner', 'admin', 'member', 'remove']) }),
      writes: true,
      confirm: (ctx, { email, role }) => (role === 'remove' ? `Remove ${email} from ${ctx.company.name}? They'll lose access straight away.` : `Make ${email} ${role === 'admin' ? 'an admin' : `a${role === 'owner' ? 'n' : ''} ${role}`} of ${ctx.company.name}?`),
      run: async (ctx, { email, role }) => {
        const team = await ctx.rpc<TeamEntry[]>('company_team');
        const m = team.find((t) => !t.pending && t.email.toLowerCase() === email.trim().toLowerCase());
        if (!m?.user_id) throw new Error(`${email} isn't a member of the company${team.some((t) => t.pending && t.email.toLowerCase() === email.toLowerCase()) ? ' yet (their invite is open: cancel_invite removes it)' : ''}.`);
        await ctx.rpc('set_member_role', { member: m.user_id, new_role: role === 'remove' ? null : role });
        return role === 'remove' ? { removed: email } : { email, role };
      },
    }),

    defineTool({
      name: 'cancel_invite',
      title: 'Cancel an invite',
      description: "Cancels an invite that hasn't been used yet (owners and admins only).",
      input: z.object({ email: z.string() }),
      writes: true,
      confirm: (_, { email }) => `Cancel the invite for ${email}?`,
      run: async (ctx, { email }) => {
        await ctx.rpc('cancel_invite', { invite_email: email.trim().toLowerCase() });
        return { cancelled: email };
      },
    }),
  ];
}
