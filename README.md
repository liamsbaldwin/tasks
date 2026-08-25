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
