/**
 * Regenerates the sample PDFs in test/fixtures/ with headless Chromium.
 * They are committed, so this only needs running when a new case is added:
 *   node test/make-fixtures.mjs
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('./fixtures/', import.meta.url));
const b = await chromium.launch();

const papers = [
  { file:'doi-footer.pdf', docTitle:'pnas.0610172104.dvi', html:`
    <style>body{font-family:Times,serif;margin:60px 70px}
    h1{font-size:19pt;text-align:center;margin:0 0 18px;font-weight:bold;line-height:1.25}
    .au{font-size:11pt;text-align:center;margin-bottom:4px}
    .aff{font-size:8.5pt;text-align:center;color:#333;font-style:italic}
    .abs{font-size:9pt;column-count:2;column-gap:24px;margin-top:28px;text-align:justify}
    .foot{position:fixed;bottom:24px;font-size:7pt;color:#444}</style>
    <h1>Growth, innovation, scaling, and the pace of life in cities</h1>
    <p class="au">Luís M. A. Bettencourt<sup>*†</sup>, José Lobo<sup>‡</sup>, Dirk Helbing<sup>§</sup>, Christian Kühnert<sup>§</sup>, and Geoffrey B. West<sup>*†¶</sup></p>
    <p class="aff">*Theoretical Division, Los Alamos National Laboratory, Los Alamos, NM 87545</p>
    <div class="abs"><p>Humans create cities in an unprecedented way. Despite the increasing importance of cities, we lack a quantitative framework. Here we show that social organization and human behavior obey scaling relations. ${'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor. '.repeat(14)}</p></div>
    <div class="foot">www.pnas.org/cgi/doi/10.1073/pnas.0610172104 &nbsp;&nbsp; PNAS | April 24, 2007 | vol. 104 | no. 17 | 7301–7306</div>` },

  { file:'arxiv-stamp.pdf', docTitle:'main.pdf', html:`
    <style>body{font-family:Times,serif;margin:64px 76px}
    h1{font-size:20pt;text-align:center;margin:0 0 20px;font-weight:bold}
    .au{font-size:12pt;text-align:center}
    .stamp{position:fixed;left:14px;top:150px;transform:rotate(-90deg);transform-origin:left top;font-size:8pt;color:#333;white-space:nowrap}
    p.body{font-size:10pt;margin-top:26px;text-align:justify}</style>
    <div class="stamp">arXiv:1911.01547v2 [cs.AI] 25 Nov 2019</div>
    <h1>On the Measure of Intelligence</h1>
    <p class="au">François Chollet</p>
    <p class="au" style="font-size:10pt">Google, Inc.<br>fchollet@google.com</p>
    <p class="body">${'To make deliberate progress towards more intelligent systems we need a clear definition of intelligence. '.repeat(18)}</p>` },

  { file:'junk-meta-no-doi.pdf', docTitle:'Microsoft Word - structurelessness_FINAL_v3.doc', html:`
    <style>body{font-family:Georgia,serif;margin:70px 80px}
    h1{font-size:22pt;margin:0 0 10px;font-weight:normal;line-height:1.2}
    .sub{font-size:12pt;color:#222;margin:0 0 26px}
    .au{font-size:13pt;margin:0 0 40px}
    p{font-size:10.5pt;line-height:1.5;text-align:justify}</style>
    <h1>The Tyranny of Structurelessness</h1>
    <p class="au">by Jo Freeman</p>
    <p>${'During the years in which the women’s liberation movement has been taking shape, a great emphasis has been placed on what are called leaderless, structureless groups. '.repeat(12)}</p>` },

  { file:'two-line-title.pdf', docTitle:'', html:`
    <style>body{font-family:Helvetica,Arial,sans-serif;margin:58px 70px}
    h1{font-size:17pt;margin:0 0 14px;font-weight:bold;line-height:1.3;max-width:26em}
    .au{font-size:10.5pt;margin-bottom:2px}
    .aff{font-size:9pt;color:#444}
    p{font-size:9.5pt;margin-top:24px;line-height:1.45}</style>
    <h1>A General Model for the Origin of Allometric Scaling Laws in Biology</h1>
    <p class="au">Geoffrey B. West, James H. Brown, Brian J. Enquist</p>
    <p class="aff">Santa Fe Institute, 1399 Hyde Park Road, Santa Fe, NM 87501, USA</p>
    <p>${'Allometric scaling relations, including the 3/4 power law for metabolic rates, are characteristic of all organisms. '.repeat(16)}</p>
    <p style="font-size:8pt;margin-top:30px">Science 276, 122 (1997); DOI: 10.1126/science.276.5309.122</p>` },

  { file:'book-titlepage.pdf', docTitle:'', html:`
    <style>body{font-family:Garamond,Georgia,serif;margin:0;height:1000px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
    h1{font-size:30pt;margin:0 0 8px;font-weight:normal;letter-spacing:.02em}
    .sub{font-size:15pt;font-style:italic;color:#333;margin-bottom:120px;max-width:20em}
    .au{font-size:14pt;letter-spacing:.12em;text-transform:uppercase}
    .pub{font-size:10pt;margin-top:150px;color:#444}</style>
    <h1>Seeing Like a State</h1>
    <p class="sub">How Certain Schemes to Improve the Human Condition Have Failed</p>
    <p class="au">James C. Scott</p>
    <p class="pub">Yale University Press &nbsp;·&nbsp; New Haven and London</p>` },

  { file:'scanned-no-text.pdf', docTitle:'', html:`
    <style>body{margin:0}div{width:100%;height:1000px;background:
      repeating-linear-gradient(0deg,#e8e8e8 0 2px,#fff 2px 9px)}</style><div></div>` }
];

for(const p of papers){
  const page = await b.newPage();
  await page.setContent(`<!doctype html><html><head><title>${p.docTitle}</title></head><body>${p.html}</body></html>`);
  await page.pdf({ path:DIR + p.file, format:'Letter', printBackground:true });
  await page.close();
}

// A JSTOR download: a labelled cover sheet, then the article's own first page.
await (async()=>{ 
  await page.setContent(`<!doctype html><html><head><title></title></head><body>
<style>@page{margin:0} body{margin:0;font-family:Times,serif}
  .sheet{width:8.5in;height:11in;padding:1in 1.1in;box-sizing:border-box;page-break-after:always}
  .cite{font-size:12pt;line-height:1.7}
  .boiler{font-size:9pt;line-height:1.5;margin-top:34px;color:#111}
  .stamp{font-size:8pt;margin-top:300px}
  .jh{text-align:center} .jh .sm{font-size:9.6pt;letter-spacing:.2em}
  .jh .bg{font-size:16.4pt;letter-spacing:.06em;line-height:1.25}
  .vol{text-align:center;font-size:11.3pt;margin:14px 0 26px}
  .at{text-align:center;font-size:8pt;letter-spacing:.06em;margin-bottom:14px}
  .au{text-align:center;font-size:7.6pt;letter-spacing:.05em;margin-bottom:22px}
  .ab{font-size:6.5pt;line-height:1.5;text-align:justify;margin:0 40px}</style>
<div class="sheet">
  <div class="cite">Signaling Games and Stable Equilibria<br>
  Author(s): In-Koo Cho and David M. Kreps<br>
  Source: <i>The Quarterly Journal of Economics</i>, Vol. 102, No. 2 (May, 1987),<br>
  pp. 179-222<br>
  Published by: Oxford University Press<br>
  Stable URL: https://www.jstor.org/stable/1885060</div>
  <div class="boiler">JSTOR is a not-for-profit service that helps scholars, researchers, and students discover, use, and build upon a wide
  range of content in a trusted digital archive. We use information technology and tools to increase productivity and
  facilitate new forms of scholarship. For more information about JSTOR, please contact support@jstor.org.<br><br>
  Your use of the JSTOR archive indicates your acceptance of the Terms &amp; Conditions of Use, available at
  https://about.jstor.org/terms</div>
  <div class="stamp">This content downloaded from<br>129.246.254.203 on Wed, 26 Aug 2026 13:22:30 UTC<br>
  All use subject to https://about.jstor.org/terms</div>
</div>
<div class="sheet">
  <div class="jh"><div class="sm">THE</div><div class="bg">QUARTERLY JOURNAL<br>OF ECONOMICS</div></div>
  <div class="vol">Vol. CII &nbsp; May 1987 &nbsp; Issue 2</div>
  <div class="at">SIGNALING GAMES AND STABLE EQUILIBRIA*</div>
  <div class="au">IN-KOO CHO AND DAVID M. KREPS</div>
  <div class="ab">Games in which one party conveys private information to a second through messages typically
  admit large numbers of sequential equilibria, as the second party may entertain a wide range of beliefs.
  ${'We consider refinements that restrict those beliefs. '.repeat(10)}</div>
</div></body></html>`);
  await page.pdf({ path:DIR+'jstor-cover.pdf', width:'8.5in', height:'11in', printBackground:true });
})();
await b.close();
console.log('wrote', papers.length + 1, 'fixture PDFs to', DIR);
