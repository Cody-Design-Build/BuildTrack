// Write, build and try out a plugin a company can install (Settings → Plugins → Install).
// See docs/plugins.md.
//
//   npm run plugin -- new acme.punch-list     start one in plugins/punch-list/
//   npm run plugin -- build plugins/punch-list   one installable file: plugins/punch-list/dist/acme.punch-list.js
//   npm run plugin -- dev plugins/punch-list     rebuild on every save and load it into `npm run dev`
import { build, context } from 'esbuild';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const [cmd, arg] = process.argv.slice(2);
const SDK = ['@buildtrack/sdk', 'react', 'react/jsx-runtime'];
const DEV_PORT = Number(process.env.PLUGIN_PORT || 5174);

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const entryOf = (dir) => ['plugin.tsx', 'plugin.jsx', 'plugin.ts', 'plugin.js', 'index.tsx', 'index.js'].map((f) => path.join(dir, f)).find(existsSync);

/** The app's theme (colour names like bg-muted) for the plugin's Tailwind classes, without repeating it. */
function themeBlock() {
  const css = readFileSync(path.join(root, 'src/index.css'), 'utf8');
  const start = css.indexOf('@theme inline {');
  if (start < 0) return '';
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return '@theme inline reference ' + css.slice(css.indexOf('{', start), i + 1);
  }
  return '';
}

/** Only the Tailwind utilities the plugin uses (the app has its own; repeats are harmless). */
async function pluginCss(dir) {
  const input = [`@import 'tailwindcss/theme' theme(reference);`, themeBlock(), '@custom-variant dark (&:is(.dark *));', '@tailwind utilities;'].join('\n');
  const compiler = await compile(input, { base: root, onDependency: () => {} });
  const scanner = new Scanner({ sources: [{ base: dir, pattern: '**/*.{ts,tsx,js,jsx}', negated: false }] });
  const candidates = scanner.scan().filter(Boolean);
  return compiler.build(candidates).trim();
}

const esbuildOptions = (dir, entry) => ({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: SDK,
  write: false,
  // readable, so an admin can look through it before installing
  minify: false,
  legalComments: 'none',
  logLevel: 'silent',
  absWorkingDir: dir,
});

