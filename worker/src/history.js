/**
 * The edit history: one row per record per save, kept beside the notebook.
 *
 * The notebook row is overwritten on every sync, so on its own it can say when each
 * record was last touched and nothing about the writing in between. This keeps the in
 * between. On every accepted write the Worker compares the payload it is replacing with
 * the one it is storing, and every record whose timestamp moved becomes an event: what
 * it was, whether it was born, edited or deleted, when, and how many words it held
 * before and after.
 *
 * It works from the timestamps the client already keeps (src/sync.js), so the page does
 * not have to know the history exists. The time on an event is the device's own `mtime`
 * — when you typed, not when the push arrived — so a train journey offline still lands
 * on the hours it was written. The one thing lost offline is granularity: three saves of
 * the same essay with no push between them arrive as one edit, with their words summed.
 *
 * A merged copy pushed by a second device carries the first device's records at the
 * timestamps the server already holds, so they do not move and are not counted twice.
 */

/** The record kinds, as src/sync.js's keyOf spells them. Anything else is ignored. */
const KINDS = new Set(["idea", "reading", "draft", "note", "day", "credit", "roadmap"]);

function records(p) {
  const out = new Map();
  if (!p || typeof p !== "object") return out;
  for (const i of Array.isArray(p.ideas) ? p.ideas : [])       if (i && i.id) out.set(`idea:${i.id}`, i);
  for (const r of Array.isArray(p.readings) ? p.readings : []) if (r && r.id) out.set(`reading:${r.id}`, r);
  const each = (obj, kind) => {
    if (obj && typeof obj === "object") for (const [k, v] of Object.entries(obj)) out.set(`${kind}:${k}`, v);
  };
  each(p.drafts, "draft");
  each(p.notes, "note");
  each(p.days, "day");
  each(p.credited, "credit");
  if (typeof p.roadmap === "string") out.set("roadmap", p.roadmap);
  return out;
}

/** Every piece of text in a record, tags stripped: a draft is HTML, an idea a few fields. */
function text(v, out = []) {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) text(x, out);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (k !== "id") text(x, out);
  return out;
}

export function words(v) {
  if (v === undefined || v === null) return 0;
  const s = text(v).join(" ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, "x");
  const m = s.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}

const num = (obj, key) => (obj && Number.isFinite(obj[key]) ? obj[key] : 0);

/**
 * The events between two payloads, oldest first. `prev` is what the server held, `next`
 * what it is about to store.
 */
export function diff(prev, next) {
  const a = records(prev), b = records(next);
  const am = (prev && prev.mtimes) || {}, bm = (next && next.mtimes) || {};
  const at = (prev && prev.tombs) || {}, bt = (next && next.tombs) || {};
  const out = [];

  for (const key of new Set([...a.keys(), ...b.keys(), ...Object.keys(bt)])) {
    const kind = key.split(":")[0];
    if (!KINDS.has(kind)) continue;
    const before = a.has(key) ? words(a.get(key)) : 0;

    if (b.has(key)) {
      const when = num(bm, key);
      if (!when || when <= num(am, key)) continue;            // untouched, or already counted
      const after = words(b.get(key));
      out.push({ at: when, key, kind, action: a.has(key) ? "edit" : "create",
                 words: after, delta: after - before });
    } else {
      const when = num(bt, key);
      if (!when || when <= num(at, key)) continue;
      if (!a.has(key) && !num(am, key)) continue;            // a tombstone for something never seen here
      out.push({ at: when, key, kind, action: "delete", words: 0, delta: -before });
    }
  }
  return out.sort((x, y) => x.at - y.at || (x.key < y.key ? -1 : 1));
}

/** "2026-10-28T15:49" on the writer's wall clock, which is what time-of-day means. */
export function localTime(ms, tz) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || "UTC", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(ms)).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  } catch {
    return null;
  }
}

/** Good enough to tell the phone from the laptop, and Safari from Chrome, and no more. */
export function device(ua = "") {
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
           : /Macintosh|Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows"
           : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Firefox\/|FxiOS/.test(ua) ? "Firefox"
           : /Chrome\/|CriOS/.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return [br, os].filter(Boolean).join(" on ") || null;
}

const VALID_TZ = tz => typeof tz === "string" && tz.length <= 64 && localTime(0, tz) !== null;

/**
 * Write the events for one accepted save. Never throws: the history is a bonus, and a
 * missing table or a failed insert must not turn a good sync into an error.
 */
export async function record(env, request, prev, next, version) {
  try {
    const events = diff(prev, next);
    if (!events.length) return 0;
    const tzHeader = request.headers.get("x-timezone");
    const tz = VALID_TZ(tzHeader) ? tzHeader : null;
    const dev = device(request.headers.get("user-agent") || "");
    const received = new Date().toISOString();
    const sql = "INSERT INTO events (at, local, tz, key, kind, action, words, delta, device, version, received) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    await env.DB.batch(events.map(e => env.DB.prepare(sql).bind(
      e.at, tz ? localTime(e.at, tz) : null, tz, e.key, e.kind, e.action, e.words, e.delta, dev, version, received)));
    return events.length;
  } catch (err) {
    console.error("history not recorded:", err && err.message || err);
    return 0;
  }
}

/** The history, oldest first, for the Progress page or an export. */
export async function list(env, url) {
  const since = Number(url.searchParams.get("since")) || 0;
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 5000, 1), 10000);
  const res = await env.DB.prepare(
    "SELECT id, at, local, tz, key, kind, action, words, delta, device FROM events " +
    "WHERE at > ? ORDER BY at, id LIMIT ?").bind(since, limit).all();
  return res.results || [];
}
