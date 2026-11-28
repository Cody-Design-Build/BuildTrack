// Tools for AI agents. Each plugin can offer tools in its own tools.ts; BuildTrack's own are in
// src/agent/tools.ts. The agent server (src/agent/server.ts) offers an agent the tools of the
// plugins that are on for its company, worked out fresh on every request, so a new tool or a
// plugin switched on reaches every agent without anyone reinstalling anything.
//
// These files run only on the server (they use zod); the app never loads them.
import type { z } from 'zod';
import type { Db } from '../data';
import type { PluginBase } from '../plugins/sdk';

export interface AgentContext {
  /** The company's data, as it was when the request came in. */
  db: Db;
  /** The plugins that are on for this company. */
  plugins: PluginBase[];
  company: { id: string; name: string };
  /** Who the agent is acting for. */
  user: { email: string; name: string };
  /** Saves the changes between ctx.db and `next` as the signed-in person, under the same access rules as the app. */
  save(next: Db): Promise<void>;
  /** Calls a database function as the signed-in person (team changes go through these, e.g. invite_member). */
  rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T>;
}

export interface AgentTool<S extends z.ZodObject = z.ZodObject> {
  /** Letters, numbers and underscores, e.g. 'job_costs'. Unique across all plugins. */
  name: string;
  title: string;
  /** What it does and when to use it. Agents choose tools by this, so be specific. */
  description: string;
  input: S;
  /** Changes data. Tools without it are marked read-only, so agents may run them without asking. */
  writes?: boolean;
  /**
   * For changes that matter (sending, approving, paying, team changes): what will happen, in a
   * sentence the person can say yes or no to. The server asks the person before running the tool:
   * with a form in the agent (MCP elicitation) where the client supports it, otherwise by making
   * the agent show it and call again with `confirmed: true`. Return '' to skip asking this time.
   * Throw here, too, when the change isn't allowed, so nobody is asked about something that would fail.
   */
  confirm?(ctx: AgentContext, args: z.infer<S>): string;
  /**
   * Must work out the new data synchronously before its first await: the server sets the signed-in
   * person and the company's plugins for the shared rules (activity "by", contracts) just before.
   */
  run(ctx: AgentContext, args: z.infer<S>): unknown | Promise<unknown>;
}

export const defineTool = <S extends z.ZodObject>(t: AgentTool<S>): AgentTool => t as unknown as AgentTool;

/** A plugin's tools, keyed to the plugin they belong to. */
export interface PluginTools {
  plugin: string;
  tools: AgentTool[];
}

/** Common lookups for tool results: names instead of ids. */
export function names(db: Db) {
  const job = new Map(db.jobs.map((j) => [j.id, j.name] as const));
  const party = new Map<string, string>([
    ...db.accounts.map((a) => [a.id, a.name] as const),
    ...db.people.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim()] as const),
  ]);
  const code = new Map(db.costCodes.map((c) => [c.id, `${c.number} ${c.name}`] as const));
  return {
    job: (id: string) => job.get(id) ?? '',
    party: (id: string) => party.get(id) ?? '',
    code: (id: string) => (id ? code.get(id) ?? '' : 'Not coded'),
  };
}

/**
 * Saves a change made with a plugin's rules. Those rules return the data unchanged when the change
 * isn't allowed (e.g. editing a sent invoice), so that becomes an error with the reason given.
 */
export async function commit(ctx: AgentContext, next: Db, refused: string) {
  if (next === ctx.db) throw new Error(refused);
  await ctx.save(next);
}

/** A record by id, or a readable error. */
export function find<T extends { id: string }>(list: T[], id: string, what: string, hint = ''): T {
  const r = list.find((x) => x.id === id);
  if (!r) throw new Error(`No ${what} with id "${id}".${hint ? ` ${hint}` : ''}`);
  return r;
}

/** The job, or a readable error an agent can act on. */
export function findJob(db: Db, jobId: string) {
  const job = db.jobs.find((j) => j.id === jobId);
  if (!job) throw new Error(`No job with id "${jobId}". Use search_records or list_records with collection "jobs" to find it.`);
  return job;
}

/** The job's customer (the person or account linked as Customer), or ''. */
export const jobCustomer = (db: Db, jobId: string) => db.jobLinks.find((l) => l.jobId === jobId && l.role === 'Customer')?.partyId ?? '';

/** Throws unless the id is a cost code ('' is allowed: not coded). */
export function checkCostCode(db: Db, id: string) {
  if (id && !db.costCodes.some((c) => c.id === id)) throw new Error(`No cost code with id "${id}". list_records with collection "costCodes" lists them.`);
}

/** Throws unless the id is a person or account. */
export function checkParty(db: Db, id: string, what = 'person or account') {
  if (id && !db.people.some((p) => p.id === id) && !db.accounts.some((a) => a.id === id)) throw new Error(`No ${what} with id "${id}". Use search_records to find them.`);
}

/** "$1,234.50" for confirmation messages. */
export const usd = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
