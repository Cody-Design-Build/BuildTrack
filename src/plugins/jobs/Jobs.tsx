import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, ChevronDown, ChevronRight, ArrowRight, Search, User, MapPin, Columns3, List, Eye, EyeOff } from 'lucide-react';
import { PageHeader } from '../../components/Layout';
import { JobForm } from '../../components/Forms';
import { useLookups, useStore, money } from '../../store';
import { JOB_STATUSES, type Job, type JobStatus } from '../../data';
import JobDetail from './JobDetail';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { tone } from '../../colors';

export function StatusDot({ status, className }: { status: JobStatus; className?: string }) {
  return <span className={cn('size-2 shrink-0 rounded-full', className)} style={{ background: tone(JOB_STATUSES.find((s) => s.name === status)?.color) }} />;
}

function JobCard({ job, onOpen }: { job: Job; onOpen: () => void }) {
  const L = useLookups();
  const { update } = useStore();
  const [open, setOpen] = useState(false);
  const customer = L.customers(job.id)[0];
  return (
    <div
      className="group/card shrink-0 cursor-grab rounded-lg border bg-card p-3 shadow-xs transition-shadow hover:shadow-md active:cursor-grabbing"
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', job.id)}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left text-sm font-semibold leading-snug text-foreground outline-none hover:text-primary focus-visible:text-primary"
        >
          {job.name}
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="-mr-1 -mt-1 size-7 text-muted-foreground"
          aria-label={open ? 'Hide details' : 'Show details'}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
        </Button>
      </div>
      <div className="mt-2 space-y-1 text-[13px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <User className="size-3.5 shrink-0" />
          {customer ? (
            <Link to={customer.href} className="truncate hover:text-foreground hover:underline hover:underline-offset-2">
              {customer.name}
            </Link>
          ) : (
            <span>—</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">{job.address || '—'}</span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {job.total ? money(job.total) : <span className="font-normal text-muted-foreground">No total yet</span>}
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground opacity-0 transition-opacity hover:text-primary focus-visible:opacity-100 group-hover/card:opacity-100"
        >
          Open <ArrowRight className="size-3" />
        </button>
      </div>
      {open && (
        <div className="mt-3 border-t pt-3">
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Status</div>
          <Select
            value={job.status}
            onValueChange={(v) => update((d) => ({ ...d, jobs: d.jobs.map((j) => (j.id === job.id ? { ...j, status: v as JobStatus } : j)) }))}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JOB_STATUSES.map((st) => (
                <SelectItem key={st.name} value={st.name}>
                  <StatusDot status={st.name} /> {st.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

export default function Jobs() {
  const { db, update } = useStore();
  const L = useLookups();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [hideEmpty, setHideEmpty] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Job | null>(null);
  const [creating, setCreating] = useState<JobStatus | null>(null);
  const [over, setOver] = useState<string>('');

  useEffect(() => {
    if (params.get('new')) {
      setCreating('Lead');
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams, db.jobs]);

  const needle = q.trim().toLowerCase();
  const jobs = db.jobs.filter((j) => {
    if (!needle) return true;
    const hay = [j.name, j.address, ...L.customers(j.id).map((c) => c.name)].join(' ').toLowerCase();
    return hay.includes(needle);
  });
  const move = (id: string, status: JobStatus) => update((d) => ({ ...d, jobs: d.jobs.map((j) => (j.id === id ? { ...j, status } : j)) }));
  const columns = JOB_STATUSES.filter((s) => !hideEmpty || jobs.some((j) => j.status === s.name));
  const openJob = (j: Job) => setParams({ job: j.id });
  const current = db.jobs.find((j) => j.id === params.get('job'));
  if (current) return <JobDetail key={current.id} job={current} />;

  return (
    <div className="page fill">
      <PageHeader
        title="Jobs"
        actions={
          <Button onClick={() => setCreating('Lead')}>
            <Plus /> New job
          </Button>
        }
      />
      <div className="flex flex-col gap-2 px-4 pb-4 sm:flex-row sm:items-center sm:px-6">
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="kanban">
              <Columns3 /> Board
            </TabsTrigger>
            <TabsTrigger value="list">
              <List /> List
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search jobs" className="bg-card pl-8" aria-label="Search jobs" />
        </div>
        {view === 'kanban' && (
          <Button variant="outline" className={cn('sm:ml-auto', hideEmpty && 'bg-muted')} aria-pressed={hideEmpty} onClick={() => setHideEmpty((h) => !h)}>
            {hideEmpty ? <Eye /> : <EyeOff />} {hideEmpty ? 'Show empty' : 'Hide empty'}
          </Button>
        )}
      </div>

      {view === 'kanban' ? (
        <div className="kanban">
          {columns.map((s) => {
            const list = jobs.filter((j) => j.status === s.name);
            const isCollapsed = collapsed[s.name];
            const value = list.reduce((a, j) => a + j.total, 0);
            return (
              <div
                key={s.name}
                className={'k-col' + (over === s.name ? ' over' : '') + (isCollapsed ? ' collapsed' : '')}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(s.name);
                }}
                onDragLeave={() => setOver('')}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver('');
                  move(e.dataTransfer.getData('text/plain'), s.name);
                }}
              >
                <div className="k-head">
                  <button
                    type="button"
                    className="k-toggle"
                    aria-label={isCollapsed ? 'Expand column' : 'Collapse column'}
                    onClick={() => setCollapsed((c) => ({ ...c, [s.name]: !c[s.name] }))}
                  >
                    <ChevronRight size={14} className={cn('transition-transform', !isCollapsed && 'rotate-90')} />
                  </button>
                  <StatusDot status={s.name} />
                  <span className="k-title truncate">{s.name}</span>
                  {value > 0 && <span className="text-xs font-normal tabular-nums text-muted-foreground">{money(value)}</span>}
                  <span className="k-count">{list.length}</span>
                </div>
                {!isCollapsed && (
                  <div className="k-body">
                    {list.map((j) => (
                      <JobCard key={j.id} job={j} onOpen={() => openJob(j)} />
                    ))}
                    {list.length === 0 && <div className="k-empty">Drop jobs here</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="table-wrap mx-4 mb-4 rounded-xl border bg-card sm:mx-6">
          <table className="grid-table w-full">
            <thead>
              <tr>
                <th>Job</th>
                <th>Customer</th>
                <th>Address</th>
                <th>Status</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} onClick={() => openJob(j)} className="clickable">
                  <td className="font-medium text-foreground">{j.name}</td>
                  <td className="text-muted-foreground">{L.customerName(j.id)}</td>
                  <td className="text-muted-foreground">{j.address}</td>
                  <td>
                    <Badge variant="outline" className="font-medium">
                      <StatusDot status={j.status} className="size-1.5" /> {j.status}
                    </Badge>
                  </td>
                  <td className="num tabular-nums">{j.total ? money(j.total) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <JobForm job={editing} onClose={() => setEditing(null)} />}
      {creating && <JobForm defaultStatus={creating} onClose={() => setCreating(null)} />}
    </div>
  );
}
