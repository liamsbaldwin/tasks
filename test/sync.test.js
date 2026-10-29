import { test } from "node:test";
import assert from "node:assert/strict";
import { merge, stamp, normalise, prune, sameContent, emptyPayload, keyOf, linkHref, pastedLink } from "../src/sync.js";

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

/* ==================== what the second version added ==================== */

test("footnotes, calendar days and credits merge per record, like everything else", () => {
  const a = at(100, p => {
    p.notes = { essay1: { f1: "a note" } };
    p.days = { "2026-10-23": "Edit §4" };
    p.credited = { "reading:r1": "2026-05-01" };
    p.ideas = [idea("essay1", "An essay")];
    return p;
  });
  const b = structuredClone(a);
  b.days["2026-10-24"] = "Record the intro";              // the phone adds a day
  const bStamped = stamp(a, b, 200);
  const aLater = structuredClone(a);
  aLater.notes.essay1.f2 = "another note";                // the laptop adds a footnote
  const aStamped = stamp(a, aLater, 300);

  const merged = merge(aStamped, bStamped);
  assert.deepEqual(merged.notes.essay1, { f1: "a note", f2: "another note" });
  assert.deepEqual(Object.keys(merged.days).sort(), ["2026-10-23", "2026-10-24"]);
  assert.equal(merged.credited["reading:r1"], "2026-05-01");
});

test("the same day written on both devices: the later writing wins", () => {
  const base = at(100, p => { p.days = { "2026-10-23": "first" }; return p; });
  const x = stamp(base, { ...structuredClone(base), days: { "2026-10-23": "from the laptop" } }, 200);
  const y = stamp(base, { ...structuredClone(base), days: { "2026-10-23": "from the phone" } }, 300);
  assert.equal(merge(x, y).days["2026-10-23"], "from the phone");
  assert.equal(merge(y, x).days["2026-10-23"], "from the phone");
});

test("clearing a day removes it rather than leaving a blank", () => {
  const before = at(100, p => { p.days = { "2026-10-23": "something" }; return p; });
  const after = stamp(before, { ...structuredClone(before), days: {} }, 200);
  assert.equal(after.tombs[keyOf.day("2026-10-23")], 200);
  const merged = merge(after, before);
  assert.equal("2026-10-23" in merged.days, false);
});

test("the log is a tally: the bigger count of each day and kind wins", () => {
  const a = normalise({ log: [{ d: "2026-10-20", kind: "reading" }, { d: "2026-10-20", kind: "reading" }] });
  const b = normalise({ log: [{ d: "2026-10-20", kind: "reading" }, { d: "2026-10-21", kind: "essay" }] });
  const m = merge(a, b);
  assert.equal(m.log.filter(e => e.d === "2026-10-20").length, 2);   // not three, not one
  assert.equal(m.log.filter(e => e.d === "2026-10-21").length, 1);
  assert.deepEqual(merge(b, a).log, m.log);                          // and either way round
});

test("the log survives a round of syncing without growing", () => {
  const a = normalise({ log: [{ d: "2026-10-20", kind: "reading" }] });
  assert.deepEqual(merge(merge(a, a), a).log, a.log);
});

test("junk in the log is dropped, not carried about", () => {
  const n = normalise({ log: [null, { d: "2026-10-20" }, { kind: "reading" }, { d: "x", kind: "nonsense" },
                               { d: "2026-10-20", kind: "essay" }] });
  assert.deepEqual(n.log, [{ d: "2026-10-20", kind: "essay" }]);
});

test("footnotes do not outlive the essay they belong to", () => {
  const before = at(100, p => {
    p.ideas = [idea("a", "A")];
    p.drafts = { a: "<p>words</p>" };
    p.notes = { a: { f1: "a note" } };
    return p;
  });
  const after = stamp(before, { ...structuredClone(before), ideas: [] }, 200);
  const merged = merge(after, before);
  assert.deepEqual(merged.ideas, []);
  assert.equal("a" in merged.notes, false);
  assert.equal("a" in merged.drafts, false);
});

