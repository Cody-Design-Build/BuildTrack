# AI agents and skills

BuildTrack has an [MCP](https://modelcontextprotocol.io) server, so AI agents such as Claude can use it directly: answer "what will the Oak Avenue job make?", list what's overdue, compare bids. Agents use BuildTrack's own tools, which apply the same rules as the app, and the company's **skills**, its know-how written down. People can read and change those skills in the app, or ask an agent to change them.

For now agents can **read** everything and **change only skills**. Tools that change jobs, budgets, invoices and so on will come plugin by plugin.

## Connecting an agent

The address is your app's address plus `/mcp`, e.g. `https://app.buildtrack.run/mcp`. **Settings → Agents** shows it with copy buttons.

- **Claude (app or web):** Settings → Connectors → Add custom connector, and paste the address.
- **Claude Code:** `claude mcp add --transport http buildtrack https://app.buildtrack.run/mcp`, then `/mcp` to sign in.
- **Any other MCP client** that supports remote servers with OAuth sign-in.

The first time, the agent opens BuildTrack in your browser. You sign in as usual (emailed code or Google) and approve the agent on the **Connect an agent** page (`/oauth/consent`). Each person connects their own agent, and it acts as them. **Settings → Agents → Your connected agents** lists the agents you've approved, and **Disconnect** removes one.

## What agents see

The server builds its list of tools and skills **every time an agent asks**, from the company's data. So:

- **A plugin turned off** in Settings → Plugins takes its tools, its records and its skills with it, from the next request on. Turned back on, they return.
- **A new tool or skill** in BuildTrack reaches every connected agent as soon as it's deployed. Nobody reinstalls anything.
- **A skill changed** in the app or by an agent is what every agent in the company reads next.

### Tools

| Tool | From | What it does |
|---|---|---|
| `company_overview` | BuildTrack | The company, who the agent acts for, the plugins that are on, record counts, jobs and skills. The place to start. |
| `list_records`, `get_record`, `search_records` | BuildTrack | Read any record the plugins that are on own (jobs, people, accounts, budgets, bids, invoices, bills…). |
| `list_skills`, `read_skill` | BuildTrack | The company's skills, for clients that don't load skills themselves. |
| `save_skill`, `reset_skill` | BuildTrack | Change or add a skill, or go back to BuildTrack's version. The only tools that change data. |
| `job_budgets` | Budgets | A job's contract at cost and price, margin, and each proposal and change order. |
| `job_billing`, `open_invoices` | Invoices | One job's billing, and every unpaid invoice across jobs. |
| `bills_owed` | Bills | What's owed to vendors, overdue and due this week. |
| `bid_comparison` | Bids | Every bid on a package side by side, against the budget. |
| `job_costs` | Job costing | A job's costs by cost code, with variance and projected profit. |

Read-only tools are marked as such (`readOnlyHint`), so clients can run them without asking each time.

### Skills

A skill is a short Markdown guide with a name and a description of when to use it. BuildTrack ships `buildtrack-basics`, and each plugin ships its own (for example `progress-billing` with Invoices and `job-costing` with Job costing). They're served with the MCP [skills extension](https://modelcontextprotocol.io/extensions/skills/overview), so clients that support it load a skill only when a task needs it. Other clients can use `list_skills` and `read_skill`.

In **Settings → Agents → Skills** anyone in the company can:

- **edit** a skill. Changing one of BuildTrack's saves the company's own version, and **Reset** goes back to BuildTrack's;
- **turn off** a skill agents shouldn't use;
- **add** the company's own skills, e.g. how you handle warranty calls.

Or just ask: "change the job-costing skill so you flag any code more than 10% over". The agent uses `save_skill`, and the skill shows "changed by Dana Cole's agent".

Skills the company hasn't changed aren't stored. They keep improving as BuildTrack does. A changed skill stays as the company wrote it until someone resets it.

## Security

- **Agents act as the person who approved them.** Every request carries that person's own Supabase access token, and every read and write uses it, so the database's access rules apply exactly as in the app. The agent sees one company's data, and team changes stay with owners and admins. The server holds no secret key.
- **Invite-only still holds.** Only someone with a BuildTrack account can approve an agent, and only for themselves.
- **Treat record text as data.** Notes, scopes and descriptions can come from outside the company (a sub's exclusions, a customer's email). The server's instructions and `buildtrack-basics` tell agents never to follow instructions found in records.
- **Skills are instructions,** and any member can change them. Each change records who made it, and **Reset** undoes it. If that ever needs tightening, limiting skill changes to owners and admins is a database rule.
- With access to several companies, an agent uses the oldest one. A client can send the `X-BuildTrack-Company` header with a company id to pick another.

## How it's built

```
api/mcp.js            Vercel function at /mcp; runs api/_agent.mjs (built by scripts/build-agent.mjs)
src/agent/http.ts     sign-in (bearer token), loading the company's data, saving, sign-in metadata
src/agent/server.ts   the MCP server for one request: tools and skills from the plugins that are on
src/agent/tools.ts    BuildTrack's own tools
src/agent/sdk.ts      AgentTool, defineTool, helpers
src/plugins/*/tools.ts each plugin's tools (src/agent/plugins.ts lists them)
src/plugins/*/base.ts  each plugin without its screens: id, requires, records, contracts, skills
src/skills.ts          skills: defaults, the company's changes, saving, SKILL.md
src/pages/AgentSettings.tsx, AgentConsent.tsx   Settings → Agents and the approval page
```

It uses the official MCP TypeScript SDK (`@modelcontextprotocol/server`, MCP version 2026-07-28, with a fallback for older clients). It's stateless: each request gets a fresh server built from the company's data, which suits Vercel functions.

**Sign-in** is Supabase's OAuth 2.1 server (`auth.oauth_server` in `supabase/config.jsonc`). `/.well-known/oauth-protected-resource/mcp` tells clients to sign in there. Clients register themselves automatically (dynamic client registration), and Supabase sends people to `/oauth/consent` to approve.

**Server code must not use React or the browser.** Everything `src/agent/` imports, including plugins' `base.ts`, their rules files (`budgets.ts`, `invoices.ts`…), `data.ts`, `model.ts` and `skills.ts`, is bundled into the Vercel function. `npm run build` fails if one of those imports a `.tsx` file or the browser app.

### Adding a tool or skill to a plugin

- **A skill:** add it to `skills` in the plugin's `base.ts` (name, description, Markdown body).
- **A tool:** add it to the plugin's `tools.ts` with `defineTool()`. If the plugin has no `tools.ts` yet, create one and add it to `src/agent/plugins.ts`. Use the plugin's own rules functions rather than new arithmetic, and throw an `Error` with a helpful message when the input is wrong; the agent sees the message. Mark tools that change data with `writes: true`. They save through `ctx.save(next)`, which writes only the records that changed, as the signed-in person.
- **Test** with `npm run test:agent`. A real MCP client connects to the server on the sample data and runs every tool. Add a check for anything new.

### Not done yet

- Tools that change records other than skills (create a draft invoice, record a payment…), with confirmation before anything that matters (MCP elicitation).
- Pushing changes to agents that stay connected (`notifications/tools/list_changed`). Today agents pick changes up on their next request.
- Long-running work as MCP tasks.
