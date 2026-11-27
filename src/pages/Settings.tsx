import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Check, Database, Monitor, Moon, Palette, Sun, type LucideIcon } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { Field } from '../components/Forms';
import { useStore } from '../store';
import { DataCard } from './Other';
import { ACCENTS, THEMES, setAppearance, useAppearance, type Accent, type Mode } from '../appearance';
import { cn } from '@/lib/utils';
import { cloud, useCloudStatus } from '../cloud';
import { signOut } from '../components/CloudGate';

const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'general', label: 'General', icon: Building2 },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'data', label: 'Data', icon: Database },
];

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const section = SECTIONS.some((s) => s.id === params.get('section')) ? params.get('section')! : 'general';
  return (
    <div className="page scroll">
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-6 p-4 md:flex-row md:items-start">
        <nav className="flex shrink-0 gap-1 overflow-x-auto md:sticky md:top-4 md:w-48 md:flex-col" aria-label="Settings sections">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setParams(id === 'general' ? {} : { section: id }, { replace: true })}
              aria-current={section === id ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                section === id && 'bg-muted text-foreground',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 max-w-3xl flex-1 space-y-4">
          {section === 'general' && <General />}
          {section === 'appearance' && <AppearanceSettings />}
          {section === 'data' && <Data />}
        </div>
      </div>
    </div>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
      </div>
      <div className="card-body">
        {note && <p className="form-note mb-4 text-muted-foreground">{note}</p>}
        {children}
      </div>
    </section>
  );
}

function General() {
  const { db, update } = useStore();
  const [name, setName] = useState(db.companyName);
  return (
    <>
      {cloud && <AccountCard />}
      <Card title="Company">
        <Field label="Company name">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="row-end">
          <button type="button" className="btn primary" onClick={() => update((d) => ({ ...d, companyName: name.trim() || d.companyName }))}>
            Save
          </button>
        </div>
      </Card>
      <Card title="Team">
        {db.team.map((m) => (
          <div key={m.id} className="list-row">
            <span className="grow">{m.name}</span>
            <span className="muted">{m.initials}</span>
          </div>
        ))}
      </Card>
    </>
  );
}

function AccountCard() {
  const [email, setEmail] = useState('');
  const { status } = useCloudStatus();
  useEffect(() => {
    cloud!.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''));
  }, []);
  const label = { local: 'This browser only', connecting: 'Connecting…', online: 'Connected', saving: 'Saving…', offline: 'Offline — changes will save when you reconnect', error: 'Couldn’t save — retrying' }[status];
  return (
    <Card title="Your account">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{email || '…'}</div>
          <div className="text-xs text-muted-foreground">Shared team data · {label}</div>
        </div>
        <button type="button" className="btn" onClick={signOut}>Sign out</button>
      </div>
    </Card>
  );
}

function Data() {
  const { reset } = useStore();
  return (
    <>
      <DataCard />
      <Card title="Start over" note="Your data is saved in this browser. Resetting brings back the sample data.">
        <button type="button" className="btn danger" onClick={() => confirm('Reset all data to the sample data?') && reset()}>
          Reset sample data
        </button>
      </Card>
    </>
  );
}

const MODES: { id: Mode; label: string; icon: LucideIcon }[] = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
];

