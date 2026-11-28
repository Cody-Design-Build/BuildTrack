// Omarchy themes (https://omarchy.org) describe their colours in a small colors.toml.
// Two shapes exist and both are read here:
//
//   current:  mode, accent, background, dark_background, lighter_background,
//             foreground, dark_foreground, light_foreground, selection, muted,
//             red, yellow, orange, green, cyan, blue, magenta, …
//   older:    accent, background, foreground, color0 … color15 (terminal colours)
//
// Used by Settings → Appearance → Import theme and by scripts/import-omarchy-themes.mjs.
import { isDark } from './engine';
import type { ThemeColors, ThemeDefinition } from './types';

/** Reads the `key = "value"` lines of a TOML file (all colors.toml needs). */
export function parseColorsToml(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*["']([^"']*)["']/.exec(line);
    if (m) out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
}

const COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl|oklch|oklab)a?\(.*\))$/i;

/** An Omarchy colors.toml as a BuildTrack theme. Throws if it isn't one. */
export function omarchyTheme(text: string, id: string, name: string): ThemeDefinition {
  const v = parseColorsToml(text);
  const get = (...keys: string[]) => keys.map((k) => v[k]).find((x) => x && COLOR.test(x));
  const background = get('background');
  const foreground = get('foreground');
  const primary = get('accent', 'blue', 'color4');
  if (!background || !foreground || !primary) throw new Error('This file has no background, foreground and accent colours.');
  const dark = v.mode ? v.mode === 'dark' : isDark(background);
  const colors: ThemeColors = {
    background,
    foreground,
    primary,
    text: get('light_foreground'),
    sidebar: get('dark_background'),
    muted: get('lighter_background'),
    faint: get('dark_foreground', 'muted', 'color8'),
    borderStrong: get('selection'),
    destructive: get('red', 'color1'),
    success: get('green', 'color2'),
    warning: get('yellow', 'color3'),
    info: get('blue', 'color4'),
    palette: {
      red: get('red', 'color1'),
      orange: get('orange'),
      amber: get('yellow', 'color3', 'color11'),
      green: get('green', 'color2'),
      cyan: get('cyan', 'color6'),
      blue: get('blue', 'color4'),
      purple: get('magenta', 'color5'),
      pink: get('bright_magenta', 'color13'),
      gray: get('muted', 'dark_foreground', 'color8'),
    },
  };
  // Drop what the file didn't have, so the engine fills it in.
  for (const k of Object.keys(colors) as (keyof ThemeColors)[]) if (colors[k] === undefined) delete colors[k];
  for (const k of Object.keys(colors.palette!) as (keyof NonNullable<ThemeColors['palette']>)[]) if (colors.palette![k] === undefined) delete colors.palette![k];
  return { id, name, [dark ? 'dark' : 'light']: colors, font: 'jetbrains-mono', radius: 0 }; // Omarchy is square-cornered
}
