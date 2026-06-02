const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:5180";
const IMG = path.join(__dirname, "img");
if (!fs.existsSync(IMG)) fs.mkdirSync(IMG);

const URL = "https://rwnzggjxhxnfrhstbxkm.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bnpnZ2p4aHhuZnJoc3RieGttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjk2MjUsImV4cCI6MjA5NTc0NTYyNX0.hkCTJF65URa5zN8TBfV72vLJzj71Ie8jmKLRi4_bzfM";
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rest(method, p, body) {
  const o = { method, headers: { ...H, Prefer: "return=minimal" } };
  if (body) o.body = JSON.stringify(body);
  return fetch(`${URL}/rest/v1/${p}`, o);
}

// Pedidos temporários (loja_id 10 = Pizzaria Forno & Lenha)
const tmp = [
  { id: "PED-DEMO91", mesa: "Mesa 05", comanda: "PIZ-000091", cliente: "Ana Paula", status: "recebido", status_pagamento: "aberto", itens: [{ name: "Pizza Calabresa", quantity: 1, price: 44.9 }, { name: "Refrigerante 2L", quantity: 1, price: 14.9 }], loja_id: 10 },
  { id: "PED-DEMO92", mesa: "Mesa 08", comanda: "PIZ-000092", cliente: "Bruno Costa", status: "preparando", status_pagamento: "aberto", itens: [{ name: "Pizza Quatro Queijos", quantity: 1, price: 52.9 }], loja_id: 10 },
  { id: "PED-DEMO93", mesa: "Mesa 12", comanda: "PIZ-000093", cliente: "Carla Dias", status: "entregue", status_pagamento: "aberto", itens: [{ name: "Pizza Portuguesa", quantity: 1, price: 48.9 }, { name: "Pizza Margherita", quantity: 1, price: 42.9 }], loja_id: 10 },
];

async function login(page, email) {
  await page.waitForSelector('input[placeholder="seu@email.com"]', { timeout: 15000 });
  await page.$eval('input[placeholder="seu@email.com"]', (e) => (e.value = ""));
  await page.type('input[placeholder="seu@email.com"]', email);
  await page.$eval('input[type="password"]', (e) => (e.value = ""));
  await page.type('input[type="password"]', "123456");
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Entrar/.test(b.textContent)).click());
  await sleep(3500);
}
async function logout(page) {
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Sair"); if (b) b.click(); });
  await sleep(1500);
}
async function clickText(page, txt) {
  await page.evaluate((t) => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === t); if (b) b.click(); }, txt);
  await sleep(1500);
}
async function shot(page, nome) {
  await page.screenshot({ path: path.join(IMG, nome + ".png") });
  console.log("  capturado: " + nome);
}

(async () => {
  console.log("Inserindo pedidos temporarios...");
  for (const t of tmp) { await rest("DELETE", `tab_pedidos?id=eq.${t.id}`); }
  await rest("POST", "tab_pedidos", tmp);

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--window-size=1280,800"], defaultViewport: { width: 1280, height: 800 } });
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await sleep(2500);

  await shot(page, "01-login");

  // Admin geral -> Empresas
  await login(page, "admin@restaurante.com");
  await clickText(page, "🏪Empresas");
  await shot(page, "02-empresas");
  await logout(page);

  // Cardapio (sushi - imagens). Aguarda as fotos carregarem (loremflickr e lento).
  await login(page, "garcom.sushi@demo.com");
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll("img")].filter((i) => i.src.includes("loremflickr"));
    return imgs.length >= 4 && imgs.slice(0, 8).every((i) => i.complete && i.naturalWidth > 0);
  }, { timeout: 30000 }).catch(() => {});
  await sleep(1500);
  await shot(page, "03-cardapio");
  await logout(page);

  // Dashboard (gestor pizzaria)
  await login(page, "gestor.pizzaria@demo.com");
  await sleep(1500);
  await shot(page, "04-dashboard");
  await logout(page);

  // Cozinha (pizzaria) - mostra PIZ-000091/000092 (oculta o aviso de tela cheia)
  await login(page, "cozinha.pizzaria@demo.com");
  await sleep(2000);
  await page.evaluate(() => {
    const p = [...document.querySelectorAll("p")].find((e) => /Abrir cozinha em tela cheia/.test(e.textContent));
    if (p) { let el = p; while (el && !(typeof el.className === "string" && el.className.includes("inset-0"))) el = el.parentElement; if (el) el.style.display = "none"; }
  });
  await sleep(400);
  await shot(page, "05-cozinha");
  await logout(page);

  // Caixa (pizzaria) - le PIZ-000093 entregue
  await login(page, "caixa.pizzaria@demo.com");
  await sleep(1500);
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /Ler comanda/.test(x.textContent)); if (b) b.click(); });
  await sleep(1000);
  await page.type('input[placeholder^="Ex.: PIZ"]', "PIZ-000093");
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Confirmar"); if (b) b.click(); });
  await sleep(1500);
  await shot(page, "06-caixa");

  await browser.close();

  console.log("Removendo pedidos temporarios...");
  for (const t of tmp) { await rest("DELETE", `tab_pedidos?id=eq.${t.id}`); }
  console.log("Concluido.");
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
