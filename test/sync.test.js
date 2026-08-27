import { test } from "node:test";
import assert from "node:assert/strict";
import { merge, stamp, normalise, prune, sameContent, emptyPayload, keyOf } from "../src/sync.js";

const idea = (id, title) => ({ id, title, blurb: "", stage: "reading", essay: { deck: "" } });
const book = (id, title) => ({ id, title, kind: "paper", status: "unread", ideas: [] });

/** A payload as it would look after being edited at time t. */
function at(t, build) {
  const p = build(emptyPayload());
  return stamp(emptyPayload(), p, t);
}

test("normalise accepts the v1 shape that predates syncing", () => {
  const v1 = { ideas: [idea("a", "A")], readings: [], drafts: { a: "hello" }, roadmap: "plan" };
  const n = normalise(v1);
  assert.deepEqual(n.mtimes, {});
  assert.deepEqual(n.tombs, {});
  assert.equal(n.drafts.a, "hello");
  assert.equal(n.roadmap, "plan");
});

test("normalise drops junk rather than throwing", () => {
  const n = normalise({ ideas: [null, { title: "no id" }, idea("a", "A")], readings: "nope", roadmap: 7 });
  assert.equal(n.ideas.length, 1);
  assert.deepEqual(n.readings, []);
  assert.equal(n.roadmap, "");
});

test("stamp dates only what changed", () => {
  const before = at(100, p => { p.ideas = [idea("a", "A"), idea("b", "B")]; return p; });
  const after = structuredClone(before);
  after.ideas[1].title = "B prime";
  const out = stamp(before, after, 200);
  assert.equal(out.mtimes[keyOf.idea("a")], 100);
  assert.equal(out.mtimes[keyOf.idea("b")], 200);
});

test("stamp buries what was removed", () => {
  const before = at(100, p => { p.ideas = [idea("a", "A"), idea("b", "B")]; return p; });
  const after = structuredClone(before);
  after.ideas = after.ideas.filter(i => i.id !== "b");
  const out = stamp(before, after, 200);
  assert.equal(out.tombs[keyOf.idea("b")], 200);
  assert.equal(out.mtimes[keyOf.idea("b")], undefined);
});

test("an emptied roadmap is a blank page, not a deletion", () => {
  const before = at(100, p => { p.roadmap = "the plan"; return p; });
  const out = stamp(before, { ...before, roadmap: "" }, 200);
  assert.equal(out.tombs[keyOf.roadmap()], undefined);
  assert.equal(out.mtimes[keyOf.roadmap()], 200);
  assert.equal(merge(out, before).roadmap, "");
});

test("edits to different records both survive — the whole point", () => {
  const base = at(100, p => {
    p.ideas = [idea("a", "A"), idea("b", "B")];
    p.drafts = { a: "essay a", b: "essay b" };
    return p;
  });
  const phone = stamp(base, { ...structuredClone(base), drafts: { a: "essay a", b: "essay b, much longer" } }, 300);
  const laptop = stamp(base, (() => { const p = structuredClone(base); p.ideas[0].title = "A revised"; return p; })(), 200);

  const m = merge(laptop, phone);
  assert.equal(m.drafts.b, "essay b, much longer");
  assert.equal(m.ideas.find(i => i.id === "a").title, "A revised");
});

test("the same record edited on both sides: the later edit wins", () => {
  const base = at(100, p => { p.drafts = { a: "start" }; p.ideas = [idea("a", "A")]; return p; });
  const early = stamp(base, { ...structuredClone(base), drafts: { a: "from the laptop" } }, 200);
  const late  = stamp(base, { ...structuredClone(base), drafts: { a: "from the phone" } }, 300);
  assert.equal(merge(early, late).drafts.a, "from the phone");
  assert.equal(merge(late, early).drafts.a, "from the phone");
});

test("a delete on one device is not resurrected by the other", () => {
  const base = at(100, p => { p.readings = [book("r1", "Paper"), book("r2", "Book")]; return p; });
  const deleted = stamp(base, (() => {
    const p = structuredClone(base); p.readings = p.readings.filter(r => r.id !== "r2"); return p;
  })(), 200);
  // The other device never heard about it and still has both.
  const m = merge(base, deleted);
  assert.deepEqual(m.readings.map(r => r.id), ["r1"]);
  assert.deepEqual(merge(deleted, base).readings.map(r => r.id), ["r1"]);
});

