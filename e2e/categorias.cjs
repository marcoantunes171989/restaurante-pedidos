// ════════════════════════════════════════════════════════════
//  E2E — sincronização categorias × produtos do cardápio digital
//  (barra sticky, clique -> scroll compensado, scroll-spy).
//
//  Roda num navegador real (Playwright — Chromium e WebKit) contra a loja
//  demo "Matriz" (prefixo CMD, sempre presente no banco). Uso:
//    node e2e/categorias.cjs                         # produção
//    PW_URL="http://localhost:5173/cardapio?e=CMD" \
//      node e2e/categorias.cjs                        # dev local
//
//  Existe porque os testes unitários (src/lib/cardapioCategorias.test.js)
//  cobrem só a lógica pura — os dois bugs reais mais sérios encontrados
//  nesta função (conflito de scrollIntoView cancelando o scroll vertical, e
//  headerH/catBarH travados em 0 por uma corrida entre o skeleton e o
//  carregamento dos dados) só aparecem com scroll/layout/timing de um
//  navegador de verdade — impossível de reproduzir em jsdom.
// ════════════════════════════════════════════════════════════
const { chromium, webkit } = require('playwright');

const URL = process.env.PW_URL || 'https://www.pedidoprime.com.br/cardapio?e=CMD';
const semEstrela = (s) => (s || '').replace(/^★\s*/, '');

async function state(page) {
  return page.evaluate(() => {
    const root = document.getElementById('root');
    const header = document.querySelector('header');
    const catBar = document.querySelector('.pp-noscrollbar.sticky.z-20');
    const cats = [...document.querySelectorAll('button')].filter(b => b.closest('.pp-noscrollbar.sticky.z-20'));
    const active = cats.filter(b => b.getAttribute('aria-current') === 'true');
    const sections = [...document.querySelectorAll('section[id^="cat-"]')];
    return {
      scrollTop: root.scrollTop,
      scrollHeight: root.scrollHeight,
      clientHeight: root.clientHeight,
      headerH: header ? Math.round(header.getBoundingClientRect().height) : null,
      catBarH: catBar ? Math.round(catBar.getBoundingClientRect().height) : null,
      catBarBg: catBar ? getComputedStyle(catBar).backgroundColor : null,
      activeCount: active.length,
      activeLabels: active.map(b => b.textContent.trim()),
      catLabels: cats.map(b => b.textContent.trim()),
      sectionTops: sections.map(s => ({ id: s.id, top: Math.round(s.getBoundingClientRect().top) })),
    };
  });
}

async function clickCategoria(page, label) {
  const btn = page.locator('.pp-noscrollbar.sticky.z-20 button', { hasText: label }).first();
  await btn.click();
  // espera a rolagem suave assentar (scrollend real, com folga)
  await page.waitForTimeout(1100);
}

