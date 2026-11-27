# Plugins

Everything in BuildTrack is a plugin. The app itself (the "kernel") is only:

- the record store, undo, saved files and backups (`src/store.tsx`, `src/files.ts`, `src/data.ts`)
- the shell: menu, search, settings and themes (`src/components/Layout.tsx`, `src/pages/Settings.tsx`)
- shared building blocks: forms, tables, documents, attachments, payments (`src/components/`)

Jobs, contacts, tasks, the schedule, budgets, bids, invoices, bills, expenses and job costing
each live in a folder here, and each folder has an `index.tsx` that describes the plugin with
`definePlugin()` (see `sdk.ts` for every option).

## What a plugin can add

| Option            | What it does                                                            |
| ----------------- | ----------------------------------------------------------------------- |
| `nav`             | Menu entries (group `work`, `records` or `insights`, sorted by `order`) |
| `routes`          | Pages                                                                   |
| `jobTabs`         | Tabs on a job page (`id` is what appears in `?tab=`)                    |
| `jobSummary`      | Rows in the Money card on a job's Overview (render `<SummaryRow>`)      |
| `accountSections` | Sections on a company's page                                            |
| `themes`          | Colour themes (and a suggested font) for Settings → Appearance           |
| `costEntries`     | Its share of the **costs/v1** contract (below)                          |
| `filesInUse`      | Stored files its records still use, so they aren't cleaned up           |
| `removeParty`     | Tidy its records when a person or company is deleted                    |
| `requires`        | Other plugins it needs; it's turned off while any of them is off        |
| `role`            | Plugins with the same role replace each other; Settings offers a choice |
| `core`            | Always on                                                               |

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
2. Give it a new `id` (use your own prefix, e.g. `acme.costing`) and `name`.
3. Change what you like. Read data from `useStore()` and other plugins' data through contracts.
4. Add it to the list in `src/plugins/index.ts`.
5. Pick it in Settings → Plugins.

To change a plugin without keeping the original, edit its folder directly.

## Not done yet

- Each plugin's records are still declared in the shared `Db` type in `src/data.ts`, with their
  upgrades in `src/store.tsx` (`parseDb`). Moving those into the plugins comes with the backend.
- Some plugins still import helpers from others (e.g. Invoices uses Budgets' totals, Bids
  creates bills). Those are listed in `requires`.
- Plugins are built into the app. Installing one without rebuilding, and limiting what a
  third-party plugin can see, come later with the hosted version.

## Themes

A theme is data, not CSS: a name, colours for light and/or dark mode, and optionally a font.
Add themes from any plugin with `themes: [...]`; the engine (`src/theming/engine.ts`) turns
them into the CSS the whole app is styled with, and they appear in Settings → Appearance.
Built-in themes live in `themes-builtin`, the Omarchy desktop themes in `themes-omarchy`.

```ts
import { definePlugin } from '../sdk';
import { defineTheme } from '../../theming/types';

export default definePlugin({
  id: 'acme.themes',
  name: 'Acme brand',
  description: 'Our colours.',
  themes: [
    defineTheme({
      id: 'acme-brand',
      name: 'Acme',
      note: 'Navy and safety orange',
      light: { background: '#f7f8fa', foreground: '#0f1b2d', primary: '#ff6b1a' },
      dark: { background: '#0f1b2d', foreground: '#e8edf5', primary: '#ff8a3d' },
      font: 'plex', // 'inter' | 'system' | 'plex' | 'jetbrains-mono'
    }),
  ],
});
```

- **Only `background`, `foreground` and `primary` are required.** Everything else (cards,
  sidebar, borders, muted and faint text, hover tint, text on buttons, status colours and
  the ten category colours behind labels and the Accent choice) is worked out from them.
  Give any of them (`ThemeColors` in `src/theming/types.ts`) to take control.
- **One mode is fine.** A theme with only `dark` stays dark whichever mode is chosen.
- **Colours** can be any CSS colour (`#hex`, `oklch()`, `rgb()`). Keep text readable: aim
  for clear contrast between `foreground` and `background`, and between `primary` and the
  page.
- **Customer documents** (proposals, invoices, bills) always stay black on white in the
  standard font, whatever the theme.
- **Omarchy:** `scripts/import-omarchy-themes.mjs` regenerates the Omarchy pack from
  Omarchy's theme folders; `src/theming/omarchy.ts` reads a `colors.toml` (both the current
  named-colour format and the older `color0`–`color15` one). The same reader powers
  Settings → Appearance → Import theme.
- **Try a theme without code:** in Settings → Appearance, *Download this theme* saves the
  current theme as JSON; edit it and *Import theme* to see it (kept in that browser). When
  it's right, add it to a theme plugin so everyone gets it.
