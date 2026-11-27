// The themes BuildTrack ships with, grouped for Settings → Appearance. Each is a
// starting point: pick one, then change anything under Customize.
import { omarchyTheme } from '../omarchy';
import type { ThemeDefinition } from '../types';
import { BUILTIN_THEMES } from './builtin';
import { OMARCHY_THEMES } from './omarchy-data';

export interface ThemePack {
  id: string;
  name: string;
  themes: ThemeDefinition[];
}

export const THEME_PACKS: ThemePack[] = [
  { id: 'builtin', name: 'BuildTrack themes', themes: BUILTIN_THEMES },
  { id: 'omarchy', name: 'Omarchy themes', themes: OMARCHY_THEMES.map((t) => omarchyTheme(t.toml, t.id, t.name)) },
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
  'omarchy-osaka-jade': 'omarchy-gruvbox',
  'omarchy-retro-82': 'omarchy-tokyo-night',
  'omarchy-ristretto': 'omarchy-gruvbox',
  'omarchy-solitude': 'omarchy-tokyo-night',
  'omarchy-starship': 'omarchy-tokyo-night',
  'omarchy-vantablack': 'omarchy-tokyo-night',
  'omarchy-white': 'omarchy-flexoki-light',
};
