// A small floating card shown only in the public demo: says what the demo is and
// offers to start over or get the code. Floating, so it never changes page layout.
import { useState } from 'react';
import { ArrowLeft, ExternalLink, Github, RotateCcw, X } from 'lucide-react';
import { DEMO, REPO_URL, SITE_URL } from '../demo';
import { useStore } from '../store';

const KEY = 'bt-demo-notice-hidden';

export function DemoNotice() {
  const { reset } = useStore();
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  if (!DEMO) return null;
  const hide = (value: boolean) => {
    setHidden(value);
    try {
      sessionStorage.setItem(KEY, value ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  };
  const startOver = () => {
    if (confirm('Start over with fresh sample data? Your changes in this demo will be lost.')) reset();
  };
  const place = 'fixed right-3 bottom-[calc(var(--tabs-h)+12px)] z-50 sm:right-4 sm:bottom-4';

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => hide(false)}
        className={`${place} rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-md hover:text-foreground`}
      >
        Demo
      </button>
    );
  }
  return (
    <aside aria-label="About this demo" className={`${place} w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border bg-card p-4 text-sm shadow-lg`}>
      <button type="button" onClick={() => hide(true)} aria-label="Hide" className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
        <X className="size-4" />
      </button>
      <p className="pr-6 font-semibold">You’re trying BuildTrack</p>
      <p className="mt-1 text-muted-foreground">
        This is sample data for a made-up company. Click around and change anything: it stays in this browser and nobody else sees it.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={REPO_URL}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Get it on GitHub <ExternalLink className="size-3.5" />
        </a>
        <button type="button" onClick={startOver} className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-muted">
          <RotateCcw className="size-3.5" /> Start over
        </button>
      </div>
    </aside>
  );
}

/** Links back to the website and the code, at the top of every page in the demo. */
export function DemoLinks() {
  if (!DEMO) return null;
  const link = 'inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground';
  return (
    <nav aria-label="BuildTrack" className="flex items-center gap-1">
      <a href={SITE_URL} className={link} title="Back to buildtrack.run">
        <ArrowLeft className="size-4" />
        <span className="hidden sm:inline">buildtrack.run</span>
      </a>
      <a href={REPO_URL} className={link} title="BuildTrack on GitHub">
        <Github className="size-4" />
        <span className="hidden sm:inline">GitHub</span>
      </a>
    </nav>
  );
}
