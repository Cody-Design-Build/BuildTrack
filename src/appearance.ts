// How the app looks for the person using it: their "look" (theme, any colours they
// changed, mode, accent, font, numbers, corners) and their saved presets.
//
// Remembered in this browser (applied by index.html before the first paint) and, when
// signed in to shared data, in the person's Preferences record so it follows them to
// any device (see AppearanceSync in src/components/AppearanceSync.tsx). A company can
// also set a company theme: the look people start with until they change their own.
import { useSyncExternalStore } from 'react';
import { complete, fontStack, modeFor, themeCss } from './theming/engine';
import { allThemes, findTheme, setLookCss, subscribeThemes, type ThemeEntry } from './theming/registry';
import type { Accent, ColorKey, ColorOverrides, Corners, FontChoice, Look, Mode, Preset, ThemeColors, ThemeDefinition } from './theming/types';

export type { Accent, Corners, FontChoice, Look, Mode, Preset };
/** @deprecated use Look */
export type Appearance = Look;

export const CORNERS: { id: Corners; name: string; note: string; px: number }[] = [
  { id: 'sharp', name: 'Sharp', note: 'Nearly square', px: 2 },
  { id: 'standard', name: 'Standard', note: 'Slightly rounded', px: 6 },
  { id: 'round', name: 'Round', note: 'Soft and rounded', px: 12 },
];

export const ACCENTS: { id: Accent; name: string }[] = [
  { id: 'theme', name: "Theme's own" },
  { id: 'red', name: 'Red' },
  { id: 'orange', name: 'Orange' },
  { id: 'amber', name: 'Amber' },
  { id: 'green', name: 'Green' },
  { id: 'teal', name: 'Teal' },
  { id: 'cyan', name: 'Cyan' },
  { id: 'blue', name: 'Blue' },
  { id: 'purple', name: 'Purple' },
  { id: 'pink', name: 'Pink' },
  { id: 'gray', name: 'Mono' },
];

/** The colours Customize offers, in the order shown. */
export const COLOR_FIELDS: { key: ColorKey; label: string; group: 'Surfaces' | 'Text' | 'Lines' | 'Accent' | 'Status' }[] = [
  { key: 'background', label: 'Page background', group: 'Surfaces' },
  { key: 'card', label: 'Cards and panels', group: 'Surfaces' },
  { key: 'sidebar', label: 'Sidebar', group: 'Surfaces' },
  { key: 'muted', label: 'Subtle surfaces', group: 'Surfaces' },
  { key: 'foreground', label: 'Headings', group: 'Text' },
  { key: 'text', label: 'Body text', group: 'Text' },
  { key: 'mutedForeground', label: 'Secondary text', group: 'Text' },
  { key: 'faint', label: 'Faint text', group: 'Text' },
  { key: 'border', label: 'Borders', group: 'Lines' },
  { key: 'borderStrong', label: 'Strong borders', group: 'Lines' },
  { key: 'primary', label: 'Accent', group: 'Accent' },
  { key: 'primaryForeground', label: 'Text on accent', group: 'Accent' },
  { key: 'accent', label: 'Hover tint', group: 'Accent' },
  { key: 'destructive', label: 'Danger', group: 'Status' },
  { key: 'success', label: 'Success', group: 'Status' },
  { key: 'warning', label: 'Warning', group: 'Status' },
  { key: 'info', label: 'Information', group: 'Status' },
];

const KEY = 'bt-appearance';
const PRESETS_KEY = 'bt-presets';
const BOOT_KEY = 'bt-theme-boot';
export const DEFAULT_LOOK: Look = { theme: 'buildtrack', mode: 'light', accent: 'theme', corners: 'standard', font: 'theme' };
const FONT_CHOICES: FontChoice[] = ['theme', 'inter', 'system', 'plex', 'jetbrains-mono'];
const dark = () => window.matchMedia('(prefers-color-scheme: dark)');

/** What's stored: the look, when it last changed, and whether the person ever changed it. */
interface Saved {
  look: Look;
  updated: string;
  customized: boolean;
}

