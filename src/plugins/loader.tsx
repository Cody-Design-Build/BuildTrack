// Loads the company's installed plugins (db.installedPlugins) and adds them to the registry next to
// BuildTrack's own. Two ways to run one, chosen when it's installed:
//
//   - 'full': its module runs inside the app, like BuildTrack's own plugins. It can do anything the
//     person using the app can, so it's for plugins the company wrote or trusts.
//   - 'sandboxed': its screens run in a frame on a separate, opaque origin (/sandbox.html). It sees
//     only the records it declared and asks the app for every change, which the app checks.
//
// Either way each screen is wrapped so a crash shows a message instead of breaking the page, and
// `?safe` in the address starts the app without any installed plugin.
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { Component, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useLocation as useRouterLocation, useNavigate as useRouterNavigate, useParams } from 'react-router-dom';
import type { Account, Db, Job } from '../data';
import { meOf, useStore } from '../store';
import { signedInAccount } from '../session';
import { costEntries, pluginStatus, setLoadedPlugins, setPluginStatus } from './registry';
import { allowedFor, applyChanges, applyChangesSafely, kit, ScopeContext, visibleData, type KitScope, type RecordChange } from './kit';
import { manifestOf, type InstalledPlugin, type PluginManifest } from './installed';
import type { FromFrame, FrameState, FrameTheme, Slot, ToFrame } from './bridge';
import { isFromFrame } from './bridge';
import type { Plugin, PluginNavItem } from './sdk';
import { cn } from '@/lib/utils';
import * as Icons from './kit-icons';
import { iconName } from './kit-icon-name';

// What /sdk/*.js hand to plugin modules (see scripts/plugin-sdk.mjs).
(globalThis as unknown as { __buildtrack: unknown }).__buildtrack = { kit, React, jsxRuntime };

// ── Safe mode ──────────────────────────────────────────────────────────────────────────────

const SAFE_KEY = 'bt-safe-mode';
/** Started with ?safe: no installed plugins load until safe mode is left (or the tab is closed). */
export function isSafeMode(): boolean {
  try {
    if (new URLSearchParams(location.search).has('safe')) sessionStorage.setItem(SAFE_KEY, '1');
    return sessionStorage.getItem(SAFE_KEY) === '1';
  } catch {
    return new URLSearchParams(location.search).has('safe');
  }
}
export function leaveSafeMode() {
  try {
    sessionStorage.removeItem(SAFE_KEY);
  } catch {
    /* ignore */
  }
  const u = new URL(location.href);
  u.searchParams.delete('safe');
  location.replace(u.toString());
}

// ── Running a plugin's module ──────────────────────────────────────────────────────────────

