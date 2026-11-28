// Messages between the app and a sandboxed plugin's frame (src/sandbox/, /sandbox.html). The frame
// has no access to the app, the signed-in session or the database: it gets only what the plugin
// declared, from these messages, and asks the app to make changes, which the app checks.
import type { Account, Job } from '../data';
import type { RecordChange } from './kit';
import type { PluginManifest } from './installed';
import type { CostEntry } from './sdk';

/** Which of the plugin's screens a frame shows, or 'inspect' to only read what it declares. */
export type Slot =
  | { kind: 'inspect' }
  | { kind: 'route'; path: string }
  | { kind: 'jobTab'; id: string }
  | { kind: 'jobSummary'; index: number }
  | { kind: 'accountSection'; id: string };

export interface FrameState {
  data: Record<string, unknown>;
  me: { name: string; email: string } | null;
  location: { path: string; params: Record<string, string>; search: string };
  props: { job?: Job; account?: Account };
  costEntries: CostEntry[];
}

export interface FrameTheme {
  className: string;
  attrs: Record<string, string>;
  style: string;
  css: string[];
}

export type ToFrame =
  | { bt: 'load'; code: string; css?: string; slot: Slot }
  | { bt: 'state'; state: FrameState }
  | { bt: 'theme'; theme: FrameTheme };

export type FromFrame =
  | { bt: 'ready' }
  | { bt: 'manifest'; manifest: PluginManifest }
  | { bt: 'change'; changes: RecordChange[] }
  | { bt: 'navigate'; to: string }
  | { bt: 'height'; height: number }
  | { bt: 'error'; message: string };

export const isFromFrame = (d: unknown): d is FromFrame => !!d && typeof d === 'object' && typeof (d as { bt?: unknown }).bt === 'string';