test("but re-adding after a delete sticks", () => {
  const base = at(100, p => { p.readings = [book("r1", "Paper")]; return p; });
  const deleted = stamp(base, { ...structuredClone(base), readings: [] }, 200);
  const readded = stamp(deleted, { ...structuredClone(deleted), readings: [book("r1", "Paper")] }, 300);
  assert.deepEqual(merge(base, readded).readings.map(r => r.id), ["r1"]);
  assert.deepEqual(merge(readded, base).readings.map(r => r.id), ["r1"]);
});

test("an addition on either side arrives", () => {
  const base = at(100, p => { p.ideas = [idea("a", "A")]; return p; });
  const added = stamp(base, (() => {
    const p = structuredClone(base); p.ideas.push(idea("z", "Z")); p.drafts.z = ""; return p;
  })(), 200);
  assert.deepEqual(merge(base, added).ideas.map(i => i.id), ["a", "z"]);
  assert.deepEqual(merge(added, base).ideas.map(i => i.id), ["a", "z"]);
});

test("merge agrees on content whichever way round it is called", () => {
  const base = at(100, p => {
    p.ideas = [idea("a", "A"), idea("b", "B"), idea("c", "C")];
    p.readings = [book("r1", "One"), book("r2", "Two")];
    p.drafts = { a: "a", b: "b", c: "c" };
    p.roadmap = "plan";
    return p;
  });
  const x = stamp(base, (() => {
    const p = structuredClone(base);
    p.ideas = p.ideas.filter(i => i.id !== "b");
    p.roadmap = "plan, revised";
    return p;
  })(), 300);
  const y = stamp(base, (() => {
    const p = structuredClone(base);
    p.readings.push(book("r3", "Three"));
    p.drafts.c = "c, longer";
    return p;
  })(), 200);

  const ab = merge(x, y), ba = merge(y, x);
  assert.ok(sameContent(ab, ba), "content should not depend on the order of the arguments");
  assert.equal(ab.roadmap, "plan, revised");
  assert.deepEqual(ab.readings.map(r => r.id).sort(), ["r1", "r2", "r3"]);
  assert.equal(ab.ideas.find(i => i.id === "b"), undefined);
  assert.equal(ab.drafts.c, "c, longer");
});

test("merging is idempotent", () => {
  const base = at(100, p => { p.ideas = [idea("a", "A")]; p.drafts = { a: "x" }; return p; });
  const other = stamp(base, { ...structuredClone(base), drafts: { a: "y" } }, 200);
  const once = merge(base, other);
  assert.ok(sameContent(once, merge(once, other)));
  assert.ok(sameContent(once, merge(once, once)));
});

test("a device carrying only the old untimestamped file loses to one that has synced", () => {
  const v1 = { ideas: [idea("a", "Old title")], readings: [], drafts: { a: "old" }, roadmap: "" };
  const synced = at(500, p => { p.ideas = [idea("a", "New title")]; p.drafts = { a: "new" }; return p; });
  const m = merge(v1, synced);
  assert.equal(m.ideas[0].title, "New title");
  assert.equal(m.drafts.a, "new");
});

test("a record only the old file has is kept, not silently dropped", () => {
  const v1 = { ideas: [idea("a", "A"), idea("keeper", "Only here")], readings: [], drafts: {}, roadmap: "" };
  const synced = at(500, p => { p.ideas = [idea("a", "A")]; return p; });
  assert.ok(merge(v1, synced).ideas.some(i => i.id === "keeper"));
  assert.ok(merge(synced, v1).ideas.some(i => i.id === "keeper"));
});

test("a draft does not outlive its idea", () => {
  const base = at(100, p => { p.ideas = [idea("a", "A")]; p.drafts = { a: "essay" }; return p; });
  const gone = stamp(base, { ...structuredClone(base), ideas: [], drafts: {} }, 200);
  const m = merge(base, gone);
  assert.deepEqual(m.ideas, []);
  assert.deepEqual(m.drafts, {});
});

