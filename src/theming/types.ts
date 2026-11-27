// What a theme is: a name and the colours for light and/or dark mode, plus an
// optional font. Only background, foreground and primary are required; the engine
// (./engine.ts) works out every other colour from them. Built-in themes spell
// everything out; imported and agent-written themes can give as little or as much
// as they like.
//
// Add themes from a plugin with `themes: [defineTheme({...})]` (see
// src/plugins/README.md → Themes).

/** The ten category colours behind statuses, task types, avatars and the Accent choice. */
export type PaletteSlot = 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'cyan' | 'blue' | 'purple' | 'pink' | 'gray';
export const PALETTE_SLOTS: PaletteSlot[] = ['red', 'orange', 'amber', 'green', 'teal', 'cyan', 'blue', 'purple', 'pink', 'gray'];

/** Any CSS colour: '#509475', 'oklch(0.64 0.175 44)', 'rgb(…)'. */
type Color = string;

export interface ThemeColors {
  /** The page behind everything. */
  background: Color;
  /** Headings and strong text. */
  foreground: Color;
  /** The accent: primary buttons, links, highlights. */
  primary: Color;

  // Optional: worked out from the three above when left out.
  /** Body text, a touch softer than foreground. */
  text?: Color;
  /** Cards, tables, panels. */
  card?: Color;
  sidebar?: Color;
  /** Subtle surfaces: hover rows, tab strips, chips. */
  muted?: Color;
  /** Secondary text. */
  mutedForeground?: Color;
  /** Placeholder and disabled text. */
  faint?: Color;
  /** Hover tint on menus and selected items. */
  accent?: Color;
  /** Text on primary-coloured buttons. */
  primaryForeground?: Color;
  destructive?: Color;
  border?: Color;
  borderStrong?: Color;
  info?: Color;
  success?: Color;
  warning?: Color;
  /** Category colours; any left out are worked out from the others. */
  palette?: Partial<Record<PaletteSlot, Color>>;
}

export type FontId = 'inter' | 'system' | 'plex' | 'jetbrains-mono';

export interface ThemeDefinition {
  /** Lower-case, dashes: 'osaka-jade'. Prefix your own, e.g. 'acme-brand'. */
  id: string;
  name: string;
  note?: string;
  /** At least one of light or dark. A theme with only one keeps it whatever mode is chosen. */
  light?: ThemeColors;
  dark?: ThemeColors;
  /** The font this theme suggests (Settings → Appearance → Font can override it). */
  font?: FontId;
}

export const defineTheme = (t: ThemeDefinition): ThemeDefinition => t;
