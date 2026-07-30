---
name: preview-navegavel
description: Cria um PREVIEW NAVEGÁVEL e isolado de qualquer tela/componente do projeto restaurante-pedidos, alimentado com DADOS DE EXEMPLO, para conferência VISUAL antes de aplicar/publicar — inclusive de telas que dependem de Supabase, URL params ou contexto (caixa, cardápio do cliente, checkout, cards). Use SEMPRE que alterar/criar UI e for preciso ver o resultado renderizado (não só build/teste), quando pedirem "preview", "conferência visual", "mostra como fica", "screenshot", "renderiza a tela", "valida no navegador", ou quando o componente não abre sozinho sem dados. Trabalha junto de responsabilidade-qualidade, compatibilidade-dispositivos e testes-apos-execucao.
---

# Preview navegável com dados de exemplo

Sempre que uma alteração de UI precisar de **conferência visual** (e não só
`build`/`test`), monte um **preview isolado** do componente/tela com **dados de
exemplo** e tire **screenshots** em 3 tamanhos. Vale especialmente para telas que
não abrem sozinhas (dependem de Supabase, `?mesa=`, carrinho, login etc.).

Princípios:
- **Isolado**: não subir o app inteiro nem depender de banco. Renderiza só o alvo.
- **Dados de exemplo realistas**: parecidos com produção (nomes, preços, itens,
  formas de pagamento, mesa/comanda) — evite 1 item só; use um caso representativo.
- **Descartável**: arquivos de preview NUNCA vão para commit. Limpe ao final e
  reverta qualquer `export` temporário.
- **3 tamanhos**: desktop 1280, tablet ~820, celular 390 (foco no celular, é PWA).

## Passo a passo

### 1. Tornar o alvo importável (se necessário)
- Componente já exportado (ex.: `TabletProductCard`, `CheckoutKeypad`): importe direto.
- Alvo interno de um arquivo grande (ex.: `CashierView` dentro de `src/App.jsx`,
  ou um card definido dentro de `CardapioPublico.jsx`): duas opções
  1. **export temporário** — `sed -i 's/^function CashierView(/export function CashierView(/' src/App.jsx` (reverter no fim), ou
  2. **reproduzir o markup** do bloco no próprio preview (útil quando o alvo é um
     trecho JSX acoplado a muito estado). Reproduza fielmente as MESMAS classes.

### 2. Criar o harness (na raiz do projeto)
`preview.html`:
```html
<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Preview</title></head><body><div id="root"></div><script type="module" src="/preview.jsx"></script></body></html>
```
`preview.jsx` — importa `./src/index.css` (traz os tokens `--pp-*` / `--client-*`,
que são globais em `:root`) + o alvo + dados de exemplo. Para estado interativo,
use um wrapper com `useState` (ex.: editar item, aplicar desconto, abrir conta):
```jsx
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./src/index.css";
import { CashierView } from "./src/App"; // ou o componente exportado
function Harness() {
  const [orders, setOrders] = useState(ORDERS_EXEMPLO);
  return <CashierView orders={orders} formasPagamento={FORMAS} products={PRODUCTS}
    currentUser={{ name: "Lucas Oliveira" }} lojaInfo={{ id: 1, nome: "Burger Station", prefixo: "HAM" }}
    editarItensPedido={async (id, itens) => setOrders(c => c.map(o => o.id === id ? { ...o, items: itens } : o))}
    baixarComandas={async () => {}} auditar={() => {}} conexaoOk /> ;
}
createRoot(document.getElementById("root")).render(<div style={{ minHeight: "100vh" }}><Harness /></div>);
```

### 3. Rodar o dev server (background) e esperar subir
Use o Bash em `run_in_background: true` para `npm run dev`; depois faça um loop de
espera pelo HTTP 200 (nunca `sleep` fixo encadeado):
```bash
for i in $(seq 1 25); do sleep 1; c=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ 2>/dev/null); [ "$c" = "200" ] && break; done
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/preview.html
```

### 4. Screenshots + erros de runtime (Playwright)
Chromium já vem pronto (`executablePath: '/opt/pw-browsers/chromium'`,
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` — NÃO rodar `playwright install`).
Capture erros de página e as 3 telas; interaja quando fizer sentido (abrir conta,
clicar botão, aplicar desconto) e salve os PNG no diretório de scratchpad:
```js
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w,h,n] of [[1280,800,'desktop'],[820,1180,'tablet'],[390,844,'mobile']]) {
  const p = await b.newPage({ viewport:{ width:w, height:h }, deviceScaleFactor:2 });
  const errs=[]; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5173/preview.html', { waitUntil:'networkidle' });
  await p.waitForTimeout(600);
  console.log(n, 'erros:', errs.slice(0,3));
  await p.screenshot({ path: `${SCRATCH}/preview-${n}.png`, fullPage: n==='mobile' });
  await p.close();
}
await b.close();
```
Depois **leia os PNG** (ferramenta Read) e confira: fidelidade ao pedido/mockup,
paleta oficial, sem overflow horizontal, toques ≥44px, **zero `pageerror`**.

### 5. Limpar SEMPRE (não commitar lixo)
```bash
rm -f preview.html preview.jsx _pw_*.mjs
# reverter export temporário, se usou:
sed -i 's/^export function CashierView(/function CashierView(/' src/App.jsx
```
Confirme `git status --short` limpo (só os arquivos que você realmente alterou).
Encerre o dev server (o processo de background é finalizado ao terminar).

## Regras
- Preview é para CONFERÊNCIA, não vai para produção — nunca deixe `preview.*` no commit.
- Imagens externas (Unsplash etc.) podem falhar pelo proxy no preview — é só o
  harness; o layout/spacing continua válido para conferência.
- Dados de exemplo por escrito, nunca dados reais de cliente.
- Combine com **compatibilidade-dispositivos** (conforto por tamanho) e
  **responsabilidade-qualidade** (nada pode quebrar) ao avaliar os screenshots.
