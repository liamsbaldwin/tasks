import { test } from "node:test";
import assert from "node:assert/strict";
import { diff, words, written, localTime, device } from "../worker/src/history.js";

const base = () => ({
  ideas: [{ id: "a", title: "First thought" }], readings: [], drafts: { a: "<p>Hello there world</p>" },
  notes: {}, days: {}, credited: {}, roadmap: "",
  mtimes: { "idea:a": 100, "draft:a": 100 }, ctimes: {}, tombs: {},
});

test("words reads through HTML and ignores ids", () => {
  assert.equal(words("<p>It&rsquo;s a <em>well-made</em> thing&nbsp;here</p>"), 5);
  assert.equal(words({ id: "abc123", title: "Two words" }), 2);
  assert.equal(words(undefined), 0);
});

test("nothing moved, nothing recorded", () => {
  assert.deepEqual(diff(base(), base()), []);
});

test("an edit carries its time, its size and how much it changed", () => {
  const next = base();
  next.drafts.a = "<p>Hello there wide world, again</p>";
  next.mtimes["draft:a"] = 200;
  assert.deepEqual(diff(base(), next),
    [{ at: 200, key: "draft:a", kind: "draft", action: "edit", words: 5, delta: 2 }]);
});

test("births and deaths are told apart from edits", () => {
  const next = base();
  next.ideas.push({ id: "b", title: "Second" });
  next.mtimes["idea:b"] = 300;
  delete next.drafts.a; delete next.mtimes["draft:a"];
  next.tombs["draft:a"] = 250;
  assert.deepEqual(diff(base(), next).map(e => [e.key, e.action, e.delta]),
    [["draft:a", "delete", -3], ["idea:b", "create", 1]]);
});

test("a record the server already had at that time is not counted again", () => {
  const prev = base();
  prev.ideas.push({ id: "b", title: "From the phone" });
  prev.mtimes["idea:b"] = 300;
  const merged = structuredClone(prev);
  merged.mtimes["idea:a"] = 400; merged.ideas[0].title = "First thought, renamed";
  assert.deepEqual(diff(prev, merged).map(e => e.key), ["idea:a"]);
});

test("an older timestamp is not news", () => {
  const next = base();
  next.mtimes["draft:a"] = 50;
  next.drafts.a = "stale";
  assert.deepEqual(diff(base(), next), []);
});

test("local time is the writer's wall clock", () => {
  const t = Date.UTC(2026, 6, 1, 23, 30);
  assert.equal(localTime(t, "America/New_York"), "2026-07-01T19:30");
  assert.equal(localTime(t, "Europe/Berlin"), "2026-07-02T01:30");
  assert.equal(localTime(t, "Not/AZone"), null);
});

test("devices are named coarsely", () => {
  assert.equal(device("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36"), "Chrome on Mac");
  assert.equal(device("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1"), "Safari on iPhone");
  assert.equal(device(""), null);
});

test("a note on the Notes page is part of the history", () => {
  const prev = { ...base(), tangents: {} };
  const next = { ...base(), tangents: { t1: { title: "Aside", html: "<p>Three more words</p>", fns: {} } },
                 mtimes: { ...base().mtimes, "tangent:t1": 400 } };
  assert.deepEqual(diff(prev, next),
    [{ at: 400, key: "tangent:t1", kind: "tangent", action: "create", words: 4, delta: 4 }]);
});

test("a source's looked-up details are not writing; its notes are", () => {
  const src = { id: "n1", kind: "paper", title: "Learning from Schelling's Strategy of Conflict",
    authors: ["Roger B. Myerson"], year: 2009, venue: "Journal of Economic Literature",
    doi: "10.1257/jel.47.4.1109", url: "https://home.uchicago.edu/~rmyerson/stratofc2010.pdf",
    status: "queued", note: "" };
  assert.equal(written("reading", src), 0);
  assert.equal(written("reading", { ...src, note: "<p>Focal points matter here</p>" }), 4);
  assert.equal(written("idea", { id: "a", title: "Two words", stage: "drafting", dek: "", deck: "One more" }), 4);
  assert.equal(written("credit", "2026-10-30"), 0);

  const next = base();
  next.readings.push(src);
  next.mtimes["reading:n1"] = 300;
  assert.deepEqual(diff(base(), next).map(e => [e.key, e.action, e.words, e.delta]),
    [["reading:n1", "create", 0, 0]]);
});
