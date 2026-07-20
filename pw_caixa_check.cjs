const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));

  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(12000); // deixa o client tentar/desistir e cair na tela de login

  await page.locator('input[placeholder="seu@email.com"]').fill('cozinha.hamburgueria@demo.com');
  await page.locator('#login-senha').fill('123456');
  await page.locator('button', { hasText: /^Entrar/i }).first().click();
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(6000);

  const texto = await page.evaluate(() => document.body.innerText);
  console.log('--- texto da tela pós-login (primeiros 1200 chars) ---');
  console.log(texto.slice(0, 1200));
  await page.screenshot({ path: 'pw_caixa_1_pos_login.png', fullPage: true });

  console.log('\nErros:', errors.length ? JSON.stringify(errors) : 'nenhum');
  await browser.close();
}
main().catch((e) => { console.error('ERRO:', e); process.exit(1); });
