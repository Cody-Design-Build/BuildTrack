// The plugin kit: everything an installed plugin can use, as `import { … } from '@buildtrack/sdk'`.
// It's a promise to plugin authors: add to it freely, but don't change or remove anything without
// bumping KIT_API_VERSION (installed.ts), or plugins already installed stop working.
//
// The same kit runs in two places, so a plugin never knows which:
//   - inside the app (trust 'full'): <HostScope> in loader.tsx gives it the company's data;
//   - in a sandboxed frame (trust 'sandboxed'): src/sandbox/ gives it only what it declared,
//     passed in over postMessage.
// Either way a plugin sees its own records, plus the core records it lists in `reads` and
// `writes`, and nothing else.
//
// Everything named in KIT_EXPORTS is also served as an ES module at /sdk/buildtrack.js (see
// scripts/plugin-sdk.mjs), which is how a plugin file finds it at run time.
import * as React from 'react';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import * as I from './kit-icons';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Empty, Row, Section, SearchInput, SummaryRow } from '../components/Detail';
import { localIso, money, pct, uid } from '../model';
import type { Db } from '../data';
import type { CostEntry, Plugin } from './sdk';
import { KIT_API_VERSION } from './installed';

// ── What the kit needs from wherever it runs ───────────────────────────────────────────────

/** A change to one record, as a plugin asks for it. */
export type RecordChange =
  | { op: 'add'; collection: string; record: { id: string } }
  | { op: 'change'; collection: string; id: string; patch: Record<string, unknown> }
  | { op: 'remove'; collection: string; id: string };

export interface KitScope {
  plugin: { id: string; name: string; collections: string[]; reads: string[]; writes: string[] };
  /** The records this plugin may see (its own, plus `reads` and `writes`), and companyName. */
  data: Record<string, unknown>;
  /** Applies changes, checked against what the plugin declared. */
  change(changes: RecordChange[]): void;
  costEntries(jobId?: string): CostEntry[];
  me: { name: string; email: string } | null;
  location: { path: string; params: Record<string, string>; query: URLSearchParams };
  navigate(to: string): void;
}

export const ScopeContext = createContext<KitScope | null>(null);

function useScope(): KitScope {
  const s = useContext(ScopeContext);
  if (!s) throw new Error('BuildTrack plugin kit used outside a plugin (hooks only work inside its components).');
  return s;
}

/** Which collections a plugin may read and change. */
export function allowedFor(p: Pick<Plugin, 'collections' | 'reads' | 'writes'>) {
  const own = (p.collections ?? []) as string[];
  const writes = [...own, ...((p.writes ?? []) as string[])];
  return { read: new Set([...writes, ...((p.reads ?? []) as string[])]), write: new Set(writes) };
}

/** Checks a plugin's changes against what it declared, then applies them to the data. */
export function applyChanges(db: Db, changes: RecordChange[], allowed: Set<string>): Db {
  const next = { ...db } as unknown as Record<string, { id: string }[] | undefined>;
  for (const c of changes) {
    if (!allowed.has(c.collection)) throw new Error(`This plugin can't change "${c.collection}" (it isn't in its collections or writes).`);
    const list = next[c.collection] ?? [];
    if (c.op === 'add') {
      if (!c.record || typeof c.record.id !== 'string' || !c.record.id) throw new Error('A new record needs a string id (use uid()).');
      if (list.some((r) => r.id === c.record.id)) throw new Error(`There's already a record ${c.record.id} in ${c.collection}.`);
      next[c.collection] = [...list, JSON.parse(JSON.stringify(c.record))];
    } else if (c.op === 'change') {
      next[c.collection] = list.map((r) => (r.id === c.id ? { ...r, ...JSON.parse(JSON.stringify(c.patch)), id: r.id } : r));
    } else if (c.op === 'remove') {
      next[c.collection] = list.filter((r) => r.id !== c.id);
    }
  }
  return next as unknown as Db;
}

/**
 * applyChanges for the store: never throws (a plugin's change racing another must not break the
 * app), it leaves the data as it was and logs why.
 */
export function applyChangesSafely(db: Db, changes: RecordChange[], allowed: Set<string>, plugin: string): Db {
  try {
    return applyChanges(db, changes, allowed);
  } catch (e) {
    console.warn(`${plugin}: change not made.`, e);
    return db;
  }
}

/** The part of the data a plugin may see. */
export function visibleData(db: Db, read: Set<string>): Record<string, unknown> {
  const d = db as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { companyName: db.companyName };
  for (const k of read) out[k] = d[k] ?? [];
  return out;
}

// ── The kit ────────────────────────────────────────────────────────────────────────────────

