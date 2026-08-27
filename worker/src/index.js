/**
 * Marginalia on Cloudflare Workers.
 *
 * Three jobs, and deliberately no more:
 *
 *   GET  /api/state      hand back the stored notebook and its version
 *   PUT  /api/state      store a new one, refusing a write built on a stale version
 *   GET  /api/fetch?url= fetch a bibliographic record on the page's behalf
 *
 * The store is dumb on purpose. It keeps one row and a version counter and knows
 * nothing about ideas or essays; merging two divergent copies is the client's job
 * (src/sync.js), where it can be tested without a database. The server's only
 * contribution to correctness is refusing to let a device overwrite a version it has
 * not seen — that is what turns "last write wins" into "merge, then write".
 *
 * The proxy exists because the browser cannot call Crossref, arXiv, Open Library or a
 * publisher's PDF directly: no CORS headers, so the request is blocked before it is
 * even sent. Same-origin through here, and it simply works — on the phone too.
 */

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });

/** Constant-time, so a wrong token cannot be narrowed down one character at a time. */
function tokenMatches(given, expected) {
  if (typeof given !== "string" || typeof expected !== "string") return false;
  const a = new TextEncoder().encode(given), b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function authorised(request, env) {
  if (!env.SYNC_TOKEN) return false;                 // unconfigured means shut, not open
  const header = request.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return !!m && tokenMatches(m[1], env.SYNC_TOKEN);
}

/* ==================== the notebook ==================== */

const ROW = "notebook";                              // one user, one row; no accounts to run

async function readState(env) {
  const row = await env.DB.prepare("SELECT version, payload, updated FROM state WHERE id = ?")
    .bind(ROW).first();
  if (!row) return { version: 0, payload: null, updated: null };
  return { version: row.version, payload: JSON.parse(row.payload), updated: row.updated };
}

/**
 * A compare-and-set, expressed as a conditional UPDATE so two devices writing at the
 * same instant cannot both believe they won. D1 gives us the row count back, which is
 * the only signal needed: zero rows changed means somebody else got there first.
 */
async function writeState(env, baseVersion, payload) {
  const body = JSON.stringify(payload);
  const now = new Date().toISOString();

  if (baseVersion === 0) {
    const ins = await env.DB.prepare(
      "INSERT INTO state (id, version, payload, updated) VALUES (?, 1, ?, ?) ON CONFLICT(id) DO NOTHING")
      .bind(ROW, body, now).run();
    if (ins.meta.changes === 1) return { ok: true, version: 1 };
    return { ok: false, current: await readState(env) };
  }

  const upd = await env.DB.prepare(
    "UPDATE state SET version = version + 1, payload = ?, updated = ? WHERE id = ? AND version = ?")
    .bind(body, now, ROW, baseVersion).run();
  if (upd.meta.changes === 1) return { ok: true, version: baseVersion + 1 };
  return { ok: false, current: await readState(env) };
}

/* ==================== the lookup proxy ==================== */

const MAX_PROXY_BYTES = 32 * 1024 * 1024;            // a fat scanned PDF, and no more
const PROXY_TIMEOUT_MS = 20_000;

async function proxy(request, url) {
  const target = url.searchParams.get("url");
  if (!target) return json({ error: "no url" }, 400);

  let parsed;
  try { parsed = new URL(target); } catch { return json({ error: "bad url" }, 400); }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return json({ error: "only http(s)" }, 400);
  }

  const upstream = await fetch(parsed.toString(), {
    headers: {
      // Some publishers serve a stub to anything that looks like a script. Ask politely.
      "user-agent": "Marginalia/1.0 (personal reading notebook)",
      accept: request.headers.get("accept") || "*/*",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
  });

  const length = Number(upstream.headers.get("content-length") || 0);
  if (length > MAX_PROXY_BYTES) return json({ error: "too large" }, 413);

  const headers = new Headers();
  for (const h of ["content-type", "content-length", "content-disposition"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("cache-control", "public, max-age=86400");
  return new Response(upstream.body, { status: upstream.status, headers });
}

/* ==================== routing ==================== */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      // Everything else is the page itself, served by Workers Assets.
      return env.ASSETS.fetch(request);
    }

    if (!authorised(request, env)) {
      return json({ error: "unauthorised" }, 401, { "www-authenticate": 'Bearer realm="marginalia"' });
    }

    try {
      if (url.pathname === "/api/state" && request.method === "GET") {
        return json(await readState(env));
      }

      if (url.pathname === "/api/state" && request.method === "PUT") {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || !("payload" in body)) {
          return json({ error: "expected {baseVersion, payload}" }, 400);
        }
        const base = Number.isInteger(body.baseVersion) ? body.baseVersion : 0;
        const result = await writeState(env, base, body.payload);
        // 409 carries the winning copy, so the client can merge and try again without
        // a second round trip.
        return result.ok ? json({ version: result.version })
                         : json({ error: "stale", ...result.current }, 409);
      }

      if (url.pathname === "/api/fetch" && request.method === "GET") {
        return await proxy(request, url);
      }

      if (url.pathname === "/api/ping") return json({ ok: true });

      return json({ error: "no such endpoint" }, 404);
    } catch (err) {
      return json({ error: String(err && err.message || err) }, 502);
    }
  },
};
