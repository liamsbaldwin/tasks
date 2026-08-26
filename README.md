# Marginalia

A private cockpit for running personal research projects that end in an essay
and then a video: **idea → reading → notes → draft → cut**.

The interactive mockup lives at [`mockup/marginalia.html`](mockup/marginalia.html).
Open it in a browser — no build step, no dependencies, no server.

## The model

| Thing | What it is |
|---|---|
| **Idea** | A title, a 1–3 sentence brief, and a stage. The unit of work. |
| **Source** | A paper, book, essay, or talk. Lives in one shared library, tagged onto one or more ideas. |
| **Card** | One claim, quote, or objection lifted from a source, with its page reference. |
| **Draft** | One markdown essay/script per idea, written next to that idea's cards. |

Ideas move through five stages — spark, gathering, drafting, cutting, published —
and the interface colours them on a cool-to-warm ramp, so the cockpit shows at a
glance which projects are heating up and which have gone cold.

## The three decisions worth arguing with

1. **The card is the load-bearing part.** Reading lists and drafts are the visible
   halves of the job; the hunt for "where did I read that?" is the invisible half
   where projects die. Cards made while reading appear automatically in an evidence
   rail beside the draft, and clicking one inserts it with the citation formed.
   That yields the most useful number in the tool: **unspent cards**.
2. **Sources are shared, not owned.** Ideas are tags on one library, not folders.
   Filing a paper under a second idea is one click and brings its notes along.
3. **Notes get a page, not a dropdown.** A drawer signals "keep it short"; the
   summary is where you find out whether you actually understood the source.

Full reasoning, plus three organisational alternatives that were considered and
rejected, are in the **Why it works this way** tab of the mockup.

## Adding a source

`src/resolve.js` turns whatever you paste or drag into real bibliographic fields. It has
no dependencies; `fetch` and pdf.js are injected, so it runs in node and from a `file://`
page alike. It works down a ladder and stops at the first step that gives a real answer:

| # | Step | Why it is in this position |
|---|---|---|
| 1 | An identifier in the input — DOI, arXiv id, ISBN, or a URL containing one | Authoritative, instant, and needs no download at all |
| 2 | An identifier printed inside the PDF | Papers print their DOI in the page-1 footer; preprints stamp the arXiv id up the margin; JSTOR prints `Stable URL:` on its cover |
| 3 | The archive's cover sheet citation | `Author(s):` / `Source:` / `Published by:` is structured data, and works offline |
| 4 | The PDF's embedded metadata, after a junk check | Half of them claim to be called `Microsoft Word - final_v3.doc` |
| 5 | The layout of the first page that is not a cover sheet | Largest type block near the top is the title; the first block below it that reads like names is the byline |
| 6 | A Crossref title search to confirm step 5 | Upgrades a guess to a fact, and discards a hit that is a different paper |

Several archives mint their DOIs mechanically from an id in the URL, so step 1 derives
rather than guesses:

| Link | DOI |
|---|---|
| `jstor.org/stable/1885060` | `10.2307/1885060` |
| `nber.org/papers/w1885` | `10.3386/w1885` |
| `papers.ssrn.com/…?abstract_id=123` | `10.2139/ssrn.123` |
| `nature.com/articles/<slug>` | `10.1038/<slug>` |
| `pubmed.ncbi.nlm.nih.gov/<pmid>` | via NCBI, which returns the DOI |

Springer, Wiley, Taylor & Francis, bioRxiv and most other publishers already put the DOI
in the URL and need no special case. A ScienceDirect PII cannot be derived — there the
answer is to drag the PDF in, which is read locally.

Registries used: Crossref (DOIs), arXiv, Open Library (ISBNs), plus Google Scholar's
`citation_*` meta tags on publisher landing pages. All allow direct browser requests and
need no API key.

### It never accepts the wrong record

Every registry answer is checked against the identifier that was requested: a Crossref
record whose DOI differs from the one asked for, an arXiv entry that is really an error
page, an NCBI record for a different PMID — all are refused rather than returned. A
confident wrong citation is worse than no citation, and this class of bug is invisible
until you are proofreading a bibliography.

### It never invents a field

No author, no year, no venue is ever fabricated. If a step could not establish something,
the source is flagged **Check** and opens into a form with whatever *was* found already
filled in — usually one field to type, not four. The sidebar lists which step produced
which field. A scan with no text layer says so and asks for a title. A title read off
page 1 but never confirmed by a registry is usable but still gets flagged; anything a
registry confirmed goes straight in.

### The one real limitation

A browser cannot download a PDF from a site that refuses cross-origin requests, and most
publishers do. The tool says so and asks you to drag the file in instead. This is why
identifiers are tried first: for arXiv, doi.org, PubMed Central and biorxiv the download
never has to happen.

## Running it

```
npm install
npm start            # → http://localhost:4321
```

From localhost (or from disk) the page calls the real Crossref, arXiv, Open Library and
NCBI. **This is the only way lookups work.** Or resolve a single item without the UI:

```
npm run resolve -- "https://doi.org/10.2307/1912767"
npm run resolve -- ~/Downloads/paper.pdf
npm run resolve -- --json "https://www.nber.org/papers/w31710"
```

It prints the trail and the resolved fields, and exits non-zero if the result needs
checking.

### The published preview cannot look anything up

A published Artifact runs in a sandbox with no outbound network, and no capability grants
one. So the hosted copy of this mockup resolves only its half-dozen sample links, from
recorded answers, and everything else lands in "needs checking" no matter how good the
identifier is. The page says so on screen the first time a lookup fails. Dropped PDFs
*are* parsed there for real, since pdf.js is inlined and needs no network.

Treat the hosted page as a design mockup. Run it locally to use it.

## Layout


```
src/resolve.js          the resolver — no dependencies, fully tested
bin/resolve.mjs         resolve a link or PDF from the command line
bin/serve.mjs           npm start — serves the app so it can reach the registries
src/extract-fixtures.mjs build step: pulls page-1 text runs out of sample PDFs
build.mjs               inlines the resolver + samples into the mockup
test/                   25 tests, including six real PDFs through pdf.js
mockup/marginalia.html  the single-file prototype (generated block inside)
```

`node bin/resolve.mjs <url|file.pdf>` resolves anything from the command line against the
live registries and prints what the app would file, with the trail of how it got there;
`--json` for the raw record. It exits non-zero when the result needs checking.

`npm test` runs the suite. `node build.mjs` re-inlines the resolver after editing
`src/resolve.js` — never edit the generated block in the HTML directly.

`build.mjs` also inlines pdf.js (~1.7MB) into the page as inert text, turned into a blob
module on first use — so a PDF dropped into the published preview is genuinely parsed in
the browser, offline. If a host's CSP refuses `blob:` scripts the load fails and the page
falls back to asking for the fields. The preview has no outbound network, so registry
lookups replay recorded answers there; opened from disk it calls the real APIs, and falls
back to the recordings if it cannot reach them.

## Intended shape of the real thing


A single local HTML file, opened from disk, with no server and no account. On first
run it asks for a folder and then reads/writes:

```
~/Projects/marginalia/
├── data.json      ideas, sources, cards, notes
├── essays/*.md    one plain markdown file per draft
└── pdfs/          the papers themselves
```

Make that folder a git repo and you get version history of every draft and backup
by pushing to a private remote. Metadata lookup (Crossref, arXiv, Open Library) all
allow direct browser requests, so adding a source by pasting a DOI needs no backend
and no API keys.

## Status

Mockup only. Every screen is interactive — add a source, insert a card into the
draft, type in the essay — but nothing persists across a reload.
