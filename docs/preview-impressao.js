const puppeteer = require("puppeteer-core");
const path = require("path");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:5180";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1280, height: 800 } });
  const page = await b.newPage();
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await sleep(2500);
  const setVal = async (sel, v) => page.evaluate((s, val) => { const el = document.querySelector(s); const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; set.call(el, val); el.dispatchEvent(new Event("input", { bubbles: true })); }, sel, v);
  const clickTxt = (re) => page.evaluate((r) => { const b = [...document.querySelectorAll("button")].find((x) => new RegExp(r).test(x.textContent)); if (b) b.click(); return !!b; }, re.source);

  await setVal('input[placeholder="seu@email.com"]', "gestor.hamburgueria@demo.com");
  await setVal('input[type="password"]', "123456");
  await clickTxt(/Entrar/); await sleep(3500);
  await clickTxt(/Relatórios de vendas/); await sleep(1200);

  // captura o popup do PDF/Imprimir (relatório A4)
  const novaPagina = new Promise((res) => b.once("targetcreated", async (t) => { const p = await t.page(); res(p); }));
  await clickTxt(/PDF \/ Imprimir/);
  const pop = await Promise.race([novaPagina, sleep(4000).then(() => null)]);
  if (pop) {
    await pop.setViewport({ width: 794, height: 1123 });
    await sleep(1500);
    await pop.screenshot({ path: path.join(__dirname, "img", "impressao-relatorio-a4.png") });
    console.log("capturado: relatorio A4");
  } else { console.log("popup nao capturado"); }
  await b.close();
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