test("sameContent notices a calendar entry, a footnote or a credit", () => {
  const base = normalise({ ideas: [idea("a", "A")] });
  for (const change of [
    p => { p.days = { "2026-10-23": "x" }; },
    p => { p.notes = { a: { f1: "x" } }; },
    p => { p.credited = { "essay:a": "2026-10-23" }; },
    p => { p.log = [{ d: "2026-10-23", kind: "essay" }]; },
  ]) {
    const other = structuredClone(base);
    change(other);
    assert.equal(sameContent(base, other), false);
  }
});

const note = (html, extra = {}) => ({ title: "", html, fns: {}, ...extra });

test("notes on the Notes page sync per note, and a deleted one stays deleted", () => {
  const base = at(100, p => { p.tangents = { t1: note("<p>first</p>"), t2: note("<p>second</p>") }; return p; });
  const phone = stamp(base, { ...base, tangents: { t1: note("<p>first, <b>edited</b></p>"), t2: note("<p>second</p>") } }, 200);
  const laptop = stamp(base, { ...base, tangents: { t1: note("<p>first</p>") } }, 300);
  const m = merge(phone, laptop);
  assert.deepEqual(m.tangents, { t1: note("<p>first, <b>edited</b></p>") });
  assert.deepEqual(merge(laptop, phone).tangents, m.tangents);
});

test("notes stand alone: they outlive every idea and count for nothing", () => {
  const p = at(100, q => { q.ideas = [idea("a", "A")]; q.tangents = { t1: note("<p>a thought</p>") }; return q; });
  const out = merge(stamp(p, { ...p, ideas: [] }, 200), p);
  assert.deepEqual(out.tangents, { t1: note("<p>a thought</p>") });
  assert.deepEqual(out.log, []);
  assert.deepEqual(out.credited, {});
  assert.equal(sameContent(p, { ...p, tangents: {} }), false);
  assert.deepEqual(normalise({ tangents: "junk" }).tangents, {});
});

test("a note's title, footnotes and dates travel with it, and the later edit wins", () => {
  const base = at(100, p => { p.tangents = { t1: note("<p>body</p>", { created: 100 }) }; return p; });
  const later = note('<p>body<sup class="fnref" data-fn="f1">1</sup></p>',
    { title: "On maps", fns: { f1: "<i>see</i> Bettencourt" }, created: 100, updated: 200 });
  const phone = stamp(base, { ...base, tangents: { t1: later } }, 200);
  const laptop = stamp(base, { ...base, tangents: { t1: note("<p>body, longer</p>", { created: 100, updated: 150 }) } }, 150);
  const m = merge(laptop, phone);
  assert.deepEqual(m.tangents.t1, later);
  assert.deepEqual(merge(phone, laptop).tangents, m.tangents);
});

test("a note's footnotes are its own: not an essay's, and gone with the note", () => {
  const p = at(100, q => {
    q.ideas = [idea("a", "A")]; q.drafts = { a: "<p>essay</p>" };
    q.tangents = { t1: note("<p>x</p>", { fns: { f1: "aside" } }) };
    return q;
  });
  assert.deepEqual(p.notes, {});
  const gone = merge(stamp(p, { ...p, tangents: {} }, 200), p);
  assert.deepEqual(gone.tangents, {});
  assert.deepEqual(gone.notes, {});
  assert.deepEqual(normalise({ tangents: { t1: { html: "", fns: { f1: 3, f2: "ok" } } } }).tangents.t1.fns, { f2: "ok" });
});

test("the first notes, saved as plain text, become paragraphs with their line breaks", () => {
  const n = normalise({ tangents: {
    t1: "old thought",
    t2: 7,
    t3: { text: "one\ntwo\n\n<three> & four", title: "T", created: "soon", updated: 5 },
  } });
  assert.deepEqual(n.tangents, {
    t1: { title: "", html: "<p>old thought</p>", fns: {} },
    t3: { title: "T", html: "<p>one<br>two</p><p>&lt;three&gt; &amp; four</p>", fns: {}, updated: 5 },
  });
  // and reading them that way is not itself an edit
  const was = { tangents: { t1: "old thought", t3: { title: "", text: "a\nb" } } };
  assert.deepEqual(stamp(was, normalise(was), 500).mtimes, {});
});

