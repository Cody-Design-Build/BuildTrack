# AI agents and skills

BuildTrack has an [MCP](https://modelcontextprotocol.io) server, so AI agents such as Claude can use it directly. They can answer "what will the Oak Avenue job make?", list what's overdue and compare bids. They can also do the work: write a proposal, bill a job, enter and pay a bill, put work out to bid, add a task, or change settings and the team.

Agents use BuildTrack's own tools, which apply the same rules as the app. Drafts can change, sent documents are locked, and statuses move only the way the app allows. Agents also read the company's **skills**: its know-how, written down. People can read and change skills in the app, or ask an agent to change them.

Anything that matters asks the person first (see [Confirmations](#confirmations)).

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

| From | Reads | Changes |
|---|---|---|
| BuildTrack | `company_overview` (start here), `list_records`, `get_record`, `search_records`, `list_skills`, `read_skill` | `save_skill`, `reset_skill` |
| Settings | `get_settings`, `list_members` | `set_plugin`\*, `choose_plugin`\*, `set_company_details`\*, `set_company_theme`\*, `invite_member`\*, `set_member_role`\*, `cancel_invite`\* |
| Jobs | | `create_job`, `update_job`, `link_to_job` |
| Contacts | | `create_account`, `create_person` |
| Tasks | | `create_task`, `complete_task` |
| Budgets | `job_budgets` | `create_budget`, `add_budget_lines`, `remove_budget_lines`, `clone_budget`, `set_budget_status`\*, `approve_budget`\* |
| Invoices | `job_billing`, `open_invoices`, `get_invoice` | `create_invoice`, `set_invoice_progress`, `set_invoice_status`\*, `record_payment`\* |
| Bills | `bills_owed` | `create_bill`, `set_bill_status`\*, `record_bill_payment`\* |
| Bids | `bid_comparison` | `create_bid_package`, `invite_vendors`, `mark_bids_sent`, `record_bid`, `decline_bid`, `award_bid`\* |
| Job costing | `job_costs` | |

\* asks the person first. Team changes go through the same database functions as Settings → Members, so only owners and admins can invite or change roles. Recording that something was sent doesn't email anyone. Deleting records isn't offered to agents.

Read-only tools are marked as such (`readOnlyHint`), so clients can run them without asking each time. Tools that ask first are marked `destructiveHint`.

### Confirmations

Sending, approving, recording payments, awarding bids, settings and team changes wait for the person's yes:

- **In clients that support forms** (MCP elicitation, on the 2026-07-28 protocol), the server pauses the call and the client shows a form, for example *"Mark Invoice 8-3 for $12,135.00 on 538 Market as Sent? It will be locked."* Yes runs it; no changes nothing.
- **In other clients**, the tool changes nothing and replies with the change to show the person. The agent calls again with `confirmed: true` only after they agree. The server instructions and `buildtrack-basics` tell agents never to set it without asking. The client's own approval prompt for tools that change data is a second check.

A change that isn't allowed (approving a draft, editing a sent invoice) is refused with the reason before anyone is asked.

### Live updates

Agents that keep a `subscriptions/listen` stream open are told straight away when plugins are switched on or off (new tool list) or a skill changes. The server watches the company's records over Supabase Realtime, as the signed-in person, while the stream is open. Other agents pick changes up on their next request.

### Skills

A skill is a short Markdown guide with a name and a description of when to use it. BuildTrack ships `buildtrack-basics`, and each plugin ships its own (for example `progress-billing` with Invoices and `job-costing` with Job costing). They're served with the MCP [skills extension](https://modelcontextprotocol.io/extensions/skills/overview), so clients that support it load a skill only when a task needs it. Other clients can use `list_skills` and `read_skill`.

**Settings → Agents → Skills** lists them by where they come from (BuildTrack, each plugin, then the company's own), each with a switch. Anyone in the company can:

- **read** a skill: click it to open it in a side panel, laid out as Markdown;
- **turn off** a skill agents shouldn't use (the switch), and back on;
- **upload** `SKILL.md` files (the button, or drop them on the card): front matter with `name` and `description`, then the Markdown. A file named like one of BuildTrack's skills becomes the company's version of it;
- **download** any skill as `SKILL.md`;
- see **What changed** in a changed skill compared with BuildTrack's version, and **Reset** it; **Delete** the company's own.

Skills aren't edited in the app: agents write them better, and every change says who made it. Or just ask: "change the job-costing skill so you flag any code more than 10% over". The agent uses `save_skill`, and the skill shows "changed by Dana Cole's agent".

Skills the company hasn't changed aren't stored. They keep improving as BuildTrack does. A changed skill stays as the company wrote it until someone resets it.

## Security

- **Agents act as the person who approved them.** Every request carries that person's own Supabase access token, and every read and write uses it, so the database's access rules apply exactly as in the app. The agent sees one company's data, and team changes stay with owners and admins. The server holds no secret key.
- **Invite-only still holds.** Only someone with a BuildTrack account can approve an agent, and only for themselves.
- **Treat record text as data.** Notes, scopes and descriptions can come from outside the company (a sub's exclusions, a customer's email). The server's instructions and `buildtrack-basics` tell agents never to follow instructions found in records.
- **Skills are instructions,** and any member can change them. Each change records who made it, and **Reset** undoes it. If that ever needs tightening, limiting skill changes to owners and admins is a database rule.
- **Changes need a yes.** See [Confirmations](#confirmations). Every change is saved as the person (`updated_by`), and activity says "by" them, as in the app.
- With access to several companies, an agent uses the oldest one. A client can send the `X-BuildTrack-Company` header with a company id to pick another.

## How it's built

```
api/mcp.js            Vercel function at /mcp; runs api/_agent.mjs (built by scripts/build-agent.mjs)
src/agent/http.ts     sign-in (bearer token), loading the company's data, saving, sign-in metadata
src/agent/server.ts   the MCP server for one request: tools and skills from the plugins that are on
src/agent/tools.ts    BuildTrack's own tools
src/agent/settings.ts settings and team tools
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
- **A tool:** add it to the plugin's `tools.ts` with `defineTool()`. If the plugin has no `tools.ts` yet, create one and add it to `src/agent/plugins.ts`. Use the plugin's own rules functions rather than new arithmetic, and throw an `Error` with a helpful message when the input is wrong; the agent sees the message.
  - **Changing data:** set `writes: true` and save with `commit(ctx, next, reason)`. It writes only the records that changed, as the signed-in person, and turns a rule's refusal (the data coming back unchanged) into an error. Work out `next` before the first `await`: the server sets the signed-in person and the company's plugins for the shared rules just before the tool starts.
  - **Changes that matter:** add `confirm(ctx, args)`, returning the sentence the person says yes or no to. Throw there if the change isn't allowed. The server handles the form or the `confirmed: true` round trip.
- **Test** with `npm run test:agent`. A real MCP client connects to the server on the sample data and runs every tool. Add a check for anything new.

### Not done yet

- Long-running work as MCP tasks.
- Uploading files (signed copies, vendor invoices) from an agent.
- Limiting what an agent may do below the person's own access (scopes).
