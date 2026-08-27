/**
 * Merging two copies of the notebook.
 *
 * The server is deliberately stupid: it stores one blob and a version number, and
 * refuses a write whose base version is stale. All the thinking happens here, on the
 * client, which means it can be tested in Node without a network or a database.
 *
 * The model is last-write-wins *per record*, not per document. Whole-document LWW is
 * the obvious thing and it is wrong: write two paragraphs of an essay on the train,
 * fix a typo in a different idea on the laptop, and one of them vanishes. Per-record
 * means only a genuine collision — the same essay edited in two places at once, with
 * no sync in between — can lose anything, which is the honest floor without going all
 * the way to CRDTs.
 *
 * Deletions carry tombstones. Without them a delete is indistinguishable from "this
 * device has not heard about that record yet", and anything you delete on the phone
 * comes back from the dead the next time the laptop syncs.
 */

/** Every record in the notebook gets one of these keys, and one timestamp against it. */
export const keyOf = {
  idea:    id => `idea:${id}`,
  reading: id => `reading:${id}`,
  draft:   id => `draft:${id}`,
  roadmap: () => "roadmap",
};

export function emptyPayload() {
  return { ideas: [], readings: [], drafts: {}, roadmap: "", mtimes: {}, ctimes: {}, tombs: {} };
}

/**
 * A payload must never share objects with the live state it came from: the app edits its
 * ideas in place, and a "before" copy that quietly edits itself alongside them can see no
 * difference between two saves, so nothing is ever dated and nothing is ever synced.
 */
export const clone = v =>
  (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

/**
 * Accept anything that has been stored before, including the v1 shape that predates
 * syncing and has no timestamps at all. An untimestamped record is treated as
 * infinitely old, so a device that has actually seen the record wins over one that is
 * merely carrying an old local file.
 */
export function normalise(p) {
  const e = emptyPayload();
  if (!p || typeof p !== "object") return e;
  const out = {
    ideas:    Array.isArray(p.ideas)    ? clone(p.ideas.filter(x => x && x.id))    : e.ideas,
    readings: Array.isArray(p.readings) ? clone(p.readings.filter(x => x && x.id)) : e.readings,
    drafts:   p.drafts   && typeof p.drafts === "object"   ? clone(p.drafts) : e.drafts,
    roadmap:  typeof p.roadmap === "string" ? p.roadmap : e.roadmap,
    mtimes:   p.mtimes   && typeof p.mtimes === "object"   ? { ...p.mtimes } : e.mtimes,
    ctimes:   p.ctimes   && typeof p.ctimes === "object"   ? { ...p.ctimes } : e.ctimes,
    tombs:    p.tombs    && typeof p.tombs  === "object"   ? { ...p.tombs }  : e.tombs,
  };
  // Records from before syncing have no creation date. Number them by the order they
  // are already in: sequence numbers sort below any real timestamp, so the list a
  // device has been looking at for months does not reshuffle the first time it syncs.
  canonical(out);
  let seq = 0;
  for (const key of records(out).keys()) if (!(key in out.ctimes)) out.ctimes[key] = ++seq;
  return canonical(out);
}

/*
 * Two devices must be able to compare payloads byte for byte — it is how each decides
 * whether it has anything to push — so the maps are always written in key order.
 * Object key order is not meaningful, but JSON.stringify makes it look like it is.
 */
const sortKeys = o => Object.fromEntries(Object.entries(o).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));
function canonical(p) {
  p.drafts = sortKeys(p.drafts);
  p.mtimes = sortKeys(p.mtimes);
  p.ctimes = sortKeys(p.ctimes);
  p.tombs  = sortKeys(p.tombs);
  return p;
}

/** The content of every record, flattened to one map, so two payloads can be compared. */
function records(p) {
  const out = new Map();
  for (const i of p.ideas)    out.set(keyOf.idea(i.id), i);
  for (const r of p.readings) out.set(keyOf.reading(r.id), r);
  for (const [id, html] of Object.entries(p.drafts)) out.set(keyOf.draft(id), html);
  out.set(keyOf.roadmap(), p.roadmap);
  return out;
}

const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);

/**
 * Date the records that changed between two saves. Called on every local save, so the
 * app never has to remember to touch a timestamp at a mutation site — and cannot
 * forget to. A record that appeared is dated; one that vanished gets a tombstone.
 */
export function stamp(prev, next, now = Date.now()) {
  const a = records(normalise(prev)), b = records(normalise(next));
  const was = normalise(prev);
  const out = normalise(next);
  out.mtimes = { ...was.mtimes, ...out.mtimes };
  out.ctimes = { ...was.ctimes, ...out.ctimes };
  out.tombs  = { ...was.tombs,  ...out.tombs };

  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const had = a.has(key), has = b.has(key);
    // The roadmap is always "present" — an empty one is a blank page, not a deletion.
    if (had && !has && key !== keyOf.roadmap()) {
      out.tombs[key] = now;
      delete out.mtimes[key];
    } else if (!same(a.get(key), b.get(key))) {
      out.mtimes[key] = now;
      delete out.tombs[key];
    }
    if (!had && has) out.ctimes[key] = now;      // born now, wherever normalise numbered it
  }
  return canonical(out);
}

