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

/** The job, or a readable error an agent can act on. */
export function findJob(db: Db, jobId: string) {
  const job = db.jobs.find((j) => j.id === jobId);
  if (!job) throw new Error(`No job with id "${jobId}". Use search_records or list_records with collection "jobs" to find it.`);
  return job;
}
