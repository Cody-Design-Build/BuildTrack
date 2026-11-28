# Plugins a company installs

Everything in BuildTrack is a plugin (see [`src/plugins/README.md`](../src/plugins/README.md)). BuildTrack's own plugins are built into the app. A company can also **install its own** without changing or rebuilding BuildTrack: a punch list, equipment tracking, a different way of doing job costing. It's one file, installed in **Settings → Plugins**, and it reaches everyone in the company, phones included.

You don't fork BuildTrack to change it. You add or swap plugins, and BuildTrack itself keeps updating underneath them.

## Who can install

Only **owners and admins**. An installed plugin is code that runs for the whole company, so the database refuses anyone else ([`supabase/migrations/20261128090000_plugin_admins.sql`](../supabase/migrations/20261128090000_plugin_admins.sql)). The same goes for turning plugins on and off. Anyone can **propose** a plugin (usually by asking an agent to write one); an admin reviews and installs it.

## How a plugin runs

You choose when you install it:

| | **Sandboxed** (recommended) | **Inside the app** |
|---|---|---|
| Where | A sealed frame (`/sandbox.html`) on an opaque origin | The app itself, like BuildTrack's own plugins |
| Sees | Only its own records and the ones it lists in `reads` / `writes` | Everything the person using it can see |
| Changes | Asks the app, which checks each change against `collections` and `writes` | Same checks through the kit, but nothing stops it going around them |
| Internet | None: no fetch, images, fonts or forms from anywhere else (Content-Security-Policy) | Yes |
| Session, storage, cookies | None | The person's |
| Can provide | Pages, job tabs, job-overview rows, company-page sections, skills | All of that, plus `costEntries` (job costing), `filesInUse`, `removeParty` |

Use **inside the app** only for plugins your company wrote or fully trusts. Sandboxed plugins look and behave like the rest of BuildTrack: the frame copies the company's theme, light or dark, and resizes to fit. One visible difference is that a dialog in a sandboxed plugin dims only the plugin's own area, not the whole window.

Before anything is installed, BuildTrack reads what the plugin declares by running it in a hidden sandbox, so nothing runs inside the app until an admin has looked at it. The install screen shows what it adds, what it reads and changes, its records, its skills, and its code.

If an installed plugin breaks, only its own screen shows an error. To start BuildTrack without any installed plugins, open it with `?safe` (e.g. `https://app.buildtrack.run/?safe`), then update or remove the plugin in Settings → Plugins.

## Writing one

In a copy of this repository:

```
npm run plugin -- new acme.punch-list         # starts plugins/punch-list/plugin.tsx
npm run dev                                   # in one terminal
npm run plugin -- dev plugins/punch-list      # in another: rebuilds on every save
```

Open `http://localhost:5173/?dev-plugin=http://localhost:5174` and the plugin appears in your local BuildTrack, reloading whenever you save. (`?dev-plugin=` with nothing after it stops loading it. This only works in `npm run dev`.) Then:

```
npm run plugin -- build plugins/punch-list    # → plugins/punch-list/dist/acme.punch-list.js
```

and install that file in Settings → Plugins. [`plugins/punch-list`](../plugins/punch-list/plugin.tsx) is a complete example: a page, a tab on each job, its own records and a skill.

Asking Claude to write one works well: point it at this page and the example. A connected agent (see [agents.md](agents.md)) can also write one without the repository. It reads the `writing-plugins` skill, writes plain JavaScript and calls `propose_plugin`, and an admin reviews it in Settings → Plugins.

### The file

A plugin is one ES module whose default export is `definePlugin({ … })`, importing from `'@buildtrack/sdk'` and `'react'`:

```tsx
import { useState } from 'react';
import { definePlugin, useRecords, Page, Section, Row, Empty, ui, icons, uid, today } from '@buildtrack/sdk';

function PunchList() {
  const items = useRecords<{ id: string; text: string }>('acme.punch-list.items');
  …
}

export default definePlugin({
  id: 'acme.punch-list',                  // your own prefix, never 'buildtrack.'
  name: 'Punch list',
  description: 'Items to finish before a job closes out.',
  version: '1.0.0',
  collections: ['acme.punch-list.items'], // its own records, named '<id>.<something>'
  reads: ['jobs'],                        // BuildTrack records it reads
  writes: [],                             // BuildTrack records it changes
  nav: [{ to: '/punch-list', label: 'Punch list', icon: icons.ClipboardCheck, group: 'work', order: 45 }],
  routes: [{ path: '/punch-list', component: PunchList }],
  jobTabs: [{ id: 'punch-list', label: 'Punch list', order: 65, component: JobPunchList }],
});
```

