// How the app looks on this device: colour theme and light/dark mode.
// Kept in this browser's localStorage, not in the company data, so each person
// and device can choose their own. index.html applies the saved choice before
// the page first paints, so there's no flash of the wrong colours.
import { useSyncExternalStore } from 'react';
import { fontStack, modeFor, themeCss } from './theming/engine';
import { allThemes, findTheme, subscribeThemes, type ThemeEntry } from './theming/registry';
import type { FontId } from './theming/types';

export type Mode = 'light' | 'dark' | 'system';
/** 'theme' keeps the theme's own accent; anything else is a slot from src/palette.css. */
export type Accent = 'theme' | 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'cyan' | 'blue' | 'purple' | 'pink' | 'gray';
/** Corner rounding; the sizes are in src/themes.css ([data-corners]). */
export type Corners = 'sharp' | 'standard' | 'round';
/** 'theme' uses the font the current theme suggests (Inter when it suggests none). */
export type FontChoice = 'theme' | FontId;
export type Appearance = { theme: string; mode: Mode; accent: Accent; corners: Corners; font: FontChoice };

export const CORNERS: { id: Corners; name: string; note: string }[] = [
  { id: 'sharp', name: 'Sharp', note: 'Nearly square' },
  { id: 'standard', name: 'Standard', note: 'Slightly rounded' },
  { id: 'round', name: 'Round', note: 'Soft and rounded' },
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



const KEY = 'bt-appearance';
const DEFAULT: Appearance = { theme: 'buildtrack', mode: 'light', accent: 'theme', corners: 'standard', font: 'theme' };
const FONT_CHOICES: FontChoice[] = ['theme', 'inter', 'system', 'plex', 'jetbrains-mono'];
const BOOT_KEY = 'bt-theme-boot';
const dark = () => window.matchMedia('(prefers-color-scheme: dark)');

let current: Appearance = load();
const listeners = new Set<() => void>();

function load(): Appearance {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Appearance>;
    return {
      // Themes come from plugins and imports, registered after this runs; an unknown id
      // falls back to the default when applied.
      theme: typeof a.theme === 'string' && /^[a-z0-9-]+$/.test(a.theme) ? a.theme : DEFAULT.theme,
      mode: a.mode === 'dark' || a.mode === 'system' || a.mode === 'light' ? a.mode : DEFAULT.mode,
      accent: ACCENTS.some((x) => x.id === a.accent) ? a.accent! : DEFAULT.accent,
      corners: CORNERS.some((x) => x.id === a.corners) ? a.corners! : DEFAULT.corners,
      font: FONT_CHOICES.includes(a.font as FontChoice) ? (a.font as FontChoice) : DEFAULT.font,
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
  const theme = findTheme(current.theme) ?? findTheme(DEFAULT.theme);
  // A theme with only one mode (most Omarchy themes are dark only) keeps that mode.
  const mode = theme ? modeFor(theme, resolveMode(current.mode)) : resolveMode(current.mode);
  root.dataset.theme = theme?.id ?? DEFAULT.theme;
  root.dataset.mode = mode;
  if (current.accent === 'theme') delete root.dataset.accent;
  else root.dataset.accent = current.accent;
  if (current.corners === 'standard') delete root.dataset.corners;
  else root.dataset.corners = current.corners;
  root.classList.toggle('dark', mode === 'dark');
  const font = fontStack(current.font === 'theme' ? theme?.font : current.font);
  root.style.setProperty('--app-font', font);
  // For index.html, so the next visit starts in the right colours and font.
  try {
    const only = theme && !(theme.light && theme.dark) ? (theme.dark ? 'dark' : 'light') : null;
    localStorage.setItem(BOOT_KEY, JSON.stringify({ css: theme ? themeCss(theme) : '', font, only }));
  } catch {
    /* storage unavailable */
  }
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
  subscribeThemes(() => {
    apply();
    current = { ...current };
    listeners.forEach((l) => l());
  });
  dark().addEventListener('change', () => {
    if (current.mode !== 'system') return;
    current = { ...current }; // new snapshot so components re-render
    apply();
    listeners.forEach((l) => l());
  });
}

/** Every theme the app knows (plugins' and imported), for Settings. */
export function useThemes(): ThemeEntry[] {
  return useSyncExternalStore(subscribeThemes, allThemes);
}

export function useAppearance() {
  const a = useSyncExternalStore(subscribe, () => current);
  return { ...a, resolved: resolveMode(a.mode) };
}
