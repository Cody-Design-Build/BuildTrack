# Developing BuildTrack

How to run, build and change BuildTrack. What each feature does is in [guide.md](guide.md).

## Run it locally

The team's full workflow (local, preview and live; branches and pull requests; database changes) is in [AGENTS.md](../AGENTS.md).

```
npm install
npm run dev
```

That runs BuildTrack in your browser on sample data, with no sign-in. `npm run dev:live` connects your machine to the live database instead (it reads `.env.live.local`; edits there are real). How sign-in, invites and email work on the live app is in [accounts-and-email.md](accounts-and-email.md).

The UI is built with [shadcn/ui](https://ui.shadcn.com) components (in `src/components/ui/`) on Tailwind CSS v4. Colours come from the theme engine (see Appearance below) as CSS tokens; the older hand-written styles in `src/styles.css` are loaded in a lower cascade layer, so Tailwind classes always win where they meet. Add more components with `npx shadcn@latest add <name>`.

## Appearance: themes, colours, fonts and presets

**Settings → Appearance** lets each person shape how BuildTrack looks:

- **Theme**: a starting point. The BuildTrack themes (BuildTrack, Graphite, Blueprint, Kraft, Hi-Vis, Sage, Walnut, Concrete; each light and dark) and six basic Omarchy desktop themes (three light, three dark). **Import theme** adds an Omarchy `colors.toml` or a downloaded BuildTrack theme (kept in that browser); **Download this theme** saves the current one, custom colours included, as JSON.
- **Customize colours**: every colour (surfaces, text, borders, accent, status), per mode, with colour pickers or codes. Anything left alone follows the theme.
- **Mode**, **Accent** (from the theme's palette), **Font** (theme's, Inter, System, IBM Plex Sans, JetBrains Mono), **Numbers in a monospaced font**, **Corners** (Sharp / Standard / Round or an exact size).
- **Presets**: the whole look saved under a name, to switch back to.
- **Company theme**: an owner or admin can make their look the company's; people start on it until they change their own.

Remembered in the browser (`bt-appearance`, `bt-presets`; `index.html` applies the look before the first paint) and, on shared data, in the person's `preferences` record, so it follows them between devices (`src/components/AppearanceSync.tsx`). The company theme is `companyLook` in the company data. Customer documents (budgets, invoices, PDFs) always stay black on white in the standard font.

How it works:

- A theme is data (`ThemeDefinition` in `src/theming/types.ts`): a name, light and/or dark colours and an optional font. Only `background`, `foreground` and `primary` are required; `src/theming/engine.ts` works out the rest (cards, borders, text shades, hover, status and the ten category colours behind labels and Accent) and writes the `[data-theme]` CSS. A theme with one mode keeps it whatever mode is chosen.
- The shipped themes are in `src/theming/packs/`. To add one for everyone, add a `defineTheme({...})` there. `scripts/import-omarchy-themes.mjs` regenerates the Omarchy pack (only the themes in its `KEEP` list); when you remove a shipped theme, map its id to the closest remaining one in `RETIRED_THEMES` (`src/theming/packs/index.ts`) so saved looks move over; `src/theming/omarchy.ts` reads `colors.toml` (current and older formats).
- A person's look (`Look`) is a theme plus their changes; `src/appearance.ts` turns it into the CSS for `[data-theme='look']`. Everything else derives from the tokens in `src/themes.css`; `src/theme-legacy.css` maps the older hand-written styles onto them.

## Build

```
npm run build
```

The finished site is written to `dist/`. Serve that folder with any static web server, for example:

```
npx serve dist
```

(Opening `index.html` straight from the disk won't work, because each page lives at its own address such as `/jobs`.)

A build without Supabase settings runs on sample data stored in the browser (localStorage); use **Settings → Data → Reset sample data** to start over. The live site is built by Vercel with the Supabase settings, so it signs in and uses the shared data.

## Where things live

- **The app itself:** this folder. `src/` holds the code: the kernel (store, shell, shared components) at the top level and every feature in `src/plugins/` (see [its README](../src/plugins/README.md)), and the MCP server for AI agents in `src/agent/` (see [AI agents and skills](agents.md)). `npm run build` writes the finished site to `dist/` and the agent server to `api/_agent.mjs`.
- **Live data:** in Supabase, one row per record in the `records` table, filed under a company (`supabase/migrations/`). Files are in the private `files` storage bucket under the company's id. Signing out clears the browser's copy.
- **Browser-only data:** your browser saves a local copy under `buildtrack-db-v6`. Older saves and restored backups are migrated automatically (`src/migrate.ts`). Existing to-dos become Tasks, and existing schedule records go into Schedule Entries with an unassigned crew. Each job's old budget table becomes one proposal (attached to the job's existing proposal document if it had one), its "spent so far" amounts become expenses, and other proposal and change-order documents become budgets with a single line for their total. The previous `buildtrack-db-v5` copy is left in place. To export or restore a copy, go to **Settings → Data**.

Legacy message records are removed when the app loads saved data or restores an older backup. Other records are retained.
