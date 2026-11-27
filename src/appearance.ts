// How the app looks on this device: colour theme and light/dark mode.
// Kept in this browser's localStorage, not in the company data, so each person
// and device can choose their own. index.html applies the saved choice before
// the page first paints, so there's no flash of the wrong colours.
import { useSyncExternalStore } from 'react';

export type Mode = 'light' | 'dark' | 'system';
/** 'theme' keeps the theme's own accent; anything else is a slot from src/palette.css. */
export type Accent = 'theme' | 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'cyan' | 'blue' | 'purple' | 'pink' | 'gray';
export type Appearance = { theme: string; mode: Mode; accent: Accent };

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

// The ids must match the [data-theme] blocks in src/themes.css.
export const THEMES: { id: string; name: string; note: string }[] = [
  { id: 'buildtrack', name: 'BuildTrack', note: 'The original warm orange' },
  { id: 'graphite', name: 'Graphite', note: 'Black and white, no accent colour' },
  { id: 'nord', name: 'Nord', note: 'Cool arctic blues' },
  { id: 'gruvbox', name: 'Gruvbox', note: 'Retro, warm and earthy' },
  { id: 'catppuccin', name: 'Catppuccin', note: 'Soft pastels (Latte / Mocha)' },
  { id: 'tokyo-night', name: 'Tokyo Night', note: 'Deep blues and neon (Day / Night)' },
  { id: 'rose-pine', name: 'Rosé Pine', note: 'Muted rose and pine (Dawn / Main)' },
  { id: 'solarized', name: 'Solarized', note: 'The classic low-contrast palette' },
];

const KEY = 'bt-appearance';
const DEFAULT: Appearance = { theme: 'buildtrack', mode: 'light', accent: 'theme' };
const dark = () => window.matchMedia('(prefers-color-scheme: dark)');

let current: Appearance = load();
const listeners = new Set<() => void>();

function load(): Appearance {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Appearance>;
    return {
      theme: THEMES.some((t) => t.id === a.theme) ? a.theme! : DEFAULT.theme,
      mode: a.mode === 'dark' || a.mode === 'system' || a.mode === 'light' ? a.mode : DEFAULT.mode,
      accent: ACCENTS.some((x) => x.id === a.accent) ? a.accent! : DEFAULT.accent,
    };
  } catch {
    return DEFAULT;
  }
}

export function resolveMode(mode: Mode): 'light' | 'dark' {
  return mode === 'system' ? (dark().matches ? 'dark' : 'light') : mode;
}

function apply() {
  const root = document.documentElement;
  const mode = resolveMode(current.mode);
  root.dataset.theme = current.theme;
  root.dataset.mode = mode;
  if (current.accent === 'theme') delete root.dataset.accent;
  else root.dataset.accent = current.accent;
  root.classList.toggle('dark', mode === 'dark');
}

export function setAppearance(next: Partial<Appearance>) {
  current = { ...current, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private window: the choice just won't be remembered */
  }
  apply();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Call once at start-up: applies the saved choice and follows the system setting. */
export function initAppearance() {
  apply();
  dark().addEventListener('change', () => {
    if (current.mode !== 'system') return;
    current = { ...current }; // new snapshot so components re-render
    apply();
    listeners.forEach((l) => l());
  });
}

export function useAppearance() {
  const a = useSyncExternalStore(subscribe, () => current);
  return { ...a, resolved: resolveMode(a.mode) };
}
