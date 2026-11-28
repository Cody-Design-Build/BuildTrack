// The theme engine: turns ThemeDefinitions into the CSS custom properties the app
// is styled with, in the same shape the hand-written themes used:
//
//   [data-theme='id'] { --background: …; … --c-red: …; }                 light
//   [data-theme='id'][data-mode='dark'] { … }                            dark
//
// src/themes.css then works out the rest (rings, charts, sidebar, tints) from those,
// and src/palette.css's Accent choice picks one of the --c-* slots, exactly as before.
import { PALETTE_SLOTS, type FontId, type PaletteSlot, type ThemeColors, type ThemeDefinition } from './types';

const mix = (a: string, pct: number, b: string) => `color-mix(in oklab, ${a} ${pct}%, ${b})`;

/** Relative luminance of a #rgb/#rrggbb colour, or null for anything else. */
function luminance(color: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Is this background dark? Unknown formats count as dark only when said so by the mode. */
export const isDark = (background: string) => (luminance(background) ?? 1) < 0.25;

/** Text colour for primary buttons: whichever of the page background and foreground reads better. */
function onPrimary(c: ThemeColors): string {
  const p = luminance(c.primary);
  const bg = luminance(c.background);
  const fg = luminance(c.foreground);
  if (p === null || bg === null || fg === null) return c.background;
  return contrast(p, bg) >= contrast(p, fg) ? c.background : c.foreground;
}

/** Every colour the app needs, filling in whatever the theme left out. */
export function complete(c: ThemeColors, dark: boolean): Required<Omit<ThemeColors, 'palette'>> & { palette: Record<PaletteSlot, string> } {
  const { background: bg, foreground: fg, primary } = c;
  const card = c.card ?? (dark ? mix(fg, 5, bg) : mix(bg, 35, '#ffffff'));
  const p = c.palette ?? {};
  const red = p.red ?? c.destructive ?? (dark ? '#e5484d' : '#ce2c31');
  const green = p.green ?? c.success ?? (dark ? '#46a758' : '#2a7e3b');
  const amber = p.amber ?? c.warning ?? (dark ? '#e2a336' : '#ab6400');
  const blue = p.blue ?? c.info ?? (dark ? '#5b9bf8' : '#1f5fcc');
  const cyan = p.cyan ?? mix(blue, 50, green);
  const purple = p.purple ?? mix(blue, 45, red);
  const palette: Record<PaletteSlot, string> = {
    red,
    orange: p.orange ?? mix(red, 50, amber),
    amber,
    green,
    teal: p.teal ?? mix(green, 50, cyan),
    cyan,
    blue,
    purple,
    pink: p.pink ?? mix(purple, 55, red),
    gray: p.gray ?? mix(fg, 45, bg),
  };
  return {
    background: bg,
    foreground: fg,
    primary,
    text: c.text ?? mix(fg, 88, bg),
    card,
    sidebar: c.sidebar ?? (dark ? mix(bg, 85, '#000000') : card),
    muted: c.muted ?? mix(fg, dark ? 10 : 6, bg),
    mutedForeground: c.mutedForeground ?? mix(fg, 62, bg),
    faint: c.faint ?? mix(fg, 42, bg),
    accent: c.accent ?? mix(primary, dark ? 16 : 10, card),
    primaryForeground: c.primaryForeground ?? onPrimary(c),
    destructive: c.destructive ?? red,
    border: c.border ?? mix(fg, dark ? 14 : 12, bg),
    borderStrong: c.borderStrong ?? mix(fg, dark ? 24 : 20, bg),
    info: c.info ?? blue,
    success: c.success ?? green,
    warning: c.warning ?? amber,
    palette,
  };
}

const kebab = (k: string) => k.replace(/[A-Z]/g, (ch) => '-' + ch.toLowerCase());

function block(selector: string, c: ThemeColors, dark: boolean): string {
  const full = complete(c, dark);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(full)) if (k !== 'palette') lines.push(`  --${kebab(k)}: ${v};`);
  for (const slot of PALETTE_SLOTS) lines.push(`  --c-${slot}: ${full.palette[slot]};`);
  return `${selector} {\n${lines.join('\n')}\n}`;
}

/** The theme's colours for a mode, falling back to the mode it has. */
export function modeFor(t: ThemeDefinition, wanted: 'light' | 'dark'): 'light' | 'dark' {
  if (wanted === 'dark') return t.dark ? 'dark' : 'light';
  return t.light ? 'light' : 'dark';
}

/** CSS for one theme. Every mode gets a block so previews of either mode always work. */
export function themeCss(t: ThemeDefinition): string {
  const id = t.id.replace(/[^a-z0-9-]/gi, '');
  const sel = `[data-theme='${id}']`;
  const light = t.light ?? t.dark!;
  const dark = t.dark ?? t.light!;
  // `:root${sel}` outranks the plain `:root` defaults in themes.css whatever order the
  // stylesheets load in (the dev server injects them after these).
  return [block(`:root${sel}, ${sel}`, light, !t.light), block(`${sel}[data-mode='dark']`, dark, !!t.dark || !t.light)].join('\n');
}

// ---------- Fonts ----------

export const FONTS: { id: FontId; name: string; stack: string }[] = [
  { id: 'inter', name: 'Inter', stack: "'Inter Variable', 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { id: 'system', name: 'System', stack: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif" },
  { id: 'plex', name: 'IBM Plex Sans', stack: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif" },
  { id: 'nunito', name: 'Nunito', stack: "'Nunito Variable', 'Nunito', ui-rounded, ui-sans-serif, system-ui, sans-serif" },
  { id: 'jetbrains-mono', name: 'JetBrains Mono', stack: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace" },
];
export const fontStack = (id: FontId | undefined) => (FONTS.find((f) => f.id === id) ?? FONTS[0]).stack;
