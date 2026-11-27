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
- **Changing the database itself** (tables, access rules, storage): `npm run db:new <name>` creates a migration file in `supabase/migrations/`. Keep changes additive (add, don't rename or drop in the same step) so the live site keeps working while the code deploys. After the pull request is approved and **before** merging it, apply it with `npm run db:push` (needs `SUPABASE_DB_PASSWORD` from `.env.live.local` exported in your shell). Every access-rule change needs tests in `supabase/tests/access.test.mjs` (`npm run test:db`). Supabase grants every new `public` function and table to `anon` and `authenticated` by default, so revoke from `public, anon, authenticated` and grant back only what the app needs.
- **Supabase project settings** (sign-in addresses, auth options) are in `supabase/config.jsonc`. Some are only set in the dashboard (the Google sign-in keys), so **always `supabase config pull` first**, change only what you mean to, check `supabase config diff` shows just that, then `supabase config push`.
- **Who can sign in** is invite-only and enforced by the database (`supabase/migrations/20261127210000_invites.sql`). Nobody gets an account without an invite: the *before user created* auth hook refuses any new account whose email has no open invite, and the *custom access token* hook refuses password sign-ins (Google or an emailed 6-digit code only). An invite is for one email, works once and expires after 7 days. Owners and admins invite people to their own company in **Settings → Members**; invites that start a new company are made only by the operator with `npm run invite:owner -- email "Company"` (later, payment). Membership (`company_members`) is the only way into a company: there are no allowed domains. Team changes go through the database functions in that migration, never direct table writes. Never put a company's domain or emails in a migration or in code: every self-hosted install runs our migrations.
- To start the live data over with fresh sample data: Settings → Data → Reset sample data while signed in to the live site.

## Building features for the live app

BuildTrack is live: several people use the same data at once, and every change you merge runs against data that already exists. New features must fit that.

- **Store data as records in a `Db` list.** Every top-level array in `Db` syncs automatically (`src/cloud.ts`); each record needs a unique string `id` and must be plain JSON (no `Date` objects, functions, `Map`s or class instances; dates are ISO strings). Plain top-level values (like `companyName`) sync too.
- **Change data only through `update()`** from `useStore()`, immutably: build new objects for the records you change and reuse the untouched ones. Sync compares records by reference first, so mutating in place means the change is never saved, and rebuilding every record re-saves everything.
- **Keep records small and separate.** Two people editing different records never clash; two people editing the *same* record means the last save wins. So budget lines are their own records, not an array inside the budget. Follow that for anything people edit concurrently.
- **Never assume a list exists or has the newest fields.** The live database and people's browsers hold data saved by older versions. A new list needs `seed()` sample records and a `parseDb()` upgrade step (see above); a new field on an existing record needs a sensible default wherever it's read (`x.field ?? default`), or an upgrade step that fills it in.
- **Don't rename or remove lists or fields in one go.** Add the new one, migrate in `parseDb()`, and remove the old one in a later change, once nothing reads it.
- **Settings per person or device** (layout, theme, last tab, filters) go in `localStorage` (see `src/appearance.ts`, `useRememberedChoice` in `src/components/DocLayout.tsx`), not in `Db`, or they change for everyone.
- **Files** (signed copies, attachments) go through `src/files.ts`: `putFile()` stores the bytes in the team-only Supabase `files` bucket (when connected) and caches them in this browser's IndexedDB; `getFile()` reads the cache, then the bucket. Records keep only a `StoredFile` (id, name, type, size). A plugin whose records hold files must list their ids in `filesInUse`, or this browser's cached copies are cleaned up at start-up. The bucket itself is never pruned automatically.
- **Who did what:** every saved row records the signed-in user (`updated_by`) and time. Show "by whom" from the team list (`db.team`) rather than adding new user tables.
- **Test both modes:** `npm run dev` (browser only, as previews run) and, when the change touches data loading or saving, `npm run dev:live` against the live database. Remember edits there are real.
- **Two ways BuildTrack is used.** (1) Companies **self-host** from GitHub on their own Supabase and Vercel (`docs/self-hosting.md`); (2) a **hosted version** we run for paying companies (planned). So nothing company-specific goes in code or migrations (names, domains, licence numbers outside the sample data); per-company settings are data. Every row in `records`, every file (stored under `<company id>/`) and every member and invite belongs to a **company** (`supabase/migrations/20261127200000_companies.sql`), and the access rules only show people their own company's data. A self-hosted install has one company; the hosted version has many. The app opens one company at a time (`openCompany()` / `currentCompany()` in `src/cloud.ts`) and sends its id with every write. Record ids only need to be unique within a company. Companies are created only from operator invites (`npm run invite:owner`).
- **Sign-in** is Google or an emailed 6-digit code (Supabase email OTP, templates in `supabase/templates/`); passwords are refused. Sessions don't expire, so people sign in once per device. Inviting a whole team needs a custom SMTP sender in `supabase/config.jsonc`: Supabase's built-in one only sends a few emails an hour.
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
| `npm run test:db` | Run every migration on PGlite and test the access rules (`supabase/tests/`), as GitHub does |
| `npm run build` | Full build into `dist/` (what the 4173 preview serves) |
| `npm run db:new <name>` / `npm run db:push` | New migration / apply migrations to the live database |
| `vercel ls`, `vercel logs <url>` | Deployments and logs |

## Code notes

- UI: shadcn/ui components in `src/components/ui/` on Tailwind v4. Theme colours are tokens in `src/themes.css`; never write fixed colours (use `var(--primary)`, `var(--info)`, `bg-muted` …) so dark mode and themes keep working.
- The status corner (top right) shows version, build, environment and the database connection; it offers **Update** when a newer build is live. Bump `version` in `package.json` for notable releases.
- Customer documents (budgets, invoices) always render black on white.
