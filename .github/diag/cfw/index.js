export default {
  async fetch(req) {
    const U = "https://opportunityinsights.org/wp-content/uploads/2026/09/DigitalTwins_FullPaper.pdf";
    const out = [];
    for (const ua of ["Marginalia/1.0 (personal reading notebook)", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"]) {
      try {
        const r = await fetch(U, { headers: { "user-agent": ua, accept: "*/*" }, redirect: "follow" });
        const buf = new Uint8Array(await r.arrayBuffer());
        const h = {}; for (const [k, v] of r.headers) h[k] = v;
        out.push({ ua, status: r.status, url: r.url, len: buf.length, head: new TextDecoder().decode(buf.slice(0, 200)), h });
      } catch (e) { out.push({ ua, error: String(e) }); }
    }
    return new Response(JSON.stringify(out, null, 2));
  },
};
