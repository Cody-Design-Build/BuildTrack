// BuildTrack's MCP server for AI agents, served at /mcp (and its sign-in metadata at
// /.well-known/oauth-protected-resource/mcp); see vercel.json and docs/agents.md.
//
// The work is in src/agent/. `npm run build` bundles it into api/_agent.mjs (one file, so
// Node can load it as it is; Vercel's own per-file build would leave imports Node can't resolve).
import { handleAgentRequest } from './_agent.mjs';

const env = {
  supabaseUrl: process.env.VITE_SUPABASE_URL,
  supabaseKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
};

const handle = (request) => handleAgentRequest(request, env);

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const OPTIONS = handle;
