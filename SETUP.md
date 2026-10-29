# Putting it on Cloudflare

One page, one database row, one shared secret. Phone and laptop become the same
notebook, and link lookups start working everywhere.

Everything below is a one-off. After it, deploying a change is `npm run deploy`.

## What you need

- A Cloudflare account (the free plan is enough — this uses a few hundred requests a
  day against a limit of 100,000).
- Node 18+.

## The five commands

```sh
npm install -g wrangler        # 1. the Cloudflare CLI
wrangler login                 #    opens a browser once, to authorise your account

cd worker
wrangler d1 create marginalia  # 2. make the database
```

That prints a `database_id`. Put it in `worker/wrangler.toml`, replacing
`PUT-YOUR-DATABASE-ID-HERE`.

```sh
npm run db:init                # 3. create the table (from the repo root)

cd worker
wrangler secret put SYNC_TOKEN # 4. paste a long random string — see below
cd ..

npm run deploy                 # 5. build, bundle, publish
```

Wrangler prints your URL: `https://marginalia.<your-subdomain>.workers.dev`.

## Automatic deploys from GitHub

Once this is set up, merging to the default branch tests and deploys the site, and
creates any missing database tables. You never run `npm run deploy` by hand again.

1. In the Cloudflare dashboard: **My Profile → API Tokens → Create Token → Custom
   token**. Give it two permissions, both on your account: **Workers Scripts → Edit**
   and **D1 → Edit**. Create it and copy the token.
2. On GitHub: the repo's **Settings → Secrets and variables → Actions → New repository
   secret**. Name it `CLOUDFLARE_API_TOKEN` and paste the token.

To deploy without merging anything, open **Actions → Deploy → Run workflow**.

The database id and account id are in `worker/wrangler.toml`. They name things rather
than unlock them, so they are safe to commit; the token and `SYNC_TOKEN` are not, and
stay in GitHub's and Cloudflare's secret stores.

## Check it worked

```sh
npm run smoke -- https://marginalia.<your-subdomain>.workers.dev  YOUR-SYNC-TOKEN
```

Six checks: the page serves, your notebook is refused without the key and returned with
it, a stale write is rejected, nothing was written by the attempt, and a real Crossref
lookup comes back through the proxy. It never writes to your notebook.

### Making the secret

Any long random string. On a Mac or Linux box:

```sh
openssl rand -base64 32
```

Keep a copy — you need it once per device.

### If wrangler rejects `run_worker_first`

Older versions only accept a boolean. Change that line in `worker/wrangler.toml` to:

```toml
run_worker_first = true
```

It works the same way — every request goes through the Worker, which hands the static
ones straight to the asset store.

## Getting it onto your devices

Open the URL with the key on the end of the fragment, **once**, on each device:

```
https://marginalia.<your-subdomain>.workers.dev/#key=THE-STRING-YOU-GENERATED
```

The page stores the key in that browser and strips it from the address bar. From then
on the plain URL works. The `#` matters: browsers never send a fragment to the server,
so the key stays out of request logs and out of `Referer` headers on any link you
follow from the page.

On iOS, open it in Safari and use Share → **Add to Home Screen**. It then opens
full-screen with no browser chrome, like an app.

If a browser has no key, the page still loads and works — it just runs on its own local
copy, and the corner says **No key**.

## Moving up from the first version

Nothing to do: the second version reads what the first one left, both in the browser
and on the server.

- **In the browser.** The first version kept its notebook under `marginalia.v2`. The
  second reads that key once, converts it, and writes its own. The old key is never
  written to or deleted — if the conversion gets anything wrong, the original is still
  there.
- **On the server.** The same conversion runs on whatever the server hands back, so the
  notebook you already have on Cloudflare comes up as it is, converted in flight.
- **What changes.** An idea's `blurb` becomes its one-line dek and `essay.deck` its
  subtitle; a reading's plain-text `summary` becomes a note, split into paragraphs at
  blank lines. The old fields are left on the records rather than deleted, so the copy
  on the server stays readable by the first version.
- **What does not come across.** The first version kept no record of when anything was
  written, so the tracker starts from the day you move. Work already long enough to
  count is marked as counted, but nothing is back-dated — a year of writing all stamped
  with today would be a lie the tracker would repeat every year.

