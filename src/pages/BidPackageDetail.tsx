import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Award, Ban, Check, ClipboardCopy, FilePlus2, Import, Mail, Pencil, Plus, Printer, RotateCcw, Send, Trash2, Undo2, UserPlus, X } from 'lucide-react';
import { Modal, PageHeader } from '../components/Layout';
import { Field } from '../components/Forms';
import { NumCell, TextCell } from '../components/Cells';
import { Segmented } from '../components/DocLayout';
import { History } from '../components/BudgetSigning';
import { Attachments } from '../components/Attachments';
import { BidPackageDocument } from '../components/BidPackageDocument';
import { fmtDate } from '../components/Payments';
import { Button } from '@/components/ui/button';
import { useLookups, useStore, lineCost, money, uid } from '../store';
import type { Bid, BidItem, BidPackage } from '../data';
import {
  BID_STATUS_COLOR, PACKAGE_STATUS_COLOR, awardBid, awardBills, bidStatusLabel, cancelPackage, canUnaward, declineBid, deletePackage, editBid,
  editPackage, importItems, inviteEmail, inviteVendors, isPackageOpen, markSent, packageLabel, packageSummary, recordBid, removeBid,
  reopenPackage, unawardBid, vendorEmail,
} from '../bids';
import { createBill } from '../bills';
import { budgetLabel, pct } from '../budgets';
import { todayYmd } from '../invoices';
import { Pill } from './Budgets';
import { BillTable, isVendor } from './Bills';
import { cn } from '@/lib/utils';

type View = 'bids' | 'scope' | 'document';
const VIEWS: { id: View; label: string }[] = [
  { id: 'bids', label: 'Bids' },
  { id: 'scope', label: 'Scope' },
  { id: 'document', label: 'Document' },
];

export default function BidPackageDetail() {
  const { id = '' } = useParams();
  const { db, update } = useStore();
  const L = useLookups();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = (VIEWS.some((v) => v.id === params.get('view')) ? params.get('view') : 'bids') as View;
  const setView = (v: View) => setParams(v === 'bids' ? {} : { view: v }, { replace: true });
  useEffect(() => {
    const prev = document.title;
    const p = db.bidPackages.find((x) => x.id === id);
    if (p) document.title = `${packageLabel(p)}${p.title ? ` - ${p.title}` : ''} - ${db.companyName}`;
    return () => { document.title = prev; };
  }, [db, id]);

  const pkg = db.bidPackages.find((x) => x.id === id);
  if (!pkg) {
    return (
      <div className="page scroll">
        <PageHeader title="Bid package not found" />
        <div className="detail"><p className="muted">This bid package doesn't exist. It may have been deleted. <Link to="/bids" className="text-primary hover:underline">See all bid packages</Link></p></div>
      </div>
    );
  }
  const job = L.job.get(pkg.jobId);
  const s = packageSummary(db, pkg);
  const open = isPackageOpen(pkg);
  const sendAll = () => {
    const ids = s.bids.filter((b) => b.status === 'Invited' && !b.invited).map((b) => b.id);
    if (!ids.length) return;
    if (!window.confirm(`Mark the package as sent today to ${ids.length} sub${ids.length === 1 ? '' : 's'}? Use this if you emailed it yourself. The Email button next to each sub does this for you.`)) return;
    update((d) => markSent(d, pkg.id, ids));
  };
  const del = () => {
    if (!window.confirm(`Delete ${packageLabel(pkg)}? This draft and its invite list will be removed.`)) return;
    update((d) => deletePackage(d, pkg.id));
    nav(`/jobs?job=${pkg.jobId}&tab=bids`);
  };
  const cancel = () => window.confirm('Cancel this bid package? It stops counting as out for bid. You can reopen it later.') && update((d) => cancelPackage(d, pkg.id));

  return (
    <div className="page scroll job-page">
      <PageHeader
        crumb={job?.name ?? 'Bid package'}
        title={`${packageLabel(pkg)}${pkg.title ? ` · ${pkg.title}` : ''}`}
        actions={
          <>
            <button type="button" className="btn" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
            {open && s.notSent > 0 && <button type="button" className="btn primary" onClick={sendAll}><Send size={14} /> Mark as sent</button>}
            {pkg.status === 'Draft' && <button type="button" className="btn" onClick={del}><Trash2 size={14} /> Delete</button>}
            {pkg.status === 'Out for bid' && <button type="button" className="btn" onClick={cancel}><Ban size={14} /> Cancel</button>}
            {pkg.status === 'Cancelled' && <button type="button" className="btn" onClick={() => update((d) => reopenPackage(d, pkg.id))}><RotateCcw size={14} /> Reopen</button>}
          </>
        }
      />
      <div className="j-bar flex-wrap">
        <Link to={`/jobs?job=${pkg.jobId}&tab=bids`} className="back-link"><ArrowLeft size={14} /> {job?.name ?? 'Job'} bids</Link>
        <Pill label={pkg.status} color={PACKAGE_STATUS_COLOR[pkg.status]} />
        <span className="text-xs text-muted-foreground">Bids due {fmtDate(pkg.due) || '—'}</span>
        <span className="grow" />
        <Segmented label="View" options={VIEWS} value={view} onChange={setView} />
      </div>
      <div className="detail">
        {view === 'bids' && <BidsView pkg={pkg} goScope={() => setView('scope')} />}
        {view === 'scope' && <ScopeView pkg={pkg} />}
        {view === 'document' && (
          <div className="bt-doc-col">
            <BidPackageDocument pkg={pkg} db={db} L={L} />
          </div>
        )}
      </div>
      {createPortal(<div className="print-only"><BidPackageDocument pkg={pkg} db={db} L={L} /></div>, document.body)}
    </div>
  );
}

