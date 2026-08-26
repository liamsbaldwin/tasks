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
| 2 | An identifier printed inside the PDF | Papers print their DOI in the page-1 footer; preprints stamp the arXiv id up the margin |
| 3 | The PDF's embedded metadata, after a junk check | Half of them claim to be called `Microsoft Word - final_v3.doc` |
| 4 | The layout of page 1 | Largest type block near the top is the title; the first block below it that reads like names is the byline |
| 5 | A Crossref title search to confirm step 4 | Upgrades a guess to a fact, and discards a hit that is a different paper |

Registries used: Crossref (DOIs), arXiv, Open Library (ISBNs), plus Google Scholar's
`citation_*` meta tags on publisher landing pages. All allow direct browser requests and
need no API key.

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

## Layout

```
src/resolve.js          the resolver — no dependencies, fully tested
src/extract-fixtures.mjs build step: pulls page-1 text runs out of sample PDFs
build.mjs               inlines the resolver + samples into the mockup
test/                   25 tests, including six real PDFs through pdf.js
mockup/marginalia.html  the single-file prototype (generated block inside)
```

`npm test` runs the suite. `node build.mjs` re-inlines the resolver after editing
`src/resolve.js` — never edit the generated block in the HTML directly.

Note that the published preview of the mockup is sandboxed with no outbound network and
cannot load pdf.js, so it replays recorded registry responses and uses page-1 text runs
extracted from real PDFs at build time. The DOI scan, the layout heuristic and the whole
ladder run for real in it; only the byte-level PDF parsing and the live HTTP calls are
stood in for. Opened from disk, it uses the real thing.

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
