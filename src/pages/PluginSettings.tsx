// Settings → Plugins: turn features on and off, choose between plugins that do the same job (e.g.
// two ways of doing job costing), and install the company's own plugins. All of it is company-wide
// and only owners and admins can change it (the database enforces that too).
import { useRef, useState, type ChangeEvent } from 'react';
import { Check, Download, FileCode, Puzzle, RefreshCw, ShieldCheck, Trash2, TriangleAlert, Upload } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { blockedBy, builtInPlugins, dependents, installedPlugins, isOn, isSwitchedOn, roleChoice, usePluginStatus, usePlugins, withPluginOn, withRoleChoice } from '../plugins/registry';
import { addsOf, problemsWith, withoutPluginData, type InstalledPlugin, type PluginManifest, type PluginProposal, type Trust } from '../plugins/installed';
import { inspectPlugin, isSafeMode } from '../plugins/loader';
import type { Plugin } from '../plugins/sdk';
import type { PluginChoices } from '../data';
import { defaultSkills } from '../skills';
import { localIso, meOf, useStore } from '../store';
import { signedInAccount } from '../cloud';
import { useIsAdmin } from '../lib/useIsAdmin';
import { Modal } from '../components/Layout';

function useAllPlugins() {
  usePlugins(); // re-render when choices or installed plugins change
  return installedPlugins();
}

