import { useEffect, useRef, useState } from 'react';
import { Undo2, Redo2, Ban, Check, Ellipsis, CloudDownload } from 'lucide-react';
import { useStore } from '../store';

/** Shared editing controls for the Tasks and Schedule toolbars. */
export function EditTools({ onDownload, extra }: { onDownload?: () => void; extra?: { label: string; run: () => void }[] }) {
  const { undo, redo, revert, canUndo, canRedo } = useStore();
  const [more, setMore] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMore(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  return (
    <>
      {onDownload && (
        <button type="button" className="btn icon-only tb-wide" title="Download calendar" aria-label="Download calendar" onClick={onDownload}>
          <CloudDownload size={14} />
        </button>
      )}
      <div className="btn-group tb-mid">
        <button type="button" className="btn icon-only" title="Undo" aria-label="Undo" onClick={undo} disabled={!canUndo}><Undo2 size={14} /></button>
        <button type="button" className="btn icon-only" title="Redo" aria-label="Redo" onClick={redo} disabled={!canRedo}><Redo2 size={14} /></button>
        <button type="button" className="btn icon-only" title="Discard all changes" aria-label="Discard all changes" onClick={() => canUndo && confirm('Discard all changes made since the page was opened?') && revert()} disabled={!canUndo}><Ban size={14} /></button>
      </div>
      <button type="button" className="btn saved" disabled title="Changes save automatically">
        <Check size={14} /> Save
      </button>
      <div className="menu-wrap tb-more" ref={ref}>
        <button type="button" className="btn icon-only" aria-label="More" title="More" onClick={() => setMore((m) => !m)}><Ellipsis size={14} /></button>
        {more && (
          <div className="dropdown right" onClick={() => setMore(false)}>
            <button type="button" onClick={undo} disabled={!canUndo}>Undo</button>
            <button type="button" onClick={redo} disabled={!canRedo}>Redo</button>
            {onDownload && <button type="button" onClick={onDownload}>Download calendar</button>}
            {extra?.map((x) => <button key={x.label} type="button" onClick={x.run}>{x.label}</button>)}
          </div>
        )}
      </div>
    </>
  );
}
