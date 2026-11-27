// Settings → Plugins: turn features on and off, and choose between plugins that do the same
// job (e.g. two ways of doing job costing). Turning a plugin off hides it; its data stays.
import { Check, Puzzle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { blockedBy, dependents, installedPlugins, isOn, isSwitchedOn, roleChoice, usePlugins, withPluginOn, withRoleChoice } from '../plugins/registry';
import type { Plugin } from '../plugins/sdk';
import type { PluginChoices } from '../data';
import { useStore } from '../store';

function useAllPlugins() {
  usePlugins(); // re-render when choices change
  return installedPlugins();
}

/** A plain list of what a plugin adds to the app, e.g. "Bids menu item, 2 pages, Bids tab on jobs". */
function adds(p: Plugin): string[] {
  const out: string[] = [];
  const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  if (p.nav?.length) out.push(`${p.nav.map((n) => n.label).join(', ')} in the menu`);
  if (p.routes?.length) out.push(plural(p.routes.length, 'page'));
  if (p.jobTabs?.length) out.push(`${p.jobTabs.map((t) => t.label).join(', ')} tab on jobs`);
  if (p.jobSummary?.length) out.push('rows on the job Overview');
  if (p.accountSections?.length) out.push(plural(p.accountSections.length, 'section') + ' on company pages');
  if (p.costEntries) out.push('costs for job costing');
  return out;
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

export function PluginSettings() {
  const all = useAllPlugins();
  const { update } = useStore();
  // company-wide: saved in the data, so it syncs to the whole team
  const save = (plugins: PluginChoices) => update((d) => ({ ...d, plugins }));
  // a choice card only for roles with more than one plugin to pick from
  const count = (role: string) => all.filter((p) => p.role?.id === role).length;
  const roles = [...new Map(all.filter((p) => p.role && count(p.role.id) > 1).map((p) => [p.role!.id, p.role!.label])).entries()];
  const plain = all.filter((p) => !p.role || count(p.role.id) === 1);
  return (
    <>
      <section className="card">
        <div className="card-head"><h2>Plugins</h2></div>
        <div className="card-body">
          <p className="form-note text-muted-foreground">
            Everything in BuildTrack is a plugin: each one adds its own menu items, pages, job tabs and company-page sections. Changes here apply to everyone in the company. Turning one off hides it everywhere; its records are kept, and it comes back as it was when you turn it on again. To change how something works, change or replace its plugin (see <code>src/plugins/README.md</code>).
          </p>
        </div>
      </section>

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
                    onClick={() => save(withRoleChoice(role, p.id))}
                    aria-pressed={on}
                    className={cn('flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60', on && 'border-primary bg-primary/5')}
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
            return (
              <div key={p.id} className="flex items-start gap-3 px-5 py-3">
                <Puzzle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium">{p.name}{p.core && <span className="ml-2 text-xs font-normal text-muted-foreground">Always on</span>}</span>
                  <span className="text-sm text-muted-foreground">{p.description}</span>
                  {adds(p).length > 0 && <span className="text-xs text-muted-foreground">Adds: {adds(p).join(' · ')}</span>}
                  {p.requires?.length ? <span className="text-xs text-muted-foreground">Needs: {p.requires.map((r) => all.find((x) => x.id === r)?.name ?? r).join(', ')}</span> : null}
                  {blocked.length > 0 && isSwitchedOn(p.id) && <span className="text-xs text-destructive">Off because it needs {blocked.join(' and ')}.</span>}
                  {needed.length > 0 && <span className="text-xs text-muted-foreground">Turning it off also turns off {needed.join(' and ')}.</span>}
                  <Meta p={p} />
                </div>
                <Switch
                  checked={!!p.core || isSwitchedOn(p.id)}
                  disabled={p.core}
                  onCheckedChange={(v) => save(withPluginOn(p.id, v))}
                  aria-label={`${p.name} on`}
                  className="mt-1"
                />
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
