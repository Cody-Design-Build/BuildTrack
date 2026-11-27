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
