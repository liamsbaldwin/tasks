# Marginalia

A private notebook for research projects that end in an essay and then a video:
**idea → reading → notes → draft → published**. One person, every device, no account.

Live at <https://marginalia.liambwin02.workers.dev>.

## How it works

```
 browser (any device)                         Cloudflare
┌──────────────────────────┐   /api/state   ┌──────────────────────────────────┐
│ the page: one HTML file  │ ─────────────▶ │ Worker  (worker/src/index.js)    │
│ notebook in localStorage │ ◀───────────── │   ├─ D1 `state`  the notebook    │
│ works fully offline      │   /api/fetch   │   ├─ D1 `events` the edit history│
└──────────────────────────┘ ─────────────▶ │   └─ proxy for Crossref, arXiv…  │
                                            └──────────────────────────────────┘
```

- **The page is the app.** Everything — Cockpit, Library, Roadmap, Notes, Progress, the
  essay editor, the PDF reader and maths rendering — is one file,
  [`mockup/asterisk.html`](mockup/asterisk.html). `npm run bundle` wraps it for Cloudflare.
- **Each browser keeps a full copy** of the notebook in `localStorage`, so it opens
  instantly and works with no network.
- **Sync.** About a second after you stop typing, the page sends its copy to the Worker;
  it pulls on arrival, on returning to the tab and every 30 seconds. The server stores one
  row and refuses a write built on a stale version; the client then merges
  ([`src/sync.js`](src/sync.js)) **per record** — each idea, reading, draft and note
  carries its own timestamps, so edits on two devices both survive, deletes stick, and an
  update never lands while you are typing.
- **The key.** The API answers only requests carrying the secret `SYNC_TOKEN`. A browser
  is given it once by opening `…/#key=THE-KEY`; it is saved and stripped from the address
  bar. Without it the page still works, local-only, and the corner says **No key**.
- **Edit history.** Every accepted sync also appends one row per changed record to the
  `events` table: when it was written (device clock, local time of day and time zone),
  what it was, created/edited/deleted, word count and words added or removed, and which
  browser. Counts only — never copies of the text — so it stays small (≈30 MB a year at
  most). Read it with `GET /api/events?since=<ms>`. See
  [`worker/src/history.js`](worker/src/history.js).
- **Lookups.** Paste a link or drop a PDF and the source fills itself in
  ([`src/resolve.js`](src/resolve.js)): identifiers first (DOI, arXiv, ISBN, PMID), then
  what is printed in the PDF, then registry search. Every answer is checked against what
  was asked for, and no field is ever invented — anything unconfirmed is flagged
  **Check**. The Worker fetches on the page's behalf because those registries send no
  CORS headers.

## Where things live

| What | Where |
|---|---|
| Code and its history | GitHub, this repo |
| The running site | Cloudflare Workers (`marginalia`) |
| Your notebook | Cloudflare D1 `marginalia`, table `state` (one row), plus a copy in each browser |
| Edit history | Cloudflare D1 `marginalia`, table `events` |
| The sync key | Cloudflare secret `SYNC_TOKEN`, and each browser's `localStorage` |

## Deploying

**Merging to the default branch deploys.** [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
runs the tests, builds the page, creates any missing database tables and publishes the
Worker. It needs one repository secret, `CLOUDFLARE_API_TOKEN` — see [`SETUP.md`](SETUP.md).

So GitHub is the source of truth: don't `npm run deploy` from a local folder with
uncommitted changes, or the site will run code GitHub doesn't have, and the next merge
will quietly replace it.

## Working on it

```sh
npm install
npm start            # the app at http://localhost:4321, local-only
npm test             # resolver, sync merge, typing, Worker and history tests
node build.mjs       # after editing src/resolve.js, src/sync.js or src/typing.js
```

`build.mjs` copies `src/resolve.js`, `src/sync.js` and `src/typing.js` into marked blocks in the HTML (and
inlines pdf.js and KaTeX), so the page and the tested modules can't drift. Never edit a
generated block by hand; CI refuses to deploy if they are stale.

`npm run resolve -- <url|file.pdf>` resolves one source from the command line and prints
the trail of how it got there (`--json` for the raw record).

## Layout

```
mockup/asterisk.html     the app (deployed)
mockup/marginalia.html   the earlier single-file prototype
src/resolve.js           link/PDF → bibliographic record
src/sync.js              per-record merge, timestamps, tombstones
src/favicon.js           icons, inlined by the bundler
worker/src/index.js      the Worker: /api/state, /api/events, /api/fetch, static page
worker/src/history.js    the edit-history diff and the events table
worker/schema.sql        D1 tables (safe to re-run)
worker/wrangler.toml     Cloudflare config
build.mjs, bin/          build, bundle, local server, CLI resolver, smoke test
test/                    node --test suites and sample PDFs
SETUP.md                 one-off Cloudflare setup, devices, the sync indicator
```
