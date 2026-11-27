# Developing BuildTrack

How to run, build and change BuildTrack. What each feature does is in [guide.md](guide.md).

## Run it locally

The team's full workflow (local, preview and live; branches and pull requests; database changes) is in [AGENTS.md](../AGENTS.md).

```
npm install
npm run dev
```

The UI is built with [shadcn/ui](https://ui.shadcn.com) components (in `src/components/ui/`) on Tailwind CSS v4. Theme colours live in `src/index.css`; the older hand-written styles in `src/styles.css` are loaded in a lower cascade layer, so Tailwind classes always win where they meet. Add more components with `npx shadcn@latest add <name>`.

## Themes and dark mode

**Settings → Appearance** picks a colour theme (BuildTrack, Graphite, Nord, Gruvbox, Catppuccin, Tokyo Night, Rosé Pine, Solarized) and Light, Dark or System mode. The choice is saved per browser (`bt-appearance` in localStorage), not in the company data, and `index.html` applies it before the first paint. Customer documents (budgets, invoices, PDFs) always stay black on white.

- Themes live in `src/themes.css`: each one sets a few base colours for light and dark, and the rest are worked out from them. To add one, add a pair of `[data-theme]` blocks there and an entry in `THEMES` in `src/appearance.ts`.
- `src/theme-legacy.css` swaps the few colours written directly into `src/styles.css` for theme colours.

## Build

```
npm run build
```

The finished site is written to `dist/`. Serve that folder with any static web server, for example:

```
npx serve dist
```

(Opening `index.html` straight from the disk won't work, because each page lives at its own address such as `/jobs`.)

All data is sample data stored in your browser (localStorage). Use **Settings → Reset sample data** to start over.

## Where things live

- **The app itself:** this folder. `src/` holds the code: the kernel (store, shell, shared components) at the top level and every feature in `src/plugins/` (see [its README](../src/plugins/README.md)). `npm run build` writes the finished site to `dist/`.
- **Your data:** your browser saves a local copy under `buildtrack-db-v6`. Older saves and restored backups are migrated automatically (`src/migrate.ts`). Existing to-dos become Tasks, and existing schedule records go into Schedule Entries with an unassigned crew. Each job's old budget table becomes one proposal (attached to the job's existing proposal document if it had one), its "spent so far" amounts become expenses, and other proposal and change-order documents become budgets with a single line for their total. The previous `buildtrack-db-v5` copy is left in place. To export or restore a copy, go to **Settings → Your data**.

Legacy message records are removed when the app loads saved data or restores an older backup. Other records are retained.
