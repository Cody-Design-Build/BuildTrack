import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Maximize, RefreshCw, Plus, Settings, ArrowUpRight, FileText, Hammer, ChevronRight, Wrench, Receipt, Target, SquareCheck, type LucideIcon } from 'lucide-react';
import { useLookups, useStore, money, sameDayLabel, timeLabel } from '../store';
import { linesByBudget, totals } from '../budgets';
import { invoiceLabel, invoiceMoney } from '../invoices';
import { QuickAdd } from '../components/QuickAdd';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function Stat({ label, value, sub, icon: Icon, to }: { label: string; value: string; sub: string; icon: LucideIcon; to: string }) {
  return (
    <Link to={to} className="group outline-none">
      <Card className="gap-3 py-5 transition-shadow group-hover:shadow-md group-focus-visible:ring-[3px] group-focus-visible:ring-ring/40">
        <CardHeader className="px-5">
          <CardDescription className="font-medium">{label}</CardDescription>
          <CardAction>
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-4" />
            </span>
          </CardAction>
        </CardHeader>
        <CardContent className="px-5">
          <div className="truncate text-xl font-semibold tracking-tight tabular-nums text-foreground sm:text-2xl">{value}</div>
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

interface Row {
  key: string;
  a: string;
  b: string;
  c: string;
  to: string;
}

function TableCard({ title, cols, rows, total, empty }: { title: string; cols: [string, string, string]; rows: Row[]; total?: string; empty: string }) {
  const nav = useNavigate();
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
        <CardTitle className="text-[15px]">{title}</CardTitle>
        <CardAction>
          <Badge variant="secondary" className="tabular-nums">{rows.length}</Badge>
        </CardAction>
      </CardHeader>
      <div className="max-h-72 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">{empty}</div>
        ) : (
          <Table className="table-fixed">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[36%] pl-5 text-xs">{cols[0]}</TableHead>
                <TableHead className="text-xs">{cols[1]}</TableHead>
                <TableHead className="w-[28%] pr-5 text-right text-xs">{cols[2]}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.key}
                  role="link"
                  tabIndex={0}
                  className="cursor-pointer outline-none focus-visible:bg-muted/60"
                  onClick={() => nav(r.to)}
                  onKeyDown={(e) => e.key === 'Enter' && nav(r.to)}
                >
                  <TableCell className="truncate pl-5 font-medium text-foreground" title={r.a}>{r.a}</TableCell>
                  <TableCell className="truncate text-muted-foreground" title={r.b}>{r.b}</TableCell>
                  <TableCell className="pr-5 text-right tabular-nums">{r.c || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      {total && rows.length > 0 && (
        <CardFooter className="justify-between border-t bg-muted/40 px-5 py-3 text-sm [.border-t]:pt-3">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold tabular-nums text-foreground">{total}</span>
        </CardFooter>
      )}
    </Card>
  );
}

function IconAction({ label, onClick, children, to }: { label: string; onClick?: () => void; children: ReactNode; to?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {to ? (
          <Button variant="outline" size="icon" asChild aria-label={label}>
            <Link to={to}>{children}</Link>
          </Button>
        ) : (
          <Button variant="outline" size="icon" aria-label={label} onClick={onClick}>
            {children}
          </Button>
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export default function Home() {
  const { db } = useStore();
  const L = useLookups();
  const [filter, setFilter] = useState<'all' | 'customer' | 'vendor'>('all');
  const [adding, setAdding] = useState(false);
  const me = db.team[0];

  const partyName = (id: string) => L.party.get(id)?.name ?? '';
  const partyHref = (id: string) => L.party.get(id)?.href ?? '/accounts';
  const jobName = (id: string) => L.job.get(id)?.name ?? '';

  const feed = db.activity
    .filter((a) => {
      if (filter === 'all') return true;
      const acct = L.account.get(a.partyId);
      const isVendor = !!acct && acct.types.some((t) => t !== 'Customer');
      return filter === 'vendor' ? isVendor : !isVendor;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const activeCustomerJobs = db.jobs.filter((j) => ['Pre-Construction', 'In Progress', 'Punch List'].includes(j.status) && j.total > 0);
  const byBudget = linesByBudget(db);
  const openInvoices = [
    ...db.docs.filter((d) => d.kind === 'Invoice' && d.status === 'Open').map((d) => ({ id: d.id, partyId: d.partyId, label: `${d.kind} ${d.number}`, amount: d.amount, to: partyHref(d.partyId) })),
    ...db.invoices.filter((i) => i.status === 'Sent').map((i) => ({ id: i.id, partyId: i.partyId, label: invoiceLabel(i), amount: invoiceMoney(db, i, byBudget).balance, to: `/invoices/${i.id}` })),
  ];
  const leads = db.jobs.filter((j) => ['Lead', 'Estimating', 'Negotiating'].includes(j.status));
  const custOrders = db.budgets.filter((b) => b.status === 'Sent').map((b) => ({ ...b, amount: totals(byBudget.get(b.id) ?? []).price }));
  const vendorOrders = db.docs.filter((d) => (d.kind === 'Subcontractor Agreement' || d.kind === 'Purchase Order') && d.status === 'Pending');
  const draftBills = db.docs.filter((d) => d.kind === 'Bill' && d.status === 'Draft');
  const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const sum = (xs: number[]) => money(total(xs));
  const myTasks = db.tasks.filter((t) => !t.done && t.assignees.includes(me?.id));

  let lastDay = '';
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pb-10 pt-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{db.companyName} · Lic# 1118207</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
            {greeting()}, {me?.name.split(' ')[0] ?? 'there'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <IconAction label="Full screen" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>
            <Maximize />
          </IconAction>
          <IconAction label="Refresh" onClick={() => location.reload()}>
            <RefreshCw />
          </IconAction>
          <IconAction label="Settings" to="/settings">
            <Settings />
          </IconAction>
          <Button onClick={() => setAdding(true)}>
            <Plus /> New
          </Button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 sm:gap-4 xl:grid-cols-[repeat(4,minmax(0,1fr))]">
        <Stat label="Active contracts" value={sum(activeCustomerJobs.map((j) => j.total))} sub={`${activeCustomerJobs.length} jobs underway`} icon={Wrench} to="/jobs" />
        <Stat label="Open invoices" value={sum(openInvoices.map((d) => d.amount))} sub={`${openInvoices.length} awaiting payment`} icon={Receipt} to="/invoices" />
        <Stat label="Pipeline" value={sum(leads.map((j) => j.projectedCost))} sub={`${leads.length} leads & estimates`} icon={Target} to="/jobs" />
        <Stat label="My tasks" value={String(myTasks.length)} sub={myTasks.length ? 'open and assigned to you' : 'all caught up'} icon={SquareCheck} to="/tasks" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 lg:grid-cols-2">
          <TableCard
            title="Active Customer Jobs"
            cols={['Customer', 'Job', 'Total']}
            rows={activeCustomerJobs.map((j) => ({ key: j.id, a: L.customerName(j.id), b: j.name, c: money(j.total), to: `/jobs?job=${j.id}` }))}
            total={sum(activeCustomerJobs.map((j) => j.total))}
            empty="No active jobs right now"
          />
          <TableCard
            title="Open Customer Invoices"
            cols={['Customer', 'Document', 'Balance']}
            rows={openInvoices.map((d) => ({ key: d.id, a: partyName(d.partyId), b: d.label, c: money(d.amount), to: d.to }))}
            total={sum(openInvoices.map((d) => d.amount))}
            empty="No open invoices"
          />
          <TableCard
            title="Leads & Estimates"
            cols={['Customer', 'Job', 'Projected']}
            rows={leads.map((j) => ({ key: j.id, a: L.customerName(j.id), b: j.name, c: j.projectedCost ? money(j.projectedCost) : '', to: `/jobs?job=${j.id}` }))}
            empty="No leads yet"
          />
          <TableCard
            title="Pending Customer Orders"
            cols={['Customer', 'Document', 'Total']}
            rows={custOrders.map((d) => ({ key: d.id, a: partyName(d.partyId), b: `${d.kind} ${d.number}`, c: money(d.amount), to: `/budgets/${d.id}` }))}
            total={sum(custOrders.map((d) => d.amount))}
            empty="No pending customer orders"
          />
          <TableCard
            title="Pending Vendor Orders"
            cols={['Vendor', 'Document', 'Cost']}
            rows={vendorOrders.map((d) => ({ key: d.id, a: partyName(d.partyId), b: `${d.kind} ${d.number}`, c: money(d.amount), to: partyHref(d.partyId) }))}
            total={sum(vendorOrders.map((d) => d.amount))}
            empty="No pending vendor orders"
          />
          <TableCard
            title="Draft Vendor Bills"
            cols={['Vendor', 'Document', 'Cost']}
            rows={draftBills.map((d) => ({ key: d.id, a: partyName(d.partyId), b: `${d.kind} ${d.number}`, c: money(d.amount), to: partyHref(d.partyId) }))}
            empty="No draft bills"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
              <CardTitle className="text-[15px]">My Open Tasks</CardTitle>
              <CardAction>
                <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
                  <Link to="/tasks">
                    View all <ArrowUpRight />
                  </Link>
                </Button>
              </CardAction>
            </CardHeader>
            <div className="max-h-80 overflow-y-auto p-2">
              {myTasks.length === 0 && <div className="px-3 py-8 text-center text-sm text-muted-foreground">Nothing to do — nice!</div>}
              {myTasks.map((t) => (
                <Link
                  key={t.id}
                  to={`/tasks?id=${t.id}`}
                  className="group flex items-center gap-3 rounded-lg p-3 outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                    <Hammer className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{t.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {t.jobId ? jobName(t.jobId) : t.partyId ? partyName(t.partyId) : 'Task'}
                      {t.due ? ` · due ${t.due}` : ''}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
              <CardTitle className="text-[15px]">Activity</CardTitle>
              <CardDescription>Latest document changes</CardDescription>
            </CardHeader>
            <div className="border-b px-5 py-3">
              <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                <TabsList className="w-full">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="customer">Customers</TabsTrigger>
                  <TabsTrigger value="vendor">Vendors</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="max-h-[640px] overflow-y-auto px-5 py-4">
              {feed.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">No activity yet</div>}
              <ol className="relative">
                {feed.map((f, i) => {
                  const day = sameDayLabel(f.date);
                  const showDay = day !== lastDay;
                  lastDay = day;
                  const last = i === feed.length - 1 || sameDayLabel(feed[i + 1].date) !== day;
                  return (
                    <li key={f.id}>
                      {showDay && (
                        <div className={cn('mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground', i > 0 && 'mt-5')}>{day}</div>
                      )}
                      <Link
                        to={f.jobId ? `/jobs?job=${f.jobId}&tab=documents` : '/documents'}
                        className="group relative flex gap-3 rounded-lg pb-4 outline-none"
                      >
                        {!last && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-border" aria-hidden="true" />}
                        <span
                          className="relative flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card"
                          style={{ background: `color-mix(in oklch, ${f.color} 14%, transparent)`, color: f.color }}
                        >
                          <FileText className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1 pt-0.5">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-medium text-foreground group-hover:underline group-hover:underline-offset-2">{f.title}</span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{timeLabel(f.date)}</span>
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground/80">
                            {f.doc}
                            {f.amount ? <span className="font-semibold tabular-nums text-foreground">{money(f.amount, true)}</span> : null}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{f.text}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </div>
          </Card>
        </div>
      </div>
      {adding && <QuickAdd onClose={() => setAdding(false)} />}
    </div>
  );
}