/** Bundles the plugin and its styles; returns { code, css, id, file }. */
async function buildOnce(dir) {
  const entry = entryOf(dir);
  if (!entry) fail(`No plugin.tsx (or plugin.js) in ${dir}.`);
  const out = await build(esbuildOptions(dir, entry));
  const code = out.outputFiles[0].text;
  const css = await pluginCss(dir);
  const id = code.match(/\bid:\s*["']([a-z0-9.-]+)["']/)?.[1] ?? path.basename(dir);
  return { code, css, id };
}

/** One file: the styles in a comment block the app splits off (src/pages/PluginSettings.tsx), then the code. */
const fileText = ({ code, css }) => (css ? `/*! buildtrack-css\n${css.replace(/\*\//g, '*\\/')}\n*/\n` : '') + code;

async function cmdBuild(dirArg) {
  const dir = path.resolve(dirArg || fail('Which plugin? npm run plugin -- build plugins/<name>'));
  const b = await buildOnce(dir);
  mkdirSync(path.join(dir, 'dist'), { recursive: true });
  const file = path.join(dir, 'dist', `${b.id}.js`);
  writeFileSync(file, fileText(b));
  console.log(`Built ${path.relative(root, file)} (${Math.round(fileText(b).length / 1024)} KB).`);
  console.log('Install it in BuildTrack: Settings → Plugins → Install a plugin.');
}

async function cmdDev(dirArg) {
  const dir = path.resolve(dirArg || fail('Which plugin? npm run plugin -- dev plugins/<name>'));
  const entry = entryOf(dir) || fail(`No plugin.tsx (or plugin.js) in ${dir}.`);
  let latest = { code: '', css: '' };
  const clients = new Set();
  const rebuild = async () => {
    try {
      const out = await ctx.rebuild();
      latest = { code: out.outputFiles[0].text, css: await pluginCss(dir) };
      for (const c of clients) c.write(`data: ${Date.now()}\n\n`);
      console.log(`${new Date().toLocaleTimeString()} rebuilt`);
    } catch (e) {
      console.error(e.message);
    }
  };
  const ctx = await context(esbuildOptions(dir, entry));
  await rebuild();
  // watch the folder (esbuild's own watch can't hand us output with write: false)
  const { watch } = await import('node:fs');
  let timer;
  watch(dir, { recursive: true }, (_e, f) => {
    if (!f || f.startsWith('dist') || f.startsWith('node_modules')) return;
    clearTimeout(timer);
    timer = setTimeout(rebuild, 80);
  });
  createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/plugin.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(latest.code);
    if (url.pathname === '/plugin.css') return res.writeHead(200, { 'content-type': 'text/css' }).end(latest.css);
    if (url.pathname === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      res.write(': hello\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    res.writeHead(404).end();
  }).listen(DEV_PORT, () => {
    console.log(`Serving ${path.relative(root, dir)} on http://localhost:${DEV_PORT}`);
    console.log(`Run \`npm run dev\` and open http://localhost:5173/?dev-plugin=http://localhost:${DEV_PORT}`);
    console.log('It reloads on every save. Open ?dev-plugin= (empty) to stop loading it.');
  });
}

function cmdNew(id) {
  if (!id || !/^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/.test(id)) fail('Give it an id with your own prefix: npm run plugin -- new acme.punch-list');
  if (id.startsWith('buildtrack.')) fail("'buildtrack.' is for BuildTrack's own plugins. Use your company's prefix.");
  const short = id.split('.').slice(1).join('-');
  const dir = path.join(root, 'plugins', short);
  if (existsSync(dir)) fail(`${path.relative(root, dir)} already exists.`);
  mkdirSync(dir, { recursive: true });
  const title = short.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
  writeFileSync(path.join(dir, 'plugin.tsx'), `// ${title}: a BuildTrack plugin. See docs/plugins.md.
import { useState } from 'react';
import { definePlugin, useRecords, Page, Section, Row, Empty, ui, icons, uid, today } from '@buildtrack/sdk';

interface Item {
  id: string;
  text: string;
  created: string;
}

const ITEMS = '${id}.items';

function Page() {
  const items = useRecords<Item>(ITEMS);
  const [text, setText] = useState('');
  const add = () => {
    if (!text.trim()) return;
    items.add({ id: uid('it'), text: text.trim(), created: today() });
    setText('');
  };
  return (
    <Page title="${title}">
      <Section title="Items" count={items.items.length}>
        {items.items.length === 0 && <Empty>Nothing yet.</Empty>}
        {items.items.map((i) => (
          <Row key={i.id}>
            <span className="flex-1">{i.text}</span>
            <ui.Button variant="ghost" size="sm" onClick={() => items.remove(i.id)}>Remove</ui.Button>
          </Row>
        ))}
        <div className="flex gap-2 p-2">
          <ui.Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Add an item" />
          <ui.Button onClick={add}>Add</ui.Button>
        </div>
      </Section>
    </Page>
  );
}

export default definePlugin({
  id: '${id}',
  name: '${title}',
  description: 'What it does, in a sentence.',
  version: '1.0.0',
  collections: [ITEMS],
  reads: [],
  writes: [],
  nav: [{ to: '/${short}', label: '${title}', icon: icons.Package, group: 'work', order: 90 }],
  routes: [{ path: '/${short}', component: Page }],
});
`);
  console.log(`Started ${path.relative(root, dir)}/plugin.tsx.`);
  console.log(`Try it:  npm run plugin -- dev plugins/${short}   (with npm run dev)`);
  console.log(`Ship it: npm run plugin -- build plugins/${short}`);
}

if (cmd === 'build') await cmdBuild(arg);
else if (cmd === 'dev') await cmdDev(arg);
else if (cmd === 'new') cmdNew(arg);
else fail('npm run plugin -- new <id> | build <folder> | dev <folder>   (see docs/plugins.md)');
