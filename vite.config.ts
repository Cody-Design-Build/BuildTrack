import path from 'node:path';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Which build this is, shown in the status corner. On Vercel the commit and
// environment come from Vercel; locally from git.
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as { version: string };
const git = (cmd: string) => {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};
const build = {
  version: pkg.version,
  commit: (process.env.VERCEL_GIT_COMMIT_SHA || git('git rev-parse HEAD')).slice(0, 7) || 'unknown',
  branch: process.env.VERCEL_GIT_COMMIT_REF || git('git rev-parse --abbrev-ref HEAD'),
  env: process.env.VERCEL_ENV || 'local', // production | preview | development | local
  built: new Date().toISOString(),
};

/** Writes version.json next to the app, so open copies can tell when a newer build is live. */
function versionFile(): Plugin {
  return {
    name: 'buildtrack-version',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(build) });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), versionFile()],
  base: '/',
  define: { __BUILD__: JSON.stringify(build) },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist', emptyOutDir: true },
});
