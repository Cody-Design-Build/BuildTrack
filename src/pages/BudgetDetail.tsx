import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, FolderPlus, Lock, Plus, Trash2, Upload, Printer } from 'lucide-react';
import { StatusMenu } from '../components/StatusMenu';
import { BudgetDocument } from '../components/BudgetDocument';
import { Segmented, useRememberedChoice } from '../components/DocLayout';
import { ApproveDialog, BudgetHistory, SignedCopyCard, SignedCopyViewer } from '../components/BudgetSigning';
import { PageHeader, Modal } from '../components/Layout';
import { Field } from '../components/Forms';
import { NumCell, TextCell } from '../components/Cells';
import { downloadCsv } from '../lib/downloads';
import { useLookups, useStore, money, uid, lineCost, linePrice } from '../store';
import { BUDGET_STATUSES, COST_TYPES, DEFAULT_DISPLAY, type Budget, type BudgetDetailLevel, type BudgetLine, type BudgetStatus, type CostType } from '../data';
import { BUDGET_STATUS_COLOR, NEXT_STATUSES, budgetLabel, deleteBudget, editBudget, isEditable, pct, setBudgetStatus, totals } from '../budgets';
import { useCloneBudget } from './Budgets';

const CONFIRM: Partial<Record<BudgetStatus, string>> = {
  Sent: 'Sending locks this budget so it matches what the customer sees. To change it later, clone it and send the copy. Mark it as sent?',
  Void: 'Voiding takes this budget out of the contract for good. It stays on record but can never be used again. Void it?',
};

type View = 'lines' | 'document' | 'details' | 'signed';
const VIEWS: { id: View; label: string }[] = [
  { id: 'lines', label: 'Lines' },
  { id: 'document', label: 'Document' },
  { id: 'details', label: 'Details' },
  { id: 'signed', label: 'Signed copy' },
];
const STATUS_HINT: Record<BudgetStatus, string> = {
  Draft: 'Marking it sent locks it, so it always matches what the customer saw.',
  Sent: "A sent budget can't go back to draft. Clone it to make changes.",
  Approved: 'A signed budget can only be voided. Clone it to make changes.',
  Declined: 'Declined is final. Clone it to reuse the lines.',
  Void: 'Void is final. Clone it to reuse the lines.',
};
const DETAIL_LABEL: Record<BudgetDetailLevel, string> = { lines: 'Every line priced', groups: 'Group totals only', total: 'One total for the whole scope' };

