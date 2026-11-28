// Punch list: an example BuildTrack plugin, installed without changing BuildTrack.
// Items to finish before a job closes out, on their own page and as a tab on each job.
//   npm run plugin -- dev plugins/punch-list     try it with `npm run dev`
//   npm run plugin -- build plugins/punch-list   the file to install (Settings → Plugins)
// See docs/plugins.md.
import { useState } from 'react';
import { definePlugin, useData, useRecords, useLocation, Link, Page, Section, Row, Empty, Field, Modal, ui, icons, uid, today } from '@buildtrack/sdk';
import type { Job } from '../../src/data';

interface Item {
  id: string;
  jobId: string;
  text: string;
  location: string; // e.g. "Master bath"
  done: boolean;
  created: string; // yyyy-mm-dd
}

const ITEMS = 'example.punch-list.items';

function AddItem({ jobId, onClose }: { jobId?: string; onClose: () => void }) {
  const items = useRecords<Item>(ITEMS);
  const { jobs } = useData<{ jobs: Job[] }>();
  const [job, setJob] = useState(jobId ?? jobs[0]?.id ?? '');
  const [text, setText] = useState('');
  const [location, setLocation] = useState('');
  const save = () => {
    items.add({ id: uid('pl'), jobId: job, text: text.trim(), location: location.trim(), done: false, created: today() });
    onClose();
  };
  return (
    <Modal title="Punch list item" onClose={onClose}>
      {!jobId && (
        <Field label="Job">
          <ui.Select value={job} onValueChange={setJob}>
            <ui.SelectTrigger className="w-full"><ui.SelectValue /></ui.SelectTrigger>
            <ui.SelectContent>{jobs.map((j) => <ui.SelectItem key={j.id} value={j.id}>{j.name}</ui.SelectItem>)}</ui.SelectContent>
          </ui.Select>
        </Field>
      )}
      <Field label="What needs doing"><ui.Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Touch up paint by the back door" /></Field>
      <Field label="Where"><ui.Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Kitchen" /></Field>
      <div className="row-end">
        <ui.Button variant="outline" onClick={onClose}>Cancel</ui.Button>
        <ui.Button disabled={!text.trim() || !job} onClick={save}>Add</ui.Button>
      </div>
    </Modal>
  );
}

function ItemRow({ item, showJob }: { item: Item; showJob?: boolean }) {
  const items = useRecords<Item>(ITEMS);
  const { jobs } = useData<{ jobs: Job[] }>();
  const job = jobs.find((j) => j.id === item.jobId);
  return (
    <Row>
      <ui.Checkbox checked={item.done} onCheckedChange={(v) => items.update(item.id, { done: v === true })} aria-label="Done" />
      <div className="min-w-0 flex-1">
        <div className={item.done ? 'text-muted-foreground line-through' : ''}>{item.text}</div>
        <div className="text-xs text-muted-foreground">
          {[item.location, showJob && job ? job.name : ''].filter(Boolean).join(' · ') || ' '}
        </div>
      </div>
      {showJob && job && <Link to={`/jobs?job=${job.id}&tab=punch-list`} className="text-xs text-muted-foreground underline">Job</Link>}
      <ui.Button variant="ghost" size="sm" onClick={() => items.remove(item.id)} aria-label="Remove"><icons.Trash2 className="size-4" /></ui.Button>
    </Row>
  );
}

function PunchListPage() {
  const items = useRecords<Item>(ITEMS);
  const { query } = useLocation();
  const [adding, setAdding] = useState(false);
  const showDone = query.get('done') === '1';
  const open = items.items.filter((i) => !i.done);
  const done = items.items.filter((i) => i.done);
  return (
    <Page title="Punch list" actions={<ui.Button onClick={() => setAdding(true)}><icons.Plus className="size-4" /> Item</ui.Button>}>
      <Section title="Open" count={open.length}>
        {open.length === 0 ? <Empty>Nothing left to do.</Empty> : open.map((i) => <ItemRow key={i.id} item={i} showJob />)}
      </Section>
      {done.length > 0 && (
        <Section title="Done" count={done.length} action={<Link to={showDone ? '/punch-list' : '/punch-list?done=1'} className="text-sm underline">{showDone ? 'Hide' : 'Show'}</Link>}>
          {showDone ? done.map((i) => <ItemRow key={i.id} item={i} showJob />) : <Empty>{done.length} finished.</Empty>}
        </Section>
      )}
      {adding && <AddItem onClose={() => setAdding(false)} />}
    </Page>
  );
}

function JobPunchList({ job }: { job: Job }) {
  const items = useRecords<Item>(ITEMS);
  const [adding, setAdding] = useState(false);
  const mine = items.items.filter((i) => i.jobId === job.id);
  return (
    <div className="space-y-3 py-3">
      <Section title="Punch list" count={mine.filter((i) => !i.done).length} action={<ui.Button size="sm" variant="outline" onClick={() => setAdding(true)}><icons.Plus className="size-4" /> Item</ui.Button>}>
        {mine.length === 0 ? <Empty>No punch list items for this job.</Empty> : mine.map((i) => <ItemRow key={i.id} item={i} />)}
      </Section>
      {adding && <AddItem jobId={job.id} onClose={() => setAdding(false)} />}
    </div>
  );
}

export default definePlugin({
  id: 'example.punch-list',
  name: 'Punch list',
  description: 'Items to finish before a job closes out, on their own page and as a tab on each job.',
  version: '1.0.0',
  author: 'BuildTrack example',
  collections: [ITEMS],
  reads: ['jobs'],
  nav: [{ to: '/punch-list', label: 'Punch list', icon: icons.ClipboardCheck, group: 'work', order: 45 }],
  routes: [{ path: '/punch-list', component: PunchListPage }],
  jobTabs: [{ id: 'punch-list', label: 'Punch list', order: 65, component: JobPunchList }],
  skills: [
    {
      name: 'punch-list',
      description: 'How the company uses its punch list: items to finish before a job closes out. Use for questions like "what is left on the Oak Avenue job".',
      body: `# Punch list

Punch list items are records in \`${ITEMS}\`: \`{ id, jobId, text, location, done, created }\`.

- A job is ready to close out when it has no open items (\`done: false\`).
- When asked what's left on a job, list its open items with their location.`,
    },
  ],
});
