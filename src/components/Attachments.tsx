// A list of uploaded files on a record (a bill now, bid packages later): add, open, remove.
// The bytes live in this browser's file store (src/files.ts); the record keeps StoredFile entries.
import { useRef, useState } from 'react';
import { ExternalLink, FileText, Image as ImageIcon, Paperclip, Trash2 } from 'lucide-react';
import type { StoredFile } from '../data';
import { fileSize, getFile } from '../files';
import { storeUpload } from './BudgetSigning';
import { fmtDate } from './Payments';

async function openFile(f: StoredFile) {
  const tab = window.open('', '_blank'); // open synchronously so the browser doesn't block it
  const blob = await getFile(f.fileId).catch(() => undefined);
  if (!blob) {
    tab?.close();
    window.alert(`${f.name} isn't stored in this browser. Files stay in the browser they were uploaded from.`);
    return;
  }
  const url = URL.createObjectURL(blob);
  if (tab) tab.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function Attachments({ files, onChange, hint = 'PDFs, photos or any other file, up to 25 MB each.' }: { files: StoredFile[]; onChange: (next: StoredFile[]) => void; hint?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const add = async (list: FileList) => {
    setBusy(true);
    setError('');
    const added: StoredFile[] = [];
    for (const file of Array.from(list)) {
      try {
        added.push(await storeUpload(file));
      } catch (e) {
        setError(e instanceof Error ? e.message : `Couldn't save ${file.name}.`);
      }
    }
    if (added.length) onChange([...files, ...added]);
    setBusy(false);
  };
  const remove = (f: StoredFile) => {
    if (!window.confirm(`Remove ${f.name}?`)) return;
    onChange(files.filter((x) => x.fileId !== f.fileId));
  };
  return (
    <div>
      {files.length === 0 && <p className="text-sm text-muted-foreground">No files attached.</p>}
      <ul className="flex flex-col gap-1">
        {files.map((f) => {
          const Icon = f.type.startsWith('image/') ? ImageIcon : FileText;
          return (
            <li key={f.fileId} className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <button type="button" className="min-w-0 truncate text-left font-medium text-primary hover:underline" onClick={() => openFile(f)} title="Open in a new tab">
                {f.name}
              </button>
              <span className="whitespace-nowrap text-xs text-muted-foreground">{fileSize(f.size)} · {fmtDate(f.uploaded)}</span>
              <span className="grow" />
              <button type="button" className="icon-btn" title="Open" aria-label={`Open ${f.name}`} onClick={() => openFile(f)}><ExternalLink size={14} /></button>
              <button type="button" className="icon-btn" title="Remove" aria-label={`Remove ${f.name}`} onClick={() => remove(f)}><Trash2 size={14} /></button>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <input ref={input} type="file" multiple hidden onChange={(e) => { if (e.target.files?.length) add(e.target.files); e.target.value = ''; }} />
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => input.current?.click()}><Paperclip size={14} /> {busy ? 'Saving…' : 'Attach files'}</button>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