/** Imports a plugin module from its code and returns what it exports by default. */
export async function importPlugin(code: string): Promise<Plugin> {
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try {
    const mod = (await import(/* @vite-ignore */ url)) as { default?: Plugin };
    const p = mod.default;
    if (!p || typeof p !== 'object' || typeof p.id !== 'string') throw new Error("The file doesn't export a plugin (export default definePlugin({ … })).");
    return p;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export { iconName };

// ── Inside the app ('full') ───────────────────────────────────────────────────────────────

/** Gives a plugin's screen its part of the data, checked writes and the page it's on. */
function HostScope({ plugin, children }: { plugin: Plugin; children: ReactNode }) {
  const { db, update } = useStore();
  const loc = useRouterLocation();
  const params = useParams();
  const navigate = useRouterNavigate();
  const allowed = useMemo(() => allowedFor(plugin), [plugin]);
  const data = useMemo(() => visibleData(db, allowed.read), [db, allowed]);
  const scope = useMemo<KitScope>(() => {
    const me = signedInAccount() ?? (meOf(db) ? { name: meOf(db)!.name, email: meOf(db)!.email ?? '' } : null);
    return {
      plugin: { id: plugin.id, name: plugin.name, collections: (plugin.collections ?? []) as string[], reads: (plugin.reads ?? []) as string[], writes: (plugin.writes ?? []) as string[] },
      data,
      change: (changes: RecordChange[]) => {
        applyChanges(db, changes, allowed.write); // throws here, in the plugin, if it isn't allowed
        update((d) => applyChangesSafely(d, changes, allowed.write, plugin.name));
      },
      costEntries: (jobId?: string) => costEntries(db, jobId),
      me,
      location: { path: loc.pathname, params: params as Record<string, string>, query: new URLSearchParams(loc.search) },
      navigate: (to: string) => navigate(to),
    };
    // db changes `data`; the rest only matters with it
  }, [plugin, data, allowed, update, loc.pathname, loc.search, params, navigate, db]);
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>;
}

/** Catches a plugin screen's errors so the rest of the page keeps working. */
class PluginBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(`Plugin ${this.props.name} failed`, error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <PluginError name={this.props.name} message={this.state.error.message} retry={() => this.setState({ error: null })} />;
  }
}

function PluginError({ name, message, retry }: { name: string; message: string; retry?: () => void }) {
  return (
    <div role="alert" className="my-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
      <b>{name} hit an error.</b> <span className="text-muted-foreground">{message}</span>
      {retry && <button type="button" className="ml-2 underline" onClick={retry}>Try again</button>}
      <div className="mt-1 text-xs text-muted-foreground">An owner or admin can update or remove it in Settings → Plugins, or open BuildTrack with <code>?safe</code> to start without installed plugins.</div>
    </div>
  );
}

function wrapFull<P extends object>(plugin: Plugin, C: ComponentType<P>): ComponentType<P> {
  const Wrapped = (props: P) => (
    <PluginBoundary name={plugin.name}>
      <HostScope plugin={plugin}>
        <C {...props} />
      </HostScope>
    </PluginBoundary>
  );
  Wrapped.displayName = `Plugin(${plugin.id})`;
  return Wrapped;
}

/** A plugin running inside the app, with every screen wrapped. */
function fullPlugin(p: Plugin, rec: InstalledPlugin): Plugin {
  return {
    ...p,
    version: p.version ?? rec.manifest.version,
    // a menu item without a usable icon would break the menu itself
    nav: p.nav?.map((n) => ({ ...n, icon: typeof n.icon === 'function' || (typeof n.icon === 'object' && n.icon) ? n.icon : Icons.Package })),
    routes: p.routes?.map((r) => ({ ...r, component: wrapFull(p, r.component) })),
    jobTabs: p.jobTabs?.map((t) => ({ ...t, component: wrapFull(p, t.component) })),
    jobSummary: p.jobSummary?.map((s) => ({ ...s, component: wrapFull(p, s.component) })),
    accountSections: p.accountSections?.map((s) => ({ ...s, component: wrapFull(p, s.component) })),
  };
}

// ── In a sandbox ('sandboxed') ────────────────────────────────────────────────────────────

const SANDBOX_URL = '/sandbox.html';

/** The app's current look, for a frame to copy. */
function themeNow(): FrameTheme {
  const root = document.documentElement;
  const attrs: Record<string, string> = {};
  for (const a of Array.from(root.attributes)) if (a.name.startsWith('data-')) attrs[a.name] = a.value;
  const css = Array.from(document.querySelectorAll<HTMLStyleElement>('style[id^="bt-"]')).map((s) => s.textContent ?? '');
  return { className: root.className, attrs, style: root.getAttribute('style') ?? '', css };
}

/** Calls `fn` whenever the app's look changes. */
function useThemeChanges(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const o = new MutationObserver(() => ref.current());
    o.observe(document.documentElement, { attributes: true });
    o.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => o.disconnect();
  }, []);
}