Every option a built-in plugin has works here too (`nav`, `routes`, `jobTabs`, `jobSummary`, `accountSections`, `skills`, `requires`, `role`; see [`src/plugins/sdk.ts`](../src/plugins/sdk.ts)). A plugin with the same `role` as a built-in one, e.g. `role: { id: 'costing', label: 'Job costing' }`, can replace it: Settings → Plugins then offers the choice.

At run time the browser maps `'@buildtrack/sdk'`, `'react'` and `'react/jsx-runtime'` to BuildTrack's own copies (`/sdk/*.js`, through the import map in `index.html`), so a plugin carries none of them. The build step is only for JSX, TypeScript and Tailwind classes BuildTrack doesn't already use. A hand-written file with `createElement` needs no build.

### The kit (`'@buildtrack/sdk'`)

| | |
|---|---|
| `useData()` | The records the plugin may see (its own, `reads`, `writes`) and `companyName` |
| `useRecords(collection)` | `{ items, add(record), update(id, patch), remove(id) }` for its own lists and `writes` |
| `useChange()` | Several changes at once (undone together) |
| `useCostEntries(jobId)` | The costs/v1 entries for a job (budget, committed, actual) |
| `useMe()` | The signed-in person's name and email |
| `useLocation()`, `useNavigate()`, `Link` | The page's `path`, route `params` and `query`; moving between pages |
| `Page`, `PageHeader`, `Section`, `Row`, `Empty`, `SearchInput`, `SummaryRow`, `Field`, `Modal` | BuildTrack's own building blocks |
| `ui` | Button, Badge, Card…, Checkbox, Dialog…, Input, Label, Select…, Switch, Table…, Tabs…, Textarea |
| `icons` | Icons by name (`icons.Hammer`); the list is in [`src/plugins/kit-icons.ts`](../src/plugins/kit-icons.ts) |
| `money`, `pct`, `uid`, `today`, `now`, `cn` | Helpers |

The kit is a promise: things are added to it, never changed or removed, without bumping its version (`KIT_API_VERSION` in [`src/plugins/installed.ts`](../src/plugins/installed.ts)). A plugin built for a newer kit than the app has is refused at install.

### Rules

- Records are plain JSON with a unique string `id` (`uid('pl')`); dates are `yyyy-mm-dd` strings. Keep them small and separate, as in [AGENTS.md](../AGENTS.md).
- Older records may lack newer fields: read them as `item.field ?? default`.
- Use the theme's colours (`text-muted-foreground`, `bg-muted`, `var(--primary)`), never fixed ones, so every theme and dark mode works.
- List every BuildTrack collection you read in `reads` and change in `writes`. Sandboxed, that's all a plugin gets.
- A plugin's own records stay when it's removed (unless the admin chooses otherwise), so reinstalling brings them back.

## How it works

| File | |
|---|---|
| [`src/plugins/installed.ts`](../src/plugins/installed.ts) | The `installedPlugins` record, manifests, checks, the kit version |
| [`src/plugins/kit.tsx`](../src/plugins/kit.tsx) | The kit, and the checks on every change a plugin makes |
| [`src/plugins/loader.tsx`](../src/plugins/loader.tsx) | Loads installed plugins into the registry; error boundaries; the sandbox frame on the app's side; safe mode; `?dev-plugin` |
| [`src/plugins/bridge.ts`](../src/plugins/bridge.ts), [`src/sandbox/main.tsx`](../src/sandbox/main.tsx), [`sandbox.html`](../sandbox.html) | The sandbox: messages, the frame's side, its Content-Security-Policy (also sent as a header, `vercel.json`) |
| [`src/pages/PluginSettings.tsx`](../src/pages/PluginSettings.tsx) | Install, review, update, remove; proposals |
| [`scripts/plugin.mjs`](../scripts/plugin.mjs) | `npm run plugin -- new / build / dev` |
| [`scripts/plugin-sdk.mjs`](../scripts/plugin-sdk.mjs) | Writes `public/sdk/*.js` and `src/plugins/sdk-module.ts` from the kit; `npm run check` fails if they're stale |

An installed plugin is a record in `db.installedPlugins`: its code, styles, manifest (what it declares, without code), how it runs, and who installed it. It syncs like any record. The agent server reads only the manifest, so agents get an installed plugin's records and skills without ever running its code. Agent tools from installed plugins would mean running a company's code on the shared server, so they aren't supported.
