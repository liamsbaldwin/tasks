/**
 * resolve.js — turn whatever the user pasted or dropped into real bibliographic fields.
 *
 * No dependencies. Everything that touches the outside world (fetch, PDF parsing)
 * is injected, so this file is testable in node and usable from a file:// page.
 *
 *   const meta = await resolveSource(input, { fetch, getDocument });
 *
 * Returns { title, authors[], year, venue, kind, doi, url, confidence, provenance[], needsReview }
 * confidence: "confirmed" (a registry agreed) | "likely" | "guess" | "failed"
 *
 * The contract that matters: this NEVER invents an author. If it cannot find one it
 * returns needsReview so the interface can ask, rather than writing "Unknown author".
 */

/* ------------------------------------------------------------------ identifiers */

// Crossref's own recommended pattern, plus a trailing-punctuation trim.
const DOI_RE = /\b(10\.\d{4,9}\/[-._;()/:a-z0-9<>+\[\]]+)/gi;
const ARXIV_NEW = /arxiv[:\s/]*(\d{4}\.\d{4,5})(v\d+)?/i;
const ARXIV_OLD = /arxiv[:\s/]*([a-z-]+(?:\.[a-z]{2})?\/\d{7})(v\d+)?/i;
const ISBN_RE = /\b(?:isbn[:\s-]*)?((?:97[89][-\s]?)?(?:\d[-\s]?){9}[\dxX])\b/i;
const PMCID_RE = /\bPMC(\d{6,8})\b/i;

