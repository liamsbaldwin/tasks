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

### Making the secret

Any long random string. On a Mac or Linux box:

```sh
openssl rand -base64 32
```

Keep a copy — you need it once per device.

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
