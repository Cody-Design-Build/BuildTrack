// Agent tools for jobs (server only, see src/agent/sdk.ts).
import { z } from 'zod';
import { checkParty, commit, defineTool, findJob, names, type PluginTools } from '../../agent/sdk';
import { JOB_ROLES, JOB_STATUSES, type Job, type JobStatus } from '../../data';
import { localIso, uid } from '../../model';

const STATUS = z.enum(JOB_STATUSES.map((s) => s.name) as [JobStatus, ...JobStatus[]]);

export default {
  plugin: 'buildtrack.jobs',
  tools: [
    defineTool({
      name: 'create_job',
      title: 'Add a job',
      description: 'Adds a job (a lead, an estimate or work under way), optionally with its customer (a person or account id).',
      input: z.object({
        name: z.string().min(1).describe('e.g. "Oak Avenue Bathrooms"'),
        address: z.string().optional().describe('The job site'),
        status: STATUS.optional().describe('Default Lead'),
        customerId: z.string().optional(),
        start: z.string().optional().describe('yyyy-mm-dd'),
        end: z.string().optional().describe('yyyy-mm-dd'),
      }),
      writes: true,
      run: async (ctx, a) => {
        if (ctx.db.jobs.some((j) => j.name.trim().toLowerCase() === a.name.trim().toLowerCase())) throw new Error(`There's already a job called "${a.name}".`);
        if (a.customerId) checkParty(ctx.db, a.customerId, 'customer');
        const today = localIso().slice(0, 10);
        const job: Job = { id: uid('j'), name: a.name.trim(), address: a.address ?? '', status: a.status ?? 'Lead', total: 0, projectedCost: 0, start: a.start ?? today, end: a.end ?? a.start ?? today, progress: 0 };
        const links = a.customerId ? [...ctx.db.jobLinks, { id: uid('l'), jobId: job.id, partyId: a.customerId, role: 'Customer' }] : ctx.db.jobLinks;
        await commit(ctx, { ...ctx.db, jobs: [...ctx.db.jobs, job], jobLinks: links }, '');
        return job;
      },
    }),
    defineTool({
      name: 'update_job',
      title: 'Change a job',
      description: "Changes a job's status, name, address, dates or percent complete.",
      input: z.object({
        jobId: z.string(),
        status: STATUS.optional(),
        name: z.string().optional(),
        address: z.string().optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        progress: z.number().min(0).max(100).optional(),
      }),
      writes: true,
      run: async (ctx, { jobId, ...patch }) => {
        const job = findJob(ctx.db, jobId);
        const next = { ...job, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
        await commit(ctx, { ...ctx.db, jobs: ctx.db.jobs.map((j) => (j.id === jobId ? next : j)) }, '');
        return next;
      },
    }),
    defineTool({
      name: 'link_to_job',
      title: 'Put someone on a job',
      description: `Links a person or account to a job with a role, e.g. Architect or Subcontractor. Roles: ${JOB_ROLES.join(', ')} (or another).`,
      input: z.object({ jobId: z.string(), partyId: z.string(), role: z.string() }),
      writes: true,
      run: async (ctx, { jobId, partyId, role }) => {
        findJob(ctx.db, jobId);
        checkParty(ctx.db, partyId);
        if (ctx.db.jobLinks.some((l) => l.jobId === jobId && l.partyId === partyId && l.role === role)) throw new Error('They are already on the job in that role.');
        const link = { id: uid('l'), jobId, partyId, role: role.trim() };
        await commit(ctx, { ...ctx.db, jobLinks: [...ctx.db.jobLinks, link] }, '');
        const n = names(ctx.db);
        return { ...link, job: n.job(jobId), who: n.party(partyId) };
      },
    }),
  ],
} satisfies PluginTools;