function AppearanceSettings() {
  const { theme, mode, accent, resolved } = useAppearance();
  return (
    <>
      <Card title="Mode" note="System follows your computer's light or dark setting.">
        <div className="grid grid-cols-3 gap-3">
          {MODES.map(({ id, label, icon: Icon }) => (
            <Choice key={id} selected={mode === id} onSelect={() => setAppearance({ mode: id })} label={label} icon={<Icon className="size-4" />}>
              {id === 'system' ? (
                <div className="flex">
                  <Preview theme={theme} accent={accent} mode="light" className="w-1/2 rounded-r-none border-r-0" />
                  <Preview theme={theme} accent={accent} mode="dark" className="w-1/2 rounded-l-none border-l-0" />
                </div>
              ) : (
                <Preview theme={theme} accent={accent} mode={id} />
              )}
            </Choice>
          ))}
        </div>
      </Card>
      <Card
        title="Theme"
        note="Each theme has a light and a dark version. Budgets and invoices you send to customers always stay black on white."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {THEMES.map((t) => (
            <Choice key={t.id} selected={theme === t.id} onSelect={() => setAppearance({ theme: t.id })} label={t.name} note={t.note}>
              <Preview theme={t.id} accent={accent} mode={resolved} />
            </Choice>
          ))}
        </div>
      </Card>
      <Card title="Accent colour" note="Buttons, links and highlights. Each colour is drawn from the current theme's own palette, so it always fits.">
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((a) => (
            <AccentSwatch key={a.id} id={a.id} name={a.name} theme={theme} mode={resolved} selected={accent === a.id} />
          ))}
        </div>
      </Card>
    </>
  );
}

function Choice({
  selected,
  onSelect,
  label,
  note,
  icon,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  note?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'group flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors hover:border-foreground/30',
        selected && 'border-primary ring-2 ring-primary/25 hover:border-primary',
      )}
    >
      {children}
      <span className="flex items-start gap-2 px-1 pb-0.5">
        {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{label}</span>
          {note && <span className="block text-xs text-muted-foreground">{note}</span>}
        </span>
        {selected && <Check className="mt-0.5 size-4 shrink-0 text-primary" />}
      </span>
    </button>
  );
}

function AccentSwatch({ id, name, theme, mode, selected }: { id: Accent; name: string; theme: string; mode: 'light' | 'dark'; selected: boolean }) {
  return (
    <button
      type="button"
      onClick={() => setAppearance({ accent: id })}
      aria-pressed={selected}
      title={name}
      className={cn(
        'flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition-colors hover:border-foreground/30',
        selected && 'border-primary ring-2 ring-primary/25 hover:border-primary',
      )}
    >
      {/* drawn inside its own theme scope so "Theme's own" shows the theme's accent, not the chosen one */}
      <span data-theme={theme} data-mode={mode} data-accent={id === 'theme' ? undefined : id} className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
        {selected && <Check className="size-3.5" />}
      </span>
      {name}
    </button>
  );
}

/** A tiny sketch of the app, drawn in the given theme, mode and accent. */
function Preview({ theme, mode, accent = 'theme', className }: { theme: string; mode: 'light' | 'dark'; accent?: Accent; className?: string }) {
  return (
    <div
      data-theme={theme}
      data-mode={mode}
      data-accent={accent === 'theme' ? undefined : accent}
      aria-hidden
      className={cn('flex h-24 overflow-hidden rounded-md border bg-background text-foreground', className)}
    >
      <div className="flex w-9 shrink-0 flex-col gap-1.5 border-r bg-sidebar p-1.5">
        <div className="size-3 rounded-sm bg-primary" />
        <div className="mt-1 h-1.5 rounded-full bg-primary/70" />
        <div className="h-1.5 rounded-full bg-muted-foreground/30" />
        <div className="h-1.5 rounded-full bg-muted-foreground/30" />
        <div className="h-1.5 rounded-full bg-muted-foreground/30" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2">
        <div className="flex items-center gap-1">
          <div className="h-2 w-12 rounded-full bg-foreground/80" />
          <div className="ml-auto h-3 w-7 rounded-sm bg-primary" />
        </div>
        <div className="flex flex-1 flex-col gap-1 rounded-sm border bg-card p-1.5 shadow-xs">
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-8 rounded-full bg-muted-foreground/40" />
            <div className="ml-auto h-1.5 w-3 rounded-full" style={{ background: 'var(--success)' }} />
          </div>
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-10 rounded-full bg-muted-foreground/40" />
            <div className="ml-auto h-1.5 w-3 rounded-full" style={{ background: 'var(--warning)' }} />
          </div>
          <div className="mt-auto h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-3/5 rounded-full" style={{ background: 'var(--info)' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
