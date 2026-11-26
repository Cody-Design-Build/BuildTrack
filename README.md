# BuildTrack

A simple job-management web app for a design-build company: Home dashboard, Jobs, To-Dos, Schedule, Messages, and Customer / Vendor accounts with their own contacts.

## Build

```
npm install
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
- **Your data:** your web browser's own storage (localStorage, under the key `buildtrack-db-v3`), inside the browser's private profile folder. It isn't a file you can open directly, and each browser keeps its own copy. To get a file, go to **Settings → Your data → Download backup**. **Restore backup** loads that file back in.