test("a typed link becomes a web or mail address, or nothing", () => {
  assert.equal(linkHref("https://www.jstor.org/stable/724011"), "https://www.jstor.org/stable/724011");
  assert.equal(linkHref("  example.com/a?b=1#c "), "https://example.com/a?b=1#c");
  assert.equal(linkHref("www.nature.com"), "https://www.nature.com");
  assert.equal(linkHref("example.com:8080/x"), "https://example.com:8080/x");
  assert.equal(linkHref("mailto:liam@example.com"), "mailto:liam@example.com");
  for (const bad of ["javascript:alert(1)", "JavaScript:void(0)", "data:text/html,hi", "ftp://x.org",
                     "vbscript:x", "not a link", "word", "http://", ""])
    assert.equal(linkHref(bad), bad === "" ? null : null, bad);
});

test("links survive saving and syncing in every kind of writing", () => {
  const a = '<p>see <a href="https://example.com/x">this</a></p>';
  const base = at(100, p => {
    p.ideas = [idea("i", "I")]; p.drafts = { i: a }; p.roadmap = a;
    p.readings = [{ ...book("r", "R"), note: a }];
    p.tangents = { t1: note(a, { fns: { f1: a } }) };
    return p;
  });
  const m = merge(base, emptyPayload());
  assert.equal(m.drafts.i, a);
  assert.equal(m.roadmap, a);
  assert.equal(m.readings[0].note, a);
  assert.equal(m.tangents.t1.html, a);
  assert.equal(m.tangents.t1.fns.f1, a);
  // an edited address is an edit like any other, and the later one wins
  const moved = a.replace("example.com/x", "example.org/y");
  const phone = stamp(base, { ...base, tangents: { t1: note(moved, { fns: { f1: a } }) } }, 200);
  assert.equal(merge(base, phone).tangents.t1.html, moved);
});

test("a paste becomes a link only when it is nothing but an address", () => {
  assert.equal(pastedLink(" https://example.com/a?b=1 \n"), "https://example.com/a?b=1");
  assert.equal(pastedLink("www.nature.com/articles/x"), "https://www.nature.com/articles/x");
  assert.equal(pastedLink("mailto:liam@example.com"), "mailto:liam@example.com");
  for (const not of ["see https://example.com", "https://example.com and more", "e.g.", "example.com",
                     "javascript:alert(1)", "https://", "", "Two lines\nhttps://example.com"])
    assert.equal(pastedLink(not), null, not);
});

test("the roadmap's footnotes sync as their own record, and emptying them is not a deletion", () => {
  const base = at(100, p => { p.roadmap = '<p>plan<sup class="fnref" data-fn="f1">1</sup></p>'; p.roadmapFns = { f1: "why" }; return p; });
  assert.deepEqual(merge(base, emptyPayload()).roadmapFns, { f1: "why" });
  const edited = stamp(base, { ...base, roadmapFns: { f1: "why, <i>really</i>" } }, 200);
  assert.equal(edited.mtimes[keyOf.roadmapFns()], 200);
  assert.deepEqual(merge(base, edited).roadmapFns, { f1: "why, <i>really</i>" });
  const emptied = stamp(base, { ...base, roadmapFns: {} }, 300);
  assert.equal(emptied.tombs[keyOf.roadmapFns()], undefined);
  assert.deepEqual(merge(emptied, base).roadmapFns, {});
  assert.equal(sameContent(base, { ...base, roadmapFns: {} }), false);
  assert.deepEqual(normalise({ roadmapFns: { a: "x", b: 3 } }).roadmapFns, { a: "x" });
  assert.deepEqual(normalise({}).roadmapFns, {});
});

test("a source's footnotes live on the source, never on an essay", () => {
  const base = at(100, p => {
    p.ideas = [idea("a", "A")]; p.drafts = { a: "<p>essay</p>" };
    p.readings = [{ ...book("r", "R"), note: '<p>n<sup class="fnref" data-fn="f1">1</sup></p>', fns: { f1: "aside" } }];
    return p;
  });
  const m = merge(base, emptyPayload());
  assert.deepEqual(m.readings[0].fns, { f1: "aside" });
  assert.deepEqual(m.notes, {});
  const later = stamp(base, { ...base, readings: [{ ...base.readings[0], fns: { f1: "aside, longer" } }] }, 200);
  assert.deepEqual(merge(base, later).readings[0].fns, { f1: "aside, longer" });
});

