// Settings → Agents: connecting AI agents (Claude and other MCP clients) to BuildTrack, and the
// company's skills, the know-how agents read: listed by where they come from, read in a side
// panel, switched on and off, uploaded as SKILL.md files, or written and changed by agents (save_skill).
// The server side is in src/agent/; skills in src/skills.ts.
import { useEffect, useRef, useState } from 'react';
import { Bot, ChevronRight, Copy, Download, GitCompare, RotateCcw, Sparkles, Trash2, Upload } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { cloud } from '../cloud';
import { usePlugins } from '../plugins/registry';
import { Markdown } from '../components/Markdown';
import { companySkills, defaultSkills, lineDiff, parseSkillMarkdown, resetSkill, saveSkill, skillMarkdown, skillProblem, type Skill } from '../skills';
import { meOf, useStore } from '../store';

const mcpUrl = () => `${window.location.origin}/mcp`;

function useCopy() {
  const [copied, setCopied] = useState('');
  const copy = (key: string, text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? '' : c)), 1500);
  };
  return { copied, copy };
}

function Connect() {
  const { copied, copy } = useCopy();
  const url = mcpUrl();
  const command = `claude mcp add --transport http buildtrack ${url}`;
  return (
    <section className="card">
      <div className="card-head"><h2>Connect an agent</h2></div>
      <div className="card-body space-y-3 text-sm">
        <p className="form-note text-muted-foreground">
          AI agents such as Claude can read your company's BuildTrack data and answer questions about it: what a job will make, what's overdue, which bid is best. They can also do the work: write a proposal, bill a job, enter a bill, put work out to bid, add a task, or change settings. They use BuildTrack's tools and the skills below, follow the same rules as the app, and see only what you can see. Anything that matters (sending, approving, paying, settings, the team) waits for your yes.
        </p>
        {cloud ? (
          <>
            <div className="space-y-1">
              <div className="font-medium">BuildTrack's agent address</div>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 font-mono text-xs">{url}</code>
                <button type="button" className="btn btn-sm" onClick={() => copy('url', url)}><Copy size={14} /> {copied === 'url' ? 'Copied' : 'Copy'}</button>
              </div>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li><span className="text-foreground">Claude (app or web):</span> Settings → Connectors → Add custom connector, and paste the address.</li>
              <li>
                <span className="text-foreground">Claude Code:</span> run{' '}
                <button type="button" className="font-mono text-xs underline decoration-dotted" onClick={() => copy('cmd', command)} title="Copy">{command}</button>
                {copied === 'cmd' && <span className="ml-1 text-xs">Copied</span>}
              </li>
              <li><span className="text-foreground">Other agents:</span> any MCP client that supports remote servers with sign-in.</li>
            </ul>
            <p className="form-note text-muted-foreground">The first time, the agent sends you here to sign in and approve it. New tools and skills, and plugins you turn on or off, reach every connected agent automatically, with nothing to reinstall.</p>
          </>
        ) : (
          <p className="form-note text-muted-foreground">Agents work with shared data, so they connect to the live app, not to this browser-only copy.</p>
        )}
      </div>
    </section>
  );
}

type Grant = { client: { id: string; name: string; uri: string }; granted_at: string };

/** Agents this person has approved (Supabase OAuth grants), with a way to disconnect each. */
function Connected() {
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [error, setError] = useState('');
  const load = () =>
    cloud!.auth.oauth.listGrants().then(({ data, error: e }) => {
      // before the OAuth server is switched on this fails; show nothing rather than an error
      if (e) return setGrants([]);
      setGrants(data as Grant[]);
    });
  useEffect(() => void load(), []);
  if (!grants?.length) return null;
  const disconnect = async (g: Grant) => {
    const { error: e } = await cloud!.auth.oauth.revokeGrant({ clientId: g.client.id });
    if (e) return setError(e.message);
    void load();
  };
  return (
    <section className="card">
      <div className="card-head"><h2>Your connected agents</h2></div>
      <div className="card-body">
        {grants.map((g) => (
          <div key={g.client.id} className="list-row">
            <Bot size={16} />
            <span className="grow">{g.client.name || g.client.uri || 'Agent'}</span>
            <span className="muted text-xs">since {g.granted_at.slice(0, 10)}</span>
            <button type="button" className="btn btn-sm" onClick={() => disconnect(g)}>Disconnect</button>
          </div>
        ))}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </section>
  );
}

type Notice = { kind: 'ok' | 'error'; text: string };