const at = (p, key) => p.mtimes[key] || 0;
const buried = (p, key) => p.tombs[key] || 0;

/**
 * Which side owns a key. The later timestamp wins; with no timestamps on either side —
 * two copies of the pre-sync file, or one of them — the side that actually holds the
 * record wins, because absence with no tombstone behind it is not evidence of a delete.
 */
function winner(a, b, ra, rb, key) {
  const av = Math.max(at(a, key), buried(a, key));
  const bv = Math.max(at(b, key), buried(b, key));
  if (av !== bv) return av > bv ? 1 : -1;
  if (ra.has(key) !== rb.has(key)) return ra.has(key) ? 1 : -1;
  return 1;                                    // a tie keeps the local side
}

const alive = (p, key) => at(p, key) >= buried(p, key) && (at(p, key) > 0 || buried(p, key) === 0);

/**
 * Merge two payloads. Commutative in content — merge(x, y) and merge(y, x) agree on
 * every record — and only differ in the order of items that exist on one side alone.
 * `a` supplies the running order, so the device doing the merge does not see its list
 * reshuffle under it.
 */
export function merge(aRaw, bRaw) {
  const a = normalise(aRaw), b = normalise(bRaw);
  const ra = records(a), rb = records(b);
  const out = emptyPayload();

  const pick = key => {
    const w = winner(a, b, ra, rb, key) === 1 ? a : b;
    const src = w === a ? ra : rb;
    return { live: alive(w, key) && src.has(key), value: src.get(key),
             mtime: at(w, key), tomb: buried(w, key),
             // Both devices must agree on where a record sits in the list, so creation
             // date is the earliest either side knows of — not the winner's.
             ctime: Math.min(...[a.ctimes[key], b.ctimes[key]].filter(Number.isFinite)) };
  };

  const keys = new Set([...ra.keys(), ...rb.keys(),
                        ...Object.keys(a.tombs), ...Object.keys(b.tombs)]);

  for (const key of keys) {
    const { live, value, mtime, tomb, ctime } = pick(key);
    if (mtime) out.mtimes[key] = mtime;
    if (tomb)  out.tombs[key]  = tomb;
    if (Number.isFinite(ctime)) out.ctimes[key] = ctime;
    if (!live) { delete out.mtimes[key]; continue; }
    if (key === keyOf.roadmap()) out.roadmap = typeof value === "string" ? value : "";
    else if (key.startsWith("draft:")) out.drafts[key.slice(6)] = value;
  }

  // Lists run in creation order, which both devices compute identically — otherwise the
  // same notebook reads in a different order on the phone than on the laptop.
  const listOf = (kind, plural) => {
    const seen = new Set(), list = [];
    for (const src of [a[plural], b[plural]]) {
      for (const item of src) {
        const key = keyOf[kind](item.id);
        if (seen.has(key)) continue;
        seen.add(key);
        const { live, value, ctime } = pick(key);
        if (live) list.push({ value, ctime, id: item.id });
      }
    }
    return list
      .sort((x, y) => (x.ctime - y.ctime) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
      .map(x => x.value);
  };
  out.ideas    = listOf("idea", "ideas");
  out.readings = listOf("reading", "readings");

  // A draft belongs to an idea; when the idea goes, so does it.
  const ids = new Set(out.ideas.map(i => i.id));
  for (const id of Object.keys(out.drafts)) {
    if (!ids.has(id)) {
      delete out.drafts[id];
      delete out.mtimes[keyOf.draft(id)];
      delete out.ctimes[keyOf.draft(id)];
    }
  }
  return canonical(out);
}

/** True when the two payloads hold the same notebook, timestamps aside. */
export function sameContent(a, b) {
  const strip = p => { const n = normalise(p); return JSON.stringify({
    ideas: n.ideas, readings: n.readings, drafts: n.drafts, roadmap: n.roadmap }); };
  return strip(a) === strip(b);
}

/**
 * Tombstones cannot accumulate forever. A month is far longer than any device here
 * stays offline, and dropping one only risks a very stale device resurrecting a very
 * old deletion — which is recoverable, unlike an unbounded payload.
 */
export const TOMB_TTL = 30 * 24 * 60 * 60 * 1000;

export function prune(p, now = Date.now()) {
  const out = normalise(p);
  for (const [key, t] of Object.entries(out.tombs)) if (now - t > TOMB_TTL) delete out.tombs[key];
  const live = records(out);
  for (const key of Object.keys(out.ctimes)) {
    if (!live.has(key) && !(key in out.tombs)) { delete out.ctimes[key]; delete out.mtimes[key]; }
  }
  return canonical(out);
}
