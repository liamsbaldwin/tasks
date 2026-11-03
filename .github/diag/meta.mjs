import { getDocument } from "../../node_modules/pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync } from "node:fs";
const d = await getDocument({ data: new Uint8Array(readFileSync(process.argv[2])) }).promise;
const m = await d.getMetadata(); console.log(m.info, m.metadata?.getAll?.());
const p = await d.getPage(1); const t = await p.getTextContent(); console.log(t.items.map(i=>i.str).join("|").slice(0,1500));
