// Bundles the agent server (src/agent/http.ts and everything it uses) into api/_agent.mjs for
// the Vercel function in api/mcp.js. Packages stay in node_modules, where Vercel finds them.
// Part of `npm run build` and `npm run check`.
//
// The server can't use the browser app: .tsx files aren't resolved here, so importing one (e.g.
// store.tsx) fails the build, and so does anything that reads Vite's import.meta.env.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const outfile = 'api/_agent.mjs';
try {
  await build({
    entryPoints: ['src/agent/http.ts'], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22',
    packages: 'external', resolveExtensions: ['.ts', '.mjs', '.js', '.json'], logLevel: 'silent',
    banner: { js: '// Built by scripts/build-agent.mjs from src/agent/. Do not edit.' },
  });
} catch (e) {
  console.error(`\nThe agent server (src/agent/) can't be built:\n${e.message}\n\nServer code can't import .tsx files or the browser app; see docs/agents.md → How it's built.`);
  process.exit(1);
}
if (readFileSync(outfile, 'utf8').includes('import.meta.env')) {
  console.error('\nThe agent server uses import.meta.env, which only exists in the browser app. See docs/agents.md → How it\'s built.');
  process.exit(1);
}
console.log(`Built ${outfile}`);
