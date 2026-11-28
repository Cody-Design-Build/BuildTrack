// What a theme is: a name and the colours for light and/or dark mode, plus an
// optional font and corner size. Only background, foreground and primary are required; the engine
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
  /** The corner size this theme suggests, in px, e.g. 0 for square (Settings → Appearance → Corners can override it). */
  radius?: number;
}

export const defineTheme = (t: ThemeDefinition): ThemeDefinition => t;

// ---------- A person's whole look (Settings → Appearance) ----------

export type Mode = 'light' | 'dark' | 'system';
/** 'theme' keeps the theme's own accent; anything else is one of its category colours. */
export type Accent = 'theme' | PaletteSlot;
export type Corners = 'sharp' | 'standard' | 'round';
/** 'theme' uses the font the theme suggests (Inter when it suggests none). */
export type FontChoice = 'theme' | FontId;
/** The colours a person changed on top of their theme, per mode. */
export type ColorKey = Exclude<keyof ThemeColors, 'palette'>;
export type ColorOverrides = Partial<Record<ColorKey, string>>;

export interface Look {
  /** The theme it starts from. */
  theme: string;
  mode: Mode;
  accent: Accent;
  corners: Corners;
  /** Exact corner size in px; overrides `corners` when set. */
  radius?: number;
  font: FontChoice;
  /** Money and other numbers in a monospaced font, so columns line up. */
  numbers?: 'proportional' | 'mono';
  colors?: { light?: ColorOverrides; dark?: ColorOverrides };
}

export interface Preset {
  id: string;
  name: string;
  look: Look;
}

/** A person's saved look and presets, kept with the company data so they follow them between devices. */
export interface Preferences {
  id: string; // the team member's id
  look: Look;
  presets: Preset[];
  updated: string; // ISO time of the last change
}
