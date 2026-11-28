// BuildTrack's own agent tools, on whatever plugins are on: an overview, reading any record the
// company's plugins own, search, and the company's skills (which agents can also change).
import { z } from 'zod';
import type { Db } from '../data';
import { agentSkills, companySkills, defaultSkills, resetSkill, saveSkill, skillMarkdown, SKILL_LIMITS } from '../skills';
import { defineTool, type AgentContext, type AgentTool } from './sdk';

/** Lists every company has, whatever plugins are on. */
const KERNEL_COLLECTIONS = ['team', 'costCodes'];

/** The Db lists agents can read: BuildTrack's own plus those of the plugins that are on. */
export function readableCollections(ctx: Pick<AgentContext, 'plugins'>): string[] {
  return [...new Set([...KERNEL_COLLECTIONS, ...ctx.plugins.flatMap((p) => p.collections ?? [])])];
}

const listOf = (db: Db, collection: string) => ((db as unknown as Record<string, unknown>)[collection] ?? []) as Record<string, unknown>[];

/** A short human name for any record, for search results. */
function labelOf(r: Record<string, unknown>): string {
  const s = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : '');
  const person = [s('firstName'), s('lastName')].filter(Boolean).join(' ');
  return [s('kind'), s('number')].filter(Boolean).join(' ') || s('name') || person || s('title') || s('description') || s('id');
}

export function kernelTools(ctx: AgentContext): AgentTool[] {
  const collections = readableCollections(ctx);
  const collection = z.enum(collections as [string, ...string[]]).describe('Which kind of record');

  return [
    defineTool({
      name: 'company_overview',
      title: 'Company overview',
      description: 'Start here. The company, who you are acting for, which BuildTrack features (plugins) are on, how many of each kind of record there are, the jobs with their status, and the skills available.',
      input: z.object({}),
      run: ({ db, company, user, plugins }) => ({
        company: company.name,
        actingFor: user,
        plugins: plugins.map((p) => ({ id: p.id, name: p.name, description: p.description })),
        records: Object.fromEntries(collections.map((c) => [c, listOf(db, c).length])),
        jobs: db.jobs.map((j) => ({ id: j.id, name: j.name, status: j.status, start: j.start, end: j.end })),
        skills: agentSkills(db, plugins).map((s) => ({ name: s.name, description: s.description })),
      }),
    }),

    defineTool({
      name: 'list_records',
      title: 'List records',
      description: `Records of one kind, optionally filtered by exact field values (e.g. {"jobId": "j12"} or {"status": "Sent"}). Returns at most \`limit\` records starting at \`offset\`, and the total that matched. Kinds: ${collections.join(', ')}.`,
      input: z.object({
        collection,
        where: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe('Field values the records must have'),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }),
      run: ({ db }, { collection, where, limit, offset }) => {
        const matches = listOf(db, collection).filter((r) => Object.entries(where ?? {}).every(([k, v]) => r[k] === v));
        return { collection, total: matches.length, offset, records: matches.slice(offset, offset + limit) };
      },
    }),

    defineTool({
      name: 'get_record',
      title: 'Get a record',
      description: 'One record by its kind and id, with every field.',
      input: z.object({ collection, id: z.string() }),
      run: ({ db }, { collection, id }) => {
        const r = listOf(db, collection).find((x) => x.id === id);
        if (!r) throw new Error(`No ${collection} record with id "${id}".`);
        return r;
      },
    }),

    defineTool({
      name: 'search_records',
      title: 'Search records',
      description: 'Finds records whose text contains the words given (names, numbers, titles, notes, emails…), across every kind or one. Returns the kind, id and a short label for each, best matches first.',
      input: z.object({ text: z.string().min(1), collection: collection.optional(), limit: z.number().int().min(1).max(100).default(25) }),
      run: ({ db }, { text, collection: only, limit }) => {
        const words = text.toLowerCase().split(/\s+/).filter(Boolean);
        const hits: { collection: string; id: string; label: string; score: number }[] = [];
        for (const c of only ? [only] : collections) {
          for (const r of listOf(db, c)) {
            const label = labelOf(r);
            const all = JSON.stringify(r).toLowerCase();
            if (!words.every((w) => all.includes(w))) continue;
            const inLabel = words.filter((w) => label.toLowerCase().includes(w)).length;
            hits.push({ collection: c, id: String(r.id), label, score: inLabel });
          }
        }
        hits.sort((a, b) => b.score - a.score);
        return { total: hits.length, results: hits.slice(0, limit).map(({ score: _, ...h }) => h) };
      },
    }),

    defineTool({
      name: 'list_skills',
      title: 'List skills',
      description: "The company's skills: written know-how for working with BuildTrack, each with when to use it. Includes BuildTrack's defaults (as the company has changed them), the company's own, and any it has turned off.",
      input: z.object({}),
      run: ({ db, plugins }) => companySkills(db, plugins).map((s) => ({ name: s.name, description: s.description, status: s.status, from: s.sourceName ?? 'the company', updated: s.updated, updatedBy: s.updatedBy })),
    }),

    defineTool({
      name: 'read_skill',
      title: 'Read a skill',
      description: 'The full text of one skill (its SKILL.md). Read the matching skill before a task it covers.',
      input: z.object({ name: z.string() }),
      run: ({ db, plugins }, { name }) => {
        const s = companySkills(db, plugins).find((x) => x.name === name);
        if (!s) throw new Error(`No skill called "${name}". list_skills shows them all.`);
        return { status: s.status, markdown: skillMarkdown(s) };
      },
    }),

    defineTool({
      name: 'save_skill',
      title: 'Save a skill',
      description: `Changes one of the company's skills, or adds a new one. Use when the person asks you to change how something is done or to remember a way of working. Changing one of BuildTrack's default skills saves the company's own copy (reset_skill goes back to the default). Set off to stop agents using a skill. Name: lowercase words joined by hyphens. Body: Markdown, without front matter, at most ${SKILL_LIMITS.body.toLocaleString()} characters. Show the person what you're about to save first.`,
      input: z.object({
        name: z.string().describe('e.g. "progress-billing"'),
        description: z.string().describe('What it covers and when to use it'),
        body: z.string().describe('The skill in Markdown'),
        off: z.boolean().optional().describe('Turn the skill off for agents'),
      }),
      writes: true,
      run: async (ctx, args) => {
        const next = saveSkill(ctx.db, ctx.plugins, args, `${ctx.user.name}'s agent`);
        await ctx.save(next);
        const isDefault = defaultSkills(ctx.plugins).some((d) => d.name === args.name);
        return { saved: args.name, as: isDefault ? 'the company copy of a default skill' : 'one of the company skills', off: !!args.off };
      },
    }),

    defineTool({
      name: 'reset_skill',
      title: 'Reset or delete a skill',
      description: "Puts one of BuildTrack's default skills back to BuildTrack's version, or deletes one of the company's own skills. Confirm with the person first.",
      input: z.object({ name: z.string() }),
      writes: true,
      run: async (ctx, { name }) => {
        if (!(ctx.db.skills ?? []).some((r) => r.name === name)) throw new Error(`"${name}" hasn't been changed, so there's nothing to reset.`);
        await ctx.save(resetSkill(ctx.db, name));
        const isDefault = defaultSkills(ctx.plugins).some((d) => d.name === name);
        return { [isDefault ? 'reset' : 'deleted']: name };
      },
    }),
  ];
}