function Stat({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className="card stat">
      <span className="stat-label">{label}</span>
      <b className={className}>{value}</b>
      {sub && <span className="muted small-text">{sub}</span>}
    </div>
  );
}

const vsBudget = (amount: number, budget: number) => (budget ? `${amount <= budget ? '' : '+'}${pct(((amount - budget) / budget) * 100)} vs budget` : '');

function BidsView({ pkg, goScope }: { pkg: BidPackage; goScope: () => void }) {
  const { db, update } = useStore();
  const L = useLookups();
  const nav = useNavigate();
  const s = packageSummary(db, pkg);
  const open = isPackageOpen(pkg);
  const [inviting, setInviting] = useState(false);
  const [entering, setEntering] = useState<Bid | null>(null);
  const [awarding, setAwarding] = useState<Bid | null>(null);
  const [emailing, setEmailing] = useState<Bid | null>(null);
  const priced = s.bids.filter((b) => b.amount > 0 && b.status !== 'Declined').sort((a, b) => a.amount - b.amount);

  const email = (b: Bid) => {
    const e = inviteEmail(db, pkg, b.vendorId);
    if (!e.to) return setEmailing(b);
    window.location.href = e.href;
    if (!b.invited) update((d) => markSent(d, pkg.id, [b.id]));
  };
  const unaward = (b: Bid) => {
    if (!canUnaward(db, b.id)) return window.alert('Its bill has been approved, so this award can no longer be undone. Void or change the bill instead.');
    if (window.confirm(`Undo the award to ${L.party.get(b.vendorId)?.name}? Its draft bill will be deleted.`)) update((d) => unawardBid(d, b.id));
  };
  const newBill = (b: Bid) => {
    const id = uid('bill');
    update((d) => {
      const next = createBill(d, pkg.jobId, b.vendorId, id);
      return { ...next, bills: next.bills.map((x) => (x.id === id ? { ...x, bidId: b.id, title: pkg.title, lines: x.lines.map((l) => ({ ...l, costCodeId: pkg.costCodeId || l.costCodeId })) } : x)) };
    });
    nav(`/bills/${id}`);
  };

  return (
    <div className="b-wrap">
      <div className="b-summary">
        <Stat label="Budget" value={s.budget ? money(s.budget) : '—'} sub={s.budget ? 'Approved cost for this cost code' : pkg.costCodeId ? 'Nothing budgeted for this cost code' : 'Set a cost code to compare'} />
        <Stat label="Bids back" value={`${s.received} of ${s.bids.length}`} sub={s.notSent ? `${s.notSent} not sent yet` : s.waiting ? `${s.waiting} still to reply` : s.bids.length ? 'Everyone has replied' : 'Nobody invited yet'} />
        <Stat label="Low bid" value={s.low ? money(s.low.amount) : '—'} sub={s.low ? [L.party.get(s.low.vendorId)?.name, vsBudget(s.low.amount, s.budget)].filter(Boolean).join(' · ') : undefined} />
        <Stat label="Awarded" value={s.awarded.length ? money(s.awardedTotal) : '—'} sub={s.awarded.length ? `Billed ${money(s.billed)} · paid ${money(s.paid)}` : undefined} />
      </div>

      {pkg.scope.trim() === '' && open && (
        <div className="card b-empty mb-4">
          <p>Write the scope of work before you send this out.</p>
          <button type="button" className="btn primary" onClick={goScope}><Pencil size={14} /> Write the scope</button>
        </div>
      )}

      <section className="card mb-4">
        <div className="card-head">
          <h2>Subcontractors</h2>
          {open && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setInviting(true)}><UserPlus /> Add subs</Button>}
        </div>
        {s.bids.length === 0 ? (
          <div className="wt-empty">Nobody invited yet. Add the subs you want pricing from{open ? '' : '.'}</div>
        ) : (
          <div className="table-wrap">
            <table className="grid-table bt-table">
              <thead>
                <tr>
                  <th>Sub</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>Received</th>
                  <th className="num">Bid</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {s.bids.map((b) => {
                  const v = L.party.get(b.vendorId);
                  const to = vendorEmail(db, b.vendorId);
                  const label = bidStatusLabel(b);
                  return (
                    <tr key={b.id}>
                      <td className="bt-wrap">
                        {v ? <Link to={v.href} className="font-medium hover:text-primary">{v.name}</Link> : '—'}
                        <div className="text-xs text-muted-foreground">{to || 'No email on file'}</div>
                      </td>
                      <td><Pill label={label} color={label === 'Not sent' ? '#6b7280' : BID_STATUS_COLOR[b.status]} /></td>
                      <td className="whitespace-nowrap">{fmtDate(b.invited) || <span className="muted">—</span>}</td>
                      <td className="whitespace-nowrap">{fmtDate(b.received) || <span className="muted">—</span>}</td>
                      <td className="num bold">
                        {b.amount > 0 ? money(b.amount, true) : <span className="muted font-normal">—</span>}
                        {b.amount > 0 && s.budget > 0 && <div className="text-xs font-normal text-muted-foreground">{vsBudget(b.amount, s.budget)}</div>}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {open && b.status === 'Invited' && (
                          <button type="button" className="btn btn-sm" onClick={() => email(b)} title={b.invited ? 'Email the package again' : 'Opens an email in your mail app and records it as sent'}><Mail size={14} /> {b.invited ? 'Email again' : 'Email'}</button>
                        )}
                        {b.status !== 'Awarded' && pkg.status !== 'Cancelled' && (
                          <button type="button" className="btn btn-sm ml-1" onClick={() => setEntering(b)}>{b.amount > 0 ? <><Pencil size={14} /> Edit bid</> : <><Plus size={14} /> Enter bid</>}</button>
                        )}
                        {b.amount > 0 && (b.status === 'Received' || b.status === 'Not selected') && pkg.status !== 'Cancelled' && (
                          <button type="button" className="btn btn-sm primary ml-1" onClick={() => setAwarding(b)}><Award size={14} /> Award</button>
                        )}
                        {b.status === 'Awarded' && (
                          <button type="button" className="btn btn-sm ml-1" onClick={() => unaward(b)} disabled={!canUnaward(db, b.id)} title={canUnaward(db, b.id) ? 'Undo the award and delete its draft bill' : 'Its bill has been approved'}><Undo2 size={14} /> Undo award</button>
                        )}
                        {open && b.status === 'Invited' && (
                          <button type="button" className="icon-btn ml-1" title="Declined to bid" aria-label={`${v?.name} declined`} onClick={() => update((d) => declineBid(d, b.id))}><X size={14} /></button>
                        )}
                        {open && b.status !== 'Awarded' && (
                          <button type="button" className="icon-btn" title="Take off the list" aria-label={`Remove ${v?.name}`} onClick={() => window.confirm(`Take ${v?.name} off this package?`) && update((d) => removeBid(d, b.id))}><Trash2 size={14} /></button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {open && s.bids.some((b) => b.status === 'Invited') && (
          <div className="card-body pt-2 text-xs text-muted-foreground">
            <b>Email</b> opens a ready-to-send message in your mail app and records the date. Attach the PDF (Print / PDF) and the package's files before sending.
          </div>
        )}
      </section>

      {priced.length > 0 && <CompareCard pkg={pkg} bids={priced} budget={s.budget} onAward={setAwarding} />}

      {s.awarded.length > 0 && (
        <section className="card mb-4">
          <div className="card-head"><h2>Awarded</h2></div>
          <div className="card-body flex flex-col gap-4">
            {s.awarded.map((b) => {
              const bills = awardBills(db, b.id);
              return (
                <div key={b.id}>
                  <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <b>{L.party.get(b.vendorId)?.name}</b>
                    <span className="text-muted-foreground">Awarded {fmtDate(b.awarded ?? '')} for <b className="text-foreground">{money(b.amount, true)}</b></span>
                    <span className="grow" />
                    <button type="button" className="btn btn-sm" onClick={() => newBill(b)}><FilePlus2 size={14} /> New bill against this award</button>
                  </div>
                  <BillTable bills={bills} showJob={false} showVendor={false} empty="No bills yet." />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <History match={(a) => a.bidPackageId === pkg.id} empty="No history recorded for this package yet." />

      {inviting && <InviteDialog pkg={pkg} onClose={() => setInviting(false)} />}
      {entering && <BidDialog pkg={pkg} bid={entering} onClose={() => setEntering(null)} />}
      {awarding && <AwardDialog pkg={pkg} bid={awarding} onClose={() => setAwarding(null)} />}
      {emailing && <EmailDialog pkg={pkg} bid={emailing} onClose={() => setEmailing(null)} />}
    </div>
  );
}

/** Bids side by side: one column per sub, rows for each scope item, then the terms. */
function CompareCard({ pkg, bids, budget, onAward }: { pkg: BidPackage; bids: Bid[]; budget: number; onAward: (b: Bid) => void }) {
  const L = useLookups();
  const lowest = (vals: (number | undefined)[]) => {
    const nums = vals.filter((v): v is number => typeof v === 'number' && v > 0);
    return nums.length > 1 ? Math.min(...nums) : undefined;
  };
  const lowTotal = lowest(bids.map((b) => b.amount));
  const Terms = ({ label, pick }: { label: string; pick: (b: Bid) => string }) => (
    bids.some((b) => pick(b)) ? (
      <tr>
        <td className="text-muted-foreground">{label}</td>
        {bids.map((b) => <td key={b.id} className="bt-wrap align-top text-sm">{pick(b) || <span className="muted">—</span>}</td>)}
      </tr>
    ) : null
  );
  return (
    <section className="card mb-4">
      <div className="card-head">
        <h2>Compare bids</h2>
        <span className="ml-auto text-xs text-muted-foreground">Lowest in each row is highlighted</span>
      </div>
      <div className="table-wrap">
        <table className="grid-table bt-table">
          <thead>
            <tr>
              <th />
              {bids.map((b) => (
                <th key={b.id} className="num">
                  {L.party.get(b.vendorId)?.name}
                  <div className="font-normal normal-case"><Pill label={b.status} color={BID_STATUS_COLOR[b.status]} /></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pkg.items.map((i) => {
              const low = lowest(bids.map((b) => b.itemPrices[i.id]));
              return (
                <tr key={i.id}>
                  <td className="bt-wrap">{i.description}{i.unit !== 'lump' && <span className="text-muted-foreground"> · {i.quantity} {i.unit}</span>}</td>
                  {bids.map((b) => {
                    const v = b.itemPrices[i.id];
                    return <td key={b.id} className={cn('num', low !== undefined && v === low && 'font-semibold text-[var(--success-strong)]')}>{v ? money(v) : <span className="muted">—</span>}</td>;
                  })}
                </tr>
              );
            })}
            <tr className="b-group">
              <td className="bold">Total</td>
              {bids.map((b) => <td key={b.id} className={cn('num bold', lowTotal !== undefined && b.amount === lowTotal && 'text-[var(--success-strong)]')}>{money(b.amount)}</td>)}
            </tr>
            {budget > 0 && (
              <tr>
                <td className="text-muted-foreground">vs budget {money(budget)}</td>
                {bids.map((b) => <td key={b.id} className={cn('num', b.amount > budget ? 'text-destructive' : 'text-muted-foreground')}>{b.amount > budget ? '+' : ''}{money(b.amount - budget)}</td>)}
              </tr>
            )}
            <Terms label="Includes" pick={(b) => b.inclusions} />
            <Terms label="Excludes" pick={(b) => b.exclusions} />
            <Terms label="Good until" pick={(b) => fmtDate(b.validUntil)} />
            <Terms label="Notes" pick={(b) => b.notes} />
            <Terms label="Files" pick={(b) => b.attachments.map((f) => f.name).join(', ')} />
            {pkg.status !== 'Cancelled' && bids.some((b) => b.status === 'Received' || b.status === 'Not selected') && (
              <tr>
                <td />
                {bids.map((b) => (
                  <td key={b.id} className="num">
                    {(b.status === 'Received' || b.status === 'Not selected') && <button type="button" className="btn btn-sm primary" onClick={() => onAward(b)}><Award size={14} /> Award</button>}
                    {b.status === 'Awarded' && <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--success-strong)]"><Check size={14} /> Awarded</span>}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Pick subs to invite: vendors whose trade matches the package first. */
function InviteDialog({ pkg, onClose }: { pkg: BidPackage; onClose: () => void }) {
  const { db, update } = useStore();
  const L = useLookups();
  const trade = db.costCodes.find((c) => c.id === pkg.costCodeId)?.name.toLowerCase() ?? '';
  const already = new Set(db.bids.filter((b) => b.packageId === pkg.id).map((b) => b.vendorId));
  const onJob = new Set((L.linksByJob.get(pkg.jobId) ?? []).map((l) => l.partyId));
  const matches = (t?: string) => !!trade && !!t && (t.toLowerCase() === trade || trade.includes(t.toLowerCase()) || t.toLowerCase().includes(trade));
  const vendors = db.accounts.filter((a) => isVendor(a) && !already.has(a.id))
    .sort((a, b) => Number(matches(b.trade)) - Number(matches(a.trade)) || a.name.localeCompare(b.name));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(vendors.filter((v) => matches(v.trade)).map((v) => v.id)));
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <Modal title="Add subcontractors" onClose={onClose}>
      {vendors.length === 0 && <p className="form-note">Every vendor is already on this package. Add more under Accounts with the Vendor or Subcontractor type.</p>}
      <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
        {vendors.map((v) => (
          <label key={v.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
            <input type="checkbox" checked={picked.has(v.id)} onChange={() => toggle(v.id)} />
            <span className="font-medium">{v.name}</span>
            {v.trade && <span className="text-muted-foreground">· {v.trade}</span>}
            {matches(v.trade) && <span className="text-xs text-[var(--success-strong)]">matches trade</span>}
            {onJob.has(v.id) && <span className="text-xs text-muted-foreground">on this job</span>}
            <span className="ml-auto text-xs text-muted-foreground">{vendorEmail(db, v.id) || 'no email'}</span>
          </label>
        ))}
      </div>
      <div className="row-end">
        <span style={{ flex: 1 }} />
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={picked.size === 0} onClick={() => { update((d) => inviteVendors(d, pkg.id, [...picked])); onClose(); }}>
          <UserPlus /> Add {picked.size || ''} sub{picked.size === 1 ? '' : 's'}
        </Button>
      </div>
    </Modal>
  );
}

/** For a sub with no email on file: show the message to copy, and mark it sent. */
function EmailDialog({ pkg, bid, onClose }: { pkg: BidPackage; bid: Bid; onClose: () => void }) {
  const { db, update } = useStore();
  const L = useLookups();
  const e = inviteEmail(db, pkg, bid.vendorId);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(`Subject: ${e.subject}\n\n${e.body}`).catch(() => {});
    setCopied(true);
  };
  return (
    <Modal title={`Email ${L.party.get(bid.vendorId)?.name ?? 'sub'}`} onClose={onClose} wide>
      <p className="form-note">There's no email address on file for this sub. Copy the message into your mail app (or add their email on their account), then mark it sent.</p>
      <Field label="Subject"><input readOnly value={e.subject} /></Field>
      <Field label="Message"><textarea readOnly className="min-h-64 w-full" value={e.body} /></Field>
      <div className="row-end">
        <span style={{ flex: 1 }} />
        <Button type="button" variant="outline" onClick={copy}><ClipboardCopy /> {copied ? 'Copied' : 'Copy message'}</Button>
        <Button type="button" onClick={() => { update((d) => markSent(d, pkg.id, [bid.id])); onClose(); }}><Send /> Mark as sent today</Button>
      </div>
    </Modal>
  );
}

/** Enter (or correct) a sub's bid as it came back: total, item prices, terms and their quote. */
function BidDialog({ pkg, bid, onClose }: { pkg: BidPackage; bid: Bid; onClose: () => void }) {
  const { db, update } = useStore();
  const L = useLookups();
  const live = db.bids.find((b) => b.id === bid.id) ?? bid; // attachments save straight away
  const [received, setReceived] = useState(bid.received || todayYmd());
  const [amount, setAmount] = useState(bid.amount ? String(bid.amount) : '');
  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(pkg.items.map((i) => [i.id, bid.itemPrices[i.id] ? String(bid.itemPrices[i.id]) : ''])));
  const [inclusions, setInclusions] = useState(bid.inclusions);
  const [exclusions, setExclusions] = useState(bid.exclusions);
  const [validUntil, setValidUntil] = useState(bid.validUntil);
  const [notes, setNotes] = useState(bid.notes);
  const itemPrices = Object.fromEntries(Object.entries(prices).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]));
  const itemSum = Object.values(itemPrices).reduce((s, n) => s + n, 0);
  const total = Number(amount) || itemSum;
  const mismatch = itemSum > 0 && Number(amount) > 0 && Math.abs(itemSum - Number(amount)) > 0.005;
  const save = () => {
    update((d) => recordBid(d, bid.id, { amount: total, itemPrices, inclusions: inclusions.trim(), exclusions: exclusions.trim(), notes: notes.trim(), validUntil, received }));
    onClose();
  };
  return (
    <Modal title={`${bid.amount ? 'Edit' : 'Enter'} bid · ${L.party.get(bid.vendorId)?.name ?? ''}`} onClose={onClose} wide>
      <div className="field-row">
        <Field label="Total bid">
          <input type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={itemSum ? `${itemSum} (sum of items)` : ''} autoFocus />
        </Field>
        <Field label="Received">
          <input type="date" value={received} onChange={(e) => setReceived(e.target.value)} />
        </Field>
        <Field label="Price good until">
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </Field>
      </div>
      {pkg.items.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-sm font-medium">Price per item <span className="font-normal text-muted-foreground">(optional)</span></div>
          <div className="flex flex-col gap-1">
            {pkg.items.map((i) => (
              <label key={i.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{i.description}</span>
                <input type="number" inputMode="decimal" min="0" step="0.01" className="w-32 text-right" value={prices[i.id] ?? ''} onChange={(e) => setPrices((p) => ({ ...p, [i.id]: e.target.value }))} aria-label={`Price for ${i.description}`} />
              </label>
            ))}
          </div>
          {mismatch && <p className="mt-1 text-xs text-destructive">The items add up to {money(itemSum, true)}, not {money(Number(amount), true)}. The total is what counts.</p>}
        </div>
      )}
      <div className="field-row">
        <Field label="Includes"><textarea className="min-h-16" value={inclusions} onChange={(e) => setInclusions(e.target.value)} placeholder="e.g. Permit, materials, cleanup" /></Field>
        <Field label="Excludes"><textarea className="min-h-16" value={exclusions} onChange={(e) => setExclusions(e.target.value)} placeholder="e.g. Fixtures, patch and paint" /></Field>
      </div>
      <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Can start Jan 11" /></Field>
      <div className="mb-3">
        <div className="mb-1 text-sm font-medium">Their quote</div>
        <Attachments files={live.attachments} onChange={(next) => update((d) => editBid(d, bid.id, () => ({ attachments: next })))} hint="Attach the PDF or photo they sent." />
      </div>
      <div className="row-end">
        <span style={{ flex: 1 }} />
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" onClick={save} disabled={!(total > 0)}>Save bid {total > 0 ? money(total, true) : ''}</Button>
      </div>
    </Modal>
  );
}

function AwardDialog({ pkg, bid, onClose }: { pkg: BidPackage; bid: Bid; onClose: () => void }) {
  const { db, update } = useStore();
  const L = useLookups();
  const nav = useNavigate();
  const others = db.bids.filter((b) => b.packageId === pkg.id && b.id !== bid.id && b.status === 'Received');
  const alreadyAwarded = db.bids.filter((b) => b.packageId === pkg.id && b.status === 'Awarded');
  const [othersOut, setOthersOut] = useState(alreadyAwarded.length === 0);
  const award = (open: boolean) => {
    const billId = uid('bill');
    update((d) => awardBid(d, bid.id, othersOut, billId));
    onClose();
    if (open) nav(`/bills/${billId}`);
  };
  return (
    <Modal title={`Award to ${L.party.get(bid.vendorId)?.name ?? 'this sub'}`} onClose={onClose}>
      <p className="form-note">
        Awarding {money(bid.amount, true)} creates a <b>draft bill</b> from {L.party.get(bid.vendorId)?.name} for that amount on this job, coded to this package's cost code. Check it against their invoice before approving it to pay. For progress billing, lower it to their first invoice and add more bills later.
      </p>
      {alreadyAwarded.length > 0 && (
        <p className="form-note text-sm">This package is already awarded to {alreadyAwarded.map((b) => L.party.get(b.vendorId)?.name).join(', ')}. Award this one too if the scope is split between them.</p>
      )}
      {others.length > 0 && (
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={othersOut} onChange={(e) => setOthersOut(e.target.checked)} />
          Mark the other {others.length === 1 ? 'bid' : `${others.length} bids`} as not selected
        </label>
      )}
      <div className="row-end">
        <span style={{ flex: 1 }} />
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" variant="outline" onClick={() => award(false)}>Award</Button>
        <Button type="button" onClick={() => award(true)}><Award /> Award and open the bill</Button>
      </div>
    </Modal>
  );
}

function ScopeView({ pkg }: { pkg: BidPackage }) {
  const { db, update } = useStore();
  const editable = isPackageOpen(pkg);
  const [importing, setImporting] = useState(false);
  const edit = (fn: (p: BidPackage) => Partial<BidPackage>) => update((d) => editPackage(d, pkg.id, fn));
  const setItem = (id: string, patch: Partial<BidItem>) => edit((p) => ({ items: p.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  const code = db.costCodes.find((c) => c.id === pkg.costCodeId);
  return (
    <div className="b-wrap max-w-5xl">
      <section className="card mb-4">
        <div className="card-head"><h2>Package</h2></div>
        <div className="card-body grid gap-3 sm:grid-cols-3">
          <Field label="Title">
            {editable ? <TextCell value={pkg.title} label="Title" placeholder="e.g. Electrical — whole house" onSave={(v) => edit(() => ({ title: v }))} /> : <div className="py-1.5">{pkg.title || <span className="muted">Untitled</span>}</div>}
          </Field>
          <Field label="Trade (cost code)">
            {editable ? (
              <select className="b-input" value={pkg.costCodeId} onChange={(e) => edit(() => ({ costCodeId: e.target.value }))}>
                <option value="">None</option>
                {db.costCodes.map((c) => <option key={c.id} value={c.id}>{c.number} {c.name}</option>)}
              </select>
            ) : <div className="py-1.5">{code ? `${code.number} ${code.name}` : '—'}</div>}
          </Field>
          <Field label="Bids due">
            {editable ? <input type="date" className="b-input" value={pkg.due} onChange={(e) => edit(() => ({ due: e.target.value }))} /> : <div className="py-1.5">{fmtDate(pkg.due)}</div>}
          </Field>
        </div>
      </section>

      <section className="card mb-4">
        <div className="card-head"><h2>Scope of work</h2></div>
        <div className="card-body">
          {editable ? <ScopeBox value={pkg.scope} onSave={(v) => edit(() => ({ scope: v }))} /> : <div className="whitespace-pre-wrap text-sm">{pkg.scope || <span className="muted">No scope written.</span>}</div>}
        </div>
      </section>

      <section className="card mb-4">
        <div className="card-head">
          <h2>Items to price</h2>
          <span className="ml-auto text-xs text-muted-foreground">Optional. Subs can price each one; your budget prices are never shown to them.</span>
        </div>
        {pkg.items.length > 0 && (
          <div className="table-wrap">
            <table className="grid-table bt-table">
              <thead>
                <tr><th>Item</th><th className="num">Qty</th><th>Unit</th>{editable && <th aria-label="Actions" />}</tr>
              </thead>
              <tbody>
                {pkg.items.map((i) => (
                  <tr key={i.id}>
                    <td className="bt-wrap">{editable ? <TextCell value={i.description} label="Item" className="w-full" onSave={(v) => setItem(i.id, { description: v })} /> : i.description}</td>
                    <td className="num">{editable ? <NumCell value={i.quantity} label="Quantity" width={80} onSave={(n) => setItem(i.id, { quantity: n })} /> : i.quantity}</td>
                    <td>{editable ? <TextCell value={i.unit} label="Unit" className="w-24" onSave={(v) => setItem(i.id, { unit: v })} /> : i.unit}</td>
                    {editable && <td className="center"><button type="button" className="icon-btn" aria-label="Remove item" title="Remove item" onClick={() => edit((p) => ({ items: p.items.filter((x) => x.id !== i.id) }))}><Trash2 size={14} /></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {editable && (
          <div className="card-body flex flex-wrap gap-2 pt-2">
            <button type="button" className="btn btn-sm" onClick={() => edit((p) => ({ items: [...p.items, { id: uid('bi'), description: '', quantity: 1, unit: 'lump' }] }))}><Plus size={14} /> Add item</button>
            <button type="button" className="btn btn-sm" onClick={() => setImporting(true)}><Import size={14} /> Import from budget</button>
          </div>
        )}
      </section>

      <section className="card mb-4">
        <div className="card-head"><h2>Files for bidders</h2></div>
        <div className="card-body">
          <Attachments files={pkg.attachments} onChange={(next) => edit(() => ({ attachments: next }))} hint="Plans, specs and photos. Attach them to the email along with the PDF." />
        </div>
      </section>
      {importing && <ImportDialog pkg={pkg} onClose={() => setImporting(false)} />}
    </div>
  );
}

function ScopeBox({ value, onSave }: { value: string; onSave: (s: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <textarea
      className="b-input min-h-40 w-full"
      aria-label="Scope of work"
      placeholder="What the sub is pricing: the work, where, what's supplied by whom, standards, schedule…"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onSave(text)}
    />
  );
}

/** Copy lines from the job's budgets into the package. Lines for the package's cost code come first. */
function ImportDialog({ pkg, onClose }: { pkg: BidPackage; onClose: () => void }) {
  const { db, update } = useStore();
  const budgets = db.budgets.filter((b) => b.jobId === pkg.jobId && b.status !== 'Void' && b.status !== 'Declined');
  const already = new Set(pkg.items.map((i) => i.budgetLineId).filter(Boolean));
  const [onlyCode, setOnlyCode] = useState(!!pkg.costCodeId);
  const lines = useMemo(
    () => db.budgetLines.filter((l) => budgets.some((b) => b.id === l.budgetId) && (!onlyCode || l.costCodeId === pkg.costCodeId)),
    [db.budgetLines, budgets, onlyCode, pkg.costCodeId],
  );
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const code = db.costCodes.find((c) => c.id === pkg.costCodeId);
  return (
    <Modal title="Import items from a budget" onClose={onClose} wide>
      <p className="form-note">Picked lines are copied into the package as items to price, with their quantities and units. Changing the budget later won't change the package. Your costs and prices aren't shown to bidders.</p>
      {code && (
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyCode} onChange={(e) => setOnlyCode(e.target.checked)} /> Only {code.number} {code.name} lines
        </label>
      )}
      <div className="flex max-h-96 flex-col overflow-y-auto">
        {budgets.map((b) => {
          const bl = lines.filter((l) => l.budgetId === b.id);
          if (!bl.length) return null;
          return (
            <div key={b.id} className="mb-2">
              <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{budgetLabel(b)}{b.title ? ` · ${b.title}` : ''} · {b.status}</div>
              {bl.map((l) => (
                <label key={l.id} className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60', already.has(l.id) && 'opacity-60')}>
                  <input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} />
                  <span className="min-w-0 flex-1 truncate">{l.name}<span className="text-muted-foreground"> · {l.group}</span></span>
                  <span className="text-xs text-muted-foreground">{l.quantity} {l.unit}</span>
                  <span className="w-24 text-right text-xs tabular-nums text-muted-foreground" title="Your budgeted cost (not shown to bidders)">{money(lineCost(l))}</span>
                  {already.has(l.id) && <span className="text-xs text-muted-foreground">already added</span>}
                </label>
              ))}
            </div>
          );
        })}
        {lines.length === 0 && <p className="text-sm text-muted-foreground">No budget lines{onlyCode && code ? ` for ${code.name}` : ''} on this job.</p>}
      </div>
      <div className="row-end">
        <span style={{ flex: 1 }} />
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={picked.size === 0} onClick={() => { update((d) => importItems(d, pkg.id, [...picked])); onClose(); }}><Import /> Import {picked.size || ''} line{picked.size === 1 ? '' : 's'}</Button>
      </div>
    </Modal>
  );
}
