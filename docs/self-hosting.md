# Run BuildTrack for your team

> BuildTrack is currently an internal tool at Cody Design Build. These steps work, and they're how our own install is set up, but running your own copy isn't supported yet.

On its own, BuildTrack runs in one browser with sample data (`npm run dev`). To give your whole team the same live data with company sign-in, you connect it to your own [Supabase](https://supabase.com) database and host it on [Vercel](https://vercel.com). Both have free plans to start on. You'll need about an hour, a GitHub account, a domain you can add email records to, and (only for Google sign-in) admin access to your company's Google Workspace.

Everything below runs in **your** accounts: your data never passes through ours.

## 1. Fork the repo

Fork [Cody-Design-Build/BuildTrack](https://github.com/Cody-Design-Build/BuildTrack) to your own GitHub account or organisation, and clone it.

```
git clone https://github.com/<you>/BuildTrack && cd BuildTrack
npm install
```

## 2. Create the database

1. Create a Supabase project (any region near you) and note its **project ref** (the random ID in its address) and database password.
2. Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then:
   ```
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   This creates the `records` table, companies, members and invites, the access rules, live updates and a private file store.

## 3. Make it invite-only, and invite your first owner

BuildTrack is invite-only: nobody can create an account without an invite for their email address. An invite works once and expires after 7 days.

1. In Supabase, **Authentication → Hooks**, add two hooks, each as a *Postgres function* in the `public` schema:
   - **Before User Created** → `hook_before_user_created` (refuses accounts without a valid invite)
   - **Customize Access Token** → `hook_custom_access_token` (refuses password sign-ins; people use Google or an emailed code)
2. Invite yourself as the first owner:
   ```
   npm run invite:owner -- you@yourcompany.com "Your Company Name"
   ```
   This runs against the project you linked in step 2; the Supabase CLI asks you to confirm.

Once you've signed in (step 6), invite the rest of your team from **Settings → Members**: owners and admins add an email address and a role, and BuildTrack writes the invite for you to send. `npm run company:list` shows your company, its owners and any open invites.

## 4. Turn on Google sign-in for your staff (optional)

Everyone can sign in with a 6-digit code emailed to them, so you can skip this. If your company uses Google Workspace, it lets your staff sign in with their company Google account instead.

1. In [Google Cloud Console](https://console.cloud.google.com), create a project for BuildTrack under your organisation.
2. **Google Auth Platform → Get started**: app name BuildTrack, audience **Internal** (only your company's Google accounts; everyone else uses an emailed code).
3. **Clients → Create client → Web application.** Authorised redirect URI:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
4. In Supabase, **Authentication → Sign In / Providers → Google**: enable it and paste the client ID and secret.

## 5. Deploy to Vercel

1. In Vercel, **Add New → Project**, import your fork. The settings are picked up from `vercel.json`.
2. Under **Settings → Environment Variables**, add these for **Production** only (previews then run on sample data and never touch your live data):

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://<your-project-ref>.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → publishable key |
   | `VITE_TEAM_DOMAIN` | `yourcompany.com`. Optional: shows a “Continue with Google (@yourcompany.com)” button for your staff (step 4). Without it, everyone signs in with an emailed code. Who actually gets in is decided by invites (step 3). |

3. Deploy, and add your own domain if you like (e.g. `app.yourcompany.com`).
4. In Supabase, **Authentication → URL Configuration**: set the Site URL to your app's address and add it to the redirect URLs as `https://app.yourcompany.com/**`.

## 6. First sign-in

Open your app and sign in with the address you invited in step 3, by Google or with a 6-digit code emailed to you. You're the owner, and you stay signed in on that device. Your company starts on the sample data, so you can find your way around; replace it with your own jobs, people and cost codes as you go. Every change saves automatically and shows up on teammates' screens live.

### Email for sign-in codes

Supabase's built-in email only reaches people on your Supabase team, a few emails an hour. That's enough for you to sign in once, but not for inviting anyone else. Set up your own sender before inviting your team. [Resend](https://resend.com)'s free plan (100 emails a day) is plenty:

1. In Resend, **Domains → Add domain**, for example `yourcompany.com`, and add the DNS records it lists where your domain's DNS is managed. If your registrar won't keep the `send` MX record, switch its mail settings to custom MX first, but check that turns off nothing you use. Wait until Resend shows **Verified**.
2. In Resend, **API Keys → Create**, with **Sending access** for that domain only.
3. In Supabase, **Authentication → Emails → SMTP Settings**: host `smtp.resend.com`, port `465`, username `resend`, password the key, sender `no-reply@yourcompany.com`, name `BuildTrack`.
4. In **Authentication → Rate Limits**, raise *emails per hour* from 2 to about 30.
5. In **Authentication → Sign In / Providers → Email**, set the code length to **6**. In **Authentication → Emails → Templates**, paste `supabase/templates/magic_link.html` into *Magic link* and `supabase/templates/confirmation.html` into *Confirm signup*, so people get a code to type rather than a link (subject: "Your BuildTrack sign-in code").

### AI agents (optional)

To let your team connect Claude and other AI agents (see [AI agents and skills](agents.md)), turn on Supabase's OAuth server: **Authentication → OAuth Server**, enable it, allow dynamic client registration, and set the authorization path to `/oauth/consent`. Or, with the Supabase CLI, set `auth.oauth_server` in `supabase/config.jsonc` as ours is and run `supabase config push`. The agent address is your app's address plus `/mcp`.

How sign-in, invites and email fit together, and what to check when a code doesn't arrive, is in [Accounts, sign-in and email](accounts-and-email.md).

## Keeping it up to date

Pull changes from the main BuildTrack repo into your fork when you want them. If a change adds a file under `supabase/migrations/`, run `supabase db push` before deploying it. New kinds of records need no database change at all.

To change BuildTrack itself, or have an AI agent do it, start with [AGENTS.md](../AGENTS.md): it explains the data model, the local / preview / live workflow and the rules that keep a live install working.
