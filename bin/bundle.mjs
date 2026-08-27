#!/usr/bin/env node
/**
 * Wrap the built page in the document shell and drop it where Wrangler expects it.
 * mockup/marginalia.html is a fragment — bin/serve.mjs adds the same head when it
 * serves it locally, and this does it for the deployed copy, so the two are identical.
 *
 *   npm run bundle
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../mockup/marginalia.html", import.meta.url));
const DIR = fileURLToPath(new URL("../worker/public/", import.meta.url));

const body = await readFile(SRC, "utf8");
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#F4F5F7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0F1317" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="robots" content="noindex, nofollow">
<title>Marginalia</title>
</head>
<body>${body}</body>
</html>
`;

await mkdir(DIR, { recursive: true });
await writeFile(DIR + "index.html", page);
console.log(`wrote worker/public/index.html (${(page.length / 1024 / 1024).toFixed(2)}MB)`);