/** Describes a plugin (see src/plugins/sdk.ts for every option). */
const definePlugin = (p: Plugin): Plugin => ({ apiVersion: KIT_API_VERSION, ...p });

/** The records this plugin may see: its own lists, those in `reads` and `writes`, and companyName. */
function useData<T = Record<string, unknown[]>>(): T & { companyName: string } {
  return useScope().data as T & { companyName: string };
}

/** One list of records, with ways to change it. Only lists the plugin owns or lists in `writes`. */
function useRecords<T extends { id: string }>(collection: string) {
  const s = useScope();
  const items = (s.data[collection] ?? []) as T[];
  const change = s.change;
  const add = useCallback((record: T) => change([{ op: 'add', collection, record }]), [change, collection]);
  const update = useCallback((id: string, patch: Partial<T>) => change([{ op: 'change', collection, id, patch: patch as Record<string, unknown> }]), [change, collection]);
  const remove = useCallback((id: string) => change([{ op: 'remove', collection, id }]), [change, collection]);
  return useMemo(() => ({ items, add, update, remove }), [items, add, update, remove]);
}

/** Several changes at once, saved together (and undone together). */
function useChange() {
  return useScope().change;
}

/** costs/v1 entries from the plugins that are on: what jobs are expected to cost and have cost. */
function useCostEntries(jobId?: string): CostEntry[] {
  return useScope().costEntries(jobId);
}

/** The person using the app, or null in the browser-only version. */
function useMe() {
  return useScope().me;
}

/** Where we are: the page's path, its route parameters (e.g. :id) and its query (?tab=…). */
function useLocation() {
  return useScope().location;
}

function useNavigate() {
  return useScope().navigate;
}

/** A link to another page in BuildTrack. */
function Link({ to, children, className, ...rest }: { to: string; children: ReactNode; className?: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const navigate = useNavigate();
  return (
    <a
      href={to}
      className={className}
      {...rest}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

/** The title block at the top of a page. */
function PageHeader({ title, crumb, actions }: { title: string; crumb?: string; actions?: ReactNode }) {
  const { companyName } = useData();
  return (
    <div className="page-header">
      <div className="ph-text">
        <div className="crumb">{crumb ?? companyName}</div>
        <h1 className="ph-title">{title}</h1>
      </div>
      {actions && <div className="ph-actions"><div className="btn-group">{actions}</div></div>}
    </div>
  );
}

/** A whole page laid out like BuildTrack's own: the title block, then the content with the usual spacing. */
function Page({ title, crumb, actions, narrow, children }: { title: string; crumb?: string; actions?: ReactNode; narrow?: boolean; children: ReactNode }) {
  return (
    <div className="page scroll">
      <PageHeader title={title} crumb={crumb} actions={actions} />
      <div className={cn('detail flex flex-col gap-4', narrow && 'narrow')}>{children}</div>
    </div>
  );
}

/** A dialog with a title, like BuildTrack's own forms. */
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn('max-h-[calc(100svh-2rem)] gap-0 overflow-y-auto p-0', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <DialogHeader className="sticky top-0 z-10 border-b bg-background/95 px-6 py-4 backdrop-blur">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 px-6 py-5">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

/** A labelled form field. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

const ui = {
  Button, Badge, Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Checkbox,
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger, Textarea,
};

/** Icons plugins can use in menus and pages, by name, e.g. icons.Hammer (see kit-icons.ts). */
const kitIcons = { ...I };

/** Adds a plugin's styles to the page (the build does this for you). */
const styled = new Set<string>();
function addStyles(id: string, css: string) {
  if (!css || styled.has(id)) return;
  styled.add(id);
  const el = document.createElement('style');
  el.dataset.plugin = id;
  el.textContent = `@layer utilities {\n${css}\n}`;
  document.head.appendChild(el);
}

/** Everything a plugin can import from '@buildtrack/sdk'. */
export const kit = {
  apiVersion: KIT_API_VERSION,
  definePlugin,
  useData,
  useRecords,
  useChange,
  useCostEntries,
  useMe,
  useLocation,
  useNavigate,
  Link,
  Page,
  PageHeader,
  Modal,
  Field,
  Section,
  Row,
  Empty,
  SearchInput,
  SummaryRow,
  ui,
  icons: kitIcons,
  cn,
  money,
  pct,
  uid,
  now: localIso,
  today: () => localIso().slice(0, 10),
  addStyles,
};

export type Kit = typeof kit;

/** The names /sdk/buildtrack.js exports (scripts/plugin-sdk.mjs checks they match `kit`). */
export const KIT_EXPORTS = Object.keys(kit);

/** React, for /sdk/react.js and /sdk/react-jsx-runtime.js: plugins use the app's own copy. */
export { React };
