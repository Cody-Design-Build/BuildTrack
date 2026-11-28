// Which plugins are installed and which are on. Kernel code imports only this file (never a
// plugin), so a plugin can be swapped without touching anything that uses its contracts.
//
// On/off choices are company-wide: they live in the data (db.plugins), so everyone on the team
// sees the same modules. <PluginChoicesSync> in main.tsx passes them in here.
import { useSyncExternalStore } from 'react';
import type { Db, PluginChoices } from '../data';
import type { CostEntry, Plugin } from './sdk';
import { activeOf, chosenFor, normalizeChoices, NO_CHOICES } from './activation';

let installed: Plugin[] = [];
let choices: PluginChoices = NO_CHOICES;
let input: PluginChoices | undefined;
let active: Plugin[] = [];
const listeners = new Set<() => void>();

/** The plugin chosen for a role: the saved choice if it's installed, otherwise the first one. */
export const roleChoice = (role: string, list = installed): Plugin | undefined => chosenFor(role, list, choices);

function compute() {
  active = activeOf(installed, choices);
}

/** Use the company's saved choices (called whenever db.plugins changes). */
export function setChoices(next: PluginChoices | undefined) {
  if (next === input) return;
  input = next;
  choices = normalizeChoices(next);
  compute();
  listeners.forEach((l) => l());
}

/** Called once at start-up with every installed plugin (src/plugins/index.ts). */
export function registerPlugins(list: Plugin[]) {
  const seen = new Set<string>();
  for (const p of list) {
    if (seen.has(p.id)) throw new Error(`Two plugins have the id ${p.id}`);
    seen.add(p.id);
  }
  installed = list;
  compute();
}

export const installedPlugins = () => installed;
export const activePlugins = () => active;
export const isOn = (id: string) => active.some((p) => p.id === id);
/** Whether the user has this plugin switched on (it may still be off if something it needs is off). */
export const isSwitchedOn = (id: string) => !choices.off.includes(id);

export function usePlugins(): Plugin[] {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => active,
  );
}

/** The choices with one plugin switched on or off. Save the result to db.plugins. */
export function withPluginOn(id: string, on: boolean): PluginChoices {
  return { ...choices, off: on ? choices.off.filter((x) => x !== id) : [...new Set([...choices.off, id])] };
}

/** The choices with a plugin picked for its role. Save the result to db.plugins. */
export function withRoleChoice(role: string, id: string): PluginChoices {
  return { ...choices, roles: { ...choices.roles, [role]: id }, off: choices.off.filter((x) => x !== id) };
}

/** Why a switched-on plugin isn't running, e.g. "Needs Budgets". */
export function blockedBy(p: Plugin): string[] {
  const ids = new Set(active.map((x) => x.id));
  return (p.requires ?? []).filter((r) => !ids.has(r)).map((r) => installed.find((x) => x.id === r)?.name ?? r);
}

/** Installed plugins that need this one. */
export const dependents = (id: string) => installed.filter((p) => p.requires?.includes(id));

// ── Contracts ──────────────────────────────────────────────────────────────────────────────

/** Every costs/v1 entry from the plugins that are on. */
export function costEntries(db: Db, jobId?: string): CostEntry[] {
  return active.flatMap((p) => p.costEntries?.(db, jobId) ?? []);
}

/** Every file id any installed plugin still uses. */
export function filesInUse(db: Db): string[] {
  return installed.flatMap((p) => p.filesInUse?.(db) ?? []);
}

/** Let every installed plugin tidy its records when a person or company is deleted. */
export function partyRemoved(db: Db, partyId: string): Db {
  return installed.reduce((d, p) => (p.removeParty ? p.removeParty(d, partyId) : d), db);
}
