// Agent tools for tasks (server only, see src/agent/sdk.ts).
import { z } from 'zod';
import { checkParty, commit, defineTool, find, findJob, names, type PluginTools } from '../../agent/sdk';
import type { Task } from '../../data';
import { uid } from '../../model';

export default {
  plugin: 'buildtrack.tasks',
  tools: [
    defineTool({
      name: 'create_task',
      title: 'Add a task',
      description: 'Adds a to-do for the team, optionally on a job, about a person or account, with a due date, a type and who it is assigned to (team member ids from collection "team").',
      input: z.object({
        name: z.string().min(1),
        jobId: z.string().optional(),
        partyId: z.string().optional().describe('Person or account it is about'),
        due: z.string().optional().describe('yyyy-mm-dd'),
        type: z.string().optional().describe('e.g. "Call", "Site visit" (types already in use are in tasks)'),
        assigneeIds: z.array(z.string()).optional(),
      }),
      writes: true,
      run: async (ctx, a) => {
        if (a.jobId) findJob(ctx.db, a.jobId);
        if (a.partyId) checkParty(ctx.db, a.partyId);
        for (const id of a.assigneeIds ?? []) find(ctx.db.team, id, 'team member', 'list_records with collection "team" lists them.');
        const task: Task = { id: uid('t'), name: a.name.trim(), partyId: a.partyId ?? '', jobId: a.jobId ?? '', due: a.due ?? '', type: a.type ?? '', assignees: a.assigneeIds ?? [], done: false };
        await commit(ctx, { ...ctx.db, tasks: [...ctx.db.tasks, task] }, '');
        return { ...task, job: names(ctx.db).job(task.jobId) };
      },
    }),
    defineTool({
      name: 'complete_task',
      title: 'Tick off a task',
      description: 'Marks a task done (or not done again).',
      input: z.object({ taskId: z.string(), done: z.boolean().default(true) }),
      writes: true,
      run: async (ctx, { taskId, done }) => {
        const t = find(ctx.db.tasks, taskId, 'task');
        if (t.done === done) return { ...t, unchanged: true };
        const next = { ...t, done };
        await commit(ctx, { ...ctx.db, tasks: ctx.db.tasks.map((x) => (x.id === taskId ? next : x)) }, '');
        return next;
      },
    }),
  ],
} satisfies PluginTools;