test("the list keeps the order of the side doing the merge", () => {
  const base = at(100, p => { p.ideas = [idea("a", "A"), idea("b", "B")]; return p; });
  const other = stamp(base, (() => {
    const p = structuredClone(base); p.ideas.push(idea("c", "C")); return p;
  })(), 200);
  assert.deepEqual(merge(base, other).ideas.map(i => i.id), ["a", "b", "c"]);
});

test("prune drops tombstones older than the window and keeps the rest", () => {
  const now = 10_000_000_000;
  const p = normalise({ tombs: { "idea:old": now - 40 * 864e5, "idea:new": now - 864e5 } });
  const out = prune(p, now);
  assert.equal(out.tombs["idea:old"], undefined);
  assert.ok(out.tombs["idea:new"]);
});

test("sameContent ignores timestamps", () => {
  const a = at(100, p => { p.ideas = [idea("a", "A")]; return p; });
  const b = at(900, p => { p.ideas = [idea("a", "A")]; return p; });
  assert.ok(sameContent(a, b));
  assert.ok(!sameContent(a, at(100, p => { p.ideas = [idea("a", "B")]; return p; })));
});

/*
 * The cases above are the ones I thought of. This one is the ones I did not: two
 * devices editing at random, syncing at random moments, must always agree afterwards.
 */
test("two devices editing at random converge once both have synced", () => {
  const rng = (seed => () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)(7);
  const pickOf = arr => arr[Math.floor(rng() * arr.length)];

  for (let round = 0; round < 200; round++) {
    let clock = 1000;
    let seed = at(clock, p => {
      p.ideas = [idea("a", "A"), idea("b", "B")];
      p.readings = [book("r1", "One"), book("r2", "Two")];
      p.drafts = { a: "", b: "" };
      return p;
    });
    let A = structuredClone(seed), B = structuredClone(seed);

    const edit = dev => {
      const before = dev;
      const p = structuredClone(dev);
      switch (pickOf(["idea", "draft", "reading", "add-idea", "add-reading", "del-idea", "del-reading", "roadmap"])) {
        case "idea":        if (p.ideas.length) pickOf(p.ideas).title = "t" + clock; break;
        case "draft":       if (p.ideas.length) p.drafts[pickOf(p.ideas).id] = "d" + clock; break;
        case "reading":     if (p.readings.length) pickOf(p.readings).title = "r" + clock; break;
        case "add-idea":    { const id = "i" + clock; p.ideas.push(idea(id, id)); p.drafts[id] = ""; break; }
        case "add-reading": { const id = "b" + clock; p.readings.push(book(id, id)); break; }
        case "del-idea":    if (p.ideas.length) { const g = pickOf(p.ideas);
                              p.ideas = p.ideas.filter(i => i !== g); delete p.drafts[g.id]; } break;
        case "del-reading": if (p.readings.length) { const g = pickOf(p.readings);
                              p.readings = p.readings.filter(r => r !== g); } break;
        case "roadmap":     p.roadmap = "plan " + clock; break;
      }
      return stamp(before, p, ++clock);
    };

    for (let step = 0; step < 12; step++) {
      if (rng() < 0.45) A = edit(A); else B = edit(B);
      if (rng() < 0.25) { const m = merge(A, B); A = m; B = merge(B, m); }   // a sync happens
    }
    // Both devices come online and exchange once more.
    const finalA = merge(A, B), finalB = merge(B, A);
    assert.ok(sameContent(finalA, finalB),
      `round ${round} diverged:\n${JSON.stringify(finalA)}\n${JSON.stringify(finalB)}`);
    // And nothing that was deleted came back.
    for (const key of Object.keys(finalA.tombs)) {
      const [kind, id] = key.split(":");
      if (kind === "idea")    assert.ok(!finalA.ideas.some(i => i.id === id), `${key} rose again`);
      if (kind === "reading") assert.ok(!finalA.readings.some(r => r.id === id), `${key} rose again`);
    }
  }
});
