import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, MapPin, Pencil, Phone, Plus, StickyNote, Star, UserPlus, Wrench, Hammer } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { AccountForm, JobForm, JobLinkForm, MembershipForm, TaskForm } from '../components/Forms';
import { PartyAvatar, PartyLink, RoleBadge } from '../components/Party';
import { BackLink, Empty, InfoLine, Row, SearchInput, Section } from '../components/Detail';
import { StatusDot } from './Jobs';
import { BillTable, NewBillDialog, isVendor } from './Bills';
import { payables } from '../bills';
import { useLookups, useStore, money, personName } from '../store';
import type { Account, JobLink, Membership } from '../data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function AccountDetail({ account }: { account: Account }) {
  const { db } = useStore();
  const L = useLookups();
  const party = L.party.get(account.id)!;
  const [editing, setEditing] = useState(false);
  const [membership, setMembership] = useState<Membership | 'new' | null>(null);
  const [jobLink, setJobLink] = useState<JobLink | 'new' | null>(null);
  const [newJob, setNewJob] = useState(false);
  const [newTask, setNewTask] = useState(false);
  const members = [...(L.membersOf.get(account.id) ?? [])].sort((a, b) => Number(b.primary) - Number(a.primary));
  const links = L.linksByParty.get(account.id) ?? [];
  // jobs its people are on without the account itself being linked, e.g. a vendor's estimator
  const linkedJobs = new Set(links.map((l) => l.jobId));
  const viaPeople = members.flatMap((m) => (L.linksByParty.get(m.personId) ?? []).filter((l) => !linkedJobs.has(l.jobId)));
  const docs = db.docs.filter((d) => d.partyId === account.id);
  const tasks = db.tasks.filter((t) => t.partyId === account.id && !t.done);
  const budgetById = new Map(db.budgets.map((b) => [b.id, b] as const));
  const budgetLines = db.budgetLines.filter((i) => i.vendorId === account.id);
  const bills = db.bills.filter((b) => b.vendorId === account.id).sort((a, b) => b.date.localeCompare(a.date));
  const owed = payables(db, bills);
  const [newBill, setNewBill] = useState(false);

  return (
    <div className="page scroll">
      <PageHeader
        crumb="Accounts"
        title={account.name}
        actions={
          <>
            <Button variant="outline" onClick={() => setMembership('new')}><UserPlus /> Add person</Button>
            <Button variant="outline" onClick={() => setJobLink('new')}><Wrench /> Add to job</Button>
            {account.types.includes('Customer') && <Button variant="outline" onClick={() => setNewJob(true)}><Plus /> New job</Button>}
            <Button variant="outline" onClick={() => setNewTask(true)}><Plus /> Task</Button>
            <Button onClick={() => setEditing(true)}><Pencil /> Edit</Button>
          </>
        }
      />
      <div className="detail">
        <BackLink to="/accounts">All accounts</BackLink>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card className="items-center gap-3 px-5 py-6 text-center">
              <PartyAvatar party={party} size={64} />
              <div>
                <div className="text-lg font-semibold text-foreground">{account.name}</div>
                {account.trade && <div className="text-sm text-muted-foreground">{account.trade}</div>}
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {account.types.length === 0 && <span className="text-sm text-muted-foreground">No type set</span>}
                {account.types.map((t) => <RoleBadge key={t} role={t} />)}
              </div>
            </Card>
            <Section title="Details">
              <InfoLine icon={Phone} empty="No phone">{account.phone && <a className="hover:text-primary" href={`tel:${account.phone}`}>{account.phone}</a>}</InfoLine>
              <InfoLine icon={Mail} empty="No email">{account.email && <a className="hover:text-primary" href={`mailto:${account.email}`}>{account.email}</a>}</InfoLine>
              <InfoLine icon={MapPin} empty="No address">{account.address}</InfoLine>
              {account.notes && <InfoLine icon={StickyNote} empty="">{<span className="whitespace-pre-wrap">{account.notes}</span>}</InfoLine>}
            </Section>
          </div>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
            <Section title="People" count={members.length} action={<Button size="sm" variant="ghost" onClick={() => setMembership('new')}><Plus /> Add</Button>}>
              {members.length === 0 && <Empty>Nobody linked yet.</Empty>}
              {members.map((m) => {
                const p = L.person.get(m.personId);
                if (!p) return null;
                const elsewhere = (L.accountsOf.get(p.id) ?? []).filter((x) => x.accountId !== account.id);
                return (
                  <Row key={m.id}>
                    <PartyLink id={p.id} size={28} />
                    {m.primary && <Badge variant="secondary" className="gap-1"><Star className="size-3" /> Main</Badge>}
                    <span className="min-w-0 truncate text-sm text-muted-foreground">
                      {[m.title, p.email || p.phone].filter(Boolean).join(' · ')}
                      {elsewhere.length > 0 && <> · also at {elsewhere.map((x) => L.account.get(x.accountId)?.name).join(', ')}</>}
                    </span>
                    <Button size="icon" variant="ghost" className="ml-auto size-8 shrink-0 text-muted-foreground" aria-label={`Edit ${personName(p)}'s role`} onClick={() => setMembership(m)}><Pencil /></Button>
                  </Row>
                );
              })}
            </Section>

            <Section title="Jobs" count={links.length} action={<Button size="sm" variant="ghost" onClick={() => setJobLink('new')}><Plus /> Add</Button>}>
              {links.length === 0 && viaPeople.length === 0 && <Empty>Not on any jobs yet.</Empty>}
              {links.map((l) => {
                const job = L.job.get(l.jobId);
                if (!job) return null;
                return (
                  <Row key={l.id}>
                    <StatusDot status={job.status} />
                    <Link to={`/jobs?job=${job.id}`} className="min-w-0 truncate text-sm font-medium text-foreground hover:text-primary">{job.name}</Link>
                    <span className="hidden truncate text-sm text-muted-foreground sm:inline">{job.status}</span>
                    <RoleBadge role={l.role} className="ml-auto" />
                    <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" aria-label="Edit role" onClick={() => setJobLink(l)}><Pencil /></Button>
                  </Row>
                );
              })}
              {viaPeople.length > 0 && (
                <>
                  <div className="px-3 pb-1 pt-3 text-xs font-medium text-muted-foreground">Through its people</div>
                  {viaPeople.map((l) => {
                    const job = L.job.get(l.jobId);
                    if (!job) return null;
                    return (
                      <Row key={l.id}>
                        <StatusDot status={job.status} />
                        <Link to={`/jobs?job=${job.id}`} className="min-w-0 truncate text-sm text-foreground hover:text-primary">{job.name}</Link>
                        <span className="ml-auto truncate text-xs text-muted-foreground">{L.party.get(l.partyId)?.name} · {l.role}</span>
                      </Row>
                    );
                  })}
                </>
              )}
            </Section>

            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[repeat(2,minmax(0,1fr))]">
              <Section title="Documents" count={docs.length}>
                {docs.length === 0 && <Empty>No documents</Empty>}
                {docs.map((d) => (
                  <Row key={d.id}>
                    <span className="truncate text-sm font-medium text-foreground">{d.kind} {d.number}</span>
                    <span className="text-xs text-muted-foreground">{d.status}</span>
                    <span className="ml-auto text-sm tabular-nums">{d.amount ? money(d.amount) : ''}</span>
                  </Row>
                ))}
              </Section>
              <Section title="Open tasks" count={tasks.length} action={<Button size="sm" variant="ghost" onClick={() => setNewTask(true)}><Plus /> Add</Button>}>
                {tasks.length === 0 && <Empty>Nothing open</Empty>}
                {tasks.map((t) => (
                  <Row key={t.id}>
                    <Link to={`/tasks?id=${t.id}`} className="line-clamp-2 text-sm text-foreground hover:text-primary">{t.name}</Link>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{t.due}</span>
                  </Row>
                ))}
              </Section>
            </div>

            {(bills.length > 0 || isVendor(account)) && (
              <Section
                title="Bills"
                count={bills.length}
                action={
                  <span className="flex items-center gap-3">
                    {owed.owed > 0 && <span className={'text-sm ' + (owed.overdue > 0 ? 'text-destructive' : 'text-muted-foreground')}>{money(owed.owed)} owed{owed.overdue > 0 && ` · ${money(owed.overdue)} overdue`}</span>}
                    <Button size="sm" variant="ghost" onClick={() => setNewBill(true)}><Plus /> New bill</Button>
                  </span>
                }
              >
                {bills.length === 0 ? <Empty>No bills from {account.name} yet.</Empty> : <BillTable bills={bills} showVendor={false} />}
              </Section>
            )}

            {budgetLines.length > 0 && (
              <Section title="Budget lines" count={budgetLines.length}>
                {budgetLines.map((i) => (
                  <Row key={i.id}>
                    <Hammer className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm text-foreground">{i.name}</span>
                    <Link to={`/budgets/${i.budgetId}`} className="truncate text-xs text-muted-foreground hover:text-primary">
                      {L.job.get(budgetById.get(i.budgetId)?.jobId ?? '')?.name} · {budgetById.get(i.budgetId)?.kind} {budgetById.get(i.budgetId)?.number}
                    </Link>
                    <span className="ml-auto text-sm tabular-nums">{money(i.quantity * i.unitCost)}</span>
                  </Row>
                ))}
              </Section>
            )}
          </div>
        </div>
      </div>
      {editing && <AccountForm account={account} onClose={() => setEditing(false)} />}
      {membership && <MembershipForm accountId={account.id} membership={membership === 'new' ? undefined : membership} onClose={() => setMembership(null)} />}
      {jobLink && <JobLinkForm partyId={account.id} link={jobLink === 'new' ? undefined : jobLink} onClose={() => setJobLink(null)} />}
      {newJob && <JobForm presetCustomerId={account.id} onClose={() => setNewJob(false)} />}
      {newTask && <TaskForm presetPartyId={account.id} onClose={() => setNewTask(false)} />}
      {newBill && <NewBillDialog vendorId={account.id} onClose={() => setNewBill(false)} />}
    </div>
  );
}

