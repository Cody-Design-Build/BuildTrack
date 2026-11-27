# Working on BuildTrack

Read this before changing anything. It's the process every person and agent follows.

## Where BuildTrack runs

| | What it's for | Data | How it updates |
|---|---|---|---|
| **Local** | Quick changes on your own machine | This browser's own copy (sample data), no sign-in | `npm run dev` (http://localhost:5173), or `npm run build` and the preview on http://127.0.0.1:4173 |
| **Preview** | Checking a change before it goes live | Sample data in the viewer's browser, never the live database | Vercel builds every pull request and comments a link on it |
| **Demo** | Anyone trying BuildTrack from buildtrack.run | Sample data in the visitor's own browser; `VITE_DEMO=1`, no Supabase settings (`src/demo.ts`) | Vercel project `buildtrack-demo` deploys `main` to https://demo.buildtrack.run |
| **Live** | The team's real app | The `buildtrack` Supabase project (CDB Team org), Google sign-in for @codydesignbuild.com | Vercel deploys `main` automatically |

Local and Preview never touch live data. Only `npm run dev:live` connects your machine to the live database (it reads `.env.live.local`); edits there are real.

## The workflow

1. **One task, one branch, one folder.** Never work directly on `main`. Several agents can run at once, so each works in its own git worktree:
   ```
   git worktree add -b <task> ../BuildTrack-<task> main
   cd ../BuildTrack-<task> && npm ci
   ```
2. **Work locally** with `npm run dev`. Commit as you go with clear messages that say what changed for the user.
3. **Before opening a pull request**, bring the branch up to date and check it builds:
   ```
   git fetch && git rebase origin/main
   npm run check
   ```
4. **Open a pull request** (`git push -u origin <task>` then `gh pr create`). GitHub runs the type check and build; Vercel posts a preview link.
5. **Merging:**
   - Small fixes: the agent may merge once the checks pass and David has said OK in the conversation.
   - Anything touching the database (`supabase/`), sign-in, or money calculations (budgets, invoices, bills, payments, job costing): David merges.
   - Merge with "Squash and merge". Merging to `main` is a release: Vercel deploys it to the live site within a minute or two.
6. **Clean up**: `git worktree remove ../BuildTrack-<task>` and delete the branch.

If something goes wrong on the live site, roll back in Vercel (Deployments → the previous one → Promote) and fix forward in a new pull request.

## Data and the database

- All app data is one `Db` object (`src/data.ts`). In Supabase it's stored as one row per record in the `records` table (`supabase/migrations/`), so **adding a new kind of record needs no database change**.
- **New features with sample data:** add the sample records to `seed()` in `src/data.ts`, and an upgrade step in `parseDb()` (`src/store.tsx`) that adds them when the collection is missing, like `addBills` and `addBids`. That step runs for browsers with older saved data *and* for the live database, so the live sample data picks up the new feature automatically.
- **Changing the database itself** (tables, access rules, storage): `npm run db:new <name>` creates a migration file in `supabase/migrations/`. Keep changes additive (add, don't rename or drop in the same step) so the live site keeps working while the code deploys. After the pull request is approved and **before** merging it, apply it with `npm run db:push` (needs `SUPABASE_DB_PASSWORD` from `.env.live.local` exported in your shell).
- **Supabase project settings** (sign-in addresses, auth options) are in `supabase/config.jsonc`. Some are only set in the dashboard (the Google sign-in keys), so **always `supabase config pull` first**, change only what you mean to, check `supabase config diff` shows just that, then `supabase config push`.
- Who can sign in: anyone with an @codydesignbuild.com Google account, plus addresses in the `allowed_emails` table (edit in the Supabase dashboard).
- To start the live data over with fresh sample data: Settings → Data → Reset sample data while signed in to the live site.

## Building features for the live app

BuildTrack is live: several people use the same data at once, and every change you merge runs against data that already exists. New features must fit that.

- **Store data as records in a `Db` list.** Every top-level array in `Db` syncs automatically (`src/cloud.ts`); each record needs a unique string `id` and must be plain JSON (no `Date` objects, functions, `Map`s or class instances; dates are ISO strings). Plain top-level values (like `companyName`) sync too.
- **Change data only through `update()`** from `useStore()`, immutably: build new objects for the records you change and reuse the untouched ones. Sync compares records by reference first, so mutating in place means the change is never saved, and rebuilding every record re-saves everything.
- **Keep records small and separate.** Two people editing different records never clash; two people editing the *same* record means the last save wins. So budget lines are their own records, not an array inside the budget. Follow that for anything people edit concurrently.
- **Never assume a list exists or has the newest fields.** The live database and people's browsers hold data saved by older versions. A new list needs `seed()` sample records and a `parseDb()` upgrade step (see above); a new field on an existing record needs a sensible default wherever it's read (`x.field ?? default`), or an upgrade step that fills it in.
- **Don't rename or remove lists or fields in one go.** Add the new one, migrate in `parseDb()`, and remove the old one in a later change, once nothing reads it.
- **Settings per person or device** (layout, theme, last tab, filters) go in `localStorage` (see `src/appearance.ts`, `useRememberedChoice` in `src/components/DocLayout.tsx`), not in `Db`, or they change for everyone.
- **Files** (signed copies, attachments) are still stored in each browser (`src/files.ts`, IndexedDB), so teammates can't see each other's. Don't build features that rely on shared files until they're moved to the Supabase `files` storage bucket (already created, team-only).
- **Who did what:** every saved row records the signed-in user (`updated_by`) and time. Show "by whom" from the team list (`db.team`) rather than adding new user tables.
- **Test both modes:** `npm run dev` (browser only, as previews run) and, when the change touches data loading or saving, `npm run dev:live` against the live database. Remember edits there are real.
- **Anything for other companies or outside people** (multi-company accounts, client or subcontractor portals) changes the access rules: plan it with David first.

## Secrets

- Never commit keys or passwords. `.env*.local` files are git-ignored; `.env.example` lists what exists.
- Live site settings live in Vercel (Project → Settings → Environment Variables), set for **Production only**.
- The Supabase publishable key is safe in the browser; the database's access rules are what protect the data. The secret key and database password never go in the app.

## Useful commands

| | |
|---|---|
| `npm run dev` | Local app, browser storage, hot reload |
| `npm run dev:live` | Local app against the **live** database |
| `npm run check` | Type check and build, as GitHub does |
| `npm run build` | Full build into `dist/` (what the 4173 preview serves) |
| `npm run db:new <name>` / `npm run db:push` | New migration / apply migrations to the live database |
| `vercel ls`, `vercel logs <url>` | Deployments and logs |

## Code notes

- UI: shadcn/ui components in `src/components/ui/` on Tailwind v4. Theme colours are tokens in `src/themes.css`; never write fixed colours (use `var(--primary)`, `var(--info)`, `bg-muted` …) so dark mode and themes keep working.
- The status corner (top right) shows version, build, environment and the database connection; it offers **Update** when a newer build is live. Bump `version` in `package.json` for notable releases.
- Customer documents (budgets, invoices) always render black on white.
