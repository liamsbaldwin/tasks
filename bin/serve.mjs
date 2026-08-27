#!/usr/bin/env node
/**
 * Serve the app on localhost, speaking exactly the API the Cloudflare Worker speaks:
 * /api/state for syncing and /api/fetch as the lookup proxy. That means the local run
 * is a real rehearsal of the deployed one — same client code path, same conflict
 * handling — and the sync can be driven by a test without a Cloudflare account.
 *
 *   npm start   →   http://localhost:4321
 *
 * State lives in .marginalia-state.json next to the repo. No dependencies.
 */
import { createServer } from "node:http";
import { readFile, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const FILE  = fileURLToPath(new URL("../mockup/marginalia.html", import.meta.url));
const STATE = process.env.MARGINALIA_STATE
  || fileURLToPath(new URL("../.marginalia-state.json", import.meta.url));
const PORT  = Number(process.env.PORT) || 4321;
// Local runs are on your own machine, so the token is optional here; set one to
// rehearse the deployed setup exactly.
const TOKEN = process.env.SYNC_TOKEN || "";

const send = (res, status, body, headers = {}) => {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8",
                          "cache-control": "no-store", ...headers });
  res.end(text);
};

async function readState() {
  try { return JSON.parse(await readFile(STATE, "utf8")); }
  catch { return { version: 0, payload: null, updated: null }; }
}

/* Write to a sibling file and rename, so an interrupted save cannot truncate the real one. */
async function writeState(next) {
  await writeFile(STATE + ".tmp", JSON.stringify(next));
  await rename(STATE + ".tmp", STATE);
}

/* The single-process equivalent of the Worker's conditional UPDATE. */
let writing = Promise.resolve();
const serialised = fn => (writing = writing.then(fn, fn));

const authorised = req => {
  if (!TOKEN) return true;
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
  return !!m && m[1] === TOKEN;
};

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return null; }
}

async function proxy(req, res, target) {
  let parsed;
  try { parsed = new URL(target); } catch { return send(res, 400, { error: "bad url" }); }
  if (!/^https?:$/.test(parsed.protocol)) return send(res, 400, { error: "only http(s)" });
  try {
    const upstream = await fetch(parsed, {
      headers: { "user-agent": "Marginalia/1.0 (personal reading notebook)",
                 accept: req.headers.accept || "*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    const headers = { "cache-control": "public, max-age=86400" };
    for (const h of ["content-type", "content-disposition"]) {
      const v = upstream.headers.get(h);
      if (v) headers[h] = v;
    }
    res.writeHead(upstream.status, headers);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) {
    send(res, 502, { error: String(e.message || e) });
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/favicon.ico") { res.writeHead(204).end(); return; }

  if (url.pathname.startsWith("/api/")) {
    if (!authorised(req)) return send(res, 401, { error: "unauthorised" });

    if (url.pathname === "/api/ping") return send(res, 200, { ok: true });

    if (url.pathname === "/api/state" && req.method === "GET") {
      return send(res, 200, await readState());
    }

    if (url.pathname === "/api/state" && req.method === "PUT") {
      const b = await body(req);
      if (!b || typeof b !== "object" || !("payload" in b)) {
        return send(res, 400, { error: "expected {baseVersion, payload}" });
      }
      return serialised(async () => {
        const cur = await readState();
        const base = Number.isInteger(b.baseVersion) ? b.baseVersion : 0;
        if (base !== cur.version) return send(res, 409, { error: "stale", ...cur });
        const next = { version: cur.version + 1, payload: b.payload,
                       updated: new Date().toISOString() };
        await writeState(next);
        send(res, 200, { version: next.version });
      });
    }

    if (url.pathname === "/api/fetch" && req.method === "GET") {
      const target = url.searchParams.get("url");
      if (!target) return send(res, 400, { error: "no url" });
      return proxy(req, res, target);
    }

    return send(res, 404, { error: "no such endpoint" });
  }

  try {
    const html = await readFile(FILE, "utf8");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html><head><meta charset="utf-8">` +
            `<meta name="viewport" content="width=device-width,initial-scale=1">` +
            `</head><body>${html}</body></html>`);
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
}).listen(PORT, () => {
  console.log(`\n  Marginalia → http://localhost:${PORT}\n`);
  console.log(`  Lookups go through /api/fetch to the real Crossref / arXiv / Open Library.`);
  console.log(`  Your notebook is synced to ${STATE}`);
  console.log(`  Dropped PDFs are parsed in the browser. Ctrl-C to stop.\n`);
});
