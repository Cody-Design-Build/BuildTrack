// The themes BuildTrack ships with, grouped for Settings → Appearance. Each is a
// starting point: pick one, then change anything under Customize.
import { omarchyTheme } from '../omarchy';
import type { ThemeDefinition } from '../types';
import { BUILTIN_THEMES } from './builtin';
import { OMARCHY_THEMES } from './omarchy-data';

export interface ThemePack {
  id: string;
  name: string;
  /** One line under the group's name in Settings → Appearance. */
  note?: string;
  themes: ThemeDefinition[];
}

const builtin = (...ids: string[]) => ids.map((id) => BUILTIN_THEMES.find((t) => t.id === id)!).filter(Boolean);

/** What each terminal theme looks like (the Omarchy colours files don't say). */
const TERMINAL_NOTES: Record<string, string> = {
  'omarchy-tokyo-night': 'Terminal · deep navy and soft blue',
  'omarchy-osaka-jade': 'Terminal · dark jade green',
  'omarchy-gruvbox': 'Terminal · warm retro browns',
  'omarchy-flexoki-light': 'Terminal · ink on warm paper',
};

/** Grouped by style. Each theme brings its own colours, font and corners. */
export const THEME_PACKS: ThemePack[] = [
  { id: 'clean', name: 'Clean', note: 'Crisp and businesslike, with small corners.', themes: builtin('buildtrack', 'graphite', 'blueprint', 'concrete', 'hi-vis') },
  { id: 'soft', name: 'Soft', note: 'Rounded corners and a rounded font.', themes: builtin('sage', 'kraft', 'walnut', 'lilac') },
  {
    id: 'terminal',
    name: 'Terminal',
    note: 'Monospaced and square, from the Omarchy desktop.',
    themes: OMARCHY_THEMES.map((t) => ({ ...omarchyTheme(t.toml, t.id, t.name), note: TERMINAL_NOTES[t.id] ?? 'Terminal' })),
  },
];

/**
 * Themes that were removed, and the closest one still shipped. Saved looks, presets
 * and the company theme that name an old id are moved over (see cleanLook in
 * src/appearance.ts), so nobody's screen changes to something unrelated.
 */
export const RETIRED_THEMES: Record<string, string> = {
  nord: 'blueprint',
  'tokyo-night': 'blueprint',
  gruvbox: 'kraft',
  catppuccin: 'sage',
  'rose-pine': 'walnut',
  solarized: 'sage',
  'omarchy-catppuccin': 'omarchy-tokyo-night',
  'omarchy-catppuccin-latte': 'omarchy-flexoki-light',
  'omarchy-rose-pine': 'omarchy-flexoki-light',
  'omarchy-ethereal': 'omarchy-tokyo-night',
  'omarchy-everforest': 'omarchy-gruvbox',
  'omarchy-hackerman': 'omarchy-tokyo-night',
  'omarchy-jade-horse': 'omarchy-gruvbox',
  'omarchy-kanagawa': 'omarchy-tokyo-night',
  'omarchy-last-horizon': 'omarchy-tokyo-night',
  'omarchy-lumon': 'omarchy-tokyo-night',
  'omarchy-lupine': 'omarchy-flexoki-light',
  'omarchy-matte-black': 'omarchy-gruvbox',
  'omarchy-miasma': 'omarchy-gruvbox',
  'omarchy-nord': 'omarchy-tokyo-night',
  'omarchy-retro-82': 'omarchy-tokyo-night',
  'omarchy-ristretto': 'omarchy-gruvbox',
  'omarchy-solitude': 'omarchy-tokyo-night',
  'omarchy-starship': 'omarchy-tokyo-night',
  'omarchy-vantablack': 'omarchy-tokyo-night',
  'omarchy-white': 'omarchy-flexoki-light',
};