test("an idea's description is part of the idea: it syncs with it, and the later edit wins", () => {
  const base = at(100, p => { p.ideas = [{ ...idea("a", "A"), dek: "" }, idea("b", "B")]; return p; });
  const phone = stamp(base, { ...base, ideas: [{ ...base.ideas[0], dek: "What legibility costs" }, base.ideas[1]] }, 200);
  const laptop = stamp(base, { ...base, ideas: [base.ideas[0], { ...base.ideas[1], title: "B prime" }] }, 300);
  const m = merge(phone, laptop);
  assert.equal(m.ideas.find(i => i.id === "a").dek, "What legibility costs");
  assert.equal(m.ideas.find(i => i.id === "b").title, "B prime");
  assert.deepEqual(merge(laptop, phone).ideas, m.ideas);
  assert.equal(sameContent(base, phone), false);
});

test("an update held while typing does not undo what was typed meanwhile", () => {
  // the server's answer, merged against the notebook as it stood before the keystrokes
  const before = at(100, p => { p.ideas = [{ ...idea("a", "A"), dek: "old" }]; return p; });
  const heldBack = merge(before, before);
  // then the typing, dated when it is folded in
  const typed = { ...before, ideas: [{ ...before.ideas[0], dek: "old, and new" }] };
  const landed = merge(stamp(before, typed, 200), heldBack);
  assert.equal(landed.ideas[0].dek, "old, and new");
  // and a genuinely newer edit from elsewhere still wins over an older local one
  const elsewhere = stamp(before, { ...before, ideas: [{ ...before.ideas[0], dek: "from the phone" }] }, 300);
  assert.equal(merge(stamp(before, typed, 200), elsewhere).ideas[0].dek, "from the phone");
});

test("words written each day count only what saves added, on the writer's day", async () => {
  const { wordsByDay } = await import("../src/sync.js");
  const day = ms => new Date(ms).toISOString().slice(0, 10);
  assert.deepEqual(wordsByDay([
    { at: Date.UTC(2026, 9, 28, 23), local: "2026-10-28T19:00", delta: 300 },
    { at: Date.UTC(2026, 9, 29, 1),  local: "2026-10-28T21:00", delta: 120 },
    { at: Date.UTC(2026, 9, 29, 2),  local: "2026-10-28T22:00", delta: -500 },   // a cut
    { at: Date.UTC(2026, 9, 29, 15), delta: 40 },                                // no time zone
    { at: Date.UTC(2026, 9, 29, 16), delta: 0 },
    null,
  ], day), { "2026-10-28": 420, "2026-10-29": 40 });
  assert.deepEqual(wordsByDay(undefined), {});
});

test("the calendar shades at 250, 500, 1,000 and 2,000 words", async () => {
  const { wordLevel } = await import("../src/sync.js");
  assert.deepEqual([0, 1, 249, 250, 499, 500, 999, 1000, 1999, 2000, 9000].map(wordLevel),
                   [0, 0, 0,   1,   1,   2,   2,   3,    3,    4,    4]);
});

test("days before the history began are filled in from the credit log", async () => {
  const { backfillFromLog } = await import("../src/sync.js");
  const log = [{ d: "2026-10-27", kind: "reading" }, { d: "2026-10-28", kind: "reading" },
               { d: "2026-10-28", kind: "essay" }, { d: "2026-10-28", kind: "video" },
               { d: "2026-10-29", kind: "reading" }];
  assert.deepEqual(backfillFromLog({ "2026-10-28": 300, "2026-10-29": 100 }, log, "2026-10-28"),
                   { "2026-10-27": 500, "2026-10-28": 2000, "2026-10-29": 100 });
  assert.equal(backfillFromLog({ "2026-10-28": 2600 }, log, "2026-10-28")["2026-10-28"], 2600);
  assert.deepEqual(backfillFromLog({}, log, undefined)["2026-10-29"], 500);   // no history at all
});
