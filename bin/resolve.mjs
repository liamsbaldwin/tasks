#!/usr/bin/env node
/**
 * Resolve a link or a PDF from the command line, using the live registries.
 *
 *   node bin/resolve.mjs "https://www.jstor.org/stable/1913604?seq=1"
 *   node bin/resolve.mjs ~/Downloads/paper.pdf
 *   node bin/resolve.mjs --json "https://www.nber.org/papers/w1885"
 *
 * Same module the app uses, so what it prints is what the app would file.
 */
import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import { resolveSource } from "../src/resolve.js";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const input = args.filter(a => a !== "--json")[0];

if (!input) {
  console.error("usage: node bin/resolve.mjs [--json] <url | doi | arxiv id | isbn | file.pdf>");
  process.exit(2);
}

let getDocument;
try {
  ({ getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs"));
} catch {
  // only needed for local PDFs
}

const isFile = existsSync(input);
const payload = isFile
  ? { file: { name: basename(input), arrayBuffer: async () => new Uint8Array(readFileSync(input)).buffer } }
  : input;

const steps = [];
const meta = await resolveSource(payload, { fetch, getDocument, onStep: s => steps.push(s) });

if (asJson) {
  console.log(JSON.stringify({ ...meta, provenance: steps }, null, 2));
  process.exit(meta.needsReview ? 1 : 0);
}

const dim = s => `\x1b[2m${s}\x1b[0m`;
const bold = s => `\x1b[1m${s}\x1b[0m`;
const mark = { confirmed: "\x1b[32m✓\x1b[0m", likely: "\x1b[32m✓\x1b[0m",
               guess: "\x1b[33m?\x1b[0m", failed: "\x1b[31m✗\x1b[0m" }[meta.confidence] || "?";

console.log();
for (const s of steps) console.log(dim("  " + s));
console.log();
console.log(`  ${mark} ${bold(meta.title || "— no title found —")}`);
console.log(`    ${meta.authors.length ? meta.authors.join(", ") : "\x1b[31m— no authors found —\x1b[0m"}`);
const line = [meta.venue, meta.year, meta.kind].filter(Boolean).join(" · ");
if (line) console.log(dim("    " + line));
if (meta.doi) console.log(dim("    doi:" + meta.doi));
console.log();
console.log(meta.needsReview
  ? `  \x1b[33mNeeds checking\x1b[0m (${meta.confidence}) — nothing above was invented; blanks are blanks.`
  : `  Filed as ${meta.confidence}.`);
console.log();
process.exit(meta.needsReview ? 1 : 0);