/** Who changed a skill and when, e.g. "Changed by Dana Cole · 2026-11-27". */
const changedLine = (s: Skill) => (s.updatedBy ? `by ${s.updatedBy}${s.updated ? ` · ${s.updated.slice(0, 10)}` : ''}` : '');

function StatusBadge({ s }: { s: Skill }) {
  const label = s.status === 'off' ? 'Off' : s.status === 'changed' ? 'Changed' : s.own ? 'Your own' : '';
  if (!label) return null;
  return <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', s.status === 'changed' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{label}</span>;
}

function download(s: Skill) {
  const url = URL.createObjectURL(new Blob([skillMarkdown(s)], { type: 'text/markdown' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${s.name}.SKILL.md` });
  a.click();
  URL.revokeObjectURL(url);
}

/** Turns a skill on or off for agents. Turning a default back on drops the record if nothing else changed. */
function useSetOn() {
  const { update } = useStore();
  const plugins = usePlugins();
  return (s: Skill, on: boolean) =>
    update((x) => {
      const def = defaultSkills(plugins).find((d) => d.name === s.name);
      if (on && def && def.description === s.description && def.body === s.body) return resetSkill(x, s.name);
      return saveSkill(x, plugins, { name: s.name, description: s.description, body: s.body, off: !on }, meOf(x)?.name ?? 'Someone');
    });
}

/** One skill, read in a side panel: rendered, with what the company changed and what you can do. */
function SkillPanel({ s, onClose }: { s: Skill | null; onClose: () => void }) {
  const { update } = useStore();
  const plugins = usePlugins();
  const setOn = useSetOn();
  const [showChanges, setShowChanges] = useState(false);
  useEffect(() => setShowChanges(false), [s?.name]);
  const def = s ? defaultSkills(plugins).find((d) => d.name === s.name) : undefined;
  const changed = !!def && !!s && (def.body !== s.body || def.description !== s.description);
  return (
    <Sheet open={!!s} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-2xl">
        {s && (
          <>
            <div className="space-y-2 border-b p-5 pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="font-mono text-base">{s.name}</SheetTitle>
                <StatusBadge s={s} />
              </div>
              <SheetDescription>{s.description}</SheetDescription>
              <div className="text-xs text-muted-foreground">
                {s.sourceName ? `From ${s.sourceName}` : 'Your company'}
                {changedLine(s) && ` · changed ${changedLine(s)}`}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <label className="mr-2 flex items-center gap-2 text-sm">
                  <Switch checked={s.status !== 'off'} onCheckedChange={(on) => setOn(s, on)} aria-label="Agents use this skill" />
                  Agents use it
                </label>
                <button type="button" className="btn btn-sm" onClick={() => download(s)}><Download size={14} /> Download</button>
                {changed && (
                  <button type="button" className={cn('btn btn-sm', showChanges && 'bg-muted')} onClick={() => setShowChanges((v) => !v)} aria-pressed={showChanges}>
                    <GitCompare size={14} /> What changed
                  </button>
                )}
                {def && s.status !== 'default' && (
                  <button type="button" className="btn btn-sm" onClick={() => window.confirm(`Go back to ${s.sourceName}'s version of "${s.name}"? Your company's changes are dropped.`) && (update((x) => resetSkill(x, s.name)), onClose())}>
                    <RotateCcw size={14} /> Reset
                  </button>
                )}
                {s.own && (
                  <button type="button" className="btn btn-sm" onClick={() => window.confirm(`Delete the skill "${s.name}"? Agents stop using it.`) && (update((x) => resetSkill(x, s.name)), onClose())}>
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {showChanges && def ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">Compared with {s.sourceName}'s version: <span className="text-[var(--success-strong)]">added</span> and <span className="text-destructive line-through">removed</span> lines.</p>
                  {def.description !== s.description && (
                    <div className="rounded-md border p-3 text-sm">
                      <div className="mb-1 text-xs font-medium text-muted-foreground">Description</div>
                      <div className="text-destructive line-through">{def.description}</div>
                      <div className="text-[var(--success-strong)]">{s.description}</div>
                    </div>
                  )}
                  <pre className="overflow-x-auto rounded-md border font-mono text-xs leading-relaxed">
                    {lineDiff(def.body, s.body).map((l, i) => (
                      <div key={i} className={cn('px-3 whitespace-pre-wrap', l.kind === 'added' && 'bg-[var(--success-soft)] text-[var(--success-strong)]', l.kind === 'removed' && 'bg-destructive/10 text-destructive line-through')}>
                        {l.kind === 'added' ? '+ ' : l.kind === 'removed' ? '− ' : '  '}{l.text || ' '}
                      </div>
                    ))}
                  </pre>
                </div>
              ) : (
                <Markdown text={s.body} />
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

const ASKS = [
  'Add a skill for how we handle warranty calls: call back within a day and log a task.',
  'Change the job-costing skill so you flag any cost code more than 10% over budget.',
  "Turn off the bid-leveling skill. We don't put work out to bid.",
];

function Skills() {
  const { db, update } = useStore();
  const plugins = usePlugins();
  const setOn = useSetOn();
  const { copied, copy } = useCopy();
  const skills = companySkills(db, plugins);
  const [openName, setOpenName] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dragging, setDragging] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const open = skills.find((s) => s.name === openName) ?? null;

  // grouped by where they come from: BuildTrack, each plugin, then the company's own
  const groups: { label: string; items: Skill[] }[] = [];
  for (const s of skills) {
    const label = s.own ? 'Your company' : s.sourceName ?? 'BuildTrack';
    let g = groups.find((x) => x.label === label);
    if (!g) groups.push((g = { label, items: [] }));
    g.items.push(s);
  }

  const upload = async (files: FileList | File[] | null) => {
    const list = [...(files ?? [])];
    if (!list.length) return;
    const done: string[] = [];
    for (const f of list) {
      try {
        if (f.size > 200_000) throw new Error('That file is too big for a skill.');
        const parsed = parseSkillMarkdown(await f.text());
        const problem = skillProblem(parsed);
        if (problem) throw new Error(problem);
        const existing = companySkills(db, plugins).find((s) => s.name === parsed.name);
        if (existing && !window.confirm(existing.own ? `Replace your skill "${parsed.name}" with this file?` : `"${parsed.name}" is one of ${existing.sourceName}'s skills. Use this file as your company's version? (Reset goes back to theirs.)`)) continue;
        update((x) => saveSkill(x, plugins, parsed, meOf(x)?.name ?? 'Someone'));
        done.push(parsed.name);
      } catch (e) {
        setNotice({ kind: 'error', text: `${f.name}: ${(e as Error).message}` });
        return;
      }
    }
    if (done.length) setNotice({ kind: 'ok', text: `Added ${done.join(', ')}. Every agent in the company gets ${done.length > 1 ? 'them' : 'it'} on its next request.` });
  };

  return (
    <section
      className={cn('card', dragging && 'ring-2 ring-primary')}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files); }}
    >
      <div className="card-head flex items-center justify-between gap-2">
        <h2>Skills</h2>
        <button type="button" className="btn btn-sm" onClick={() => file.current?.click()}><Upload size={14} /> Upload SKILL.md</button>
        <input ref={file} type="file" accept=".md,text/markdown,text/plain" multiple hidden onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
      </div>
      <div className="card-body space-y-4">
        <p className="form-note text-muted-foreground">
          Skills are how your company does things, written down for agents: how you bill, how you level bids, what to flag. Agents read the ones that match a task. BuildTrack and each plugin come with some; turn off any you don't want, upload your own <code>SKILL.md</code> files (or drop them here), or ask your agent to write or change one. Changes reach every agent in the company on its next request.
        </p>

        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Sparkles size={15} /> Ask your agent</div>
          <ul className="space-y-1.5">
            {ASKS.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="grow text-muted-foreground">“{a}”</span>
                <button type="button" className="btn btn-sm shrink-0" onClick={() => copy(`ask${i}`, a)} aria-label="Copy">{copied === `ask${i}` ? 'Copied' : <Copy size={13} />}</button>
              </li>
            ))}
          </ul>
        </div>

        {notice && <p className={cn('text-sm', notice.kind === 'error' ? 'text-destructive' : 'text-[var(--success-strong)]')} role="status">{notice.text}</p>}

        {groups.map((g) => (
          <div key={g.label}>
            <div className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.label}</div>
            <div className="divide-y overflow-hidden rounded-lg border">
              {g.items.map((s) => (
                <div key={s.name} className={cn('flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50', s.status === 'off' && 'opacity-60')}>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpenName(s.name)}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium">{s.name}</span>
                      <StatusBadge s={s} />
                      {changedLine(s) && <span className="text-[11px] text-muted-foreground">{changedLine(s)}</span>}
                    </div>
                    <div className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{s.description}</div>
                  </button>
                  <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden />
                  <Switch checked={s.status !== 'off'} onCheckedChange={(on) => setOn(s, on)} aria-label={`Agents use ${s.name}`} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <SkillPanel s={open} onClose={() => setOpenName(null)} />
    </section>
  );
}

export function AgentSettings() {
  return (
    <>
      <Connect />
      {cloud && <Connected />}
      <Skills />
    </>
  );
}
