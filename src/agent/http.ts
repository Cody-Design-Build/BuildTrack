// The agent server's HTTP side: sign-in, loading the company's data, and handing the request to
// the MCP server (server.ts). Runs as a Vercel function (api/mcp.ts) at /mcp.
//
// Every request carries the person's own Supabase access token (from BuildTrack's OAuth sign-in,
// see docs/agents.md), and every read and write uses that token, so the database's access rules
// apply exactly as in the app: one company's data only, and team changes only for owners and
// admins. The server never holds a secret key.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { Db } from '../data';
import { activeOf, normalizeChoices } from '../plugins/activation';
import { PLUGIN_BASES } from '../plugins/bases';
import { buildServer } from './server';
import type { AgentContext } from './sdk';

export interface AgentEnv {
  supabaseUrl?: string;
  supabaseKey?: string; // the publishable key: safe anywhere, the access rules protect the data
}

const META = '$meta';
const SCHEMA = '$schema';
const ORIGIN = 'agent';

type Row = { collection: string; id: string; data: unknown; sort: number };
type Item = { id: string };
type AnyDb = Record<string, unknown>;

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

/** Where this server lives, e.g. https://app.buildtrack.run/mcp. */
const resourceUrl = (request: Request) => `${new URL(request.url).origin}/mcp`;
const metadataUrl = (request: Request) => `${new URL(request.url).origin}/.well-known/oauth-protected-resource/mcp`;

/** RFC 9728: tells MCP clients to sign in through BuildTrack's Supabase OAuth server. */
export function protectedResourceMetadata(request: Request, env: AgentEnv) {
  return {
    resource: resourceUrl(request),
    authorization_servers: [`${env.supabaseUrl}/auth/v1`],
    bearer_methods_supported: ['header'],
    resource_name: 'BuildTrack',
    resource_documentation: 'https://github.com/Cody-Design-Build/BuildTrack/blob/main/docs/agents.md',
  };
}

const unauthorized = (request: Request, error: string, description: string) =>
  json(401, { error, error_description: description }, {
    'www-authenticate': `Bearer resource_metadata="${metadataUrl(request)}", error="${error}", error_description="${description}"`,
  });

/** The company's records as a Db, plus each list's highest sort number (for adding records). */
async function loadCompany(sb: SupabaseClient, companyId: string) {
  const out: AnyDb = {};
  const maxSort = new Map<string, number>();
  let known: string[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb
      .from('records').select('collection,id,data,sort').eq('company_id', companyId)
      .order('collection').order('sort').order('id').range(from, from + page - 1);
    if (error) throw new Error(error.message);
    for (const r of data as Row[]) {
      if (r.collection === SCHEMA) known = r.data as string[];
      else if (r.collection === META) out[r.id] = r.data;
      else {
        ((out[r.collection] ??= []) as unknown[]).push(r.data);
        maxSort.set(r.collection, Math.max(maxSort.get(r.collection) ?? -Infinity, r.sort));
      }
    }
    if (data.length < page) break;
  }
  for (const k of known) out[k] ??= [];
  // older data may not have every list yet; tools read them all
  for (const k of ['jobs', 'people', 'accounts', 'memberships', 'jobLinks', 'costCodes', 'team', 'budgets', 'budgetLines', 'invoices', 'payments', 'bills', 'bidPackages', 'bids', 'expenses', 'tasks', 'scheduleEntries', 'docs', 'activity']) out[k] ??= [];
  return { db: out as unknown as Db, known, maxSort };
}