The payload grew with the page: footnotes, the calendar and the tracker's log sync too,
each by the same per-record rule. The log is the exception — it is a tally, so merging
takes whichever device counted more of each day and kind, which is right whether the
other device has not heard about yesterday yet or has already heard about both.

## What the indicator in the corner means

| | |
|---|---|
| **Synced** | This device and the server agree. |
| **Syncing** | A push is in flight. |
| **Holding** | Changes arrived from your other device while you were typing. They land the moment you stop. |
| **Offline** | Can't reach the server. Everything still saves locally and goes up when the connection comes back. |
| **No key** | This browser hasn't been given the sync key. |

Nothing at all in the corner means the page is running from a file or a static host,
with no server behind it — local-only, exactly as it behaved before.

## How the syncing actually behaves

- **Pulls** on arrival, whenever you come back to the tab, and every 30 seconds while
  you're looking at it. **Pushes** about a second after you stop typing.
- **Merging is per record, not per document.** Write two paragraphs on the train and fix
  a different idea's title on the laptop, and you keep both. Only the same field edited
  in two places at once, with no sync in between, can lose anything — and then the later
  edit wins.
- **Deletes stick.** A deleted source leaves a tombstone, so the device that hadn't heard
  about the deletion doesn't cheerfully put it back.
- **Typing is never interrupted.** An incoming change is held until the caret leaves the
  editor, so the page can't redraw under your hands.
- **localStorage is still the first line.** The server is a second copy, not the only one;
  every device keeps a full local notebook and works with no network at all.

## The edit history

Alongside the notebook, the Worker keeps a log of every save: which idea, reading,
draft or note changed, when (on the device's clock, and as local time of day), whether
it was created, edited or deleted, its word count and how many words the save added or
removed, and which browser it came from. It keeps counts, never copies of your text, so
it stays small — a heavy day is a few hundred rows, roughly 30 MB a year.

It needs one table. On a server set up before the history existed, run this once after
deploying (it only adds what is missing and leaves the notebook alone):

```sh
npm run db:init
```

Until then saves work exactly as before and simply are not logged. History starts the
day the table exists; it cannot be filled in backwards.

Read it back with the key, oldest first:

```sh
curl -H "Authorization: Bearer YOUR-SYNC-TOKEN" \
  "https://marginalia.<your-subdomain>.workers.dev/api/events?since=0&limit=5000"
```

`since` is a timestamp in milliseconds, so a chart can fetch only what is new.

## Lookups

Pasted links (Crossref, DOI, JSTOR, NBER, arXiv, Open Library, PubMed, YouTube) and
downloaded PDFs are fetched by the Worker on the page's behalf, at `/api/fetch`. This
isn't for privacy — it's the only way they work at all: those endpoints send no CORS
headers, so a browser asking them directly is refused before the request leaves.

The proxy is behind the same key as everything else.

## Costs

Free, in practice. Workers' free plan covers 100,000 requests/day; D1's covers 5 million
row reads/day and 5GB of storage. One person on two devices is not close to either. You
pay nothing until you register a custom domain, which is optional.

## Running it locally

```sh
npm start     # http://localhost:4321
```

The local server speaks the same API — `/api/state` and `/api/fetch` — so a local run is
a real rehearsal of the deployed one, and your notebook lives in
`.marginalia-state.json` in the repo. Set `SYNC_TOKEN` in the environment if you want to
rehearse the key handling too.

## Changing something later

```sh
npm run deploy
```

That rebuilds the page, wraps it, and publishes. Your data is in D1 and is untouched by
a deploy.

## If you want to move off Cloudflare

The client talks to three endpoints and nothing else:

- `GET /api/state` → `{version, payload, updated}`
- `PUT /api/state` with `{baseVersion, payload}` → `{version}`, or `409` with the current
  `{version, payload}` if someone else wrote first
- `GET /api/fetch?url=…` → passes the response through

`bin/serve.mjs` is a complete 130-line implementation of all three in plain Node. Point
it at any host that can run Node and it works, with no changes to the page.
