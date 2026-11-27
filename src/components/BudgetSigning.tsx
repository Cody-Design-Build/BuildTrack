// Recording a customer's signature on a budget: the approve dialog, the signed copy, and the
// budget's history.
import { useEffect, useRef, useState } from 'react';
import { Download, Eye, FileCheck2, Paperclip, RefreshCw, Trash2 } from 'lucide-react';
import { Modal } from './Layout';
import { Field } from './Forms';
import { useLookups, useStore, uid, localIso, sameDayLabel, timeLabel } from '../store';
import type { Activity, Budget, StoredFile } from '../data';
import { approveBudget, budgetLabel, openAlternates, setSignedCopy } from '../budgets';
import { MAX_FILE_BYTES, fileSize, getFile, putFile } from '../files';
import { tone } from '../colors';

const ACCEPT = 'application/pdf,image/*';
const today = () => localIso().slice(0, 10);

/** Saves an uploaded file to the browser's file store and describes it for the data. */
export async function storeUpload(file: File): Promise<StoredFile> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`That file is ${fileSize(file.size)}. The limit is ${fileSize(MAX_FILE_BYTES)}.`);
  const fileId = uid('f');
  await putFile(fileId, file);
  return { fileId, name: file.name, type: file.type || 'application/octet-stream', size: file.size, uploaded: localIso() };
}