let saved: Saved = load();
let presets: Preset[] = loadPresets();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Turns anything stored (old shapes included) into a valid look. */
export function cleanLook(a: Partial<Look> | undefined): Look {
  const x = a ?? {};
  const okColors = (o: unknown): ColorOverrides | undefined => {
    if (!o || typeof o !== 'object') return undefined;
    const out: ColorOverrides = {};
    for (const f of COLOR_FIELDS) {
      const v = (o as Record<string, unknown>)[f.key];
      if (typeof v === 'string' && v.length < 80) out[f.key] = v;
    }
    return Object.keys(out).length ? out : undefined;
  };
  const light = okColors(x.colors?.light);
  const darkC = okColors(x.colors?.dark);
  return {
    theme: typeof x.theme === 'string' && /^[a-z0-9-]+$/.test(x.theme) && x.theme !== 'look' ? x.theme : DEFAULT_LOOK.theme,
    mode: x.mode === 'dark' || x.mode === 'system' || x.mode === 'light' ? x.mode : DEFAULT_LOOK.mode,
    accent: ACCENTS.some((a) => a.id === x.accent) ? x.accent! : DEFAULT_LOOK.accent,
    corners: CORNERS.some((c) => c.id === x.corners) ? x.corners! : DEFAULT_LOOK.corners,
    ...(typeof x.radius === 'number' && x.radius >= 0 && x.radius <= 24 ? { radius: Math.round(x.radius) } : {}),
    font: FONT_CHOICES.includes(x.font as FontChoice) ? (x.font as FontChoice) : DEFAULT_LOOK.font,
    ...(x.numbers === 'mono' ? { numbers: 'mono' as const } : {}),
    ...(light || darkC ? { colors: { ...(light ? { light } : {}), ...(darkC ? { dark: darkC } : {}) } } : {}),
  };
}

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    // Older saves stored the look's fields at the top level.
    const look = cleanLook(raw.look ?? raw);
    return { look, updated: typeof raw.updated === 'string' ? raw.updated : '', customized: raw.customized ?? !!raw.theme };
  } catch {
    return { look: DEFAULT_LOOK, updated: '', customized: false };
  }
}

function loadPresets(): Preset[] {
  try {
    const list = JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]');
    return Array.isArray(list) ? list.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string').map((p) => ({ id: p.id, name: p.name, look: cleanLook(p.look) })) : [];
  } catch {
    return [];
  }
}

export function resolveMode(mode: Mode): 'light' | 'dark' {
  return mode === 'system' ? (dark().matches ? 'dark' : 'light') : mode;
}

/** The theme with the look's colour changes on top. */
export function lookTheme(look: Look): ThemeDefinition | undefined {
  const base = findTheme(look.theme) ?? findTheme(DEFAULT_LOOK.theme);
  if (!base || !look.colors) return base;
  const merge = (colors: ThemeColors | undefined, over: ColorOverrides | undefined): ThemeColors | undefined =>
    colors || over ? ({ ...(colors ?? base.dark ?? base.light)!, ...(over ?? {}) } as ThemeColors) : undefined;
  return { ...base, id: 'look', light: merge(base.light, look.colors.light), dark: merge(base.dark, look.colors.dark) };
}

function apply() {
  const root = document.documentElement;
  const look = saved.look;
  const theme = lookTheme(look);
  // A theme with only one mode (most Omarchy themes are dark only) keeps that mode.
  const mode = theme ? modeFor(theme, resolveMode(look.mode)) : resolveMode(look.mode);
  const css = theme?.id === 'look' ? themeCss(theme) : '';
  setLookCss(css);
  root.dataset.theme = theme?.id ?? DEFAULT_LOOK.theme;
  root.dataset.mode = mode;
  root.classList.toggle('dark', mode === 'dark');
  if (look.accent === 'theme') delete root.dataset.accent;
  else root.dataset.accent = look.accent;
  if (look.corners === 'standard') delete root.dataset.corners;
  else root.dataset.corners = look.corners;
  if (look.radius !== undefined) root.style.setProperty('--radius', `${look.radius}px`);
  else root.style.removeProperty('--radius');
  if (look.numbers === 'mono') root.dataset.numbers = 'mono';
  else delete root.dataset.numbers;
  const font = fontStack(look.font === 'theme' ? theme?.font : look.font);
  root.style.setProperty('--app-font', font);
  // For index.html, so the next visit starts in the right colours and font.
  try {
    const only = theme && !(theme.light && theme.dark) ? (theme.dark ? 'dark' : 'light') : null;
    localStorage.setItem(BOOT_KEY, JSON.stringify({ css: theme ? themeCss(theme) : '', theme: theme?.id, font, only, radius: look.radius }));
  } catch {
    /* storage unavailable */
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    /* private window: remembered for this visit only */
  }
}

