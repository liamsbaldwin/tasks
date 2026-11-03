export default {
  async fetch(req) {
    const U = "https://opportunityinsights.org/wp-content/uploads/2026/09/DigitalTwins_FullPaper.pdf";
    const out = [];
    for (const u of ["https://archive.org/wayback/available?url=" + encodeURIComponent(U), "https://web.archive.org/web/2id_/" + U]) {
      try {
        const r = await fetch(u, { headers: { "user-agent": "Marginalia/1.0 (personal reading notebook)" }, redirect: "follow" });
        const buf = new Uint8Array(await r.arrayBuffer());
        out.push({ u, status: r.status, url: r.url, ct: r.headers.get("content-type"), len: buf.length, head: new TextDecoder().decode(buf.slice(0, 300)) });
      } catch (e) { out.push({ u, error: String(e) }); }
    }
    return new Response(JSON.stringify(out, null, 2));
  },
};
