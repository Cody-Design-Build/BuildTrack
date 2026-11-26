import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, MapPin, Pencil, Phone, Plus, StickyNote, Star, Building2, Wrench } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { JobLinkForm, MembershipForm, PersonForm, TaskForm } from '../components/Forms';
import { PartyAvatar, PartyLink, RoleBadge } from '../components/Party';
import { BackLink, Empty, InfoLine, Row, SearchInput, Section } from '../components/Detail';
import { StatusDot } from './Jobs';
import { useLookups, useStore, money, personName } from '../store';
import type { JobLink, Membership, Person } from '../data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function PersonDetail({ person }: { person: Person }) {
  const { db } = useStore();
  const L = useLookups();
  const party = L.party.get(person.id)!;
  const [editing, setEditing] = useState(false);
  const [membership, setMembership] = useState<Membership | 'new' | null>(null);
  const [jobLink, setJobLink] = useState<JobLink | 'new' | null>(null);
  const [newTask, setNewTask] = useState(false);
  const memberships = L.accountsOf.get(person.id) ?? [];
  const links = L.linksByParty.get(person.id) ?? [];
  const docs = db.docs.filter((d) => d.partyId === person.id);
  const tasks = db.tasks.filter((t) => t.partyId === person.id && !t.done);

  return (
    <div className="page scroll">
      <PageHeader
        crumb="People"
        title={personName(person)}
        actions={
          <>
            <Button variant="outline" onClick={() => setJobLink('new')}><Wrench /> Add to job</Button>
            <Button variant="outline" onClick={() => setMembership('new')}><Building2 /> Add to account</Button>
            <Button variant="outline" onClick={() => setNewTask(true)}><Plus /> Task</Button>
            <Button onClick={() => setEditing(true)}><Pencil /> Edit</Button>
          </>
        }
      />
      <div className="detail">
        <BackLink to="/people">All people</BackLink>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card className="items-center gap-3 px-5 py-6 text-center">
              <PartyAvatar party={party} size={64} />
              <div>
                <div className="text-lg font-semibold text-foreground">{personName(person)}</div>
                <div className="text-sm text-muted-foreground">
                  {memberships.length ? memberships.map((m) => [m.title, L.account.get(m.accountId)?.name].filter(Boolean).join(' at ')).join(' · ') : 'Not part of any account'}
                </div>
              </div>
              {[...new Set(links.map((l) => l.role))].length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {[...new Set(links.map((l) => l.role))].map((r) => <RoleBadge key={r} role={r} />)}
                </div>
              )}
            </Card>
            <Section title="Contact details">
              <InfoLine icon={Mail} empty="No email">{person.email && <a className="hover:text-primary" href={`mailto:${person.email}`}>{person.email}</a>}</InfoLine>
              <InfoLine icon={Phone} empty="No phone">{person.phone && <a className="hover:text-primary" href={`tel:${person.phone}`}>{person.phone}</a>}</InfoLine>
              <InfoLine icon={MapPin} empty="No address">{person.address}</InfoLine>
              {person.notes && <InfoLine icon={StickyNote} empty="">{<span className="whitespace-pre-wrap">{person.notes}</span>}</InfoLine>}
            </Section>
          </div>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
            <Section
              title="Accounts"
              count={memberships.length}
              action={<Button size="sm" variant="ghost" onClick={() => setMembership('new')}><Plus /> Add</Button>}
            >
              {memberships.length === 0 && <Empty>Not linked to any account. Add them to a household, company or vendor.</Empty>}
              {memberships.map((m) => {
                const acct = L.account.get(m.accountId);
                return (
                  <Row key={m.id}>
                    <PartyLink id={m.accountId} size={28} />
                    <span className="truncate text-sm text-muted-foreground">{m.title}</span>
                    {m.primary && <Badge variant="secondary" className="gap-1"><Star className="size-3" /> Main contact</Badge>}
                    <span className="ml-auto hidden gap-1 sm:flex">{acct?.types.map((t) => <RoleBadge key={t} role={t} />)}</span>
                    <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" aria-label="Edit" onClick={() => setMembership(m)}><Pencil /></Button>
                  </Row>
                );
              })}
            </Section>

            <Section title="Jobs" count={links.length} action={<Button size="sm" variant="ghost" onClick={() => setJobLink('new')}><Plus /> Add</Button>}>
              {links.length === 0 && <Empty>Not on any jobs yet.</Empty>}
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
          </div>
        </div>
      </div>
      {editing && <PersonForm person={person} onClose={() => setEditing(false)} />}
      {membership && <MembershipForm personId={person.id} membership={membership === 'new' ? undefined : membership} onClose={() => setMembership(null)} />}
      {jobLink && <JobLinkForm partyId={person.id} link={jobLink === 'new' ? undefined : jobLink} onClose={() => setJobLink(null)} />}
      {newTask && <TaskForm presetPartyId={person.id} onClose={() => setNewTask(false)} />}
    </div>
  );
}

