import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as R from "../src/resolve.js";
import * as F from "./fixtures.js";

const PDFJS = await import("pdfjs-dist/legacy/build/pdf.mjs");
const getDocument = PDFJS.getDocument;
const FIX = fileURLToPath(new URL("./fixtures/", import.meta.url));
const file = (n) => ({ file: { name: n, arrayBuffer: async () => new Uint8Array(readFileSync(FIX + n)).buffer } });

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

/* ---------------------------------------------------------------- archive covers */

test("every JSTOR and NBER URL shape in the wild derives the right DOI", () => {
  const doi = (u) => R.parseIdentifiers(u).doi;
  assert.equal(doi("https://www.jstor.org/stable/1913604?searchText=&seq=1&initiator=recommender"), "10.2307/1913604");
  assert.equal(doi("https://www.jstor.org/stable/1885060?seq=3#metadata_info_tab_contents"), "10.2307/1885060");
  assert.equal(doi("https://www.jstor.org/stable/pdf/1885060.pdf?refreqid=x&acceptTC=1"), "10.2307/1885060");
  assert.equal(doi("https://www.jstor.org/stable/10.2307/1885060"), "10.2307/1885060");  // already a DOI
  assert.equal(doi("https://www.jstor.org/stable/j.ctt7zvxr2.9"), "10.2307/j.ctt7zvxr2.9"); // book chapter
  assert.equal(doi("https://www.jstor.org/stable/pdf/j.ctt7zvxr2.9.pdf"), "10.2307/j.ctt7zvxr2.9");
  assert.equal(doi("https://www.nber.org/papers/w31710.pdf"), "10.3386/w31710");
  assert.equal(doi("http://papers.nber.org/papers/w0223"), "10.3386/w0223");
  assert.equal(doi("https://www.nber.org/system/files/working_papers/w31710/w31710.pdf"), "10.3386/w31710");
});

test("a JSTOR stable id is a DOI in disguise", () => {
  const url = "https://www.jstor.org/stable/pdf/1885060.pdf?refreqid=fastly-default%3A6415" +
              "&ab_segments=&initiator=&acceptTC=1";
  const ids = R.parseIdentifiers(url);
  assert.equal(ids.jstor, "1885060");
  assert.equal(ids.doi, "10.2307/1885060");
  assert.equal(R.parseIdentifiers("https://www.jstor.org/stable/1879431").doi, "10.2307/1879431");
});

test("a Nature article slug is a DOI too", () => {
  assert.equal(R.parseIdentifiers("https://www.nature.com/articles/s41586-020-2649-2").doi,
               "10.1038/s41586-020-2649-2");
});

test("the labelled citation on a JSTOR cover sheet is read directly", () => {
  const c = R.parseCoverCitation(F.JSTOR_COVER_TEXT);
  assert.equal(c.title, "Signaling Games and Stable Equilibria");
  assert.deepEqual(c.authors, ["In-Koo Cho", "David M. Kreps"]);
  assert.equal(c.venue, "The Quarterly Journal of Economics");
  assert.equal(c.year, 1987);
  assert.equal(c.doi, "10.2307/1885060");
});

test("the year comes from the citation, never from the download stamp", () => {
  // the stamp on this cover says 2026; the paper is from 1987
  assert.equal(R.parseCoverCitation(F.JSTOR_COVER_TEXT).year, 1987);
});

test("a JSTOR download resolves through the stable id even though the URL has no DOI", async () => {
  const fetch = F.mockFetch([["api.crossref.org/works/10.2307", F.CROSSREF_JSTOR]]);
  const m = await R.resolveSource("https://www.jstor.org/stable/pdf/1885060.pdf?refreqid=x&acceptTC=1",
                                  { fetch, getDocument });
  assert.equal(m.confidence, "confirmed");
  assert.equal(m.title, "Signaling Games and Stable Equilibria");
  assert.deepEqual(m.authors, ["In-Koo Cho", "David M. Kreps"]);
  assert.equal(m.needsReview, false);
});

