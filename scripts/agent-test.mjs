// Bundles and runs scripts/agent.test.ts (the agent server's tests) with esbuild, which Vite
// already brings along. The bundle goes in node_modules/.cache so it finds the packages.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';

const out = 'node_modules/.cache/buildtrack/agent.test.mjs';
await build({
  entryPoints: ['scripts/agent.test.ts'], outfile: out, bundle: true, platform: 'node', format: 'esm', target: 'node22',
  packages: 'external', resolveExtensions: ['.ts', '.tsx', '.mjs', '.js', '.json'], logLevel: 'warning',
});
try {
  execFileSync(process.execPath, [out], { stdio: 'inherit' });
} catch {
  process.exit(1);
}
