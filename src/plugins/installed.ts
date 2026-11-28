// Installed plugins: plugins a company adds without rebuilding BuildTrack (Settings → Plugins →
// Install). Each is one record in db.installedPlugins holding its code and a copy of what it
// declares (the manifest), so the agent server can offer its records and skills without ever
// running its code. Only owners and admins can add, change or remove these records (the access
// rules in supabase/migrations/20261128090000_plugin_admins.sql).
//
// No React or browser code here: the agent server uses it too.
import type { Db, SkillRecord } from '../data';
import type { Plugin, PluginBase, SkillDefault } from './sdk';

/** How an installed plugin runs. */
export type Trust =
  /** Inside the app, like BuildTrack's own plugins: it can do anything the person using it can. */
  | 'full'
  /** In a sandboxed frame: it sees only the records it declared and can't reach anything else. */
  | 'sandboxed';

/** What a plugin says about itself: everything but its code. */
export interface PluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  apiVersion: number;
  requires?: string[];
  role?: { id: string; label: string };
  collections?: string[];
  reads?: string[];
  writes?: string[];
  skills?: SkillDefault[];
  /** What it adds, for the install screen and Settings → Plugins (e.g. "Punch list in the menu"). */
  adds?: string[];
  /** Where its screens go, so a sandboxed plugin's menu items and pages can be set up without running it. */
  ui?: PluginSlots;
}

/** A plugin's screens, without the screens themselves. */
export interface PluginSlots {
  nav?: { to: string; label: string; icon?: string; group: 'work' | 'records' | 'insights'; order: number }[];
  routes?: { path: string }[];
  jobTabs?: { id: string; label: string; order: number }[];
  jobSummary?: { order: number }[];
  accountSections?: { id: string; order: number }[];
}

export interface InstalledPlugin {
  id: string; // the plugin's id, so there's one record per plugin
  manifest: PluginManifest;
  /** The plugin's JavaScript module (see docs/plugins.md). */
  code: string;
  /** Styles it brings (built by `npm run plugin -- build`). */
  css?: string;
  trust: Trust;
  installed: string; // local date and time
  installedBy: string; // name
  updated?: string;
  updatedBy?: string;
}

/**
 * A plugin someone (usually an agent) has written and proposed. Anyone can propose one; only an
 * owner or admin can install it, from Settings → Plugins.
 */
export interface PluginProposal {
  id: string;
  manifest: PluginManifest;
  code: string;
  css?: string;
  note: string; // what it's for, from whoever proposed it
  proposed: string;
  proposedBy: string;
}

/** The plugin kit version this build of BuildTrack offers (see kit.ts). Bump on breaking changes only. */
export const KIT_API_VERSION = 1;

/** Lists the core app keeps, which no installed plugin may claim as its own. */
const isNamespaced = (pluginId: string, collection: string) => collection.startsWith(pluginId + '.') && collection.length > pluginId.length + 1;

/** What a plugin adds to the app, in plain words. */
export function addsOf(p: Partial<Plugin>): string[] {
  const out: string[] = [];
  const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  if (p.nav?.length) out.push(`${p.nav.map((n) => n.label).join(', ')} in the menu`);
  if (p.routes?.length) out.push(plural(p.routes.length, 'page'));
  if (p.jobTabs?.length) out.push(`${p.jobTabs.map((t) => t.label).join(', ')} tab on jobs`);
  if (p.jobSummary?.length) out.push('rows on the job Overview');
  if (p.accountSections?.length) out.push(plural(p.accountSections.length, 'section') + ' on company pages');
  if (p.costEntries) out.push('costs for job costing');
  if (p.skills?.length) out.push(plural(p.skills.length, 'skill') + ' for agents');
  return out;
}

/** The manifest of a loaded plugin module. `iconName` names a menu icon (see kit-icons.ts). */
export function manifestOf(p: Plugin, iconName: (icon: unknown) => string | undefined = () => undefined): PluginManifest {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    version: p.version ?? '0.0.0',
    author: p.author,
    apiVersion: p.apiVersion ?? KIT_API_VERSION,
    requires: p.requires,
    role: p.role,
    collections: p.collections as string[] | undefined,
    reads: p.reads as string[] | undefined,
    writes: p.writes as string[] | undefined,
    skills: p.skills,
    adds: addsOf(p),
    ui: {
      nav: p.nav?.map((n) => ({ to: n.to, label: n.label, icon: iconName(n.icon), group: n.group, order: n.order })),
      routes: p.routes?.map((r) => ({ path: r.path })),
      jobTabs: p.jobTabs?.map((t) => ({ id: t.id, label: t.label, order: t.order })),
      jobSummary: p.jobSummary?.map((s) => ({ order: s.order })),
      accountSections: p.accountSections?.map((s) => ({ id: s.id, order: s.order })),
    },
  };
}

/**
 * Problems that stop a plugin being installed, in plain words (empty when it's fine).
 * `builtIn` are BuildTrack's own plugin ids; `skillNames` the skill names already taken.
 */
export function problemsWith(m: PluginManifest, builtIn: string[], skillNames: string[] = []): string[] {
  const out: string[] = [];
  if (!m.id || !/^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/.test(m.id))
    out.push(`Its id "${m.id ?? ''}" isn't valid: use your own prefix, lowercase, e.g. "acme.punch-list".`);
  if (m.id?.startsWith('buildtrack.') || builtIn.includes(m.id)) out.push(`"${m.id}" is one of BuildTrack's own plugin ids. Give it your own prefix.`);
  if (!m.name?.trim()) out.push('It has no name.');
  if (m.apiVersion > KIT_API_VERSION) out.push(`It needs a newer BuildTrack (plugin kit ${m.apiVersion}; this one has ${KIT_API_VERSION}).`);
  for (const c of m.collections ?? []) {
    if (!isNamespaced(m.id, c)) out.push(`Its records "${c}" must be named after the plugin, e.g. "${m.id}.items".`);
  }
  for (const s of m.skills ?? []) {
    if (skillNames.includes(s.name)) out.push(`Its skill "${s.name}" has the same name as one BuildTrack already has.`);
  }
  return out;
}

/** An installed plugin as the agent server sees it: what it declares, no code. */
export function baseOf(rec: InstalledPlugin): PluginBase {
  const m = rec.manifest;
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    version: m.version,
    author: m.author,
    requires: m.requires,
    role: m.role,
    collections: m.collections,
    reads: m.reads as PluginBase['reads'],
    writes: m.writes as PluginBase['writes'],
    skills: m.skills,
    apiVersion: m.apiVersion,
  };
}

/** BuildTrack's own plugins plus the company's installed ones (bases only). */
export function allBases(builtIn: PluginBase[], db: Pick<Db, 'installedPlugins'>): PluginBase[] {
  const ids = new Set(builtIn.map((p) => p.id));
  return [...builtIn, ...(db.installedPlugins ?? []).filter((r) => r?.manifest && !ids.has(r.id)).map(baseOf)];
}

/** Everything a removed plugin leaves behind: its own lists, and changes to its skills. */
export function withoutPluginData(db: Db, rec: InstalledPlugin): Db {
  const next = { ...db } as Record<string, unknown>;
  for (const c of rec.manifest.collections ?? []) delete next[c];
  const out = next as unknown as Db;
  if (db.skills) out.skills = db.skills.filter((s: SkillRecord) => s.plugin !== rec.id);
  return out;
}
