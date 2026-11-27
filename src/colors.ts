// Theme-aware category colours.
//
// Statuses, task types, people's avatars and so on are stored as plain hex
// colours (#2b7fff, #ea580c…). Shown as they are, those are bright Tailwind
// primaries that ignore the chosen theme. tone() maps any stored colour onto
// the nearest of a small set of named slots, and each theme defines its own
// version of every slot in src/palette.css (Catppuccin's pastels, Gruvbox's
// earth tones, and so on). So data keeps its colour meaning, and the theme
// decides the actual shade.
import type { CSSProperties } from 'react';

export const SLOTS = ['red', 'orange', 'amber', 'green', 'teal', 'cyan', 'blue', 'purple', 'pink', 'gray'] as const;
export type Slot = (typeof SLOTS)[number];

function hsl(hex: string): { h: number; s: number; l: number } | null {
  let m = hex.trim().replace('#', '');
  if (m.length === 3) m = [...m].map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(m)) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

const cache = new Map<string, Slot>();

/** The named colour slot nearest to a hex colour. */
export function slotOf(color: string): Slot {
  const hit = cache.get(color);
  if (hit) return hit;
  const c = hsl(color);
  let slot: Slot = 'gray';
  if (c && c.s >= 0.2) {
    const h = c.h;
    slot =
      h < 12 || h >= 345 ? 'red'
      : h < 34 ? 'orange'
      : h < 62 ? 'amber'
      : h < 160 ? 'green'
      : h < 180 ? 'teal'
      : h < 197 ? 'cyan'
      : h < 248 ? 'blue'
      : h < 285 ? 'purple'
      : 'pink';
  }
  cache.set(color, slot);
  return slot;
}

/**
 * A stored colour as the current theme's version of it, for use in style={{…}}.
 * CSS values that are already theme-aware (var(--…), color-mix(…)) pass through.
 */
export function tone(color: string | undefined): string {
  if (!color) return 'var(--c-gray)';
  if (!color.startsWith('#')) return color;
  return `var(--c-${slotOf(color)})`;
}

/** Inline style for a soft tinted label (.tint in palette.css) in the given colour. */
export const tint = (color: string | undefined) => ({ '--c': tone(color) }) as CSSProperties;