/** id-in-the-URL → DOI, for archives whose DOI suffix *is* that id. */
const DERIVABLE = [
  // numeric article ids, and the j.ctt… ids JSTOR uses for book chapters
  [/jstor\.org\/stable\/(?:pdf\/)?(j\.[a-z0-9]+(?:\.[a-z0-9]+)*?|\d{4,10})(?:\.pdf)?(?=[?#\s"'<>)\]]|$)/i, "10.2307/", "jstor"],
  [/nber\.org\/(?:papers|system\/files\/working_papers)\/(w\d{3,6})/i, "10.3386/", "nber"],
  [/nature\.com\/articles\/([a-z0-9-]+)/i,                          "10.1038/", null],
  [/ssrn\.com\/.*?abstract_id=(\d{4,10})/i,                          "10.2139/ssrn.", "ssrn"],
  [/ssrn\.com\/abstract=(\d{4,10})/i,                                "10.2139/ssrn.", "ssrn"],
];

/** A DOI printed in a PDF usually collides with the punctuation after it. */
export function tidyDoi(raw) {
  let d = raw.trim().replace(/[.,;:]+$/, "");
  // drop a trailing ) only if it is unbalanced
  while (d.endsWith(")") && (d.match(/\)/g) || []).length > (d.match(/\(/g) || []).length) {
    d = d.slice(0, -1);
  }
  // PDF text layers love to weld the next word on; cut at whitespace
  return d.split(/\s/)[0].toLowerCase();
}

/** Pull every identifier we can out of an arbitrary string (a URL, a citation, page text). */
export function parseIdentifiers(text) {
  const s = String(text || "");
  const out = {};

  const doiMatch = s.match(DOI_RE);
  if (doiMatch) out.doi = tidyDoi(doiMatch[0]);

  // arxiv.org/abs/2401.12345 and arxiv.org/pdf/2401.12345v2 both carry the id in the path
  const arxivUrl = s.match(/arxiv\.org\/(?:abs|pdf)\/([^\s?#]+?)(?:v\d+)?(?:\.pdf)?(?:[?#]|$)/i);
  if (arxivUrl) out.arxiv = arxivUrl[1];
  else {
    const a = s.match(ARXIV_NEW) || s.match(ARXIV_OLD);
    if (a) out.arxiv = a[1];
  }

  // Several archives mint DOIs mechanically from an id that is sitting in the URL (and,
  // for JSTOR, in the "Stable URL:" line it prints on its cover page). Deriving the DOI
  // means one Crossref call and no download — no CORS problem, nothing to parse.
  for (const [re, prefix, key] of DERIVABLE) {
    const m = s.match(re);
    if (!m) continue;
    if (key) out[key] = m[1];
    if (!out.doi) out.doi = prefix + m[1].toLowerCase();
    break;
  }

  const pmc = s.match(PMCID_RE) || s.match(/ncbi\.nlm\.nih\.gov\/pmc\/articles\/PMC(\d+)/i);
  if (pmc) out.pmcid = "PMC" + pmc[1];

  const pmid = s.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{6,9})/i) || s.match(/\bPMID:?\s*(\d{6,9})\b/i);
  if (pmid) out.pmid = pmid[1];

  const yt = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i);
  if (yt) out.youtube = yt[1];

  // Only trust a bare ISBN if the string says so, or it is an isbn-shaped URL segment;
  // otherwise long digit runs in page text produce nonsense.
  if (/isbn/i.test(s) || /openlibrary|goodreads|worldcat/i.test(s)) {
    const isbn = s.match(ISBN_RE);
    if (isbn) out.isbn = isbn[1].replace(/[-\s]/g, "");
  }
  return out;
}

/* ------------------------------------------------------------------ text hygiene */

const FILE_EXT = /\.(docx?|pdf|tex|dvi|qxd|indd|rtf|odt|pptx?|ps|eps)$/i;
const GENERIC = /^(untitled|document\d*|microsoft word|powerpoint presentation|manuscript|paper|preprint|main|draft|final|new document|no title)$/i;

/** PDF Info dictionaries are full of build artefacts. Reject them rather than trust them. */
export function isJunkTitle(t) {
  if (!t) return true;
  const s = String(t).trim();
  if (s.length < 6) return true;
  if (FILE_EXT.test(s)) return true;                    // "paper.dvi", "main.pdf"
  if (/^microsoft word\s*-/i.test(s)) return true;      // "Microsoft Word - final_v3.doc"
  if (GENERIC.test(s)) return true;
  if (!/\s/.test(s) && /[_\d]/.test(s)) return true;    // "structurelessness_FINAL_v3"
  if (/^[\w.-]+$/.test(s) && /\d/.test(s)) return true; // bare filename-ish token
  if (!/[a-z]/.test(s) && s.length < 12) return true;   // stray ALLCAPS fragment
  return false;
}

export function cleanTitle(t) {
  return String(t || "")
    .replace(/\s*[\r\n]+\s*/g, " ")
    .replace(/^\s*(?:microsoft word\s*-\s*)?/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[*†‡§¶]/g, "")
    .trim()
    .replace(/[.,;:]$/, "");
}

// Words that show up in titles and subtitles but essentially never in an author list.
const PROSE_WORDS = /\b(the|of|a|an|to|in|for|on|with|how|why|what|that|from|have|has|been|its|toward|towards|against|between|through|about)\b/gi;
// Library and repository stamps carry today's date and the reader's IP address. Harvesting
// a "year" out of one is how a 1987 paper ends up filed under 2026.
const JUNK_LINE = /^(downloaded from|this content downloaded|all use subject to|©|copyright|all rights reserved|page \d+|\d+$)|about\.jstor\.org\/terms|is a not-for-profit service/i;

const PUBLISHER_RE = /\b(press|publish\w*|books|verlag|editions|éditions|imprint|&\s*co\b)/i;
const AFFIL_WORDS = /\b(universit|institut|department|laborator|college|school|academ|centre|center|inc\.|llc|gmbh|hospital|foundation|press|dept)\w*/i;

/**
 * Title pages letter-space their capitals: "J A M E S   C .   S C O T T".
 * Where the PDF keeps each glyph as its own run, toLines() has already put the word
 * breaks back from the x-gaps. Where it does not — pdf.js merges the whole line into
 * one string — every gap looks identical and the word breaks are gone. The one boundary
 * still recoverable is a lone capital with a period: that is a middle initial, so a
 * word ends before it and another begins after.
 */
export function deSpaceCapitals(str) {
  const s = String(str || "");
  if (!/^(?:\p{Lu}\s+){3,}/u.test(s + " ")) return s;
  return s
    .replace(/(?<=\p{L})\s(?=\p{L}\b)/gu, "")
    .replace(/\s+\./g, ".")
    .replace(/(\p{Lu}{2,})(\p{Lu}\.)/gu, "$1 $2")   // JAMESC. → JAMES C.
    .replace(/(\.)(\p{Lu}{2,})/gu, "$1 $2")         // C.SCOTT → C. SCOTT
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Does this line read like a byline rather than a title, subtitle, or affiliation? */
export function looksLikeAuthorLine(line) {
  const s = deSpaceCapitals(String(line || "").trim());
  if (!s || s.length > 320) return false;
  if (s.includes("@")) return false;
  if (AFFIL_WORDS.test(s)) return false;
  if (/^\s*(abstract|introduction|keywords|contents|chapter)\b/i.test(s)) return false;
  if (/^\d/.test(s)) return false;
  const prose = (s.match(PROSE_WORDS) || []).length;
  if (prose >= 2) return false;                          // a subtitle, not a byline
  return /\p{Lu}\p{L}+/u.test(s);                        // contains at least one capitalised word
}

/** "Luís M. A. Bettencourt*†, José Lobo‡, and Geoffrey B. West¶" → three clean names. */
export function parseAuthorLine(line) {
  let s = deSpaceCapitals(String(line || "").trim());
  if (!s) return [];

  s = s
    .replace(/^\s*(?:by|authors?|written by)\s*[:.]?\s*/i, "")
    .replace(/[*†‡§¶]/g, "")
    .replace(/\((?:[^)]*)\)/g, " ")          // "(corresponding author)"
    .replace(/(\p{L})\d+\b/gu, "$1")         // affiliation superscripts rendered as digits
    .replace(/\s{2,}/g, " ");

  return s
    .split(/\s*(?:,|;|\band\b|&|·)\s*/i)
    .map(n => n.replace(/^\s*and\s+/i, "").trim().replace(/[.,;:]$/, ""))
    .filter(n =>
      n.length > 1 &&
      /\p{L}/u.test(n) &&
      !/^\p{L}\.?$/u.test(n) &&              // a stray initial orphaned by the split
      !AFFIL_WORDS.test(n) &&
      !n.includes("@")
    )
    .slice(0, 24);
}

/* ------------------------------------------------------------------ PDF reading */

/**
 * Read a PDF with pdf.js. `getDocument` is injected so this works in node and browser.
 * Returns embedded metadata plus positioned text runs for page 1.
 */
export async function readPdf(data, { getDocument, maxPages = 3 } = {}) {
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  let info = {}, metadata = null;
  try {
    const m = await doc.getMetadata();
    info = m.info || {};
    metadata = m.metadata || null;
  } catch { /* some PDFs have no metadata at all */ }

  const pages = [];
  const limit = Math.min(doc.numPages, maxPages);
  for (let i = 1; i <= limit; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const vp = page.getViewport({ scale: 1 });
    pages.push({
      height: vp.height,
      width: vp.width,
      items: tc.items.filter(it => it.str !== undefined).map(it => {
        const t = it.transform || [1, 0, 0, 1, 0, 0];
        return {
          str: it.str,
          size: Math.hypot(t[2], t[3]) || it.height || 0,
          width: it.width || 0,
          x: t[4],
          y: t[5],
          rotated: Math.abs(t[1]) > 0.01 || Math.abs(t[2]) > 0.01,
        };
      }),
    });
  }
  await doc.destroy?.();

  const text = pages.map(p => p.items.map(i => i.str).join(" ")).join("\n");
  // XMP holds the good metadata when the Info dict is a build artefact
  const xmp = {
    title: metadata?.get?.("dc:title") || null,
    creator: metadata?.get?.("dc:creator") || null,
  };
  return { info, xmp, pages, text };
}

/** Merge positioned runs into lines, biggest-font-first, with junk dropped. */
export function toLines(page) {
  const rows = new Map();
  for (const it of page.items) {
    if (it.rotated) continue;                 // margin stamps are never the title
    if (!it.str.trim()) continue;
    const key = Math.round(it.y / 2) * 2;     // 2pt tolerance
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(it);
  }
  return [...rows.entries()]
    .map(([y, items]) => {
      items.sort((a, b) => a.x - b.x);
      let text = "";
      items.forEach((it, n) => {
        const prev = items[n - 1];
        if (prev) {
          const gap = it.x - (prev.x + prev.width);
          const wide = gap > 0.28 * (prev.size || it.size);
          if (wide && !/\s$/.test(text) && !/^\s/.test(it.str)) text += " ";
        }
        text += it.str;
      });
      return {
        y,
        size: Math.max(...items.map(i => i.size)),
        text: text.replace(/\s{2,}/g, " ").trim(),
      };
    })
    .filter(l => l.text.length > 2)
    .filter(l => !JUNK_LINE.test(l.text))
    .sort((a, b) => b.y - a.y);               // PDF origin is bottom-left: top of page first
}

/**
 * Group lines into blocks of one type size sitting close together. Titles, subtitles and
 * bylines all wrap, and a wrapped subtitle's last line ("Condition Have Failed") reads
 * exactly like a byline until you put it back together with the line above it.
 */
export function toBlocks(page) {
  const lines = toLines(page);
  const blocks = [];
  for (const l of lines) {
    const prev = blocks[blocks.length - 1];
    const sameSize = prev && Math.abs(prev.size - l.size) < 0.6;
    const adjacent = prev && prev.lastY - l.y < prev.size * 2.2;   // still the same paragraph
    if (sameSize && adjacent) {
      prev.lines.push(l.text);
      prev.lastY = l.y;
    } else {
      blocks.push({ size: l.size, y: l.y, lastY: l.y, lines: [l.text] });
    }
  }
  return blocks.map(b => ({ ...b, text: b.lines.join(" ").replace(/\s{2,}/g, " ").trim() }));
}

/**
 * The fallback that matters: no DOI, no usable metadata, just ink on a page.
 * The title is the largest type near the top; the byline is the first block under it
 * that reads like names rather than prose.
 */
export function guessFromLayout(page) {
  const blocks = toBlocks(page);
  if (!blocks.length) return { title: null, authors: [], confidence: "failed" };

  const top = blocks.filter(b => b.y > page.height * 0.45);
  const pool = top.length ? top : blocks.slice(0, 6);
  const maxSize = Math.max(...pool.map(b => b.size));

  const ti = blocks.findIndex(b => b.size >= maxSize - 0.6 && pool.includes(b));
  const title = cleanTitle(blocks[ti].text);

  let authors = [], authorAt = -1;
  for (let i = ti + 1; i < Math.min(blocks.length, ti + 5); i++) {
    if (!looksLikeAuthorLine(blocks[i].text)) continue;
    const parsed = parseAuthorLine(blocks[i].text);
    if (parsed.length) { authors = parsed; authorAt = i; break; }
  }

  // A title page carries its own imprint: the publisher line and the year are right there.
  let venue = "", year = null, kind = "paper";
  for (const b of blocks.slice(authorAt > 0 ? authorAt + 1 : ti + 1)) {
    if (!venue && PUBLISHER_RE.test(b.text)) {
      venue = b.text.split(/\s+[·|]\s+|\s{2,}/)[0].trim().replace(/[.,;:]$/, "");
      kind = "book";
    }
    if (!year) year = Number((b.text.match(/\b(1[6-9]\d\d|20[0-2]\d)\b/) || [])[1]) || null;
    if (venue && year) break;
  }

  const ok = title && title.length >= 8 && authors.length > 0;
  return { title: title || null, authors, venue, year, kind, confidence: ok ? "guess" : "failed" };
}

/**
 * JSTOR (and several other archives) prepend a cover page carrying a labelled citation:
 *   Signaling Games and Stable Equilibria
 *   Author(s): In-Koo Cho and David M. Kreps
 *   Source: The Quarterly Journal of Economics, Vol. 102, No. 2 (May, 1987), pp. 179-222
 *   Published by: Oxford University Press
 *   Stable URL: https://www.jstor.org/stable/1885060
 * That is better structured than anything the layout heuristic could infer, and it works
 * with no network at all.
 */
export function parseCoverCitation(text) {
  const t = String(text || "").replace(/\s+/g, " ");
  if (!/\bAuthor\(s\):/i.test(t)) return null;

  const between = (start, ends) => {
    const re = new RegExp(start + "\\s*([\\s\\S]*?)\\s*(?:" + ends + "|$)", "i");
    return ((t.match(re) || [])[1] || "").trim().replace(/^[,;:\s]+|[,;:\s]+$/g, "");
  };

  const title = cleanTitle(t.split(/\bAuthor\(s\):/i)[0]);
  const authors = parseAuthorLine(
    between("\\bAuthor\\(s\\):", "\\bReviewed work|\\bSource:|\\bPublished by:|\\bStable URL:")
  );
  const source = between("\\bSource:", "\\bPublished by:|\\bStable URL:");
  const publisher = between("\\bPublished by:", "\\bStable URL:|\\bJSTOR|\\bYour use of");

  // "The Quarterly Journal of Economics, Vol. 102, No. 2 (May, 1987), pp. 179-222" — and
  // JSTOR often repeats the date first, so cut at a volume, a month, or a bare year.
  const MONTH = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
  const venue = source
    .split(new RegExp(`,?\\s*(?:Vol\\.|No\\.|New Series|pp\\.|\\(|(?:${MONTH})[a-z]*\\.?,?\\s*\\d{4}|\\d{4}\\b)`, "i"))[0]
    .replace(/\s+([,.])/g, "$1")
    .replace(/[,;:\s]+$/, "")
    .trim();
  const year = Number((source.match(/\b(1[6-9]\d\d|20[0-2]\d)\b/) || [])[1]) || null;

  const ids = parseIdentifiers(t);
  if (!title || !authors.length) return null;
  return {
    title, authors, year,
    venue: venue || publisher || "",
    kind: "paper",
    doi: ids.doi || null,
    url: ids.jstor ? `https://www.jstor.org/stable/${ids.jstor}` : null,
  };
}

/**
 * Is this an archive's cover sheet rather than the paper's own first page?
 *
 * Keyed on the labelled citation, not the download stamp: JSTOR prints "This content
 * downloaded from …" on *every* page, so testing for it marks the whole document as
 * cover sheet and there is never a real page to fall through to.
 */
export function isCoverPage(page) {
  const t = page.items.map(i => i.str).join(" ");
  return /\bAuthor\(s\):/i.test(t) || /JSTOR is a not-for-profit/i.test(t);
}

/* ------------------------------------------------------------------ registries */

class LookupError extends Error {
  constructor(msg, code) { super(msg); this.code = code; }
}

async function getJson(url, fetchImpl, headers = {}) {
  let res;
  try {
    res = await fetchImpl(url, { headers });
  } catch (e) {
    // A browser reports a CORS refusal as a TypeError with no status.
    throw new LookupError(`Could not reach ${new URL(url).host}`, "network");
  }
  if (!res.ok) throw new LookupError(`${new URL(url).host} returned ${res.status}`, "http");
  return res.json();
}

const yearOf = m =>
  m?.["published-print"]?.["date-parts"]?.[0]?.[0] ||
  m?.["published-online"]?.["date-parts"]?.[0]?.[0] ||
  m?.issued?.["date-parts"]?.[0]?.[0] || null;

const CROSSREF_KIND = { "book": "book", "monograph": "book", "book-chapter": "book", "posted-content": "paper" };

export function fromCrossrefWork(w) {
  if (!w) return null;
  const authors = (w.author || [])
    .map(a => [a.given, a.family].filter(Boolean).join(" ").trim() || a.name)
    .filter(Boolean);
  return {
    title: cleanTitle(Array.isArray(w.title) ? w.title[0] : w.title),
    authors,
    year: yearOf(w),
    venue: (Array.isArray(w["container-title"]) ? w["container-title"][0] : w["container-title"]) ||
           w.publisher || "",
    kind: CROSSREF_KIND[w.type] || "paper",
    doi: w.DOI || null,
    url: w.URL || (w.DOI ? "https://doi.org/" + w.DOI : null),
  };
}

export async function fromCrossref(doi, fetchImpl) {
  const j = await getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, fetchImpl);
  const work = fromCrossrefWork(j.message);
  // Never accept a record for a different DOI than the one asked for. A caching proxy,
  // a stubbed fetch or a mis-keyed fixture can all hand back a neighbour's paper, and a
  // confident wrong citation is far worse than no citation.
  if (work && !sameDoi(work.doi, doi)) {
    throw new LookupError(`Crossref answered for ${work.doi}, not ${doi}`, "mismatch");
  }
  return work;
}

const sameDoi = (a, b) =>
  String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/** No DOI, but we have a title guess — ask Crossref whether that paper exists. */
export async function confirmByTitle(title, authors, fetchImpl) {
  const q = new URLSearchParams({ "query.bibliographic": title, rows: "3", select: "title,author,issued,container-title,DOI,type,publisher,URL" });
  if (authors?.length) q.set("query.author", authors[0]);
  const j = await getJson(`https://api.crossref.org/works?${q}`, fetchImpl);
  const items = j.message?.items || [];
  for (const w of items) {
    const cand = fromCrossrefWork(w);
    if (cand && titleSimilarity(cand.title, title) > 0.82) return cand;
  }
  return null;
}

/** Cheap token-overlap check, so a fuzzy match does not overwrite a good guess with the wrong paper. */
export function titleSimilarity(a, b) {
  const norm = s => new Set(String(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2));
  const A = norm(a), B = norm(b);
  if (!A.size || !B.size) return 0;
  let hits = 0;
  for (const w of A) if (B.has(w)) hits++;
  return hits / Math.max(A.size, B.size);
}

export async function fromArxiv(id, fetchImpl) {
  const res = await fetchImpl(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`)
    .catch(() => { throw new LookupError("Could not reach export.arxiv.org", "network"); });
  if (!res.ok) throw new LookupError(`arXiv returned ${res.status}`, "http");
  const xml = await res.text();
  const entry = xml.split("<entry>")[1];
  if (!entry) return null;
  // arXiv answers a bad id with an entry whose title is literally "Error"
  const entryId = (entry.match(/<id>([\s\S]*?)<\/id>/) || [])[1] || "";
  if (!entryId.toLowerCase().includes(String(id).toLowerCase().replace(/v\d+$/, ""))) {
    throw new LookupError(`arXiv answered for ${entryId || "nothing"}, not ${id}`, "mismatch");
  }
  const tag = (t) => (entry.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1];
  const unesc = s => String(s || "").replace(/\s+/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
  const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map(m => unesc(m[1]));
  const published = tag("published") || "";
  return {
    title: cleanTitle(unesc(tag("title"))),
    authors,
    year: Number(published.slice(0, 4)) || null,
    venue: "arXiv:" + id,
    kind: "paper",
    doi: unesc(tag("arxiv:doi")) || null,
    url: `https://arxiv.org/abs/${id}`,
    abstract: unesc(tag("summary")),
  };
}

export async function fromOpenLibrary(isbn, fetchImpl) {
  const j = await getJson(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`, fetchImpl);
  const b = j[`ISBN:${isbn}`];
  if (!b) return null;
  return {
    title: cleanTitle(b.title + (b.subtitle ? ": " + b.subtitle : "")),
    authors: (b.authors || []).map(a => a.name),
    year: Number(String(b.publish_date || "").match(/\d{4}/)?.[0]) || null,
    venue: (b.publishers || []).map(p => p.name).join(", "),
    kind: "book",
    url: b.url || null,
    cover: b.cover?.large || b.cover?.medium || null,
  };
}

/**
 * A talk has no DOI and no cover, but oEmbed gives its title, its channel and a
 * thumbnail — which is the closest thing a video has to a jacket.
 */
export async function fromYouTube(id, fetchImpl) {
  const watch = `https://www.youtube.com/watch?v=${id}`;
  const j = await getJson(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`, fetchImpl);
  if (!j || !j.title) return null;
  return {
    title: cleanTitle(j.title),
    authors: j.author_name ? [j.author_name] : [],
    year: null,                       // oEmbed does not carry one, so do not invent one
    venue: j.provider_name || "YouTube",
    kind: "talk",
    url: watch,
    cover: j.thumbnail_url || `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
  };
}

/** PubMed, for the many links that carry a PMID and nothing else. */
export async function fromPubmed(pmid, fetchImpl, db = "pubmed") {
  const j = await getJson(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=${db}&id=${encodeURIComponent(pmid)}&retmode=json`,
    fetchImpl);
  const rec = j.result?.[j.result?.uids?.[0]];
  if (!rec || rec.error) return null;
  if (String(rec.uid) !== String(pmid)) {
    throw new LookupError(`NCBI answered for ${rec.uid}, not ${pmid}`, "mismatch");
  }
  return {
    title: cleanTitle(rec.title),
    // NCBI writes bylines surname-first with bare initials: "Bettencourt LM"
    authors: (rec.authors || []).filter(a => a.authtype === "Author" || !a.authtype).map(a => {
      const m = String(a.name).match(/^(.+?)\s+([A-Z]{1,3})$/);
      return m ? m[2].split("").map(i => i + ".").join(" ") + " " + m[1] : a.name;
    }),
    year: Number(String(rec.pubdate || "").match(/\d{4}/)?.[0]) || null,
    venue: rec.fulljournalname || rec.source || "",
    kind: "paper",
    doi: (rec.articleids || []).find(i => i.idtype === "doi")?.value || null,
  };
}

/**
 * Publisher landing pages carry Google Scholar's citation_* meta tags. When a URL is
 * reachable this is often better than anything in the PDF itself.
 */
export function parseCitationMeta(html) {
  const meta = {};
  const re = /<meta[^>]+>/gi;
  for (const tag of html.match(re) || []) {
    const name = (tag.match(/(?:name|property)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const content = (tag.match(/content\s*=\s*["']([^"']*)["']/i) || [])[1];
    if (!name || content == null) continue;
    const k = name.toLowerCase();
    if (k === "citation_author" || k === "dc.creator") (meta.authors ||= []).push(content.trim());
    else if (!meta[k]) meta[k] = content.trim();
  }
  const decode = s => String(s || "").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(d)).replace(/&quot;/g, '"');
  const title = decode(meta.citation_title || meta["dc.title"] || meta["og:title"]);
  if (!title) return null;
  const authors = (meta.authors || []).map(decode).flatMap(a =>
    a.includes(",") && a.split(",").length === 2 ? [a.split(",").map(s => s.trim()).reverse().join(" ")] : [a]
  );
  return {
    title: cleanTitle(title),
    authors,
    year: Number(String(meta.citation_publication_date || meta.citation_date || "").match(/\d{4}/)?.[0]) || null,
    venue: decode(meta.citation_journal_title || meta.citation_inbook_title || meta["og:site_name"] || ""),
    kind: meta.citation_isbn ? "book" : "paper",
    doi: meta.citation_doi || null,
  };
}

/* ------------------------------------------------------------------ the ladder */

/**
 * Resolve anything the user gave us into bibliographic fields.
 *
 * @param input  a string (URL / DOI / arXiv id / ISBN / free text) OR
 *               { file: {name, arrayBuffer()} } for a dropped PDF
 * @param deps   { fetch, getDocument, readPdf, onStep }
 *               getDocument is pdf.js; readPdf overrides PDF reading wholesale
 */
export async function resolveSource(input, deps = {}) {
  const fetchImpl = deps.fetch || (typeof fetch !== "undefined" ? fetch : null);
  const provenance = [];
  const note = m => { provenance.push(m); deps.onStep?.(m); };

  const isFile = input && typeof input === "object" && input.file;
  const text = isFile ? (input.file.name || "") : String(input || "").trim();

  const fail = (extra = {}) => ({
    title: null, authors: [], year: null, venue: "", kind: "paper",
    doi: parseIdentifiers(text).doi || null,
    url: /^https?:/i.test(text) ? text : null,
    confidence: "failed", needsReview: true, provenance, ...extra,
  });

  const settle = (meta, confidence) => ({
    year: null, venue: "", kind: "paper", doi: null, url: null,
    ...meta,
    title: meta.title || null,
    authors: meta.authors || [],
    confidence,
    needsReview: confidence === "guess" || confidence === "failed" || !meta.authors?.length,
    provenance,
  });

  /* --- step 1: identifiers in the string itself. No download, no CORS, no guessing. --- */
  const ids = parseIdentifiers(text);
  if (!isFile) {
    const viaId = await lookupIds(ids, fetchImpl, note);
    if (viaId) return settle(viaId, "confirmed");
  }

  /* --- step 2: get PDF bytes, either from the drop or from the link --- */
  let bytes = null, fetchProblem = null;
  if (isFile) {
    bytes = new Uint8Array(await input.file.arrayBuffer());
    note(`Read ${input.file.name}`);
  } else if (/^https?:/i.test(text) && /\.pdf($|[?#])/i.test(text)) {
    try {
      const res = await fetchImpl(text);
      if (!res.ok) throw new LookupError(`${res.status}`, "http");
      const ct = res.headers?.get?.("content-type") || "";
      const buf = new Uint8Array(await res.arrayBuffer());
      if (/pdf/i.test(ct) || (buf[0] === 0x25 && buf[1] === 0x50)) {   // %P
        bytes = buf;
        note("Downloaded the PDF");
      } else {
        // it was an HTML landing page after all — Scholar meta tags are right there
        const html = new TextDecoder().decode(buf);
        const meta = parseCitationMeta(html);
        if (meta?.title) {
          note("Read citation metadata from the page");
          if (meta.doi && fetchImpl) {
            const better = await fromCrossref(meta.doi, fetchImpl).catch(() => null);
            if (better) { note(`Confirmed via Crossref (${meta.doi})`); return settle(better, "confirmed"); }
          }
          return settle(meta, meta.authors.length ? "likely" : "guess");
        }
      }
    } catch (e) {
      fetchProblem = e.code === "http"
        ? `That link returned an error (${e.message}).`
        : "The browser could not fetch that file (the site blocks it, or there is no network). Drag the PDF in instead.";
      note(fetchProblem);
    }
  }

  /* --- step 3: read the PDF --- */
  if (bytes && (deps.getDocument || deps.readPdf)) {
    let pdf = null;
    try {
      pdf = deps.readPdf
        ? await deps.readPdf(bytes)
        : await readPdf(bytes, { getDocument: deps.getDocument });
    } catch (e) {
      note(`That file could not be opened as a PDF (${e.message}).`);
      return fail();
    }

    if (!pdf.text.replace(/\s/g, "")) {
      note("No text layer — this looks like a scan. Needs a title typed in, or OCR.");
      return fail({ kind: guessKindFromName(text) });
    }

    // 3a. an identifier printed in the document beats everything else
    const inDoc = parseIdentifiers(pdf.text);
    const viaDoc = await lookupIds(inDoc, fetchImpl, note, "found in the document");
    if (viaDoc) return settle(viaDoc, "confirmed");

    // 3b. a labelled citation on an archive cover sheet beats every heuristic below
    const cover = parseCoverCitation(pdf.text);
    if (cover) {
      note("Read the citation off the archive's cover page");
      if (cover.doi && fetchImpl) {
        const better = await fromCrossref(cover.doi, fetchImpl).catch(() => null);
        if (better) { note(`Confirmed via Crossref (${cover.doi})`); return settle(better, "confirmed"); }
      }
      return settle(cover, "likely");
    }

    // 3c. embedded metadata, but only if it is not a build artefact
    const embTitle = pdf.xmp.title || pdf.info.Title;
    const embAuthor = pdf.xmp.creator || pdf.info.Author;
    let best = null, fromLayout = false;
    if (!isJunkTitle(embTitle)) {
      const authors = parseAuthorLine(embAuthor);
      note(`Used the PDF's own metadata${authors.length ? "" : " (no author recorded)"}`);
      best = { title: cleanTitle(embTitle), authors, kind: "paper" };
    }

    // 3d. read the page like a person does — skipping any cover sheet in front of it
    if (!best || !best.authors.length) {
      const pageNo = pdf.pages.findIndex(pg => !isCoverPage(pg));
      const page = pdf.pages[pageNo === -1 ? 0 : pageNo];
      const guess = guessFromLayout(page);
      if (guess.title) {
        note(`Read the title and byline off page ${(pageNo === -1 ? 0 : pageNo) + 1}`);
        fromLayout = true;
        best = {
          title: best?.title || guess.title,
          authors: best?.authors?.length ? best.authors : guess.authors,
          venue: guess.venue || "",
          year: guess.year,
          kind: guess.kind,
        };
      }
    }

    if (best?.title) {
        // 3e. ask Crossref whether that paper exists, to upgrade a guess into a fact
      if (fetchImpl) {
        const confirmed = await confirmByTitle(best.title, best.authors, fetchImpl).catch(() => null);
        if (confirmed) {
          note(`Matched to Crossref (${confirmed.doi})`);
          return settle(confirmed, "confirmed");
        }
      }
      // ink on a page is a guess and gets checked; the file's own metadata is not
      return settle(best, !best.authors.length || fromLayout ? "guess" : "likely");
    }
    note("Could not find a title on page 1");
    return fail();
  }

  if (bytes && !deps.getDocument && !deps.readPdf) {
    note("PDF reading is not available here");
    return fail();
  }

  /* --- step 4: a plain web page --- */
  if (/^https?:/i.test(text) && fetchImpl && !fetchProblem) {
    try {
      const res = await fetchImpl(text);
      const html = await res.text();
      const meta = parseCitationMeta(html);
      if (meta?.title) {
        note("Read the page's citation metadata");
        if (meta.doi) {
          const better = await fromCrossref(meta.doi, fetchImpl).catch(() => null);
          if (better) { note(`Confirmed via Crossref (${meta.doi})`); return settle(better, "confirmed"); }
        }
        return settle(meta, meta.authors.length ? "likely" : "guess");
      }
    } catch {
      note("The browser could not read that page (the site blocks it, or there is no network).");
    }
  }

  /* --- step 5: treat free text as a title and ask Crossref --- */
  if (!/^https?:/i.test(text) && text.length > 8 && fetchImpl) {
    const found = await confirmByTitle(text, null, fetchImpl).catch(() => null);
    if (found) { note("Matched by title on Crossref"); return settle(found, "confirmed"); }
  }

  return fail();
}

async function lookupIds(ids, fetchImpl, note, where = "") {
  if (!fetchImpl) return null;
  const suffix = where ? ` ${where}` : "";
  // Note the identifier before the lookup, so a failed lookup still shows that the right
  // one was found — "we know the DOI, we just could not check it" is useful, actionable news.
  const tried = (label, id, fn) => {
    note(`${label} ${id}${suffix}`);
    return fn().catch(e => { note(`  ${e.message}`); return null; });
  };
  if (ids.arxiv) {
    const m = await tried("arXiv:", ids.arxiv, () => fromArxiv(ids.arxiv, fetchImpl));
    if (m) { note("  → arXiv API"); return m; }
  }
  if (ids.doi) {
    const m = await tried("DOI", ids.doi, () => fromCrossref(ids.doi, fetchImpl));
    if (m) { note("  → Crossref"); return m; }
  }
  if (ids.isbn) {
    const m = await tried("ISBN", ids.isbn, () => fromOpenLibrary(ids.isbn, fetchImpl));
    if (m) { note("  → Open Library"); return m; }
  }
  if (ids.youtube) {
    const m = await tried("Video", ids.youtube, () => fromYouTube(ids.youtube, fetchImpl));
    if (m) { note("  → oEmbed"); return m; }
  }
  for (const [key, db, label] of [["pmid", "pubmed", "PMID"], ["pmcid", "pmc", "PMC id"]]) {
    if (!ids[key]) continue;
    const id = key === "pmcid" ? ids[key].replace(/^PMC/i, "") : ids[key];
    const m = await tried(label, ids[key], () => fromPubmed(id, fetchImpl, db));
    if (!m) continue;
    // NCBI usually knows the DOI, and Crossref's author list is better formed
    if (m.doi) {
      const better = await fromCrossref(m.doi, fetchImpl).catch(() => null);
      if (better) { note("  → PubMed → Crossref"); return better; }
    }
    note("  → PubMed");
    return m;
  }
  return null;
}

function guessKindFromName(name) {
  return /book|scan|chapter/i.test(name) ? "book" : "paper";
}
