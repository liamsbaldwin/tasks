#!/usr/bin/env node
/**
 * Serve the app on localhost so it can call Crossref, arXiv and Open Library for real.
 * No dependencies.   npm start   →   http://localhost:4321
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const FILE = fileURLToPath(new URL("../mockup/marginalia.html", import.meta.url));
const PORT = Number(process.env.PORT) || 4321;

createServer(async (req, res) => {
  if (req.url === "/favicon.ico") { res.writeHead(204).end(); return; }
  try {
    const html = await readFile(FILE, "utf8");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html><head><meta charset="utf-8">` +
            `<meta name="viewport" content="width=device-width,initial-scale=1">` +
            `</head><body>${html}</body></html>`);
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
}).listen(PORT, () => {
  console.log(`\n  Marginalia → http://localhost:${PORT}\n`);
  console.log(`  Lookups go to the real Crossref / arXiv / Open Library from here.`);
  console.log(`  Dropped PDFs are parsed in the browser. Ctrl-C to stop.\n`);
});
