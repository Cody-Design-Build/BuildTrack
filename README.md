# BuildTrack

A simple job-management web app for a design-build company: Home dashboard, Jobs, To-Dos, Schedule, and a small CRM of People and Accounts. People are standalone records that can belong to several accounts (households, companies, vendors…), and both people and accounts are linked to jobs with a role such as Customer, Architect or Subcontractor.

## Develop

```
npm install
npm run dev
```

The UI is built with [shadcn/ui](https://ui.shadcn.com) components (in `src/components/ui/`) on Tailwind CSS v4. Theme colours live in `src/index.css`; the older hand-written styles in `src/styles.css` are loaded in a lower cascade layer, so Tailwind classes always win where they meet. Add more components with `npx shadcn@latest add <name>`.

## Build

```
npm run build
```

The finished site is written to `dist/`. Serve that folder with any static web server, for example:

```
npx serve dist
```

(Opening `index.html` straight from the disk won't work, because each page lives at its own address such as `/jobs`.)

All data is sample data stored in your browser (localStorage). Use **Settings → Reset sample data** to start over.

## Where things live

- **The app itself:** this folder. `src/` holds the code, and `npm run build` writes the finished site to `dist/`.
- **Your data:** your web browser's own storage (localStorage, under the key `buildtrack-db-v4`; data saved by the older customer/vendor version under `buildtrack-db-v3` is converted automatically the first time the app loads and left in place untouched), inside the browser's private profile folder. It isn't a file you can open directly, and each browser keeps its own copy. To get a file, go to **Settings → Your data → Download backup**. **Restore backup** loads that file back in.

Legacy message records are removed when the app loads saved data or restores an older backup. Other records are retained.