export default function Accounts() {
  const { db } = useStore();
  const L = useLookups();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [type, setType] = useState(params.get('type') ?? 'all');
  const [creating, setCreating] = useState(false);
  const id = params.get('id');
  useEffect(() => {
    if (params.get('new')) {
      setCreating(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const account = id ? L.account.get(id) : undefined;
  if (account) return <AccountDetail key={account.id} account={account} />;

  const counts = new Map<string, number>();
  for (const a of db.accounts) for (const t of a.types) counts.set(t, (counts.get(t) ?? 0) + 1);
  const typeTabs = [...counts.keys()].sort((a, b) => (counts.get(b)! - counts.get(a)!) || a.localeCompare(b)).slice(0, 5);
  const needle = q.trim().toLowerCase();
  const accounts = db.accounts
    .filter((a) => type === 'all' || a.types.includes(type))
    .filter((a) => {
      if (!needle) return true;
      const people = (L.membersOf.get(a.id) ?? []).map((m) => L.party.get(m.personId)?.name).join(' ');
      return [a.name, a.email, a.phone, a.trade, a.types.join(' '), people].join(' ').toLowerCase().includes(needle);
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="page scroll">
      <PageHeader title="Accounts" actions={<Button onClick={() => setCreating(true)}><Plus /> New account</Button>} />
      <div className="flex flex-col gap-2 px-4 pb-4 sm:flex-row sm:items-center sm:px-6">
        <Tabs value={type} onValueChange={setType}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {typeTabs.map((t) => <TabsTrigger key={t} value={t}>{t}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <SearchInput value={q} onChange={setQ} placeholder="Search accounts and their people" />
        <span className="text-sm text-muted-foreground sm:ml-auto">{accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}</span>
      </div>
      <div className="px-4 pb-6 sm:px-6">
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden md:table-cell">Main contact</TableHead>
                <TableHead className="hidden text-right md:table-cell">People</TableHead>
                <TableHead className="hidden text-right md:table-cell">Jobs</TableHead>
                <TableHead className="hidden lg:table-cell pr-5">Phone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => {
                const ms = L.membersOf.get(a.id) ?? [];
                const main = ms.find((m) => m.primary) ?? ms[0];
                const jobs = new Set([...(L.linksByParty.get(a.id) ?? []).map((l) => l.jobId)]).size;
                return (
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => nav(`/accounts?id=${a.id}`)}>
                    <TableCell className="pl-5">
                      <div className="flex flex-col">
                        <PartyLink id={a.id} size={28} />
                        {a.trade && <span className="pl-9 text-xs text-muted-foreground">{a.trade}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">{a.types.map((t) => <RoleBadge key={t} role={t} />)}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{main ? <PartyLink id={main.personId} size={22} className="font-normal" /> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{ms.length}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{jobs}</TableCell>
                    <TableCell className="hidden pr-5 text-muted-foreground lg:table-cell">{a.phone}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {accounts.length === 0 && <Empty>No accounts found</Empty>}
        </Card>
      </div>
      {creating && <AccountForm presetTypes={type !== 'all' ? [type] : undefined} onClose={() => setCreating(false)} onSaved={(nid) => setParams({ id: nid })} />}
    </div>
  );
}
