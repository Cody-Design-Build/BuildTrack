// Which plugins are on, given the company's choices. Pure, so the app (registry.ts) and the agent
// server (src/agent/) work it out the same way.
import type { PluginChoices } from '../data';

type Activatable = { id: string; core?: boolean; role?: { id: string }; requires?: string[] };

export const NO_CHOICES: PluginChoices = { off: [], roles: {} };

/** Saved choices, tidied (older or hand-edited data may be missing parts). */
export function normalizeChoices(c: PluginChoices | undefined): PluginChoices {
  const x = c ?? NO_CHOICES;
  return { off: Array.isArray(x.off) ? x.off : [], roles: x.roles && typeof x.roles === 'object' ? x.roles : {} };
}

/** The plugin chosen for a role: the saved choice if it's installed, otherwise the first one. */
export function chosenFor<T extends Activatable>(role: string, installed: T[], choices: PluginChoices): T | undefined {
  const candidates = installed.filter((p) => p.role?.id === role);
  return candidates.find((p) => p.id === choices.roles[role]) ?? candidates[0];
}

/** The plugins that are on: switched on, chosen for their role, and with everything they need on. */
export function activeOf<T extends Activatable>(installed: T[], choices: PluginChoices): T[] {
  let on = installed.filter((p) => p.core || !choices.off.includes(p.id));
  on = on.filter((p) => !p.role || chosenFor(p.role.id, installed, choices) === p);
  // drop anything whose requirements are off, until nothing changes
  for (let changed = true; changed; ) {
    const ids = new Set(on.map((p) => p.id));
    const next = on.filter((p) => p.core || (p.requires ?? []).every((r) => ids.has(r)));
    changed = next.length !== on.length;
    on = next;
  }
  return on;
}