/** A temporary address for a stored file, or 'missing' if this browser doesn't have it. */
export function useFileUrl(fileId?: string): string | 'missing' | '' {
  const [url, setUrl] = useState<string>('');
  useEffect(() => {
    if (!fileId) return setUrl('');
    let live = true;
    let made = '';
    getFile(fileId)
      .then((blob) => {
        if (!live) return;
        if (!blob) return setUrl('missing');
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => live && setUrl('missing'));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [fileId]);
  return url;
}

export function ApproveDialog({ budget, onClose }: { budget: Budget; onClose: () => void }) {
  const { db, update } = useStore();
  const L = useLookups();
  const alternates = openAlternates(db, budget);
  const [signedBy, setSignedBy] = useState(L.party.get(budget.partyId)?.name ?? '');
  const [date, setDate] = useState(today());
  const [file, setFile] = useState<File | null>(null);
  const [decline, setDecline] = useState<Set<string>>(() => new Set(alternates.map((a) => a.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const signedCopy = file ? await storeUpload(file) : undefined;
      update((d) => approveBudget(d, budget.id, { signedBy, date, signedCopy, declineIds: [...decline] }));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The file could not be saved.');
      setBusy(false);
    }
  };

  return (
    <Modal title={`Approve ${budgetLabel(budget)}`} onClose={onClose}>
      <p className="text-sm text-muted-foreground">Record the customer's signature. The budget stays locked and counts toward the job's contract.</p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field label="Signed by">
          <input value={signedBy} onChange={(e) => setSignedBy(e.target.value)} placeholder="Customer's name" />
        </Field>
        <Field label="Date signed">
          <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Signed copy (optional)">
        <input type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
      {file && <p className="-mt-2 text-xs text-muted-foreground">{file.name} · {fileSize(file.size)}</p>}
      {alternates.length > 0 && (
        <fieldset className="rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">Other proposals still out on this job</legend>
          <p className="mb-2 text-xs text-muted-foreground">The customer chose this one. Mark the others as declined?</p>
          {alternates.map((a) => (
            <label key={a.id} className="flex items-center gap-2 py-0.5 text-sm">
              <input
                type="checkbox"
                checked={decline.has(a.id)}
                onChange={(e) => setDecline((s) => { const n = new Set(s); if (e.target.checked) n.add(a.id); else n.delete(a.id); return n; })}
              />
              Decline {budgetLabel(a)}{a.title ? ` · ${a.title}` : ''}
            </label>
          ))}
        </fieldset>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="row-end">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" disabled={busy || !signedBy.trim() || !date} onClick={submit}>
          <FileCheck2 size={14} /> {busy ? 'Saving…' : 'Mark as approved'}
        </button>
      </div>
    </Modal>
  );
}

/** The signed copy on a sent or approved budget: view, download, attach, replace or remove it. */
export function SignedCopyCard({ budget, onView }: { budget: Budget; onView: () => void }) {
  const { update } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const f = budget.signedCopy;
  const url = useFileUrl(f?.fileId);
  const canChange = budget.status === 'Sent' || budget.status === 'Approved';
  if (!f && !canChange) return null;

  const upload = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      const stored = await storeUpload(file);
      update((d) => setSignedCopy(d, budget.id, stored));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The file could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card mb-4">
      <div className="card-head">
        <h2>Signed copy</h2>
        {canChange && (
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => input.current?.click()}>
            {f ? <RefreshCw size={14} /> : <Paperclip size={14} />} {busy ? 'Saving…' : f ? 'Replace' : 'Attach'}
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) upload(file);
          }}
        />
      </div>
      <div className="card-body">
        {budget.approval && (
          <p className="mb-2 text-sm">
            Signed by <b>{budget.approval.signedBy}</b> on {new Date(`${budget.approval.date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
          </p>
        )}
        {f ? (
          <div className="flex flex-wrap items-center gap-2">
            <FileCheck2 size={16} className="text-muted-foreground" />
            <span className="min-w-0 truncate text-sm font-medium">{f.name}</span>
            <span className="text-xs text-muted-foreground">{fileSize(f.size)}</span>
            <span className="grow" />
            {url === 'missing' ? (
              <span className="text-xs text-muted-foreground">Not stored in this browser</span>
            ) : (
              <>
                <button type="button" className="btn btn-sm" onClick={onView} disabled={!url}><Eye size={14} /> View</button>
                <a className="btn btn-sm" href={url || undefined} download={f.name} aria-disabled={!url}><Download size={14} /> Download</a>
              </>
            )}
            {canChange && (
              <button
                type="button"
                className="icon-btn"
                title="Remove signed copy"
                aria-label="Remove signed copy"
                onClick={() => window.confirm(`Remove ${f.name} from ${budgetLabel(budget)}?`) && update((d) => setSignedCopy(d, budget.id, undefined))}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {budget.status === 'Sent'
              ? 'When the customer signs, set the status to Approved to record it and attach the signed copy. You can also attach a copy now.'
              : 'No signed copy attached. Attach the signed PDF or a photo of it.'}
          </p>
        )}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
    </section>
  );
}

export function SignedCopyViewer({ file }: { file: StoredFile }) {
  const url = useFileUrl(file.fileId);
  if (url === 'missing') return <div className="card b-empty"><p>This signed copy isn't stored in this browser. Files stay in the browser they were uploaded from.</p></div>;
  if (!url) return <div className="card b-empty"><p>Loading…</p></div>;
  return file.type.startsWith('image/') ? (
    <img src={url} alt={`Signed copy: ${file.name}`} className="mx-auto max-w-full rounded-md border bg-white" />
  ) : (
    <iframe src={url} title={`Signed copy: ${file.name}`} className="h-[80vh] w-full rounded-md border bg-white" />
  );
}

/** Everything that has happened to a budget, newest first. */
export const BudgetHistory = ({ budget }: { budget: Budget }) => <History match={(a) => a.budgetId === budget.id} empty="No history recorded for this budget yet." />;

/** Activity entries matching a record (a budget, an invoice…), newest first. */
export function History({ match, empty }: { match: (a: Activity) => boolean; empty: string }) {
  const { db } = useStore();
  // newest first; events in the same second keep the order they were recorded in
  const events = db.activity
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => match(a))
    .sort((x, y) => y.a.date.localeCompare(x.a.date) || y.i - x.i)
    .map(({ a }) => a);
  return (
    <section className="card mt-4">
      <div className="card-head"><h2>History</h2></div>
      <div className="card-body">
        {events.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
        <ol className="flex flex-col gap-2">
          {events.map((a) => (
            <li key={a.id} className="flex items-start gap-2.5 text-sm">
              <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: tone(a.color) }} />
              <span className="grow">{a.text}</span>
              <span className="whitespace-nowrap text-xs text-muted-foreground">{sameDayLabel(a.date, new Date())} · {timeLabel(a.date)}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