function Meta({ p }: { p: Plugin }) {
  return (
    <span className="font-mono text-[11px] text-muted-foreground/80">
      {p.id}
      {p.version && ` · v${p.version}`}
      {p.author && ` · ${p.author}`}
    </span>
  );
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const kb = (s: string) => `${Math.max(1, Math.round(new Blob([s]).size / 1024))} KB`;
const dateOf = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** A plugin file someone picked, and what it says about itself. */
interface Candidate {
  code: string;
  css?: string;
  manifest: PluginManifest;
  proposal?: PluginProposal;
}

/** Splits a built plugin file into code and styles (the build puts the CSS in a comment block). */
export function splitFile(text: string): { code: string; css?: string } {
  const m = text.match(/\/\*! buildtrack-css\n([\s\S]*?)\n\*\/\n?/);
  return m ? { code: text.replace(m[0], ''), css: m[1].replace(/\*\\\//g, '*/') } : { code: text };
}

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function List({ label, items }: { label: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      {items.join(', ')}
    </div>
  );
}

/** The install (or update) screen: what the plugin is, what it can see and change, and how it runs. */
function Review({ c, existing, onClose }: { c: Candidate; existing?: InstalledPlugin; onClose: () => void }) {
  const { db, update } = useStore();
  const m = c.manifest;
  const taken = defaultSkills(builtInPlugins()).map((s) => s.name);
  const problems = problemsWith(m, builtInPlugins().map((p) => p.id), taken);
  const needsFull = (m.adds ?? []).includes('costs for job costing');
  const [trust, setTrust] = useState<Trust>(existing?.trust ?? (needsFull ? 'full' : 'sandboxed'));
  const [showCode, setShowCode] = useState(false);
  const who = signedInAccount()?.name ?? meOf(db)?.name ?? 'Someone';

  const install = () => {
    const now = localIso();
    const rec: InstalledPlugin = existing
      ? { ...existing, manifest: m, code: c.code, css: c.css, trust, updated: now, updatedBy: who }
      : { id: m.id, manifest: m, code: c.code, css: c.css, trust, installed: now, installedBy: who };
    update((d) => ({
      ...d,
      installedPlugins: [...(d.installedPlugins ?? []).filter((r) => r.id !== rec.id), rec],
      pluginProposals: c.proposal ? (d.pluginProposals ?? []).filter((p) => p.id !== c.proposal!.id) : d.pluginProposals,
    }));
    onClose();
  };

  return (
    <Modal title={existing ? `Update ${m.name}` : `Install ${m.name}`} onClose={onClose} wide>
      <div className="space-y-1">
        <div className="text-base font-medium">{m.name} <span className="font-mono text-xs text-muted-foreground">{m.id} · v{m.version}{m.author && ` · ${m.author}`}</span></div>
        {existing && <div className="text-sm text-muted-foreground">Installed now: v{existing.manifest.version}</div>}
        {m.description && <p className="text-sm text-muted-foreground">{m.description}</p>}
        {c.proposal && <p className="text-sm"><span className="text-muted-foreground">Proposed by {c.proposal.proposedBy}: </span>{c.proposal.note}</p>}
      </div>

      {problems.length > 0 && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <b>It can't be installed:</b>
          <ul className="ml-4 list-disc">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      <div className="space-y-1 rounded-lg border px-4 py-3">
        <List label="Adds" items={m.adds} />
        <List label="Keeps its own records" items={m.collections} />
        <List label="Reads" items={m.reads} />
        <List label="Can change" items={m.writes} />
        <List label="Needs" items={m.requires} />
        <List label="Skills for agents" items={m.skills?.map((s) => s.name)} />
        <div className="text-sm text-muted-foreground">Code: {kb(c.code)}{c.css ? `, styles ${kb(c.css)}` : ''} · <button type="button" className="underline" onClick={() => setShowCode((v) => !v)}>{showCode ? 'Hide' : 'Show'} code</button></div>
        {showCode && <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-snug">{c.code}</pre>}
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">How it runs</legend>
        {([
          ['sandboxed', ShieldCheck, 'Sandboxed (recommended)', `Runs in a sealed frame. It sees only the records listed above, can't reach the internet, your session or anything else in BuildTrack, and BuildTrack checks every change it makes.${needsFull ? ' This plugin provides costs for job costing, which only works inside the app.' : ''}`],
          ['full', TriangleAlert, 'Inside the app', 'Runs like BuildTrack’s own features, with everything the person using it can do: all the company’s data, and the internet. Only for plugins your company wrote or fully trusts.'],
        ] as const).map(([value, Icon, label, text]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTrust(value)}
            aria-pressed={trust === value}
            className={cn('flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60', trust === value && 'border-primary bg-primary/5')}
          >
            <Icon className={cn('mt-0.5 size-4 shrink-0', value === 'full' ? 'text-destructive' : 'text-primary')} />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{label}</span>
              <span className="text-sm text-muted-foreground">{text}</span>
            </span>
          </button>
        ))}
      </fieldset>

      <div className="row-end">
        <span className="flex-1 text-xs text-muted-foreground">It’s installed for everyone in {db.companyName}.</span>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" disabled={problems.length > 0} onClick={install}>{existing ? 'Update' : 'Install'}</button>
      </div>
    </Modal>
  );
}

function RemoveDialog({ rec, onClose }: { rec: InstalledPlugin; onClose: () => void }) {
  const { db, update } = useStore();
  const counts = (rec.manifest.collections ?? []).map((c) => ((db as unknown as Record<string, unknown[]>)[c] ?? []).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const remove = (keepData: boolean) => {
    update((d) => {
      const without = { ...d, installedPlugins: (d.installedPlugins ?? []).filter((r) => r.id !== rec.id) };
      return keepData ? without : withoutPluginData(without, rec);
    });
    onClose();
  };
  return (
    <Modal title={`Remove ${rec.manifest.name}`} onClose={onClose}>
      <p className="text-sm">It’s removed for everyone in {db.companyName}.</p>
      {total > 0 && <p className="text-sm text-muted-foreground">It has {plural(total, 'record')}. Keep them and they’ll be there again if you reinstall it.</p>}
      <div className="row-end">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        {total > 0 && <button type="button" className="btn text-destructive" onClick={() => remove(false)}>Remove with its records</button>}
        <button type="button" className="btn primary" onClick={() => remove(true)}>{total > 0 ? 'Remove, keep records' : 'Remove'}</button>
      </div>
    </Modal>
  );
}

/** Picks a plugin file and reads what it declares (in a sandbox, so nothing runs in the app yet). */
function useInspect(onReady: (c: Candidate) => void) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (text: string, proposal?: PluginProposal) => {
    setError('');
    setBusy(true);
    try {
      const { code, css } = proposal ? { code: proposal.code, css: proposal.css } : splitFile(text);
      const manifest = await inspectPlugin(code, css);
      onReady({ code, css, manifest, proposal });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const fromFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) await run(await f.text());
  };
  return { error, busy, fromFile, fromProposal: (p: PluginProposal) => run('', p) };
}

function InstallCard({ onReview }: { onReview: (c: Candidate) => void }) {
  const { db, update } = useStore();
  const file = useRef<HTMLInputElement>(null);
  const { error, busy, fromFile, fromProposal } = useInspect(onReview);
  const proposals = db.pluginProposals ?? [];
  return (
    <section className="card">
      <div className="card-head"><h2>Install a plugin</h2></div>
      <div className="card-body space-y-3">
        <p className="form-note text-muted-foreground">
          Add a feature without changing BuildTrack: a plugin file your company wrote (or asked Claude to write), from <code>npm run plugin -- build</code>. You’ll see what it can read and change before it’s installed. See <a className="underline" href="https://github.com/Cody-Design-Build/BuildTrack/blob/main/docs/plugins.md" target="_blank" rel="noreferrer">writing plugins</a>.
        </p>
        <input ref={file} type="file" accept=".js,.mjs,text/javascript" className="hidden" onChange={fromFile} />
        <button type="button" className="btn primary" disabled={busy} onClick={() => file.current?.click()}><Upload size={14} /> {busy ? 'Reading…' : 'Choose a plugin file'}</button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {proposals.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Proposed</div>
            {proposals.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/50">
                <FileCode className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{p.manifest.name} <span className="font-mono text-[11px] text-muted-foreground">v{p.manifest.version}</span></div>
                  <div className="text-xs text-muted-foreground">{p.note} · {p.proposedBy}, {dateOf(p.proposed)}</div>
                </div>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => fromProposal(p)}>Review</button>
                <button type="button" className="btn btn-sm" aria-label={`Dismiss ${p.manifest.name}`} onClick={() => update((d) => ({ ...d, pluginProposals: (d.pluginProposals ?? []).filter((x) => x.id !== p.id) }))}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function InstalledActions({ rec, onReview }: { rec: InstalledPlugin; onReview: (c: Candidate, existing: InstalledPlugin) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [removing, setRemoving] = useState(false);
  const { error, busy, fromFile } = useInspect((c) => onReview(c, rec));
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <input ref={file} type="file" accept=".js,.mjs,text/javascript" className="hidden" onChange={fromFile} />
      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => file.current?.click()}><RefreshCw size={13} /> Update</button>
      <button type="button" className="btn btn-sm" onClick={() => download(`${rec.id}.js`, rec.css ? `/*! buildtrack-css\n${rec.css.replace(/\*\//g, '*\\/')}\n*/\n${rec.code}` : rec.code)}><Download size={13} /> Download</button>
      <button type="button" className="btn btn-sm" onClick={() => setRemoving(true)}><Trash2 size={13} /> Remove</button>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
      {removing && <RemoveDialog rec={rec} onClose={() => setRemoving(false)} />}
    </div>
  );
}

export function PluginSettings() {
  const all = useAllPlugins();
  const { db, update } = useStore();
  const admin = useIsAdmin();
  const status = usePluginStatus();
  const [review, setReview] = useState<{ c: Candidate; existing?: InstalledPlugin } | null>(null);
  // company-wide: saved in the data, so it syncs to the whole team
  const save = (plugins: PluginChoices) => update((d) => ({ ...d, plugins }));
  const installedRecs = db.installedPlugins ?? [];
  const recOf = (id: string) => installedRecs.find((r) => r.id === id);
  // a choice card only for roles with more than one plugin to pick from
  const count = (role: string) => all.filter((p) => p.role?.id === role).length;
  const roles = [...new Map(all.filter((p) => p.role && count(p.role.id) > 1).map((p) => [p.role!.id, p.role!.label])).entries()];
  const plain = all.filter((p) => !p.role || count(p.role.id) === 1);
  // installed plugins that didn't load (or aren't loaded in safe mode) still get a row
  const notLoaded = installedRecs.filter((r) => !all.some((p) => p.id === r.id));
  return (
    <>
      <section className="card">
        <div className="card-head"><h2>Plugins</h2></div>
        <div className="card-body">
          <p className="form-note text-muted-foreground">
            Everything in BuildTrack is a plugin: each one adds its own menu items, pages, job tabs and company-page sections. Changes here apply to everyone in the company. Turning one off hides it everywhere; its records are kept, and it comes back as it was when you turn it on again.
          </p>
          {!admin && <p className="form-note mt-2">Only owners and admins can change plugins.</p>}
          {isSafeMode() && <p className="form-note mt-2">Safe mode: installed plugins aren’t running.</p>}
        </div>
      </section>

      {admin && <InstallCard onReview={(c) => setReview({ c, existing: recOf(c.manifest.id) })} />}

      {roles.map(([role, label]) => {
        const chosen = roleChoice(role);
        return (
          <section key={role} className="card">
            <div className="card-head"><h2>{label}</h2></div>
            <div className="card-body space-y-2">
              <p className="form-note mb-2 text-muted-foreground">These plugins do the same job in different ways. Only one is on at a time.</p>
              {all.filter((p) => p.role?.id === role).map((p) => {
                const on = chosen?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!admin}
                    onClick={() => save(withRoleChoice(role, p.id))}
                    aria-pressed={on}
                    className={cn('flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent', on && 'border-primary bg-primary/5')}
                  >
                    <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border', on && 'border-primary bg-primary text-primary-foreground')}>
                      {on && <Check className="size-3" />}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-medium">{p.name}</span>
                      <span className="text-sm text-muted-foreground">{p.description}</span>
                      <Meta p={p} />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="card">
        <div className="card-head">
          <h2>Installed</h2>
          <span className="text-sm text-muted-foreground">{all.filter((p) => isOn(p.id)).length} of {all.length} on</span>
        </div>
        <div className="divide-y">
          {plain.map((p) => {
            const blocked = blockedBy(p);
            const needed = dependents(p.id).filter((d) => isOn(d.id)).map((d) => d.name);
            const rec = recOf(p.id);
            const adds = addsOf(p);
            return (
              <div key={p.id} className="flex items-start gap-3 px-5 py-3">
                <Puzzle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {p.name}
                    {p.core && <span className="ml-2 text-xs font-normal text-muted-foreground">Always on</span>}
                    {rec && <span className="ml-2 text-xs font-normal text-muted-foreground">{rec.trust === 'sandboxed' ? 'Sandboxed' : 'Runs inside the app'} · installed by {rec.updatedBy ?? rec.installedBy}, {dateOf(rec.updated ?? rec.installed)}</span>}
                  </span>
                  <span className="text-sm text-muted-foreground">{p.description}</span>
                  {adds.length > 0 && <span className="text-xs text-muted-foreground">Adds: {adds.join(' · ')}</span>}
                  {p.requires?.length ? <span className="text-xs text-muted-foreground">Needs: {p.requires.map((r) => all.find((x) => x.id === r)?.name ?? r).join(', ')}</span> : null}
                  {blocked.length > 0 && isSwitchedOn(p.id) && <span className="text-xs text-destructive">Off because it needs {blocked.join(' and ')}.</span>}
                  {needed.length > 0 && <span className="text-xs text-muted-foreground">Turning it off also turns off {needed.join(' and ')}.</span>}
                  <Meta p={p} />
                  {rec && admin && <InstalledActions rec={rec} onReview={(c, existing) => setReview({ c, existing })} />}
                </div>
                <Switch
                  checked={!!p.core || isSwitchedOn(p.id)}
                  disabled={p.core || !admin}
                  onCheckedChange={(v) => save(withPluginOn(p.id, v))}
                  aria-label={`${p.name} on`}
                  className="mt-1"
                />
              </div>
            );
          })}
          {notLoaded.map((rec) => (
            <div key={rec.id} className="flex items-start gap-3 px-5 py-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium">{rec.manifest.name}</span>
                <span className="text-sm text-muted-foreground">
                  {status.loading.includes(rec.id) ? 'Loading…' : isSafeMode() ? 'Not running in safe mode.' : `Didn’t load: ${status.failed[rec.id] ?? 'unknown error'}`}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground/80">{rec.id} · v{rec.manifest.version}</span>
                {admin && <InstalledActions rec={rec} onReview={(c, existing) => setReview({ c, existing })} />}
              </div>
            </div>
          ))}
        </div>
      </section>

      {review && <Review c={review.c} existing={review.existing} onClose={() => setReview(null)} />}
    </>
  );
}
