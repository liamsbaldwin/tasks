import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as R from "../src/resolve.js";
import * as F from "./fixtures.js";

const PDFJS = await import("pdfjs-dist/legacy/build/pdf.mjs");
const getDocument = PDFJS.getDocument;
const FIX = "/tmp/claude-0/-home-user-tasks/0f2ceb55-1c1d-56b1-b8e9-db5451fc280b/scratchpad/fixtures/";
const file = (n) => ({ file: { name: n, arrayBuffer: async () => readFileSync(FIX + n).buffer } });

/* ---------------------------------------------------------------- identifiers */

test("finds a DOI in a PDF footer and strips the surrounding text", () => {
  const ids = R.parseIdentifiers("www.pnas.org/cgi/doi/10.1073/pnas.0610172104 PNAS | April 24, 2007");
  assert.equal(ids.doi, "10.1073/pnas.0610172104");
});

test("trims punctuation a sentence leaves welded to a DOI", () => {
  assert.equal(R.tidyDoi("10.1234/abc.def."), "10.1234/abc.def");
  assert.equal(R.tidyDoi("10.1234/abc(1)"), "10.1234/abc(1)");   // balanced, keep
  assert.equal(R.tidyDoi("10.1234/abc)"), "10.1234/abc");        // unbalanced, drop
});

test("reads arXiv ids from margin stamps and from URLs", () => {
  assert.equal(R.parseIdentifiers("arXiv:1911.01547v2 [cs.AI] 25 Nov 2019").arxiv, "1911.01547");
  assert.equal(R.parseIdentifiers("https://arxiv.org/pdf/2401.00001v3.pdf").arxiv, "2401.00001");
  assert.equal(R.parseIdentifiers("https://arxiv.org/abs/math.GT/0309136").arxiv, "math.GT/0309136");
});

test("does not mistake long digit runs in body text for an ISBN", () => {
  assert.equal(R.parseIdentifiers("the sample of 1234567890123 households").isbn, undefined);
  assert.equal(R.parseIdentifiers("ISBN: 978-0-300-07815-2").isbn, "9780300078152");
});

/* ---------------------------------------------------------------- text hygiene */

test("rejects PDF metadata that is really a build artefact", () => {
  for (const junk of ["Microsoft Word - final_v3.doc", "main.pdf", "pnas.0610172104.dvi",
                      "untitled", "structurelessness_FINAL_v3", ""]) {
    assert.equal(R.isJunkTitle(junk), true, `${junk} should be rejected`);
  }
  assert.equal(R.isJunkTitle("Seeing Like a State"), false);
  assert.equal(R.isJunkTitle("On the Measure of Intelligence"), false);
});

test("strips affiliation markers out of a byline", () => {
  const names = R.parseAuthorLine("Luís M. A. Bettencourt*†, José Lobo‡, Dirk Helbing§, and Geoffrey B. West*†¶");
  assert.deepEqual(names, ["Luís M. A. Bettencourt", "José Lobo", "Dirk Helbing", "Geoffrey B. West"]);
});

test("handles 'by X' and letter-spaced title-page capitals", () => {
  assert.deepEqual(R.parseAuthorLine("by Jo Freeman"), ["Jo Freeman"]);
  assert.deepEqual(R.parseAuthorLine("J A M E S   C .   S C O T T"), ["JAMES C. SCOTT"]);
});

test("tells a byline apart from a subtitle or an affiliation", () => {
  assert.equal(R.looksLikeAuthorLine("Geoffrey B. West, James H. Brown"), true);
  assert.equal(R.looksLikeAuthorLine("How Certain Schemes to Improve the Human Condition Have Failed"), false);
  assert.equal(R.looksLikeAuthorLine("Santa Fe Institute, 1399 Hyde Park Road"), false);
  assert.equal(R.looksLikeAuthorLine("fchollet@google.com"), false);
  assert.equal(R.looksLikeAuthorLine("Abstract"), false);
});

/* ---------------------------------------------------------------- real PDFs */