async function runSuite(browserType, name, viewport) {
  const browser = await browserType.launch();
  const page = await browser.newPage({ viewport });
  const consoleIssues = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleIssues.push(msg.text()); });
  page.on('pageerror', (err) => consoleIssues.push('PAGEERROR: ' + err.message));

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const results = { engine: name, viewport, checks: [] };
  const push = (desc, pass, detail) => results.checks.push({ desc, pass, detail });

  // 1) Estado inicial: "Todos" ativo, exatamente 1 ativo, barra opaca
  let s = await state(page);
  push('Todos ativo ao abrir', s.activeLabels.length === 1 && /Todos/.test(s.activeLabels[0]), s.activeLabels);
  push('Exatamente 1 categoria ativa (inicial)', s.activeCount === 1, s.activeCount);
  push('Barra de categorias com fundo opaco (rgb sólido, alpha=1)', /rgba?\(255,\s*255,\s*255(,\s*1)?\)/.test(s.catBarBg), s.catBarBg);
  const FIXED_OFFSET = (s.headerH || 0) + (s.catBarH || 0);
  push('headerH+catBarH medidos (~150px)', FIXED_OFFSET > 100 && FIXED_OFFSET < 220, FIXED_OFFSET);

  // 2) Clique em cada categoria (exceto Todos) — verifica pouso ~8px abaixo da barra.
  // Exceção esperada: categorias perto do fim de um cardápio curto não têm
  // conteúdo suficiente abaixo pra pousar exatamente no offset (o scroll
  // clampa no máximo possível) — nesse caso só confere que o scroll está
  // no máximo (não sobrou "sobra" de rolagem não aproveitada).
  const maxScroll0 = s.scrollHeight - s.clientHeight;
  for (const label of s.catLabels.filter((l) => !/Todos/.test(l))) {
    await clickCategoria(page, label);
    const s2 = await state(page);
    const pousoExato = s2.sectionTops.some((x) => Math.abs(x.top - (FIXED_OFFSET + 8)) <= 20);
    const noMaximo = s2.scrollTop >= maxScroll0 - 2;
    push(`Clique "${label}": pousa a ~${FIXED_OFFSET + 8}px do topo OU no scroll máximo (cardápio curto)`, pousoExato || noMaximo, { sectionTops: s2.sectionTops, scrollTop: s2.scrollTop, maxScroll: maxScroll0 });
    push(`Clique "${label}": exatamente 1 categoria ativa`, s2.activeCount === 1, s2.activeLabels);
    push(`Clique "${label}": categoria ativa é a clicada`, semEstrela(s2.activeLabels[0]) === label, s2.activeLabels);
  }

  // 3) "Todos" de volta ao topo
  await clickCategoria(page, 'Todos');
  let s3 = await state(page);
  // "Todos" usa stickyOffset:0 (rola até o topoRef, que fica logo após o
  // cabeçalho no fluxo do documento) — o pouso correto é scrollTop ≈ headerH
  // (cabeçalho+barra ficam presos e o conteúdo aparece logo abaixo deles),
  // não scrollTop=0.
  push('Clique "Todos": volta pro topo (scrollTop ≈ headerH)', s3.scrollTop <= (s3.headerH || 0) + 15, { scrollTop: s3.scrollTop, headerH: s3.headerH });
  push('Clique "Todos": categoria ativa volta a ser Todos', s3.activeLabels.length === 1 && /Todos/.test(s3.activeLabels[0]), s3.activeLabels);

  // 4) Scroll manual, passo a passo, verificando SEMPRE exatamente 1 ativo
  await page.evaluate(() => document.getElementById('root').scrollTo({ top: 0 }));
  await page.waitForTimeout(300);
  const passos = [];
  const maxScroll = s.scrollHeight - s.clientHeight;
  const N = 12;
  let algumaFalhaMultiplo = false;
  let ultimoScrollAtivo = null;
  for (let i = 0; i <= N; i++) {
    const alvo = Math.round((maxScroll * i) / N);
    await page.evaluate((y) => document.getElementById('root').scrollTo({ top: y, behavior: 'instant' }), alvo);
    await page.waitForTimeout(250); // assenta o IntersectionObserver
    const st = await state(page);
    passos.push({ scrollTop: st.scrollTop, activeCount: st.activeCount, active: st.activeLabels });
    if (st.activeCount !== 1) algumaFalhaMultiplo = true;
    ultimoScrollAtivo = st.activeLabels[0];
  }
  push('Durante rolagem manual (12 amostras), SEMPRE exatamente 1 categoria ativa', !algumaFalhaMultiplo, passos);

  // 5) No fundo da página, a categoria REALMENTE fixa no topo fica ativa —
  // não necessariamente a última do cardápio. Se sobrar espaço (categorias
  // curtas empilhadas no fim, sem conteúdo suficiente pra rolar cada uma até
  // a linha), a fixa é a primeira dessas cujo topo já passou da linha —
  // verificado aqui com a MESMA regra que o app usa (não com um valor fixo
  // "deveria ser a última"), pra não voltar a validar o próprio bug.
  await page.evaluate(() => document.getElementById('root').scrollTo({ top: 999999 }));
  await page.waitForTimeout(600);
  const sFim = await state(page);
  const linhaFim = FIXED_OFFSET;
  // Reconstrói a mesma varredura "última seção cujo topo já passou da linha".
  const secoesEmOrdem = sFim.sectionTops; // já vem na ordem do DOM (= ordem do cardápio)
  let ultimaQuePassou = null;
  for (const sec of secoesEmOrdem) { if (sec.top - linhaFim <= 0) ultimaQuePassou = sec; }
  const tituloEsperado = ultimaQuePassou
    ? await page.evaluate((id) => document.querySelector(`#${id} h2`)?.textContent, ultimaQuePassou.id)
    : null;
  push(`No final da página, a seção realmente fixa no topo ("${tituloEsperado}") fica ativa`, tituloEsperado ? semEstrela(sFim.activeLabels[0]) === tituloEsperado : true, { ativos: sFim.activeLabels, secoes: sFim.sectionTops, linha: linhaFim });

  push('Sem erros no console durante todo o fluxo', consoleIssues.length === 0, consoleIssues);

  await browser.close();
  return results;
}

(async () => {
  const suites = [];
  suites.push(await runSuite(chromium, 'Chromium', { width: 390, height: 844 })); // mobile
  suites.push(await runSuite(chromium, 'Chromium', { width: 1440, height: 900 })); // desktop
  suites.push(await runSuite(webkit, 'WebKit (proxy Safari)', { width: 390, height: 844 })); // mobile safari-like

  let totalPass = 0, totalFail = 0;
  for (const suite of suites) {
    console.log(`\n════════ ${suite.engine} — ${suite.viewport.width}x${suite.viewport.height} ════════`);
    for (const c of suite.checks) {
      const mark = c.pass ? 'OK  ' : 'FAIL';
      console.log(`[${mark}] ${c.desc}`);
      if (!c.pass) { console.log('       detail:', JSON.stringify(c.detail)); totalFail++; } else totalPass++;
    }
  }
  console.log(`\n════════ TOTAL: ${totalPass} passaram, ${totalFail} falharam ════════`);
})();