export default function BudgetDetail() {
  const { id = '' } = useParams();
  const { db, update } = useStore();
  const L = useLookups();
  const nav = useNavigate();
  const clone = useCloneBudget();
  const [newGroup, setNewGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  // Lines or Document is remembered between budgets; Details and Signed copy are one-off visits
  const [chosenView, setView] = useRememberedChoice<View>('buildtrack-budget-view', ['lines', 'document', 'details', 'signed'], 'lines', (v) => v === 'lines' || v === 'document');
  const [approving, setApproving] = useState(false);
  // the PDF file name browsers suggest comes from the page title
  useEffect(() => {
    const prev = document.title;
    const b = db.budgets.find((x) => x.id === id);
    if (b) document.title = `${b.kind} ${b.number}${b.title ? ` - ${b.title}` : ''} - ${db.companyName}`;
    return () => { document.title = prev; };
  }, [db, id]);

  const budget = db.budgets.find((b) => b.id === id);
  if (!budget) {
    return (
      <div className="page scroll">
        <PageHeader title="Budget not found" />
        <div className="detail"><p className="muted">This budget doesn't exist. It may have been deleted. <Link to="/budgets" className="text-primary hover:underline">See all budgets</Link></p></div>
      </div>
    );
  }
  const job = L.job.get(budget.jobId);
  const lines = db.budgetLines.filter((l) => l.budgetId === id);
  const editable = isEditable(budget);
  const groups = [...new Set(lines.map((l) => l.group))];
  const t = totals(lines);
  const display = budget.display ?? DEFAULT_DISPLAY;
  const view: View = chosenView === 'signed' && !budget.signedCopy ? 'lines' : chosenView;
  const codeName = (cid: string) => {
    const c = db.costCodes.find((x) => x.id === cid);
    return c ? `${c.number} ${c.name}` : '';
  };
  const isTrade = (types: string[]) => types.some((x) => ['Vendor', 'Subcontractor', 'Supplier'].includes(x));
  const vendors = [...db.accounts].sort((a, b) => Number(isTrade(b.types)) - Number(isTrade(a.types)) || a.name.localeCompare(b.name));
  const recipients = [...new Set((L.linksByJob.get(budget.jobId) ?? []).map((l) => l.partyId))].map((pid) => L.party.get(pid)).filter((p) => !!p);

  const edit = (fn: Parameters<typeof editBudget>[2]) => update((d) => editBudget(d, id, fn));
  const setField = (p: Partial<Budget>) => edit(() => ({ budget: p }));
  const patch = (lineId: string, p: Partial<BudgetLine>) => edit((_, ls) => ({ lines: ls.map((l) => (l.id === lineId ? { ...l, ...p } : l)) }));
  const remove = (lineId: string) => edit((_, ls) => ({ lines: ls.filter((l) => l.id !== lineId) }));
  const add = (group: string) => {
    const lineId = uid('bl');
    // a new line's cost code follows its group when one matches, e.g. group "Plumbing" → "09 Plumbing"
    const code = db.costCodes.find((c) => c.name.toLowerCase() === group.toLowerCase())
      ?? db.costCodes.find((c) => c.id === lines.filter((l) => l.group === group).pop()?.costCodeId)
      ?? db.costCodes.find((c) => c.name === 'General');
    edit((_, ls) => {
      const line: BudgetLine = { id: lineId, budgetId: id, group, costCodeId: code?.id ?? '', name: 'New item', description: '', costType: 'Materials', quantity: 1, unit: 'ea', unitCost: 0, markup: 20, vendorId: '' };
      const lastInGroup = ls.map((l) => l.group).lastIndexOf(group);
      return { lines: lastInGroup < 0 ? [...ls, line] : [...ls.slice(0, lastInGroup + 1), line, ...ls.slice(lastInGroup + 1)] };
    });
  };
  const renameGroup = (from: string, to: string) => {
    const name = to.trim();
    if (name) edit((_, ls) => ({ lines: ls.map((l) => (l.group === from ? { ...l, group: name } : l)) }));
  };
  const move = (to: BudgetStatus) => {
    if (to === 'Approved') return setApproving(true);
    const q = CONFIRM[to];
    if (q && !window.confirm(q)) return;
    update((d) => setBudgetStatus(d, id, to));
  };
  const del = () => {
    if (!window.confirm(`Delete ${budgetLabel(budget)}? This draft and its lines will be removed.`)) return;
    update((d) => deleteBudget(d, id));
    nav(`/jobs?job=${budget.jobId}&tab=budget`);
  };
  return (
    <div className="page scroll job-page">
      <PageHeader
        crumb={job?.name ?? 'Budget'}
        title={`${budgetLabel(budget)}${budget.title ? ` · ${budget.title}` : ''}`}
        actions={
          <>
            <button type="button" className="btn" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
            <button type="button" className="btn" onClick={() => clone(budget.id)}><Copy size={14} /> Clone</button>
            {editable && <button type="button" className="btn" onClick={del}><Trash2 size={14} /> Delete</button>}
          </>
        }
      />
      <div className="j-bar flex-wrap">
        <Link to={`/jobs?job=${budget.jobId}&tab=budget`} className="back-link"><ArrowLeft size={14} /> {job?.name ?? 'Job'} budgets</Link>
        <StatusMenu value={budget.status} statuses={BUDGET_STATUSES} allowed={NEXT_STATUSES[budget.status]} colors={BUDGET_STATUS_COLOR} onSelect={move} hint={STATUS_HINT[budget.status]} />
        {!editable && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="Sent and signed budgets can't be edited, so they always match what the customer saw.">
            <Lock size={12} /> Locked · clone to make changes
          </span>
        )}
        <span className="grow" />
        <Segmented label="View" options={VIEWS.filter((v) => v.id !== 'signed' || budget.signedCopy)} value={view} onChange={setView} />
      </div>

      <div className="detail">
        {view === 'lines' && (
          <div className="b-wrap">
            <div className="toolbar b-toolbar flex-wrap">
              {editable && (
                <>
                  <button type="button" className="btn" onClick={() => add(groups[groups.length - 1] ?? 'General')}><Plus size={14} /> Item</button>
                  <button type="button" className="btn" onClick={() => { setGroupName(''); setNewGroup(true); }}><FolderPlus size={14} /> Group</button>
                </>
              )}
              <span className="grow" />
              <span className="text-sm text-muted-foreground">
                Cost <b className="text-foreground tabular-nums">{money(t.cost)}</b>
                <span className="mx-2">·</span>Price <b className="text-foreground tabular-nums">{money(t.price)}</b>
                <span className="mx-2">·</span>Margin <b className="text-foreground tabular-nums">{pct(t.margin)}</b>
              </span>
              <button
                type="button"
                className="btn icon-only"
                title="Export to spreadsheet"
                aria-label="Export"
                onClick={() =>
                  downloadCsv(`${job?.name ?? 'Job'} ${budgetLabel(budget)}.csv`, [
                    ['Group', 'Cost code', 'Item', 'Description', 'Type', 'Vendor', 'Qty', 'Unit', 'Unit cost', 'Markup %', 'Cost', 'Price'],
                    ...lines.map((l) => [l.group, codeName(l.costCodeId), l.name, l.description, l.costType, L.account.get(l.vendorId)?.name ?? '', String(l.quantity), l.unit, String(l.unitCost), String(l.markup), lineCost(l).toFixed(2), linePrice(l).toFixed(2)]),
                  ])
                }
              >
                <Upload size={14} />
              </button>
            </div>

          {lines.length === 0 ? (
            <div className="card b-empty">
              <p>{editable ? 'No lines yet. Add the labor, materials and subcontractors for this scope. Lines can be negative, e.g. a credit for a fee already paid.' : 'This budget has no lines.'}</p>
              {editable && <button type="button" className="btn primary" onClick={() => add('General')}><Plus size={14} /> Add first item</button>}
            </div>
          ) : (
            <div className="table-wrap b-table-wrap">
              <table className="grid-table b-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Cost code</th>
                    <th>Type</th>
                    <th>Vendor</th>
                    <th className="num">Qty</th>
                    <th>Unit</th>
                    <th className="num">Unit cost</th>
                    <th className="num">Markup %</th>
                    <th className="num">Cost</th>
                    <th className="num">Price</th>
                    {editable && <th aria-label="Remove" />}
                  </tr>
                </thead>
                {groups.map((g) => {
                  const gl = lines.filter((l) => l.group === g);
                  const gt = totals(gl);
                  return (
                    <tbody key={g}>
                      <tr className="b-group">
                        <td colSpan={8}>
                          {editable ? <TextCell value={g} label="Group name" className="bold" onSave={(v) => renameGroup(g, v)} /> : <span className="bold">{g}</span>}
                        </td>
                        <td className="num">{money(gt.cost)}</td>
                        <td className="num">{money(gt.price)}</td>
                        {editable && (
                          <td className="center">
                            <button type="button" className="icon-btn" title={`Add item to ${g}`} aria-label={`Add item to ${g}`} onClick={() => add(g)}><Plus size={14} /></button>
                          </td>
                        )}
                      </tr>
                      {gl.map((l) =>
                        editable ? (
                          <tr key={l.id}>
                            <td className="min-w-[220px]">
                              <TextCell value={l.name} label="Item name" onSave={(v) => patch(l.id, { name: v })} />
                              <TextCell value={l.description} label="Description" placeholder="Add a description for the customer" className="bt-desc" onSave={(v) => patch(l.id, { description: v })} />
                            </td>
                            <td>
                              <select className="b-input" value={l.costCodeId} aria-label="Cost code" onChange={(e) => patch(l.id, { costCodeId: e.target.value })}>
                                {!l.costCodeId && <option value="">—</option>}
                                {db.costCodes.map((c) => <option key={c.id} value={c.id}>{c.number} {c.name}</option>)}
                              </select>
                            </td>
                            <td>
                              <select className="b-input" value={l.costType} aria-label="Cost type" onChange={(e) => patch(l.id, { costType: e.target.value as CostType })}>
                                {COST_TYPES.map((c) => <option key={c}>{c}</option>)}
                              </select>
                            </td>
                            <td>
                              <select className="b-input" value={l.vendorId} aria-label="Vendor" onChange={(e) => patch(l.id, { vendorId: e.target.value })}>
                                <option value="">—</option>
                                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                              </select>
                            </td>
                            <td className="num"><NumCell value={l.quantity} label="Quantity" width={60} onSave={(n) => patch(l.id, { quantity: n })} /></td>
                            <td><TextCell value={l.unit} label="Unit" className="b-unit" onSave={(v) => patch(l.id, { unit: v })} /></td>
                            <td className="num"><NumCell value={l.unitCost} label="Unit cost" onSave={(n) => patch(l.id, { unitCost: n })} /></td>
                            <td className="num"><NumCell value={l.markup} label="Markup percent" width={56} onSave={(n) => patch(l.id, { markup: n })} /></td>
                            <td className="num">{money(lineCost(l))}</td>
                            <td className="num bold">{money(linePrice(l))}</td>
                            <td className="center">
                              <button type="button" className="icon-btn" title="Remove item" aria-label="Remove item" onClick={() => remove(l.id)}><Trash2 size={14} /></button>
                            </td>
                          </tr>
                        ) : (
                          <tr key={l.id}>
                            <td>{l.name}{l.description && <div className="muted small-text">{l.description}</div>}</td>
                            <td className="whitespace-nowrap">{codeName(l.costCodeId)}</td>
                            <td>{l.costType}</td>
                            <td>{L.account.get(l.vendorId)?.name ?? ''}</td>
                            <td className="num">{l.quantity}</td>
                            <td>{l.unit}</td>
                            <td className="num">{money(l.unitCost, true)}</td>
                            <td className="num">{l.markup}%</td>
                            <td className="num">{money(lineCost(l))}</td>
                            <td className="num bold">{money(linePrice(l))}</td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  );
                })}
                <tfoot>
                  <tr className="b-total">
                    <td colSpan={8}>{budget.kind} total</td>
                    <td className="num">{money(t.cost)}</td>
                    <td className="num">{money(t.price)}</td>
                    {editable && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          </div>
        )}

        {view === 'document' && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <label className="inline-flex items-center gap-2">
                <span className="text-muted-foreground">Customer sees</span>
                <select className="b-input w-auto rounded-md border" value={display.detail} disabled={!editable} onChange={(e) => setField({ display: { ...display, detail: e.target.value as BudgetDetailLevel } })}>
                  {(Object.keys(DETAIL_LABEL) as BudgetDetailLevel[]).map((k) => <option key={k} value={k}>{DETAIL_LABEL[k]}</option>)}
                </select>
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={display.quantities} disabled={!editable} onChange={(e) => setField({ display: { ...display, quantities: e.target.checked } })} />
                Show quantities
              </label>
            </div>
            <div className="bt-doc-col">
              <BudgetDocument budget={budget} lines={lines} db={db} L={L} />
            </div>
          </>
        )}

        {view === 'details' && (
          <div className="b-wrap max-w-4xl">
            <section className="card mb-4">
              <div className="card-body grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <Field label="Title">
                  {editable
                    ? <TextCell value={budget.title} label="Title" placeholder={budget.kind === 'Proposal' ? 'e.g. Kitchen remodel — Option A' : 'e.g. Add pantry cabinets'} onSave={(v) => setField({ title: v })} />
                    : <div className="py-1.5">{budget.title || <span className="muted">Untitled</span>}</div>}
                </Field>
                <Field label="To">
                  {editable ? (
                    <select className="b-input" value={budget.partyId} onChange={(e) => setField({ partyId: e.target.value })}>
                      <option value="">—</option>
                      {recipients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  ) : (
                    <div className="py-1.5">{L.party.get(budget.partyId)?.name ?? <span className="muted">—</span>}</div>
                  )}
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Notes on the document">
                    {editable ? (
                      <NotesBox value={budget.notes} onSave={(v) => setField({ notes: v })} />
                    ) : (
                      <div className="whitespace-pre-wrap py-1.5">{budget.notes || <span className="muted">No notes</span>}</div>
                    )}
                  </Field>
                </div>
                {budget.clonedFromId && (() => {
                  const src = db.budgets.find((b) => b.id === budget.clonedFromId);
                  return src ? <p className="text-sm text-muted-foreground sm:col-span-2">Cloned from <Link to={`/budgets/${src.id}`} className="text-primary hover:underline">{budgetLabel(src)}</Link></p> : null;
                })()}
              </div>
            </section>

            <SignedCopyCard budget={budget} onView={() => setView('signed')} />

            <div className="b-summary">
              <div className="card stat"><span className="stat-label">Cost</span><b>{money(t.cost)}</b></div>
              <div className="card stat"><span className="stat-label">Price to customer</span><b>{money(t.price)}</b></div>
              <div className="card stat"><span className="stat-label">Profit · margin</span><b>{money(t.profit)}</b><span className="muted small-text">{pct(t.margin)} margin</span></div>
              <div className="card stat"><span className="stat-label">Lines</span><b>{lines.length}</b><span className="muted small-text">{groups.length} groups</span></div>
            </div>

            <BudgetHistory budget={budget} />
          </div>
        )}

        {view === 'signed' && budget.signedCopy && <SignedCopyViewer file={budget.signedCopy} />}
      </div>
      {createPortal(<div className="print-only"><BudgetDocument budget={budget} lines={lines} db={db} L={L} /></div>, document.body)}

      {approving && <ApproveDialog budget={budget} onClose={() => setApproving(false)} />}
      {newGroup && (
        <Modal title="New Group" onClose={() => setNewGroup(false)}>
          <Field label="Group name (e.g. Framing, Electrical)">
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)} autoFocus />
          </Field>
          <div className="row-end">
            <button type="button" className="btn" onClick={() => setNewGroup(false)}>Cancel</button>
            <button type="button" className="btn primary" disabled={!groupName.trim()} onClick={() => { add(groupName.trim()); setNewGroup(false); }}>Add group</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NotesBox({ value, onSave }: { value: string; onSave: (s: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <textarea
      className="b-input min-h-16 w-full"
      aria-label="Notes on the document"
      placeholder="Scope notes, exclusions or terms shown on the document"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onSave(text)}
    />
  );
}