/** Writes the records that differ between two versions of the data (lists only, which is all tools change). */
async function saveChanges(sb: SupabaseClient, companyId: string, prev: AnyDb, next: AnyDb, known: string[], maxSort: Map<string, number>) {
  const upserts: (Row & { company_id: string; origin: string })[] = [];
  const deletes: { collection: string; id: string }[] = [];
  for (const k of Object.keys(next)) {
    const a = (prev[k] ?? []) as Item[];
    const b = next[k];
    if (!Array.isArray(b) || a === b) continue;
    const before = new Map(a.map((r) => [r.id, r] as const));
    for (const r of b as Item[]) {
      const old = before.get(r.id);
      if (!old || (old !== r && JSON.stringify(old) !== JSON.stringify(r))) {
        const sort = old ? undefined : (maxSort.get(k) ?? -1) + 1;
        if (sort !== undefined) maxSort.set(k, sort);
        upserts.push({ company_id: companyId, collection: k, id: r.id, data: r, sort: sort ?? 0, origin: ORIGIN });
      }
      before.delete(r.id);
    }
    for (const id of before.keys()) deletes.push({ collection: k, id });
  }
  const lists = Object.keys(next).filter((k) => Array.isArray(next[k]));
  const missing = lists.filter((k) => !known.includes(k));
  if (missing.length) upserts.push({ company_id: companyId, collection: SCHEMA, id: 'collections', data: [...known, ...missing].sort(), sort: 0, origin: ORIGIN });
  for (const row of upserts) {
    // a changed record keeps its place in the list: only send sort for new ones
    const { sort, ...rest } = row;
    const isNew = !((prev[row.collection] ?? []) as Item[]).some((r) => r.id === row.id);
    const { error } = await sb.from('records').upsert(isNew || row.collection === SCHEMA ? row : rest, { onConflict: 'company_id,collection,id' });
    if (error) throw new Error(error.message);
  }
  for (const d of deletes) {
    const { error } = await sb.from('records').delete().eq('company_id', companyId).eq('collection', d.collection).eq('id', d.id);
    if (error) throw new Error(error.message);
  }
}

/** The MCP side of one request for a signed-in person's company. */
export const mcpHandlerFor = (ctx: AgentContext) => createMcpHandler(() => buildServer(ctx), { onerror: (e) => console.error('[mcp]', e.message) });

export async function handleAgentRequest(request: Request, env: AgentEnv): Promise<Response> {
  const url = new URL(request.url);
  if (!env.supabaseUrl || !env.supabaseKey) return json(503, { error: 'not_configured', error_description: 'This BuildTrack has no Supabase project, so there is no shared data for agents to use.' });

  if (url.searchParams.get('meta') === 'resource' || url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
    return json(200, protectedResourceMetadata(request, env), { 'access-control-allow-origin': '*' });
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
        'access-control-allow-headers': '*',
        'access-control-expose-headers': 'www-authenticate, mcp-session-id',
      },
    });
  }

  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return unauthorized(request, 'invalid_request', 'Sign in to BuildTrack to use it from an agent.');

  const sb = createClient(env.supabaseUrl, env.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: claimData, error: claimError } = await sb.auth.getClaims(token);
  const claims = claimData?.claims;
  if (claimError || !claims?.sub) return unauthorized(request, 'invalid_token', 'The sign-in has expired or is not valid. Sign in again.');
  const email = String(claims.email ?? '').toLowerCase();
  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const user = { email, name: String(meta.full_name || meta.name || email.split('@')[0] || 'Someone') };

  const { data: companies, error: companyError } = await sb.from('companies').select('id,name').order('created_at');
  if (companyError) return json(500, { error: 'server_error', error_description: companyError.message });
  if (!companies?.length) return json(403, { error: 'insufficient_scope', error_description: 'This account is not a member of any company in BuildTrack.' });
  // with several companies, a client can pick one; otherwise the oldest
  const wanted = request.headers.get('x-buildtrack-company');
  const company = (companies.find((c) => c.id === wanted) ?? companies[0]) as { id: string; name: string };

  let loaded: Awaited<ReturnType<typeof loadCompany>>;
  try {
    loaded = await loadCompany(sb, company.id);
  } catch (e) {
    return json(500, { error: 'server_error', error_description: e instanceof Error ? e.message : String(e) });
  }
  const { db, known, maxSort } = loaded;
  const ctx: AgentContext = {
    db,
    plugins: activeOf(PLUGIN_BASES, normalizeChoices(db.plugins)),
    company,
    user,
    save: (next) => saveChanges(sb, company.id, db as unknown as AnyDb, next as unknown as AnyDb, known, maxSort),
  };

  return mcpHandlerFor(ctx).fetch(request, { authInfo: { token, clientId: String(claims.client_id ?? 'buildtrack'), scopes: [], expiresAt: Number(claims.exp) || undefined } });
}
