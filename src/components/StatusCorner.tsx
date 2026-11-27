// The status corner in the top bar: which version is running, whether the shared
// data is connected, and whether a newer version has been deployed.
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCloudStatus, type CloudStatus } from '../cloud';
import { cn } from '@/lib/utils';

const CHECK_EVERY = 5 * 60 * 1000;

const DOT: Record<CloudStatus, string> = {
  local: 'bg-muted-foreground/50',
  connecting: 'bg-amber-500',
  online: 'bg-emerald-500',
  saving: 'bg-sky-500 animate-pulse',
  offline: 'bg-amber-500',
  error: 'bg-red-500',
};
const LABEL: Record<CloudStatus, string> = {
  local: 'This browser only',
  connecting: 'Connecting…',
  online: 'Connected',
  saving: 'Saving…',
  offline: 'Offline — saves when back online',
  error: 'Couldn’t save — retrying',
};
const ENV: Record<string, string> = { production: 'Live', preview: 'Preview', development: 'Development', local: 'Local' };

/** Notices when the server has a different build from the one running here. */
function useUpdateAvailable() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (__BUILD__.env === 'local' && import.meta.env.DEV) return; // the dev server reloads by itself
    let stop = false;
    const check = async () => {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const live = (await res.json()) as typeof __BUILD__;
        if (!stop && live.commit !== __BUILD__.commit) setAvailable(true);
      } catch {
        /* offline: try again later */
      }
    };
    const timer = window.setInterval(check, CHECK_EVERY);
    const onFocus = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onFocus);
    check();
    return () => {
      stop = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);
  return available;
}

export function StatusCorner() {
  const { status, error } = useCloudStatus();
  const update = useUpdateAvailable();
  const env = ENV[__BUILD__.env] ?? __BUILD__.env;
  return (
    <div className="ml-auto flex items-center gap-2">
      {update && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground shadow-xs hover:bg-primary/90"
        >
          <RefreshCw className="size-3.5" /> Update
        </button>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Version ${__BUILD__.version}, ${LABEL[status]}`}
            className="inline-flex h-8 items-center gap-2 rounded-md border bg-card px-2.5 text-xs text-muted-foreground shadow-xs hover:text-foreground"
          >
            <span className={cn('size-2 rounded-full', DOT[status])} />
            <span className="hidden font-mono sm:inline">v{__BUILD__.version}</span>
            {__BUILD__.env !== 'production' && (
              <span className="rounded bg-muted px-1 font-medium uppercase tracking-wide text-[10px]">{env}</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-mono">{__BUILD__.version}</dd>
            <dt className="text-muted-foreground">Build</dt>
            <dd className="font-mono">
              {__BUILD__.commit}
              {__BUILD__.branch && __BUILD__.branch !== 'main' ? ` · ${__BUILD__.branch}` : ''}
            </dd>
            <dt className="text-muted-foreground">Built</dt>
            <dd>{new Date(__BUILD__.built).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</dd>
            <dt className="text-muted-foreground">Running</dt>
            <dd>{env}</dd>
            <dt className="text-muted-foreground">Data</dt>
            <dd className="flex items-center gap-1.5">
              <span className={cn('size-2 shrink-0 rounded-full', DOT[status])} />
              {status === 'local' ? 'This browser only' : `Shared · ${LABEL[status]}`}
            </dd>
          </dl>
          {status === 'error' && error && <p className="mt-2 break-words text-xs text-destructive">{error}</p>}
          <p className="mt-3 text-xs text-muted-foreground">
            {update ? 'A newer version is live. Click Update to load it.' : 'You’re on the latest version.'}
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
