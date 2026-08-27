#!/usr/bin/env node
/**
 * Check a deployment actually works, without writing anything to your notebook.
 *
 *   npm run smoke -- https://marginalia.you.workers.dev  YOUR-SYNC-TOKEN
 *
 * Every check is read-only. The one write it attempts is deliberately built on a
 * version that cannot be current, so the server is obliged to refuse it — which is
 * exactly the behaviour worth confirming.
 */
const [url, token] = process.argv.slice(2);
if (!url || !token) {
  console.error("usage: npm run smoke -- <url> <sync-token>");
  process.exit(2);
}
const base = url.replace(/\/+$/, "");
const auth = { authorization: "Bearer " + token };

let failed = 0;
const check = async (what, fn) => {
  try {
    const note = await fn();
    console.log(`  ok    ${what}${note ? `  — ${note}` : ""}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${what}\n          ${e.message}`);
  }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

console.log(`\nChecking ${base}\n`);

await check("the page is served", async () => {
  const res = await fetch(base + "/");
  expect(res.ok, `GET / returned ${res.status}`);
  const html = await res.text();
  expect(/Marginalia/.test(html), "GET / did not return the page");
  return `${(html.length / 1048576).toFixed(1)}MB`;
});

await check("your notebook is not readable without the key", async () => {
  const res = await fetch(base + "/api/state");
  expect(res.status === 401, `expected 401, got ${res.status}` +
    (res.status === 200 ? " — the Worker is not seeing /api/* (check run_worker_first)" : ""));
});

let version = null;
await check("and is readable with it", async () => {
  const res = await fetch(base + "/api/state", { headers: auth });
  expect(res.ok, `expected 200, got ${res.status}`);
  const body = await res.json();
  expect(typeof body.version === "number", "no version in the response — is D1 bound?");
  version = body.version;
  const n = body.payload?.ideas?.length;
  return version === 0 ? "empty so far" : `version ${version}, ${n ?? "?"} ideas`;
});

await check("a stale write is refused", async () => {
  const res = await fetch(base + "/api/state", {
    method: "PUT",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ baseVersion: (version ?? 0) + 500, payload: { rejected: true } }),
  });
  expect(res.status === 409, `expected 409, got ${res.status}` +
    (res.status === 200 ? " — the server accepted a write it should have rejected" : ""));
});

await check("your notebook was not touched by that", async () => {
  const res = await fetch(base + "/api/state", { headers: auth });
  const body = await res.json();
  expect(body.version === version, `version moved from ${version} to ${body.version}`);
});

await check("lookups resolve through the proxy", async () => {
  const doi = "https://api.crossref.org/works/10.2307/1912767";
  const res = await fetch(base + "/api/fetch?url=" + encodeURIComponent(doi), { headers: auth });
  expect(res.ok, `the proxy returned ${res.status}`);
  const body = await res.json();
  const title = body?.message?.title?.[0];
  expect(!!title, "no title came back from Crossref");
  return `“${title}”`;
});

console.log(failed
  ? `\n${failed} check${failed > 1 ? "s" : ""} failed.\n`
  : `\nAll good. Open ${base}/#key=… once on each device.\n`);
process.exit(failed ? 1 : 0);
