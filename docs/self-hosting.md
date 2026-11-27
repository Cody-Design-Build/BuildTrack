# Run BuildTrack for your team

On its own, BuildTrack runs in one browser with sample data (`npm run dev`). To give your whole team the same live data with company sign-in, you connect it to your own [Supabase](https://supabase.com) database and host it on [Vercel](https://vercel.com). Both have free plans to start on. You'll need about an hour, a GitHub account, and admin access to your company's Google Workspace.

Everything below runs in **your** accounts: your data never passes through ours.

## 1. Fork the repo

Fork [Cody-Design-Build/BuildTrack](https://github.com/Cody-Design-Build/BuildTrack) to your own GitHub account or organisation, and clone it.

```
git clone https://github.com/<you>/BuildTrack && cd BuildTrack
npm install
```

## 2. Set your company's email domain (do this first)

Who may sign in is decided by the database: anyone with an email at an allowed domain. The repo ships with Cody Design Build's domain. **Change it to yours before you create the database**, or our staff's accounts would be allowed into yours.

Edit `supabase/migrations/20261127144300_allowed_domain.sql` and replace `codydesignbuild.com` with your domain, e.g. `yourcompany.com`.

## 3. Create the database

1. Create a Supabase project (any region near you) and note its **project ref** (the random ID in its address) and database password.
2. Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then:
   ```
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   This creates the `records` table, the access rules, live updates and a private file store.
3. Check the sign-in list in the Supabase dashboard (Table Editor → `allowed_domains`): it should contain only your domain. Add individual outside addresses (a bookkeeper, say) to `allowed_emails`.

## 4. Turn on Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com), create a project for BuildTrack under your organisation.
2. **Google Auth Platform → Get started**: app name BuildTrack, audience **Internal** (only your company's accounts can sign in).
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
   | `VITE_TEAM_DOMAIN` | `yourcompany.com` (offered on the Google sign-in screen) |

3. Deploy, and add your own domain if you like (e.g. `app.yourcompany.com`).
4. In Supabase, **Authentication → URL Configuration**: set the Site URL to your app's address and add it to the redirect URLs as `https://app.yourcompany.com/**`.

## 6. First sign-in

The first person to sign in starts the shared data. It begins as the sample data, so everyone can find their way around; replace it with your own jobs, people and cost codes as you go. Every change saves automatically and shows up on teammates' screens live.

## Keeping it up to date

Pull changes from the main BuildTrack repo into your fork when you want them. If a change adds a file under `supabase/migrations/`, run `supabase db push` before deploying it. New kinds of records need no database change at all.

To change BuildTrack itself, or have an AI agent do it, start with [AGENTS.md](../AGENTS.md): it explains the data model, the local / preview / live workflow and the rules that keep a live install working.
