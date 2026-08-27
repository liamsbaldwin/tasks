import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/src/index.js";

/**
 * Enough of D1 to exercise the compare-and-set. It recognises the three statements the
 * Worker issues and nothing else, so a typo in one of them fails here rather than in
 * production.
 */
function fakeDB() {
  const rows = new Map();
  const run = (sql, args) => {
    if (/^INSERT INTO state/.test(sql)) {
      const [id, payload, updated] = args;
      if (rows.has(id)) return { meta: { changes: 0 } };
      rows.set(id, { version: 1, payload, updated });
      return { meta: { changes: 1 } };
    }
    if (/^UPDATE state SET/.test(sql)) {
      const [payload, updated, id, base] = args;
      const row = rows.get(id);
      if (!row || row.version !== base) return { meta: { changes: 0 } };
      rows.set(id, { version: row.version + 1, payload, updated });
      return { meta: { changes: 1 } };
    }
    throw new Error("unexpected statement: " + sql);
  };
  return {
    rows,
    prepare(sql) {
      return {
        bind: (...args) => ({
          first: async () => {
            if (!/^SELECT version, payload, updated FROM state/.test(sql)) {
              throw new Error("unexpected statement: " + sql);
            }
            return rows.get(args[0]) || null;
          },
          run: async () => run(sql, args),
        }),
      };
    },
  };
}

const TOKEN = "s3cret-token";
const envWith = (db = fakeDB()) => ({
  DB: db,
  SYNC_TOKEN: TOKEN,
  ASSETS: { fetch: async () => new Response("<html>the page</html>", { headers: { "content-type": "text/html" } }) },
});

const call = (env, path, init = {}, token = TOKEN) =>
  worker.fetch(new Request("https://example.workers.dev" + path, {
    ...init,
    headers: { ...(init.headers || {}), ...(token ? { authorization: "Bearer " + token } : {}) },
  }), env);

const put = (env, baseVersion, payload, token = TOKEN) =>
  call(env, "/api/state", { method: "PUT", body: JSON.stringify({ baseVersion, payload }) }, token);

test("the page itself is served without a key", async () => {
  const res = await worker.fetch(new Request("https://example.workers.dev/"), envWith());
  assert.equal(res.status, 200);
  assert.match(await res.text(), /the page/);
});

test("the data is not", async () => {
  const env = envWith();
  assert.equal((await call(env, "/api/state", {}, null)).status, 401);
  assert.equal((await call(env, "/api/state", {}, "wrong")).status, 401);
  assert.equal((await call(env, "/api/state")).status, 200);
});

test("a wrong key of the right length is still refused", async () => {
  const env = envWith();
  const nearly = TOKEN.slice(0, -1) + "X";
  assert.equal(nearly.length, TOKEN.length);
  assert.equal((await call(env, "/api/state", {}, nearly)).status, 401);
});

test("an unconfigured worker is shut, not open", async () => {
  const env = { ...envWith(), SYNC_TOKEN: undefined };
  assert.equal((await call(env, "/api/state", {}, null)).status, 401);
  assert.equal((await call(env, "/api/state", {}, "anything")).status, 401);
});

test("an empty store reads as version 0", async () => {
  const res = await call(envWith(), "/api/state");
  assert.deepEqual(await res.json(), { version: 0, payload: null, updated: null });
});

test("the first write creates version 1 and reads back", async () => {
  const env = envWith();
  const wrote = await put(env, 0, { ideas: ["one"] });
  assert.equal(wrote.status, 200);
  assert.deepEqual(await wrote.json(), { version: 1 });

  const read = await (await call(env, "/api/state")).json();
  assert.equal(read.version, 1);
  assert.deepEqual(read.payload, { ideas: ["one"] });
  assert.ok(read.updated);
});

test("a second device writing from version 0 is refused, and told what won", async () => {
  const env = envWith();
  await put(env, 0, { from: "laptop" });
  const res = await put(env, 0, { from: "phone" });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error, "stale");
  assert.equal(body.version, 1);
  assert.deepEqual(body.payload, { from: "laptop" });
});

test("writing from the version you actually hold succeeds", async () => {
  const env = envWith();
  await put(env, 0, { v: 1 });
  assert.equal((await put(env, 1, { v: 2 })).status, 200);
  assert.equal((await put(env, 1, { v: "stale again" })).status, 409);
  assert.equal((await put(env, 2, { v: 3 })).status, 200);
  assert.equal((await (await call(env, "/api/state")).json()).version, 3);
});

test("the loser of a race can merge and win the next round", async () => {
  const env = envWith();
  await put(env, 0, { who: "laptop" });
  const rejected = await (await put(env, 0, { who: "phone" })).json();
  const merged = { who: "both" };
  assert.equal((await put(env, rejected.version, merged)).status, 200);
  assert.deepEqual((await (await call(env, "/api/state")).json()).payload, merged);
});

test("a malformed body is rejected rather than stored", async () => {
  const env = envWith();
  const res = await call(env, "/api/state", { method: "PUT", body: "not json" });
  assert.equal(res.status, 400);
  assert.equal((await (await call(env, "/api/state")).json()).version, 0);
});

test("a missing baseVersion is treated as a first write, not as a free pass", async () => {
  const env = envWith();
  await put(env, 0, { first: true });
  const res = await call(env, "/api/state", { method: "PUT", body: JSON.stringify({ payload: { second: true } }) });
  assert.equal(res.status, 409);
});

test("the proxy refuses anything that is not http(s)", async () => {
  const env = envWith();
  for (const bad of ["file:///etc/passwd", "ftp://example.com/x", "not a url"]) {
    const res = await call(env, "/api/fetch?url=" + encodeURIComponent(bad));
    assert.equal(res.status, 400, bad);
  }
  assert.equal((await call(env, "/api/fetch")).status, 400);
});

test("the proxy needs the key like everything else", async () => {
  const res = await call(envWith(), "/api/fetch?url=https://example.com/", {}, null);
  assert.equal(res.status, 401);
});

test("an unknown endpoint is a 404, not the page", async () => {
  const res = await call(envWith(), "/api/nonsense");
  assert.equal(res.status, 404);
});

test("a database that throws becomes a 502, not a blank page", async () => {
  const env = envWith({ prepare: () => { throw new Error("d1 is down"); } });
  const res = await call(env, "/api/state");
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /d1 is down/);
});
