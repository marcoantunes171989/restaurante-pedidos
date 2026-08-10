const { existsSync, readFileSync, readdirSync, statSync, unlinkSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const expected = {
  petroleum: "rgb(1, 46, 70)",
  orange: "rgb(243, 133, 37)",
  white: "rgb(255, 255, 255)",
};
const compiledCss = readFileSync(
  path.join("dist/assets", readdirSync("dist/assets").find((file) => /^index-.*\.css$/.test(file))),
  "utf8",
);

async function inspect(page, selector) {
  return page.locator(selector).evaluate((element) => {
    const style = getComputedStyle(element);
    const label = element.querySelector("[data-label]");
    const labelStyle = label ? getComputedStyle(label) : null;
    return {
      text: element.textContent.replace(/\s+/g, " ").trim(),
      background: style.backgroundColor,
      color: style.color,
      labelColor: labelStyle?.color || null,
      width: element.getBoundingClientRect().width,
      labelWidth: label?.getBoundingClientRect().width || 0,
    };
  });
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (process.env.CI) throw error;
    console.warn("Chromium do Playwright indisponível; usando fallback npm local.");
    const chromiumPackage = require("@sparticuz/chromium");
    const packageRoot = path.resolve(path.dirname(require.resolve("@sparticuz/chromium")), "..");
    const cachedBinary = "/tmp/chromium";
    if (existsSync(cachedBinary) && statSync(cachedBinary).size === 0) unlinkSync(cachedBinary);
    return chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
      env: { ...process.env, HOME: "/tmp", XDG_CACHE_HOME: "/tmp" },
      executablePath: await chromiumPackage.inflate(path.join(packageRoot, "bin/chromium.br")),
    });
  }
}

(async () => {
  let browser;
  try {
    browser = await launchBrowser();
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      const page = await browser.newPage({ viewport });
      await page.setContent(`<!doctype html>
        <html class="pp-admin-module" data-theme="light">
        <head></head>
        <body>
          <main class="tema-claro-area pp-filter-panel" style="padding:24px;display:flex;gap:16px">
            <button id="selected-chip" class="filter-chip" aria-pressed="true" aria-selected="true"
              style="background:var(--filter-chip-selected);padding:10px 16px">
              <span data-label>Em andamento</span><span aria-hidden="true">•</span>
            </button>
            <button id="primary-button" class="button-primary" style="padding:10px 16px">
              <span data-label>Assumir</span>
            </button>
          </main>
        </body></html>`);
      await page.addStyleTag({ content: compiledCss });
      await page.waitForTimeout(250);

      const chip = await inspect(page, "#selected-chip");
      const primary = await inspect(page, "#primary-button");
      const failures = [];

      if (chip.background !== expected.petroleum) failures.push(`fundo do filtro: ${chip.background}`);
      if (chip.color !== expected.white || chip.labelColor !== expected.white) failures.push(`texto do filtro: ${chip.color}/${chip.labelColor}`);
      if (!chip.text.includes("Em andamento") || chip.labelWidth <= 0) failures.push("rótulo Em andamento ausente ou recortado");
      if (primary.background !== expected.orange) failures.push(`fundo primário: ${primary.background}`);
      if (primary.color !== expected.petroleum || primary.labelColor !== expected.petroleum) failures.push(`texto primário: ${primary.color}/${primary.labelColor}`);

      if (failures.length) throw new Error(`${viewport.width}x${viewport.height}: ${failures.join("; ")}`);
      console.log(`Contraste OK em ${viewport.width}x${viewport.height}`, { chip, primary });
      await page.close();
    }
  } finally {
    await browser?.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
