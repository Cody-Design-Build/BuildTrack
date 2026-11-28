// Settings → Agents: connecting AI agents (Claude and other MCP clients) to BuildTrack, and the
// company's skills, the know-how agents read, which anyone in the company can read and change.
// The server side is in src/agent/; skills in src/skills.ts.
import { useEffect, useState } from 'react';
import { Bot, Copy, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cloud } from '../cloud';
import { usePlugins } from '../plugins/registry';
import { companySkills, defaultSkills, resetSkill, saveSkill, skillProblem, type Skill } from '../skills';
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
          AI agents such as Claude can read your company's BuildTrack data and answer questions about it: what a job will make, what's overdue, which bid is best. They use BuildTrack's tools and the skills below, and see only what you can see. For now agents can read everything but change only skills.
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
            <p className="form-note text-muted-foreground">The first time, the agent sends you here to sign in and approve it. New tools and skills reach every connected agent automatically, with nothing to reinstall.</p>
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

const STATUS: Record<Skill['status'], string> = { default: '', changed: 'Changed', off: 'Off', custom: 'Your own' };

type Draft = { name: string; description: string; body: string; isNew: boolean; isDefault: boolean };

function Editor({ draft, onDone }: { draft: Draft; onDone: () => void }) {
  const { db, update } = useStore();
  const plugins = usePlugins();
  const [d, setD] = useState(draft);
  const [error, setError] = useState('');
  const save = () => {
    const problem = skillProblem(d);
    if (problem) return setError(problem);
    if (d.isNew && companySkills(db, plugins).some((s) => s.name === d.name)) return setError(`There's already a skill called "${d.name}".`);
    update((x) => saveSkill(x, plugins, d, meOf(x)?.name ?? 'Someone'));
    onDone();
  };
  return (
    <div className="space-y-3 border-t bg-muted/30 p-3">
      {d.isNew && (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Name</span>
          <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-') })} placeholder="e.g. warranty-calls" className="font-mono" autoFocus />
        </label>
      )}
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Description</span>
        <span className="block text-xs text-muted-foreground">What it covers and when to use it. Agents read this to decide whether to open the skill.</span>
        <textarea value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} rows={2} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Skill</span>
        <span className="block text-xs text-muted-foreground">Markdown. Write it as you would for a new team member: how you do this, what to watch for, what not to do.</span>
        <textarea value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} rows={16} className="font-mono text-xs" />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="button" className="btn primary" onClick={save}>{d.isDefault ? 'Save our version' : 'Save'}</button>
      </div>
    </div>
  );
}

function SkillRow({ s, open, onOpen, onClose }: { s: Skill; open: boolean; onOpen: () => void; onClose: () => void }) {
  const { update } = useStore();
  const plugins = usePlugins();
  const isDefault = s.status !== 'custom';
  const setOff = (off: boolean) => update((x) => saveSkill(x, plugins, { ...s, off }, meOf(x)?.name ?? 'Someone'));
  // back on: keep the company's changes, or drop the record if it was BuildTrack's version
  const turnOn = () => {
    const def = defaultSkills(plugins).find((x) => x.name === s.name);
    if (def && def.description === s.description && def.body === s.body) update((x) => resetSkill(x, s.name));
    else setOff(false);
  };
  return (
    <div className={cn('overflow-hidden rounded-lg border', s.status === 'off' && 'opacity-70')}>
      <div className="flex flex-wrap items-start gap-3 p-3">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={open ? onClose : onOpen} aria-expanded={open}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium">{s.name}</span>
            {STATUS[s.status] && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{STATUS[s.status]}</span>}
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">{s.description}</div>
          <div className="mt-1 text-[11px] text-muted-foreground/80">
            {s.sourceName ? `From ${s.sourceName}` : 'Your company'}
            {s.updatedBy && ` · changed by ${s.updatedBy}${s.updated ? `, ${s.updated.slice(0, 10)}` : ''}`}
          </div>
        </button>
        <div className="flex shrink-0 gap-1">
          {!open && <button type="button" className="btn btn-sm" onClick={onOpen}>{s.status === 'off' ? 'View' : 'Edit'}</button>}
          {isDefault && s.status !== 'off' && <button type="button" className="btn btn-sm" onClick={() => setOff(true)} title="Agents stop using it">Turn off</button>}
          {s.status === 'off' && <button type="button" className="btn btn-sm" onClick={() => turnOn()}>Turn on</button>}
          {s.status === 'changed' && (
            <button type="button" className="btn btn-sm" onClick={() => update((x) => resetSkill(x, s.name))} title="Go back to BuildTrack's version">
              <RotateCcw size={14} /> Reset
            </button>
          )}
          {s.status === 'custom' && (
            <button type="button" className="btn btn-sm" aria-label={`Delete ${s.name}`} onClick={() => window.confirm(`Delete the skill "${s.name}"?`) && update((x) => resetSkill(x, s.name))}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      {open && <Editor draft={{ name: s.name, description: s.description, body: s.body, isNew: false, isDefault }} onDone={onClose} />}
    </div>
  );
}

function Skills() {
  const { db } = useStore();
  const plugins = usePlugins();
  const skills = companySkills(db, plugins);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="card">
      <div className="card-head flex items-center justify-between gap-2">
        <h2>Skills</h2>
        <button type="button" className="btn btn-sm" onClick={() => setOpen('+new')}><Plus size={14} /> New skill</button>
      </div>
      <div className="card-body space-y-3">
        <p className="form-note text-muted-foreground">
          Skills are how your company does things, written down for agents: how you bill, how you level bids, what to flag. BuildTrack and each plugin come with some; change them to fit how you work, turn off the ones you don't want, or add your own. You can also just ask your agent ("change the job-costing skill to flag anything 10% over"). Changes apply to everyone's agents in the company.
        </p>
        {open === '+new' && (
          <div className="overflow-hidden rounded-lg border">
            <div className="flex items-center gap-2 p-3 text-sm font-medium"><Bot size={16} /> New skill</div>
            <Editor draft={{ name: '', description: '', body: '', isNew: true, isDefault: false }} onDone={() => setOpen(null)} />
          </div>
        )}
        {skills.map((s) => (
          <SkillRow key={s.name} s={s} open={open === s.name} onOpen={() => setOpen(s.name)} onClose={() => setOpen(null)} />
        ))}
      </div>
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
