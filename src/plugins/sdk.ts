// The plugin API. Every feature in BuildTrack (jobs, budgets, bids, bills, invoices, job
// costing, the schedule, tasks…) is a plugin that describes itself with definePlugin(). The
// app shell reads these descriptions to build the menu, the pages, the tabs on a job and the
// sections on a company page; plugins share data with each other only through the contracts
// below, never by reaching into each other's code.
//
// To change how something works, change (or replace) its plugin. See src/plugins/README.md.
import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Account, Db, Job } from '../data';

export interface PluginNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  group: 'work' | 'records' | 'insights';
  order: number; // lower comes first within its group
}

export interface PluginRoute {
  path: string; // react-router path, e.g. '/bids/:id'
  component: ComponentType;
}

/** A tab on a job page. Its id is what appears in the address (?tab=…). */
export interface JobTab {
  id: string;
  label: string;
  order: number;
  component: ComponentType<{ job: Job }>;
}

/** Rows in the money card on a job's Overview tab. Render <SummaryRow>s. */
export interface JobSummary {
  order: number;
  component: ComponentType<{ job: Job }>;
}

/** A section on a company's page (Accounts). Render nothing when it doesn't apply. */
export interface AccountSection {
  id: string;
  order: number;
  component: ComponentType<{ account: Account }>;
}

// ── Contracts ──────────────────────────────────────────────────────────────────────────────

/**
 * Contract costs/v1: one amount of money a job is expected to cost or has cost, against a
 * cost code. Plugins that know about costs provide them (budgets → budget, bids → committed,
 * bills and expenses → actual); a job-costing plugin reads them all and decides how to report.
 */
export interface CostEntry {
  jobId: string;
  costCodeId: string; // '' when not coded
  kind: 'budget' | 'committed' | 'actual';
  amount: number; // our cost
  price?: number; // budget entries: what the customer pays for it
  paid?: number; // actual entries: how much of it has been paid out
  vendorId?: string;
  date?: string; // yyyy-mm-dd
  label: string; // e.g. "Bill 1042 · Brightline Electric"
  source: { plugin: string; id: string; href?: string };
}

// ── The plugin ─────────────────────────────────────────────────────────────────────────────

export interface Plugin {
  id: string; // 'buildtrack.bids'; for your own, use your company's prefix
  name: string;
  description: string;
  version?: string;
  author?: string;
  /** Always on (the app doesn't work without it). */
  core?: boolean;
  /**
   * Plugins with the same role replace each other: only one is on at a time and Settings →
   * Plugins offers a choice. E.g. two ways of doing job costing.
   */
  role?: { id: string; label: string };
  /** Plugin ids this one needs. It's turned off while any of them is off. */
  requires?: string[];

  nav?: PluginNavItem[];
  routes?: PluginRoute[];
  jobTabs?: JobTab[];
  jobSummary?: JobSummary[];
  accountSections?: AccountSection[];

  /** costs/v1 entries for one job, or every job when jobId is left out. */
  costEntries?(db: Db, jobId?: string): CostEntry[];

  // Data hooks. These run for every installed plugin, on or off, so turning a plugin off
  // never loses or corrupts its data.
  /** Stored file ids this plugin's records still use (everything else is cleaned up). */
  filesInUse?(db: Db): string[];
  /** Tidy this plugin's records when a person or company is deleted. */
  removeParty?(db: Db, partyId: string): Db;
}

export const definePlugin = (p: Plugin): Plugin => p;
