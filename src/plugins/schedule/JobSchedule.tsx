// The Schedule tab on a job.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { Job, ScheduleEntry } from '../../data';
import { useStore } from '../../store';
import { ScheduleEntryForm, ScheduleTable } from './Schedule';

export function JobSchedule({ job }: { job: Job }) {
  const { db } = useStore();
  const [editing, setEditing] = useState<ScheduleEntry | 'new' | null>(null);
  const entries = db.scheduleEntries.filter((t) => t.jobId === job.id).sort((a, b) => a.start.localeCompare(b.start));
  return (
    <div>
      <div className="toolbar j-tab-bar">
        <button type="button" className="btn" onClick={() => setEditing('new')}><Plus size={14} /> Schedule Entry</button>
        <span className="grow" />
        <Link to="/schedule" className="btn">See all jobs on the schedule</Link>
      </div>
      <ScheduleTable entries={entries} onEdit={setEditing} />
      {editing && <ScheduleEntryForm entry={editing === 'new' ? undefined : editing} presetJobId={job.id} onClose={() => setEditing(null)} />}
    </div>
  );
}