/** Change part of the look (the person's own choice: remembered and synced). */
export function setAppearance(next: Partial<Look>) {
  saved = { look: cleanLook({ ...saved.look, ...next }), updated: new Date().toISOString(), customized: true };
  persist();
  apply();
  notify();
}

/** Change one colour of the current mode's colours, or clear it with undefined. */
export function setColor(key: ColorKey, value: string | undefined) {
  const mode = currentMode();
  const colors = { ...(saved.look.colors ?? {}) };
  const over = { ...(colors[mode] ?? {}) };
  if (value === undefined) delete over[key];
  else over[key] = value;
  if (Object.keys(over).length) colors[mode] = over;
  else delete colors[mode];
  setAppearance({ colors: Object.keys(colors).length ? colors : undefined });
}

/** Undo every colour change. */
export const resetColors = () => setAppearance({ colors: undefined });

/** The mode the app is showing right now (after the theme's own limits). */
export function currentMode(): 'light' | 'dark' {
  const theme = lookTheme(saved.look);
  return theme ? modeFor(theme, resolveMode(saved.look.mode)) : resolveMode(saved.look.mode);
}

/** Every colour of the look in the current mode, filled in by the engine. */
export function currentColors() {
  const theme = lookTheme(saved.look);
  const mode = currentMode();
  const c = theme?.[mode] ?? theme?.light ?? theme?.dark;
  return c ? complete(c, mode === 'dark') : undefined;
}

// ---------- Presets ----------

export function savePreset(name: string): Preset {
  const p: Preset = { id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.trim() || 'My look', look: saved.look };
  presets = [...presets, p];
  touch();
  return p;
}
export function updatePreset(id: string) {
  presets = presets.map((p) => (p.id === id ? { ...p, look: saved.look } : p));
  touch();
}
export function renamePreset(id: string, name: string) {
  presets = presets.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p));
  touch();
}
export function deletePreset(id: string) {
  presets = presets.filter((p) => p.id !== id);
  touch();
}
export const applyLook = (look: Look) => setAppearance(cleanLook(look));

function touch() {
  saved = { ...saved, updated: new Date().toISOString(), customized: true };
  persist();
  notify();
}

// ---------- Syncing with the person's Preferences record and the company theme ----------

export interface Snapshot {
  look: Look;
  presets: Preset[];
  updated: string;
  customized: boolean;
}
let snap: Snapshot = { ...saved, presets };
const refresh = () => {
  snap = { ...saved, presets };
};

/** Take a look and presets saved elsewhere (another device), without marking them as a new change. */
export function adoptRemote(remote: { look: Look; presets: Preset[]; updated: string }) {
  saved = { look: cleanLook(remote.look), updated: remote.updated, customized: true };
  presets = remote.presets.map((p) => ({ ...p, look: cleanLook(p.look) }));
  persist();
  apply();
  notify();
}

/** Start from the company theme (someone who has never changed their own look). */
export function adoptCompanyLook(look: Look) {
  saved = { look: cleanLook(look), updated: saved.updated, customized: false };
  persist();
  apply();
  notify();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
listeners.add(refresh);

/** Call once at start-up: applies the saved look and follows the system setting. */
export function initAppearance() {
  apply();
  subscribeThemes(() => {
    apply();
    notify();
  });
  dark().addEventListener('change', () => {
    if (saved.look.mode !== 'system') return;
    apply();
    notify();
  });
}

/** Every theme the app knows (shipped and imported), for Settings. */
export function useThemes(): ThemeEntry[] {
  return useSyncExternalStore(subscribeThemes, allThemes);
}

/** The look, presets and sync state; re-renders on any change. */
export function useLookState(): Snapshot {
  return useSyncExternalStore(subscribe, () => snap);
}

export function useAppearance() {
  const s = useLookState();
  return { ...s.look, resolved: resolveMode(s.look.mode), presets: s.presets };
}
