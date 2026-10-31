const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on("console", m => { if (m.type() === "error") console.log("console:", m.text()); });
  await p.goto("http://localhost:4321/");
  await p.waitForTimeout(1500);
  await p.evaluate(() => { view = "sources"; render(); });
  await p.waitForSelector("#capture", { state: "attached", timeout: 20000 });
  await p.evaluate(() => {
    const el = document.getElementById("capture");
    el.value = "https://home.uchicago.edu/~rmyerson/stratofc2010.pdf";
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  for (let i = 0; i < 40; i++) {
    const r = await p.evaluate(() => data.readings.find(x => /stratofc/.test(x.pasted || "")));
    if (r) { await p.waitForTimeout(500); console.log(JSON.stringify(await p.evaluate(() => data.readings.find(x => /stratofc/.test(x.pasted || ""))))); break; }
    await p.waitForTimeout(500);
  }
  console.log("steps:", await p.evaluate(() => document.getElementById("steps")?.innerText));
  await b.close();
})();