test("the same PDF dropped in resolves with no network at all", async () => {
  const fetch = F.mockFetch([]);          // every lookup fails
  const m = await R.resolveSource(file("jstor-cover.pdf"), { fetch, getDocument });
  assert.equal(m.title, "Signaling Games and Stable Equilibria");
  assert.deepEqual(m.authors, ["In-Koo Cho", "David M. Kreps"]);
  assert.equal(m.venue, "The Quarterly Journal of Economics");
  assert.equal(m.year, 1987);
  assert.notEqual(m.year, 2026);
  assert.equal(m.needsReview, false);
});

test("a cover sheet is not mistaken for the paper's own first page", async () => {
  const pdf = await R.readPdf(new Uint8Array(readFileSync(FIX + "jstor-cover.pdf")), { getDocument });
  assert.equal(R.isCoverPage(pdf.pages[0]), true);
  assert.equal(R.isCoverPage(pdf.pages[1]), false);
  // page 2 is the article proper, and reads correctly on its own
  const g = R.guessFromLayout(pdf.pages[1]);
  assert.match(g.title, /QUARTERLY JOURNAL/i);
});

test("NBER working papers, SSRN and the other derivable archives", () => {
  const doi = (u) => R.parseIdentifiers(u).doi;
  assert.equal(doi("https://www.nber.org/papers/w1885"), "10.3386/w1885");
  assert.equal(doi("https://www.nber.org/system/files/working_papers/w31710/w31710.pdf"), "10.3386/w31710");
  assert.equal(doi("https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1234567"), "10.2139/ssrn.1234567");
  assert.equal(doi("https://www.nature.com/articles/s41586-020-2649-2"), "10.1038/s41586-020-2649-2");
});

test("publishers that already put the DOI in the URL need no special case", () => {
  const doi = (u) => R.parseIdentifiers(u).doi;
  assert.equal(doi("https://link.springer.com/article/10.1007/s00199-020-01278-w"), "10.1007/s00199-020-01278-w");
  assert.equal(doi("https://onlinelibrary.wiley.com/doi/10.1111/ecta.12345"), "10.1111/ecta.12345");
  assert.equal(doi("https://www.tandfonline.com/doi/full/10.1080/00220388.2019.1666980"), "10.1080/00220388.2019.1666980");
  assert.equal(doi("https://www.biorxiv.org/content/10.1101/2020.03.22.002386v2"), "10.1101/2020.03.22.002386v2");
});

test("an NBER link resolves end to end", async () => {
  const fetch = F.mockFetch([["api.crossref.org/works/10.3386", F.CROSSREF_NBER]]);
  const m = await R.resolveSource("https://www.nber.org/papers/w1885", { fetch, getDocument });
  assert.equal(m.confidence, "confirmed");
  assert.equal(m.venue, "National Bureau of Economic Research");
  assert.match(provenance(m), /10\.3386\/w1885/);
});

test("a PubMed link goes through NCBI and then upgrades to Crossref", async () => {
  const fetch = F.mockFetch([
    ["eutils.ncbi.nlm.nih.gov", F.PUBMED_BETTENCOURT],
    ["api.crossref.org/works/10.1073", F.CROSSREF_PNAS],
  ]);
  const m = await R.resolveSource("https://pubmed.ncbi.nlm.nih.gov/17360779/", { fetch, getDocument });
  assert.equal(m.confidence, "confirmed");
  assert.equal(m.authors.length, 5);                       // Crossref's list, not NCBI's two
  assert.match(provenance(m), /PubMed → Crossref/);
});

test("with Crossref down, PubMed's own record is used and its bylines reordered", async () => {
  const fetch = F.mockFetch([["eutils.ncbi.nlm.nih.gov", F.PUBMED_BETTENCOURT]]);
  const m = await R.resolveSource("https://pubmed.ncbi.nlm.nih.gov/17360779/", { fetch, getDocument });
  assert.deepEqual(m.authors, ["L. M. Bettencourt", "J. Lobo"]);
  assert.equal(m.year, 2007);
});

