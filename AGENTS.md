# Working on BuildTrack

Read this before changing anything. It's the process every person and agent follows.

## Where BuildTrack runs

| | What it's for | Data | How it updates |
|---|---|---|---|
| **Local** | Quick changes on your own machine | This browser's own copy (sample data), no sign-in | `npm run dev` (http://localhost:5173). There's no need to rebuild the 4173 preview after merges. |
| **Preview** | Checking a change before it goes live | Sample data in the viewer's browser, never the live database | Vercel builds every pull request and comments a link on it |
| **Demo** | Anyone trying BuildTrack from buildtrack.run | Sample data in the visitor's own browser; `VITE_DEMO=1`, no Supabase settings (`src/demo.ts`) | Vercel project `buildtrack-demo` deploys `main` to https://demo.buildtrack.run |
| **Live** | The team's real app, internal to Cody Design Build (not public) | The `buildtrack` Supabase project (CDB Team org); invite-only sign-in by emailed code (via Resend) or @codydesignbuild.com Google account | Vercel deploys `main` automatically |

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
   - **Agents merge their own pull requests** as soon as the checks pass: open it with `gh pr create`, then `gh pr merge --auto --squash` so GitHub merges it the moment the type check, build, database tests and agent tests pass. No need to wait for David's OK. GitHub deletes the branch after merging.
   - **Exception: changes to the live database or Supabase settings** (`supabase/migrations/` or `supabase/config.jsonc`). The live app depends on them, so David runs `npm run db:push -- --yes` / `supabase config push --yes` first; only then merge. Don't set auto-merge on these.
   - Merging to `main` is a release: Vercel deploys it to the live site within a minute or two. Check it went out (the status corner shows the commit), and roll back in Vercel if something's wrong.
6. **Clean up**: `git worktree remove ../BuildTrack-<task>` and `git branch -D <task>` (GitHub already deleted the remote branch).

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
- **Settings per person or device** (layout, last tab, filters) go in `localStorage` (see `src/appearance.ts`, `useRememberedChoice` in `src/components/DocLayout.tsx`), not in `Db`, or they change for everyone.
- **Files** (signed copies, attachments) go through `src/files.ts`: `putFile()` stores the bytes in the team-only Supabase `files` bucket (when connected) and caches them in this browser's IndexedDB; `getFile()` reads the cache, then the bucket. Records keep only a `StoredFile` (id, name, type, size). A plugin whose records hold files must list their ids in `filesInUse`, or this browser's cached copies are cleaned up at start-up. The bucket itself is never pruned automatically.
- **Who did what:** every saved row records the signed-in user (`updated_by`) and time. Show "by whom" from the team list (`db.team`) rather than adding new user tables.
- **Test both modes:** `npm run dev` (browser only, as previews run) and, when the change touches data loading or saving, `npm run dev:live` against the live database. Remember edits there are real.
- **Today BuildTrack is an internal tool at Cody Design Build, not open to the public.** Build for these two future uses anyway, without exposing them yet: (1) companies **self-host** from GitHub on their own Supabase and Vercel (`docs/self-hosting.md`); (2) a **hosted version** we run for paying companies (planned, not offered). So nothing company-specific goes in code or migrations (names, domains, licence numbers outside the sample data); per-company settings are data. Every row in `records`, every file (stored under `<company id>/`) and every member and invite belongs to a **company** (`supabase/migrations/20261127200000_companies.sql`), and the access rules only show people their own company's data. A self-hosted install has one company; the hosted version has many. The app opens one company at a time (`openCompany()` / `currentCompany()` in `src/cloud.ts`) and sends its id with every write. Record ids only need to be unique within a company. Companies are created only from operator invites (`npm run invite:owner`).
- **Sign-in** is an emailed 6-digit code (Supabase email OTP, templates in `supabase/templates/`) or, for @codydesignbuild.com, Google; passwords are refused. Sessions don't expire, so people sign in once per device. Codes go out through **Resend** from `no-reply@buildtrack.run` (Supabase SMTP in `supabase/config.jsonc`, sending-only key `RESEND_API_KEY` in `.env.live.local`, at most 30 emails an hour). The domain's DNS is at Namecheap (reachable through the `namecheap` MCP connector), not Vercel. Runbook, limits and troubleshooting: `docs/accounts-and-email.md`.
- **A company's own plugins** are installed in Settings → Plugins, not built in ([`docs/plugins.md`](docs/plugins.md)). They're records in `db.installedPlugins` that only owners and admins can change (enforced by the database), loaded by `src/plugins/loader.tsx`, either sandboxed or inside the app. They use only the kit (`src/plugins/kit.tsx`): add to it freely, but never change or remove anything in it without bumping `KIT_API_VERSION`, or installed plugins break. After changing the kit, run `node scripts/plugin-sdk.mjs` (`npm run check` fails until you do).
- **Anything for other companies or outside people** (multi-company accounts, client or subcontractor portals) changes the access rules: plan it with David first.

## AI agents (MCP) and skills

BuildTrack serves AI agents at `/mcp` (`api/mcp.js` → `src/agent/`): tools and skills from the plugins that are on, built fresh for every request, as the signed-in person. Full guide: `docs/agents.md`.

- **Each plugin is split in two:** `base.ts` (id, requires, the `Db` lists it owns in `collections`, its contracts, its `skills`) and `index.tsx` (`...base` plus screens). Its agent tools go in `tools.ts`, listed in `src/agent/plugins.ts`. A new plugin goes in `src/plugins/index.ts` **and** `src/plugins/bases.ts`.
- **Server code never imports React, `.tsx` files or the browser app** (`store.tsx`, `cloud.ts`, `files.ts`). Shared helpers live in `src/model.ts`; plugin rules files (`budgets.ts`, `invoices.ts`…) import from there, not from `store`. `npm run check` bundles the server and fails if this breaks.
- **Tools apply the plugin's own rules** (its `.ts` functions), never new arithmetic. Tools that change data set `writes: true` and save with `commit()`. Ones that matter (sending, approving, paying, settings, team) add `confirm()` so the person says yes first. A new feature with actions people take should get tools for them too.
- **Skills** are the company's know-how for agents (`src/skills.ts`, Settings → Agents). A feature with rules people get wrong deserves a skill in its plugin's `base.ts`.
- **Test** with `npm run test:agent` (a real MCP client runs every tool on the sample data; GitHub runs it too).
- The server's sign-in is Supabase's OAuth server (`auth.oauth_server` in `supabase/config.jsonc`), approved on `/oauth/consent`.

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
| `npm run test:agent` | Test the agent server: tools, skills, plugins on and off (`scripts/agent.test.ts`), as GitHub does |
| `npm run build` | Full build into `dist/` (what the 4173 preview serves) |
| `npm run db:new <name>` / `npm run db:push` | New migration / apply migrations to the live database |
| `vercel ls`, `vercel logs <url>` | Deployments and logs |

## Code notes

- UI: shadcn/ui components in `src/components/ui/` on Tailwind v4. Themes are data (`src/theming/packs/`, format in `src/theming/types.ts`, explained in `docs/development.md` → Appearance) turned into colour tokens by `src/theming/engine.ts`; people customise on top in Settings → Appearance. Never write fixed colours (use `var(--primary)`, `var(--info)`, `bg-muted` …) so dark mode and themes keep working.
- The status corner (top right) shows version, build, environment and the database connection; it offers **Update** when a newer build is live. Bump `version` in `package.json` for notable releases.
- Customer documents (budgets, invoices) always render black on white.
