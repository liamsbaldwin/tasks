/** Recorded response shapes from the real registries, trimmed to what the resolver reads. */
export const CROSSREF_PNAS = { status: "ok", message: {
  DOI: "10.1073/pnas.0610172104", type: "journal-article",
  title: ["Growth, innovation, scaling, and the pace of life in cities"],
  "container-title": ["Proceedings of the National Academy of Sciences"],
  author: [
    { given: "Luís M. A.", family: "Bettencourt" }, { given: "José", family: "Lobo" },
    { given: "Dirk", family: "Helbing" }, { given: "Christian", family: "Kühnert" },
    { given: "Geoffrey B.", family: "West" },
  ],
  "published-print": { "date-parts": [[2007, 4, 24]] },
  URL: "http://dx.doi.org/10.1073/pnas.0610172104",
}};

export const CROSSREF_SCIENCE = { status: "ok", message: {
  DOI: "10.1126/science.276.5309.122", type: "journal-article",
  title: ["A General Model for the Origin of Allometric Scaling Laws in Biology"],
  "container-title": ["Science"],
  author: [{ given: "Geoffrey B.", family: "West" }, { given: "James H.", family: "Brown" }, { given: "Brian J.", family: "Enquist" }],
  "published-print": { "date-parts": [[1997, 4, 4]] },
}};

/** A bibliographic query returns candidates; the top hit is not always the right one. */
export const CROSSREF_QUERY_FREEMAN = { message: { items: [
  { DOI: "10.1093/sf/soaa010", type: "journal-article", title: ["Structurelessness and the Modern Firm"],
    "container-title": ["Social Forces"], author: [{ given: "R.", family: "Adler" }],
    "published-print": { "date-parts": [[2020]] } },
  { DOI: "10.1525/9780520314207-011", type: "book-chapter", title: ["The Tyranny of Structurelessness"],
    "container-title": ["Berkeley Journal of Sociology"], author: [{ given: "Jo", family: "Freeman" }],
    "published-print": { "date-parts": [[1972]] } },
]}};

export const CROSSREF_QUERY_MISS = { message: { items: [
  { DOI: "10.1000/nope", type: "journal-article", title: ["Something Entirely Different About Fish"],
    author: [{ given: "A.", family: "Nobody" }], "published-print": { "date-parts": [[2001]] } },
]}};

export const ARXIV_CHOLLET = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
  <id>http://arxiv.org/abs/1911.01547v2</id>
  <published>2019-11-05T02:19:24Z</published>
  <title>On the Measure of Intelligence</title>
  <summary>  To make deliberate progress towards more intelligent systems, we need a
clear definition of intelligence.
</summary>
  <author><name>François Chollet</name></author>
</entry></feed>`;

export const OPENLIBRARY_SCOTT = { "ISBN:9780300078152": {
  title: "Seeing Like a State",
  subtitle: "How Certain Schemes to Improve the Human Condition Have Failed",
  authors: [{ name: "James C. Scott" }],
  publish_date: "1999", publishers: [{ name: "Yale University Press" }],
  url: "https://openlibrary.org/books/OL7325675M",
  cover: { medium: "https://covers.openlibrary.org/b/id/1-M.jpg" },
}};

export const LANDING_PAGE_HTML = `<!doctype html><html><head>
<meta name="citation_title" content="Beyond being there">
<meta name="citation_author" content="Hollan, Jim">
<meta name="citation_author" content="Stornetta, Scott">
<meta name="citation_journal_title" content="Proceedings of CHI '92">
<meta name="citation_publication_date" content="1992/06/01">
<meta name="citation_doi" content="10.1145/142750.142769">
</head><body>...</body></html>`;

/** A fetch stand-in that serves the recordings and refuses anything not recorded. */
export function mockFetch(routes) {
  return async (url) => {
    for (const [pattern, value] of routes) {
      if (typeof pattern === "string" ? url.includes(pattern) : pattern.test(url)) {
        if (value === "CORS") throw new TypeError("Failed to fetch");
        if (value === 404) return { ok: false, status: 404, headers: { get: () => "" } };
        const isText = typeof value === "string";
        return {
          ok: true, status: 200,
          headers: { get: () => (isText && value.startsWith("<?xml") ? "application/xml" : "text/html") },
          json: async () => value,
          text: async () => (isText ? value : JSON.stringify(value)),
          arrayBuffer: async () => new TextEncoder().encode(isText ? value : JSON.stringify(value)).buffer,
        };
      }
    }
    throw new TypeError("Failed to fetch");
  };
}