/** A frame showing one of a sandboxed plugin's screens. */
function SandboxFrame({ rec, slot, props, fill }: { rec: InstalledPlugin; slot: Slot; props: FrameState['props']; fill?: boolean }) {
  const { db, update } = useStore();
  const loc = useRouterLocation();
  const params = useParams();
  const navigate = useRouterNavigate();
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(fill ? 0 : 120);
  const [error, setError] = useState('');
  const allowed = useMemo(() => allowedFor({ collections: rec.manifest.collections, reads: rec.manifest.reads as never, writes: rec.manifest.writes as never }), [rec.manifest]);
  const send = (m: ToFrame) => frame.current?.contentWindow?.postMessage(m, '*');

  const state: FrameState = useMemo(() => {
    const acct = signedInAccount() ?? (meOf(db) ? { name: meOf(db)!.name, email: meOf(db)!.email ?? '' } : null);
    return {
      data: visibleData(db, allowed.read),
      me: acct,
      location: { path: loc.pathname, params: params as Record<string, string>, search: loc.search },
      props,
      costEntries: props.job ? costEntries(db, props.job.id) : [],
    };
  }, [db, allowed, loc.pathname, loc.search, params, props]);

  // messages from this frame only
  const latest = useRef({ db, state });
  latest.current = { db, state };
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !isFromFrame(e.data)) return;
      const m = e.data as FromFrame;
      if (m.bt === 'ready') {
        send({ bt: 'theme', theme: themeNow() });
        send({ bt: 'load', code: rec.code, css: rec.css, slot });
        send({ bt: 'state', state: latest.current.state });
        setReady(true);
      } else if (m.bt === 'change') {
        update((d) => applyChangesSafely(d, m.changes, allowed.write, rec.manifest.name));
      } else if (m.bt === 'navigate') {
        if (typeof m.to === 'string' && m.to.startsWith('/') && !m.to.startsWith('//')) navigate(m.to);
      } else if (m.bt === 'height') {
        if (!fill) setHeight(Math.min(Math.max(40, Math.ceil(m.height)), 20000));
      } else if (m.bt === 'error') {
        setError(String(m.message));
      }
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec, slot, allowed, update, navigate, fill]);

  useEffect(() => {
    if (ready) send({ bt: 'state', state });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, ready]);
  useThemeChanges(() => ready && send({ bt: 'theme', theme: themeNow() }));

  return (
    <>
      {error && <PluginError name={rec.manifest.name} message={error} />}
      <iframe
        ref={frame}
        src={SANDBOX_URL}
        title={rec.manifest.name}
        // scripts only: no same-origin (so no session, storage or cookies), no top navigation
        sandbox="allow-scripts allow-forms allow-modals allow-downloads"
        // a page fills the window below the top bar (and above the tab bar on phones)
        className={cn('block w-full border-0 bg-transparent', fill && 'h-[calc(100svh-var(--top-h)-var(--tabs-h))] sm:h-[calc(100svh-var(--top-h))]')}
        style={fill ? undefined : { height }}
      />
    </>
  );
}

const sandboxed = (rec: InstalledPlugin) => {
  const ui = rec.manifest.ui ?? {};
  const fallbackIcon = Icons.Package;
  const p: Plugin = {
    id: rec.id,
    name: rec.manifest.name,
    description: rec.manifest.description,
    version: rec.manifest.version,
    author: rec.manifest.author,
    requires: rec.manifest.requires,
    role: rec.manifest.role,
    collections: rec.manifest.collections,
    reads: rec.manifest.reads as Plugin['reads'],
    writes: rec.manifest.writes as Plugin['writes'],
    skills: rec.manifest.skills,
    apiVersion: rec.manifest.apiVersion,
    nav: ui.nav?.map((n): PluginNavItem => ({ ...n, icon: (n.icon && (Icons as Record<string, PluginNavItem['icon']>)[n.icon]) || fallbackIcon })),
    routes: ui.routes?.map((r) => ({ path: r.path, component: () => <SandboxFrame rec={rec} slot={{ kind: 'route', path: r.path }} props={NO_PROPS} fill /> })),
    jobTabs: ui.jobTabs?.map((t) => ({ ...t, component: ({ job }: { job: Job }) => <SandboxFrame rec={rec} slot={{ kind: 'jobTab', id: t.id }} props={useMemo(() => ({ job }), [job])} /> })),
    jobSummary: ui.jobSummary?.map((s, index) => ({ ...s, component: ({ job }: { job: Job }) => <SandboxFrame rec={rec} slot={{ kind: 'jobSummary', index }} props={useMemo(() => ({ job }), [job])} /> })),
    accountSections: ui.accountSections?.map((s) => ({ ...s, component: ({ account }: { account: Account }) => <SandboxFrame rec={rec} slot={{ kind: 'accountSection', id: s.id }} props={useMemo(() => ({ account }), [account])} /> })),
  };
  return p;
};
const NO_PROPS = {};

/**
 * Reads what a plugin declares by running it in a hidden sandbox frame, so nothing runs inside the
 * app before an admin has seen it.
 */
