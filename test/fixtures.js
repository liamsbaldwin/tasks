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

export const CROSSREF_JSTOR = { status: "ok", message: {
  DOI: "10.2307/1885060", type: "journal-article",
  title: ["Signaling Games and Stable Equilibria"],
  "container-title": ["The Quarterly Journal of Economics"],
  author: [{ given: "In-Koo", family: "Cho" }, { given: "David M.", family: "Kreps" }],
  "published-print": { "date-parts": [[1987, 5]] },
  publisher: "Oxford University Press (OUP)",
}};

/** The cover text exactly as pdf.js extracts it from a real JSTOR download. */
export const JSTOR_COVER_TEXT =
  "Signaling Games and Stable Equilibria Author(s): In-Koo Cho and David M. Kreps " +
  "Source: The Quarterly Journal of Economics , May, 1987, Vol. 102, No. 2 (May, 1987), pp. 179-222 " +
  "Published by: Oxford University Press Stable URL: https://www.jstor.org/stable/1885060 " +
  "JSTOR is a not-for-profit service that helps scholars, researchers, and students discover, use, and " +
  "build upon a wide range of content in a trusted digital archive. " +
  "This content downloaded from 129.246.254.203 on Wed, 26 Aug 2026 13:22:30 UTC " +
  "All use subject to https://about.jstor.org/terms";

export const CROSSREF_NBER = { message: {
  DOI: "10.3386/w1885", type: "report", title: ["Signaling Games and Stable Equilibria"],
  author: [{ given: "In-Koo", family: "Cho" }], publisher: "National Bureau of Economic Research",
  "published-print": { "date-parts": [[1986]] },
}};

export const PUBMED_BETTENCOURT = { result: {
  uids: ["17360779"],
  "17360779": {
    uid: "17360779", pubdate: "2007 Apr 24", source: "Proc Natl Acad Sci U S A",
    fulljournalname: "Proceedings of the National Academy of Sciences of the United States of America",
    title: "Growth, innovation, scaling, and the pace of life in cities.",
    authors: [{ name: "Bettencourt LM", authtype: "Author" }, { name: "Lobo J", authtype: "Author" }],
    articleids: [{ idtype: "pubmed", value: "17360779" }, { idtype: "doi", value: "10.1073/pnas.0610172104" }],
  },
}};

export const OEMBED_TALK = {
  title: "The surprising math of cities and corporations",
  author_name: "TED",
  provider_name: "YouTube",
  thumbnail_url: "https://i.ytimg.com/vi/XyCY6mjWOPc/hqdefault.jpg",
};
