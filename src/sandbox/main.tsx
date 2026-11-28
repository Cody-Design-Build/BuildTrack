// A sandboxed plugin's screen (/sandbox.html in an iframe without allow-same-origin). It runs on an
// opaque origin, so it has no session, storage or cookies, and can't reach the app or the database.
// The app sends it the plugin's code, the records the plugin declared and the current look; the
// plugin's changes go back to the app as messages, and the app checks them (src/plugins/loader.tsx).
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { StrictMode, useEffect, useMemo, useState, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '../index.css';
import { kit, ScopeContext, type KitScope, type RecordChange } from '../plugins/kit';
import type { FrameState, FrameTheme, FromFrame, Slot, ToFrame } from '../plugins/bridge';
import { manifestOf } from '../plugins/installed';
import { iconName } from '../plugins/kit-icon-name';
import type { Plugin } from '../plugins/sdk';

(globalThis as unknown as { __buildtrack: unknown }).__buildtrack = { kit, React, jsxRuntime };

const post = (m: FromFrame) => window.parent.postMessage(m, '*');

function applyTheme(t: FrameTheme) {
  const root = document.documentElement;
  root.className = t.className;
  for (const a of Array.from(root.attributes)) if (a.name.startsWith('data-') && !(a.name in t.attrs)) root.removeAttribute(a.name);
  for (const [k, v] of Object.entries(t.attrs)) root.setAttribute(k, v);
  root.setAttribute('style', t.style);
  let el = document.getElementById('bt-frame-theme');
  if (!el) {
    el = document.createElement('style');
    el.id = 'bt-frame-theme';
    document.head.appendChild(el);
  }
  el.textContent = t.css.join('\n');
}

async function importPlugin(code: string): Promise<Plugin> {
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  const mod = (await import(/* @vite-ignore */ url)) as { default?: Plugin };
  if (!mod.default || typeof mod.default.id !== 'string') throw new Error("The file doesn't export a plugin (export default definePlugin({ … })).");
  return mod.default;
}

function screenFor(p: Plugin, slot: Slot): ComponentType<Record<string, unknown>> | undefined {
  const c = (x: unknown) => x as ComponentType<Record<string, unknown>> | undefined;
  if (slot.kind === 'route') return c(p.routes?.find((r) => r.path === slot.path)?.component);
  if (slot.kind === 'jobTab') return c(p.jobTabs?.find((t) => t.id === slot.id)?.component);
  if (slot.kind === 'jobSummary') return c(p.jobSummary?.[slot.index]?.component);
  if (slot.kind === 'accountSection') return c(p.accountSections?.find((s) => s.id === slot.id)?.component);
  return undefined;
}

/** Reports the content's height, so the app can size the frame. */
function useHeight() {
  useEffect(() => {
    const report = () => post({ bt: 'height', height: document.documentElement.scrollHeight });
    const o = new ResizeObserver(report);
    o.observe(document.body);
    report();
    return () => o.disconnect();
  }, []);
}

function Frame({ plugin, slot, initial }: { plugin: Plugin; slot: Slot; initial: FrameState }) {
  const [state, setState] = useState(() => lastState ?? initial);
  useHeight();
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== window.parent) return;
      const m = e.data as ToFrame;
      if (m?.bt === 'state') setState(m.state);
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, []);
  const scope = useMemo<KitScope>(() => ({
    plugin: { id: plugin.id, name: plugin.name, collections: (plugin.collections ?? []) as string[], reads: (plugin.reads ?? []) as string[], writes: (plugin.writes ?? []) as string[] },
    data: state.data,
    // shown straight away here; the app checks and saves it, and sends the result back
    change: (changes: RecordChange[]) => post({ bt: 'change', changes: JSON.parse(JSON.stringify(changes)) }),
    costEntries: () => state.costEntries,
    me: state.me,
    location: { path: state.location.path, params: state.location.params, query: new URLSearchParams(state.location.search) },
    navigate: (to: string) => post({ bt: 'navigate', to }),
  }), [plugin, state]);
  const Screen = screenFor(plugin, slot);
  if (!Screen) return <p className="p-4 text-sm text-muted-foreground">This plugin has no screen here.</p>;
  return (
    <ScopeContext.Provider value={scope}>
      <Screen {...state.props} />
    </ScopeContext.Provider>
  );
}

class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    post({ bt: 'error', message: error.message });
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

let started = false;
let lastState: FrameState | null = null;
const waiting: ((s: FrameState) => void)[] = [];
window.addEventListener('message', async (e) => {
  if (e.source !== window.parent) return;
  const m = e.data as ToFrame;
  if (m?.bt === 'theme') applyTheme(m.theme);
  if (m?.bt === 'state') {
    lastState = m.state;
    waiting.splice(0).forEach((r) => r(m.state));
  }
  if (m?.bt !== 'load' || started) return;
  started = true;
  try {
    const plugin = await importPlugin(m.code);
    if (m.slot.kind === 'inspect') {
      post({ bt: 'manifest', manifest: JSON.parse(JSON.stringify(manifestOf(plugin, iconName))) });
      return;
    }
    if (m.css) kit.addStyles(plugin.id, m.css);
    // wait for the first state, then show the screen
    const first = lastState ?? (await new Promise<FrameState>((resolve) => waiting.push(resolve)));
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <Boundary>
          <Frame plugin={plugin} slot={m.slot} initial={first} />
        </Boundary>
      </StrictMode>,
    );
  } catch (err) {
    post({ bt: 'error', message: err instanceof Error ? err.message : String(err) });
  }
});
post({ bt: 'ready' });
