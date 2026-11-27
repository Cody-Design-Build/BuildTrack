# Accounts, sign-in and email

How people get into BuildTrack, and how its emails are sent. This is the runbook for whoever operates BuildTrack. For now that's Cody Design Build: **BuildTrack is an internal tool, not open to the public.** Nobody can sign up; every account starts with an invite.

## How someone gets in

There's no sign-up page. An account can only be created for an email address with an open invite. The database enforces this, not just the app. A Supabase *before user created* hook refuses any other address, so typing a random email into the sign-in screen gets "BuildTrack is invite-only" and no account is created.

An invite:
- is for **one email address**;
- works **once**;
- expires after **7 days**.

### A new company's first owner (operator only)

Only the operator can start a company. From a folder linked to the live Supabase project:

```
npm run invite:owner -- jane@acme.com "Acme Design Build"
```

Then tell Jane to go to **https://app.buildtrack.run** within 7 days and sign in with that address. When she does, the company is created and she's its owner. On our live install today there's one company, Cody Design Build, owned by david@codydesignbuild.com.

`npm run company:list` shows every company, its owners, how many members it has, and any open invites.

### Teammates (owners and admins)

In **Settings → Members**, an owner or admin enters an email and a role (admin or member) and clicks **Invite**.

BuildTrack doesn't send the invite itself yet. The page offers:
- **Email invite**, which opens a ready-written message in your mail app;
- **Copy**, to paste it into a text or chat.

The invite shows when it expires; an expired one has **Invite again**. The same page lists members, lets owners and admins change roles or remove people, and lets anyone leave. A company always keeps at least one owner.

### Signing in

The sign-in screen offers two ways in:

- **Email me a sign-in code**, the main way. Supabase emails a 6-digit code that's good for an hour, and the person types it in.
- **Continue with Google**, for @codydesignbuild.com accounts only. It appears because `VITE_TEAM_DOMAIN` is set on the live site. Our Google sign-in app is *Internal*, so Google refuses other accounts.

Passwords are switched off: a second Supabase hook refuses any password sign-in. People stay signed in on each device until they sign out from the user menu. Signing out also clears that browser's copy of the company's data and files.

The first time someone signs in, they're added to the company's team list under their Google name, or the first part of their email address. That's who BuildTrack treats as "you": the greeting, My tasks, history entries and the default task assignee.

## How email is sent

All of BuildTrack's email today is sign-in codes. Supabase sends them through **Resend**.

| | |
|---|---|
| From | `BuildTrack <no-reply@buildtrack.run>` |
| Sent by | Supabase Auth, using Resend's SMTP server (`smtp.resend.com`, port 465, user `resend`) |
| Key | A **sending-only** Resend key for `buildtrack.run`, named `buildtrack-supabase-auth` in Resend. Kept in `.env.live.local` as `RESEND_API_KEY`, never committed. |
| Settings | `supabase/config.jsonc` → `auth.email.smtp`, the code templates (`supabase/templates/`) and `auth.rate_limit.email_sent` |
| Limits | Supabase sends at most **30 emails an hour**. Resend's free plan allows 100 a day and 3,000 a month. |

To change any of it:
1. `supabase config pull`.
2. Edit `supabase/config.jsonc`.
3. `supabase config diff`, and check it shows only your change.
4. Export the key and push:
   ```
   set -a; . ./.env.live.local; set +a
   supabase config push --yes
   ```
   The `env(RESEND_API_KEY)` in the config is filled in from your shell at that point.

### The domain

`buildtrack.run` is registered at **Namecheap**, and its DNS is there too. Vercel only hosts the website.

For Resend, Namecheap has:
- `resend._domainkey` TXT (DKIM);
- `send` TXT and MX (SPF and bounces);
- `rsend` CNAME.

Namecheap's Mail Settings are **Custom MX**, so Namecheap's email forwarding for @buildtrack.run addresses is off.

The same Resend records were also added in Vercel's DNS for the domain. They do nothing unless the nameservers are moved to Vercel, which would then take them over without another change.

### Changing the key

1. In Resend, create a new key with **Sending access** for `buildtrack.run`.
2. Replace `RESEND_API_KEY` in `.env.live.local`.
3. Run `supabase config push --yes` as above.
4. Delete the old key in Resend.

Never give Supabase a full-access key.

## When a code doesn't arrive

1. **Spam folder.** Check there first.
2. **Is there an invite?** For someone signing in for the first time, the invite must be for exactly that address and still open: unused and less than 7 days old. Check with `npm run company:list` or Settings → Members. Without one, the sign-in screen says "BuildTrack is invite-only" and nothing is sent.
3. **The hourly limit.** Supabase sends at most 30 emails an hour, and the screen shows an error when that's reached. Wait, or raise `email_sent` in the config and push.
4. **Resend's log.** Resend → Emails lists every message with its delivery status, such as delivered, bounced or marked as spam.
5. **Supabase's log.** Supabase → Logs → Auth shows each code request and any error from the hooks or the mail server.

## What's next

- **BuildTrack sending its own email:** invoices to customers, bid requests to subs, and team invites, through an email plugin that uses Resend from the server, instead of opening your mail app.
- **A customer and vendor portal.** It's planned but not built.
- **A hosted version for other companies.** Payment would create the new-company invites that `npm run invite:owner` creates today.
