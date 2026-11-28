// Small helpers used everywhere: by the screens, by the plugins' rules and by the agent server
// (src/agent/). Plain TypeScript with no browser or React dependencies, so it runs anywhere.
import type { Db, TeamMember } from './data';
import { signedInAccount } from './session';

/** The local date and time as "yyyy-mm-ddThh:mm:ss" (no time zone), the format all stored dates use. */
export const localIso = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export const uid = (p: string) => p + Math.random().toString(36).slice(2, 9);

export const money = (n: number, cents = false) =>
  (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });

/** A percentage to one decimal place, or a dash when there isn't one (e.g. margin on $0). */
export const pct = (n: number) => (Number.isFinite(n) ? `${Math.round(n * 10) / 10}%` : '—');

/**
 * The person using the app: on shared data, the team member whose email is the signed-in
 * account's (CloudGate adds one on first sign-in); otherwise the first team member, as the
 * sample data and the demo expect.
 */
export function meOf(db: Db): TeamMember | undefined {
  const account = signedInAccount();
  if (!account) return db.team[0];
  return db.team.find((t) => t.email?.toLowerCase() === account.email);
}

/** Cost and price of one budget line. */
export const lineCost = (i: { quantity: number; unitCost: number }) => i.quantity * i.unitCost;
export const linePrice = (i: { quantity: number; unitCost: number; markup: number }) => lineCost(i) * (1 + i.markup / 100);
