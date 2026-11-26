// Copies the single-page app's index.html into a folder for every page,
// so each page works when the dist folder is served by any static web server.
import { mkdirSync, copyFileSync } from 'node:fs';
const pages = ['jobs', 'tasks', 'to-dos', 'schedule', 'people', 'accounts', 'customers', 'vendors', 'documents', 'catalog', 'files', 'reports', 'settings', 'profile'];
for (const p of pages) {
  mkdirSync(`dist/${p}`, { recursive: true });
  copyFileSync('dist/index.html', `dist/${p}/index.html`);
}
copyFileSync('dist/index.html', 'dist/404.html');
console.log(`Wrote ${pages.length} page folders`);