export default function People() {
  const { db } = useStore();
  const L = useLookups();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');
  const [creating, setCreating] = useState(false);
  const id = params.get('id');
  useEffect(() => {
    if (params.get('new')) {
      setCreating(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const person = id ? L.person.get(id) : undefined;
  if (person) return <PersonDetail key={person.id} person={person} />;

  const rolesInUse = [...new Set(db.jobLinks.filter((l) => L.person.has(l.partyId)).map((l) => l.role))];
  const tabs = ['Customer', ...rolesInUse.filter((r) => r !== 'Customer')].slice(0, 4);
  const needle = q.trim().toLowerCase();
  const people = db.people
    .filter((p) => role === 'all' || (L.linksByParty.get(p.id) ?? []).some((l) => l.role === role))
    .filter((p) => {
      if (!needle) return true;
      const orgs = (L.accountsOf.get(p.id) ?? []).map((m) => `${L.account.get(m.accountId)?.name} ${m.title}`).join(' ');
      return [personName(p), p.email, p.phone, orgs].join(' ').toLowerCase().includes(needle);
    })
    .sort((a, b) => personName(a).localeCompare(personName(b)));

  return (
    <div className="page scroll">
      <PageHeader title="People" actions={<Button onClick={() => setCreating(true)}><Plus /> New person</Button>} />
      <div className="flex flex-col gap-2 px-4 pb-4 sm:flex-row sm:items-center sm:px-6">
        <Tabs value={role} onValueChange={setRole}>
          <TabsList>
            <TabsTrigger value="all">Everyone</TabsTrigger>
            {tabs.map((t) => <TabsTrigger key={t} value={t}>{t === 'Customer' ? 'Customers' : t}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <SearchInput value={q} onChange={setQ} placeholder="Search people, accounts, titles" />
        <span className="text-sm text-muted-foreground sm:ml-auto">{people.length} {people.length === 1 ? 'person' : 'people'}</span>
      </div>
      <div className="px-4 pb-6 sm:px-6">
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Name</TableHead>
                <TableHead>Accounts</TableHead>
                <TableHead className="hidden md:table-cell">Job roles</TableHead>
                <TableHead className="hidden lg:table-cell">Email</TableHead>
                <TableHead className="hidden lg:table-cell pr-5">Phone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((p) => {
                const ms = L.accountsOf.get(p.id) ?? [];
                const roles = [...new Set((L.linksByParty.get(p.id) ?? []).map((l) => l.role))];
                const jobs = new Set((L.linksByParty.get(p.id) ?? []).map((l) => l.jobId)).size;
                return (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => nav(`/people?id=${p.id}`)}>
                    <TableCell className="pl-5"><PartyLink id={p.id} size={28} /></TableCell>
                    <TableCell className="max-w-72">
                      <div className="flex flex-col gap-0.5">
                        {ms.length === 0 && <span className="text-muted-foreground">—</span>}
                        {ms.map((m) => (
                          <span key={m.id} className="truncate text-sm">
                            <span className="text-foreground">{L.account.get(m.accountId)?.name}</span>
                            {m.title && <span className="text-muted-foreground"> · {m.title}</span>}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap items-center gap-1">
                        {roles.map((r) => <RoleBadge key={r} role={r} />)}
                        {jobs > 0 && <span className="text-xs text-muted-foreground">{jobs} {jobs === 1 ? 'job' : 'jobs'}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden max-w-56 truncate text-muted-foreground lg:table-cell">{p.email}</TableCell>
                    <TableCell className="hidden pr-5 text-muted-foreground lg:table-cell">{p.phone}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {people.length === 0 && <Empty>No people found</Empty>}
        </Card>
      </div>
      {creating && <PersonForm onClose={() => setCreating(false)} onSaved={(nid) => setParams({ id: nid })} />}
    </div>
  );
}