test("PDF with a DOI in the footer resolves through Crossref", async () => {
  const fetch = F.mockFetch([["api.crossref.org/works/10.1073", F.CROSSREF_PNAS]]);
  const m = await R.resolveSource(file("doi-footer.pdf"), { fetch, getDocument });
  assert.equal(m.confidence, "confirmed");
  assert.equal(m.title, "Growth, innovation, scaling, and the pace of life in cities");
  assert.equal(m.authors.length, 5);
  assert.equal(m.authors[0], "Luís M. A. Bettencourt");
  assert.equal(m.year, 2007);
  assert.equal(m.venue, "Proceedings of the National Academy of Sciences");
  assert.equal(m.needsReview, false);
});

test("arXiv stamp is read even though it is rotated up the margin", async () => {
  const fetch = F.mockFetch([["export.arxiv.org", F.ARXIV_CHOLLET]]);
  const m = await R.resolveSource(file("arxiv-stamp.pdf"), { fetch, getDocument });
  assert.equal(m.confidence, "confirmed");
  assert.equal(m.title, "On the Measure of Intelligence");
  assert.deepEqual(m.authors, ["François Chollet"]);
  assert.equal(m.year, 2019);
});

test("junk metadata + no DOI falls through to reading page 1, then confirms", async () => {
  const fetch = F.mockFetch([["api.crossref.org/works?", F.CROSSREF_QUERY_FREEMAN]]);
  const m = await R.resolveSource(file("junk-meta-no-doi.pdf"), { fetch, getDocument });
  assert.equal(m.title, "The Tyranny of Structurelessness");
  assert.deepEqual(m.authors, ["Jo Freeman"]);
  assert.equal(m.confidence, "confirmed");            // second candidate matched, not the first
  assert.equal(m.year, 1972);
});

test("a wrong Crossref hit is rejected rather than overwriting a good guess", async () => {
  const fetch = F.mockFetch([["api.crossref.org/works?", F.CROSSREF_QUERY_MISS]]);
  const m = await R.resolveSource(file("junk-meta-no-doi.pdf"), { fetch, getDocument });
  assert.equal(m.title, "The Tyranny of Structurelessness");
  assert.deepEqual(m.authors, ["Jo Freeman"]);
  // read off the page and never confirmed by a registry: usable, but it gets checked
  assert.equal(m.confidence, "guess");
  assert.equal(m.needsReview, true);
});

test("a title wrapped over two lines is kept whole", async () => {
  const fetch = F.mockFetch([["api.crossref.org/works/10.1126", F.CROSSREF_SCIENCE]]);
  const m = await R.resolveSource(file("two-line-title.pdf"), { fetch, getDocument });
  assert.equal(m.title, "A General Model for the Origin of Allometric Scaling Laws in Biology");
  assert.deepEqual(m.authors, ["Geoffrey B. West", "James H. Brown", "Brian J. Enquist"]);
});

test("word spacing on a letter-spaced title page comes from the x-gaps, not the string", async () => {
  const { getDocument: gd } = PDFJS;
  const pdf = await R.readPdf(new Uint8Array(readFileSync(FIX + "book-titlepage.pdf")), { getDocument: gd });
  const guess = R.guessFromLayout(pdf.pages[0]);
  assert.deepEqual(guess.authors, ["JAMES C. SCOTT"]);
});

test("a book title page: subtitle skipped, author below it, imprint read off the page", async () => {
  const fetch = F.mockFetch([["api.crossref.org", F.CROSSREF_QUERY_MISS]]);
  const m = await R.resolveSource(file("book-titlepage.pdf"), { fetch, getDocument });
  assert.equal(m.title, "Seeing Like a State");
  assert.deepEqual(m.authors, ["JAMES C. SCOTT"]);
  assert.equal(m.kind, "book");                       // a publisher line means a book
  assert.equal(m.venue, "Yale University Press");
});

test("a year is never invented when the document does not carry one", async () => {
  const fetch = F.mockFetch([]);
  const m = await R.resolveSource(file("junk-meta-no-doi.pdf"), { fetch, getDocument });
  assert.equal(m.year, null);
});