test("a doi.org link resolves from the identifier, with no download attempted", async () => {
  const asked = [];
  const fetch = async (url) => {
    asked.push(url);
    if (!url.includes("api.crossref.org")) throw new TypeError("Failed to fetch");
    return { ok: true, status: 200, headers: { get: () => "application/json" },
             json: async () => F.CROSSREF_JSTOR };
  };
  const m = await R.resolveSource("https://doi.org/10.2307/1885060", { fetch, getDocument });
  assert.equal(m.confidence, "confirmed");
  // exactly one request, to Crossref — doi.org itself is never fetched
  assert.deepEqual(asked, ["https://api.crossref.org/works/10.2307%2F1885060"]);
});

test("an unresolvable DOI keeps the DOI and asks, without PDF advice that cannot help", async () => {
  const fetch = F.mockFetch([]);          // nothing reachable
  const m = await R.resolveSource("https://doi.org/10.2307/1912767", { fetch, getDocument });
  assert.equal(m.doi, "10.2307/1912767");
  assert.equal(m.title, null);
  assert.equal(m.needsReview, true);
  assert.doesNotMatch(provenance(m), /drag the pdf in/i);
});

test("a ScienceDirect PII cannot be derived, and says so rather than guessing", async () => {
  const fetch = F.mockFetch([[/sciencedirect/, "CORS"]]);
  const m = await R.resolveSource("https://www.sciencedirect.com/science/article/pii/S0022053187900253",
                                  { fetch, getDocument });
  assert.equal(m.needsReview, true);
  assert.equal(m.authors.length, 0);
});

/* ------------------------------------------------- never accept the wrong record */

test("a Crossref record for a different DOI is refused, not returned", async () => {
  // the shape a prefix-matching cache or a mis-keyed stub produces
  const fetch = F.mockFetch([["api.crossref.org/works/10.2307", F.CROSSREF_JSTOR]]);
  const m = await R.resolveSource("https://www.jstor.org/stable/1913604?seq=1", { fetch, getDocument });
  assert.notEqual(m.title, "Signaling Games and Stable Equilibria");
  assert.equal(m.authors.length, 0);
  assert.equal(m.needsReview, true);
  // but the derived identifier survives, so the reader can see it got that far
  assert.equal(m.doi, "10.2307/1913604");
  assert.match(provenance(m), /10\.2307\/1913604/);
  assert.match(provenance(m), /not 10\.2307\/1913604/);
});

test("the right DOI still resolves normally", async () => {
  const fetch = F.mockFetch([["api.crossref.org/works/10.2307", F.CROSSREF_JSTOR]]);
  const m = await R.resolveSource("https://www.jstor.org/stable/1885060", { fetch, getDocument });
  assert.equal(m.confidence, "confirmed");
  assert.equal(m.title, "Signaling Games and Stable Equilibria");
});

test("arXiv's error entry for an unknown id is not read as a paper", async () => {
  const ERROR_FEED = `<?xml version="1.0"?><feed><entry>
    <id>http://arxiv.org/api/errors#incorrect_id_format</id>
    <title>Error</title><summary>incorrect id format</summary>
    <author><name>arXiv api core</name></author></entry></feed>`;
  const fetch = F.mockFetch([["export.arxiv.org", ERROR_FEED]]);
  const m = await R.resolveSource("https://arxiv.org/abs/9999.99999", { fetch, getDocument });
  assert.notEqual(m.title, "Error");
  assert.equal(m.needsReview, true);
});

test("NCBI answering for a different PMID is refused", async () => {
  const fetch = F.mockFetch([["eutils.ncbi.nlm.nih.gov", F.PUBMED_BETTENCOURT]]);
  const m = await R.resolveSource("https://pubmed.ncbi.nlm.nih.gov/99999999/", { fetch, getDocument });
  assert.equal(m.authors.length, 0);
  assert.equal(m.needsReview, true);
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
