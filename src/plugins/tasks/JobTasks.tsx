// The Tasks tab on a job.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { Job } from '../../data';
import { useLookups, useStore } from '../../store';
import { TaskForm } from '../../components/Forms';

export function JobTasks({ job }: { job: Job }) {
  const { db, update } = useStore();
  const L = useLookups();
  const [adding, setAdding] = useState(false);
  const tasks = db.tasks.filter((t) => t.jobId === job.id);
  return (
    <div>
      <div className="toolbar j-tab-bar">
        <button type="button" className="btn" onClick={() => setAdding(true)}><Plus size={14} /> Task</button>
      </div>
      <div className="table-wrap">
        <table className="grid-table j-table">
          <thead><tr><th className="center">✓</th><th>Name</th><th>Due</th><th>Type</th><th>Assignees</th></tr></thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className={t.done ? 'done' : ''}>
                <td className="center"><input type="checkbox" checked={t.done} aria-label="Done" onChange={() => update((d) => ({ ...d, tasks: d.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) }))} /></td>
                <td><Link to={`/tasks?id=${t.id}`}>{t.name}</Link></td>
                <td>{t.due}</td>
                <td>{t.type}</td>
                <td>{t.assignees.map((a) => L.team.get(a)?.name).filter(Boolean).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tasks.length === 0 && <div className="wt-empty">No tasks for this job.</div>}
      </div>
      {adding && <TaskForm presetPartyId={L.customers(job.id)[0]?.id} presetJobId={job.id} onClose={() => setAdding(false)} />}
    </div>
  );
}