test("a scan with no text layer asks for help instead of inventing an author", async () => {
  const fetch = F.mockFetch([]);
  const m = await R.resolveSource(file("scanned-no-text.pdf"), { fetch, getDocument });
  assert.equal(m.confidence, "failed");
  assert.equal(m.needsReview, true);
  assert.equal(m.authors.length, 0);
  assert.equal(m.title, null);
  assert.match(provenance(m), /scan/i);
});

/* ---------------------------------------------------------------- links */

test("an arXiv link never downloads the PDF — the id is in the URL", async () => {
  let downloaded = false;
  const fetch = F.mockFetch([
    ["export.arxiv.org", F.ARXIV_CHOLLET],
    [/arxiv\.org\/pdf/, (downloaded = true, "CORS")],
  ]);
  const m = await R.resolveSource("https://arxiv.org/pdf/1911.01547v2.pdf", { fetch, getDocument });
  assert.equal(m.confidence, "confirmed");
  assert.deepEqual(m.authors, ["François Chollet"]);
});

test("a doi.org link resolves without touching the publisher", async () => {
  const fetch = F.mockFetch([["api.crossref.org/works/10.1073", F.CROSSREF_PNAS]]);
  const m = await R.resolveSource("https://doi.org/10.1073/pnas.0610172104", { fetch, getDocument });
  assert.equal(m.confidence, "confirmed");
  assert.equal(m.authors.length, 5);
});

test("a publisher page yields Scholar citation tags, then upgrades via the DOI", async () => {
  const fetch = F.mockFetch([
    ["api.crossref.org/works/10.1145", { message: { DOI: "10.1145/142750.142769", type: "proceedings-article",
      title: ["Beyond being there"], "container-title": ["CHI '92"],
      author: [{ given: "Jim", family: "Hollan" }, { given: "Scott", family: "Stornetta" }],
      "published-print": { "date-parts": [[1992]] } } }],
    ["dl.acm.org", F.LANDING_PAGE_HTML],
  ]);
  const m = await R.resolveSource("https://dl.acm.org/doi/10.1145/142750.142769", { fetch, getDocument });
  assert.equal(m.confidence, "confirmed");
  assert.deepEqual(m.authors, ["Jim Hollan", "Scott Stornetta"]);
});

test("citation meta flips 'Surname, Given' into reading order", () => {
  const meta = R.parseCitationMeta(F.LANDING_PAGE_HTML);
  assert.deepEqual(meta.authors, ["Jim Hollan", "Scott Stornetta"]);
  assert.equal(meta.title, "Beyond being there");
  assert.equal(meta.year, 1992);
});

test("a CORS-blocked PDF link says so plainly instead of guessing", async () => {
  const fetch = F.mockFetch([[/sciencedirect|elsevier/, "CORS"]]);
  const m = await R.resolveSource("https://www.sciencedirect.com/paper.pdf", { fetch, getDocument });
  assert.equal(m.needsReview, true);
  assert.equal(m.authors.length, 0);
  assert.match(provenance(m), /drag the pdf in instead/i);
});

test("an ISBN resolves through Open Library", async () => {
  const fetch = F.mockFetch([["openlibrary.org", F.OPENLIBRARY_SCOTT]]);
  const m = await R.resolveSource("ISBN 978-0-300-07815-2", { fetch, getDocument });
  assert.equal(m.kind, "book");
  assert.deepEqual(m.authors, ["James C. Scott"]);
  assert.equal(m.venue, "Yale University Press");
});

test("free text is matched by title", async () => {
  const fetch = F.mockFetch([["api.crossref.org/works?", F.CROSSREF_QUERY_FREEMAN]]);
  const m = await R.resolveSource("The Tyranny of Structurelessness", { fetch, getDocument });
  assert.equal(m.confidence, "confirmed");
  assert.deepEqual(m.authors, ["Jo Freeman"]);
});

test("offline, nothing resolves but nothing is fabricated either", async () => {
  const fetch = F.mockFetch([]);
  const m = await R.resolveSource("https://example.com/some/paper.pdf", { fetch, getDocument });
  assert.equal(m.needsReview, true);
  assert.equal(m.authors.length, 0);
});

const provenance = (m) => m.provenance.join(" | ");