export function inspectPlugin(code: string, css?: string): Promise<PluginManifest> {
  return new Promise((resolve, reject) => {
    const f = document.createElement('iframe');
    f.sandbox.add('allow-scripts');
    f.src = SANDBOX_URL;
    f.style.display = 'none';
    const done = (fn: () => void) => {
      window.clearTimeout(timer);
      window.removeEventListener('message', on);
      f.remove();
      fn();
    };
    const on = (e: MessageEvent) => {
      if (e.source !== f.contentWindow || !isFromFrame(e.data)) return;
      const m = e.data;
      if (m.bt === 'ready') f.contentWindow?.postMessage({ bt: 'load', code, css, slot: { kind: 'inspect' } } satisfies ToFrame, '*');
      else if (m.bt === 'manifest') done(() => resolve(m.manifest));
      else if (m.bt === 'error') done(() => reject(new Error(m.message)));
    };
    const timer = window.setTimeout(() => done(() => reject(new Error("The plugin didn't load within 15 seconds."))), 15000);
    window.addEventListener('message', on);
    document.body.appendChild(f);
  });
}

// ── Keeping the registry on the company's installed plugins ────────────────────────────────

const cache = new Map<string, Promise<Plugin>>(); // by plugin id + code, so an update reloads it

function load(rec: InstalledPlugin): Promise<Plugin> {
  const key = `${rec.id}\u0000${rec.trust}\u0000${rec.code}`;
  let p = cache.get(key);
  if (!p) {
    p = rec.trust === 'full'
      ? importPlugin(rec.code).then((mod) => {
          if (mod.id !== rec.id) throw new Error(`The code is for plugin ${mod.id}, not ${rec.id}.`);
          kit.addStyles(rec.id, rec.css ?? '');
          return fullPlugin(mod, rec);
        })
      : Promise.resolve(sandboxed(rec));
    cache.set(key, p);
  }
  return p;
}

/** A plugin served by `npm run plugin -- dev` on this machine (local development only). */
const DEV_KEY = 'bt-dev-plugin';
export const devPluginUrl = (): string | null => {
  if (!import.meta.env.DEV) return null;
  try {
    const q = new URLSearchParams(location.search).get('dev-plugin');
    if (q !== null) {
      if (q) localStorage.setItem(DEV_KEY, q);
      else localStorage.removeItem(DEV_KEY);
    }
    return localStorage.getItem(DEV_KEY);
  } catch {
    return null;
  }
};

function useDevPlugin(): InstalledPlugin | null {
  const [rec, setRec] = useState<InstalledPlugin | null>(null);
  useEffect(() => {
    const url = devPluginUrl();
    if (!url) return;
    let stop = false;
    const fetchIt = async () => {
      try {
        const [code, css] = await Promise.all([
          fetch(`${url}/plugin.js?t=${Date.now()}`).then((r) => r.text()),
          fetch(`${url}/plugin.css?t=${Date.now()}`).then((r) => (r.ok ? r.text() : '')),
        ]);
        const mod = await importPlugin(code);
        if (stop) return;
        const now = new Date().toISOString();
        setRec({ id: mod.id, manifest: manifestOf(mod, iconName), code, css, trust: 'full', installed: now, installedBy: 'npm run plugin -- dev' });
        console.info(`Loaded ${mod.name} from ${url}`);
      } catch (e) {
        console.error(`Couldn't load the plugin from ${url}`, e);
      }
    };
    void fetchIt();
    const events = new EventSource(`${url}/events`);
    events.onmessage = () => void fetchIt(); // rebuilt: load it again
    return () => {
      stop = true;
      events.close();
    };
  }, []);
  return rec;
}

/** Keeps the registry on db.installedPlugins (and a plugin in development, locally). */
export function InstalledPlugins() {
  const { db } = useStore();
  const list = db.installedPlugins;
  const dev = useDevPlugin();
  useEffect(() => {
    if (isSafeMode()) {
      setLoadedPlugins([]);
      return;
    }
    let current = true;
    const recs = [...(list ?? []).filter((r) => r?.id && r.code && r.manifest && r.id !== dev?.id), ...(dev ? [dev] : [])];
    setPluginStatus({ loading: recs.map((r) => r.id), failed: {} });
    Promise.allSettled(recs.map(load)).then((results) => {
      if (!current) return;
      const failed: Record<string, string> = {};
      const ok: Plugin[] = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') ok.push(r.value);
        else failed[recs[i].id] = r.reason instanceof Error ? r.reason.message : String(r.reason);
      });
      setLoadedPlugins(ok);
      setPluginStatus({ loading: [], failed });
    });
    return () => {
      current = false;
    };
  }, [list, dev]);
  return null;
}

/** Whether an installed plugin is still loading (so a page can wait rather than say "not found"). */
export const stillLoading = () => pluginStatus().loading.length > 0;

export type { Db };
