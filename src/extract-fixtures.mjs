/**
 * Build step: pull real page-1 text runs out of the sample PDFs so the mockup can
 * exercise the actual layout heuristic in a browser, where pdf.js is not available.
 * Body text past the point where a title/byline could live is dropped to keep it small.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readPdf } from "./resolve.js";

const DIR = process.argv[2] || fileURLToPath(new URL('../test/fixtures/', import.meta.url));
const FILES = {
  "bettencourt-cities.pdf": { label: "a journal PDF with the DOI in the footer" },
  "chollet-intelligence.pdf": { label: "a preprint with an arXiv stamp up the margin", src: "arxiv-stamp.pdf" },
  "freeman-structurelessness.pdf": { label: "junk metadata, no DOI — read off the page", src: "junk-meta-no-doi.pdf" },
  "west-scaling.pdf": { label: "a title wrapped over two lines", src: "two-line-title.pdf" },
  "scott-seeing-like-a-state.pdf": { label: "a book title page with a subtitle", src: "book-titlepage.pdf" },
  "cho-signaling-games.pdf": { label: "a JSTOR download, cover sheet and all", src: "jstor-cover.pdf" },
  "scan-1972.pdf": { label: "a scan with no text layer at all", src: "scanned-no-text.pdf" },
};
const SRC = { "bettencourt-cities.pdf": "doi-footer.pdf" };

const out = {};
for (const [name, meta] of Object.entries(FILES)) {
  const real = meta.src || SRC[name];
  const pdf = await readPdf(new Uint8Array(readFileSync(`${DIR}/${real}`)), { getDocument, maxPages: 1 });
  const items = pdf.pages[0].items;
  // keep the top of the page plus anything carrying an identifier
  const kept = items.filter((it, i) => i < 90 || /10\.\d{4}|arxiv/i.test(it.str));
  out[name] = {
    label: meta.label,
    info: { Title: pdf.info.Title || "", Author: pdf.info.Author || "" },
    page: {
      width: Math.round(pdf.pages[0].width),
      height: Math.round(pdf.pages[0].height),
      items: kept.map(it => ({
        s: it.str, z: +it.size.toFixed(1), w: +it.width.toFixed(1), x: +it.x.toFixed(1), y: Math.round(it.y),
        ...(it.rotated ? { r: 1 } : {}),
      })),
    },
  };
}
writeFileSync(new URL("./pdf-samples.json", import.meta.url), JSON.stringify(out));
console.log("wrote pdf-samples.json —", Object.keys(out).length, "samples,",
  (JSON.stringify(out).length / 1024).toFixed(0) + "KB");
