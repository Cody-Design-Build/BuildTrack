# Plugins

Everything in BuildTrack is a plugin. The app itself (the "kernel") is only:

- the record store, undo, saved files and backups (`src/store.tsx`, `src/files.ts`, `src/data.ts`)
- the shell: menu, search, settings and themes (`src/components/Layout.tsx`, `src/pages/Settings.tsx`)
- shared building blocks: forms, tables, documents, attachments, payments (`src/components/`)

Jobs, contacts, tasks, the schedule, budgets, bids, invoices, bills, expenses and job costing
each live in a folder here. Each folder has:

- `base.ts`: the plugin without its screens, with `definePluginBase()`: its id, what it needs,
  the records it owns, its contracts and its skills. No React, so the agent server can load it.
- `index.tsx`: `definePlugin({ ...base, ... })` adding the menu, pages and tabs (see `sdk.ts`).
- `tools.ts` (optional): tools for AI agents (see [`docs/agents.md`](../../docs/agents.md)).

The app lists every plugin in `index.ts`; the agent server lists their bases in `bases.ts`.

## What a plugin can add

| Option            | What it does                                                            |
| ----------------- | ----------------------------------------------------------------------- |
| `nav`             | Menu entries (group `work`, `records` or `insights`, sorted by `order`) |
| `routes`          | Pages                                                                   |
| `jobTabs`         | Tabs on a job page (`id` is what appears in `?tab=`)                    |
| `jobSummary`      | Rows in the Money card on a job's Overview (render `<SummaryRow>`)      |
| `accountSections` | Sections on a company's page                                            |
| `costEntries`     | Its share of the **costs/v1** contract (below)                          |
| `filesInUse`      | Stored files its records still use, so they aren't cleaned up           |
| `removeParty`     | Tidy its records when a person or company is deleted                    |
| `requires`        | Other plugins it needs; it's turned off while any of them is off        |
| `role`            | Plugins with the same role replace each other; Settings offers a choice |
| `core`            | Always on                                                               |
| `collections`     | The `Db` lists it owns; agents can read them while it's on              |
| `skills`          | Know-how for AI agents, which each company can change (Settings → Agents) |

`filesInUse` and `removeParty` run for every installed plugin, on or off, so turning a plugin
off never loses its data.

## Contracts: how plugins share data

Plugins don't read each other's records. When one needs to know about another's, they agree
on a contract in `sdk.ts`, and the kernel collects it from whichever plugins are on
(`registry.ts`).

**costs/v1** (`CostEntry`): an amount a job is expected to cost or has cost.

- Budgets provides `budget` entries (approved lines, at cost, with their price).
- Bids provides `committed` entries (awarded bids).
- Bills and Expenses provide `actual` entries (with how much is paid).
- Job costing reads them all with `costEntries(db, jobId)` and decides how to report.
- Bids also reads `budget` entries, to compare bids with what was budgeted.

So job costing works with any budgets, bids or bills plugin that provides these entries, and
any of them can be rewritten without touching the others.

## Replacing a plugin

Give your plugin the same `role` as the one it replaces (job costing has `role: { id: 'costing' }`); when a role has more than one plugin, Settings → Plugins lets you pick one. To write your own:

1. Copy the closest plugin's folder, e.g. `src/plugins/costing` to `src/plugins/my-costing`.
2. Give it a new `id` (use your own prefix, e.g. `acme.costing`) and `name` in `base.ts`.
3. Change what you like. Read data from `useStore()` and other plugins' data through contracts.
   Rename its tools and skills too: names are unique across plugins.
4. Add it to the lists in `src/plugins/index.ts` and `src/plugins/bases.ts`, and its tools (if
   any) to `src/agent/plugins.ts`.
5. Pick it in Settings → Plugins.

To change a plugin without keeping the original, edit its folder directly.

## Not done yet

- Each plugin's records are still declared in the shared `Db` type in `src/data.ts`, with their
  upgrades in `src/store.tsx` (`parseDb`). Moving those into the plugins is still to do.
- Some plugins still import helpers from others (e.g. Invoices uses Budgets' totals, Bids
  creates bills). Those are listed in `requires`.
- Plugins are built into the app. Installing one without rebuilding, and limiting what a
  third-party plugin can see, come later (BuildTrack is an internal tool for now).

