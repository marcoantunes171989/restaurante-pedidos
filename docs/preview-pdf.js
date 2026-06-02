const puppeteer = require("puppeteer-core");
const path = require("path");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PDF = "file:///C:/Projetos/restaurante-pedidos/docs/Roteiro-Demonstracao-Cliente.pdf";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const p = await b.newPage();
  await p.setViewport({ width: 820, height: 1060 });
  await p.goto(PDF, { waitUntil: "networkidle2" });
  await sleep(2500);
  await p.screenshot({ path: path.join(__dirname, "img", "pdf-capa.png") });
  // rola para baixo e captura paginas finais (diferenciais/FAQ)
  for (let i = 0; i < 9; i++) { await p.keyboard.press("PageDown"); await sleep(250); }
  await sleep(1200);
  await p.screenshot({ path: path.join(__dirname, "img", "pdf-diferenciais.png") });
  for (let i = 0; i < 4; i++) { await p.keyboard.press("PageDown"); await sleep(250); }
  await sleep(1200);
  await p.screenshot({ path: path.join(__dirname, "img", "pdf-faq.png") });
  await b.close();
  console.log("ok");
})();
