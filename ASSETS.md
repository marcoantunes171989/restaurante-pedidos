# ASSETS.md — Landing Pedido Prime

Catálogo de imagens reais (fotografia) necessárias para a landing page que
**não podem ser geradas por código**. Até a entrega das fotos definitivas,
cada item usa um placeholder cinza em SVG, no mesmo tamanho exato do
arquivo final — basta substituir o arquivo (mantendo o nome, ou trocando a
extensão para `.jpg`/`.webp` e ajustando o import/caminho em `content.js`).

Nenhuma foto de estoque genérica foi inventada ou baixada — os placeholders
são deliberadamente cinza/tracejados para não serem confundidos com uma
foto real durante o desenvolvimento.

## Convenções

- Todo `<img>` que referenciar um destes assets deve usar `width`/`height`
  explícitos (evita layout shift) e `loading="lazy"`, exceto a imagem do
  Hero (`hero-bg`), que deve ter `fetchpriority="high"` e carregar sem lazy
  (é o LCP da página).
- Formato final recomendado: WebP (ou AVIF), com fallback JPEG se preciso.
- Compressão alvo: ≤ 200KB para os cards de segmento, ≤ 400KB para o hero e
  a foto do gestor(a).

## Inventário

| # | Caminho | Dimensões | Aspect ratio | Descrição |
|---|---|---|---|---|
| 1 | `public/img/hero-bg.svg` → `hero-bg.webp` | 1920×1080 | 16:9 | Foto do salão de um restaurante real (cliente ou ambiente autorizado), iluminação quente/aconchegante, levemente desfocada ao fundo — usada como wash atmosférico atrás do cluster de dispositivos no Hero. Hoje o Hero usa um gradiente radial terracota/dourado no lugar desta foto; a foto é opcional/upgrade futuro, não bloqueia o lançamento. |
| 2 | `public/img/segmentos/hamburguerias.svg` → `.webp` | 480×360 | 4:3 | Foto de uma hamburgueria em operação (balcão, chapa ou prato montado) para o card "Hamburguerias" da seção Segmentos. |
| 3 | `public/img/segmentos/pizzarias.svg` → `.webp` | 480×360 | 4:3 | Foto de uma pizzaria (forno, pizza pronta ou salão) para o card "Pizzarias". |
| 4 | `public/img/segmentos/bares-e-churrascarias.svg` → `.webp` | 480×360 | 4:3 | Foto de bar ou churrascaria (chopeira, espeto, mesa de bar) para o card "Bares e Churrascarias". |
| 5 | `public/img/segmentos/restaurantes.svg` → `.webp` | 480×360 | 4:3 | Foto de salão de restaurante tradicional para o card "Restaurantes". |
| 6 | `public/img/segmentos/cafeterias.svg` → `.webp` | 480×360 | 4:3 | Foto de cafeteria (balcão, café, ambiente) para o card "Cafeterias". |
| 7 | `public/img/segmentos/espetarias.svg` → `.webp` | 480×360 | 4:3 | Foto de espetaria (espetos na grelha ou montados) para o card "Espetarias". |
| 8 | `public/img/segmentos/padarias.svg` → `.webp` | 480×360 | 4:3 | Foto de padaria (vitrine de pães/doces ou balcão) para o card "Padarias". |
| 9 | `public/img/segmentos/sorveterias.svg` → `.webp` | 480×360 | 4:3 | Foto de sorveteria (potes de sorvete, casquinha ou balcão) para o card "Sorveterias". |
| 10 | `public/img/owner.svg` → `owner.webp` | 800×1000 | 4:5 | Foto vertical de um gestor(a)/dono(a) de restaurante real (com autorização de uso de imagem), para a coluna 3 da seção "Benefícios reais" em telas ≥1100px. |

## Não-imagens pendentes (dados reais, não asset visual)

Estes itens também não podem ser inventados e ainda não foram fornecidos:

- **CNPJ** da empresa, para o rodapé.
- **Links reais de redes sociais** (Instagram, WhatsApp Business, etc.), para o rodapé.

Enquanto não chegam, o rodapé não deve exibir CNPJ nem ícones de redes
sociais — omitir é preferível a inventar.

## Já resolvido sem foto real (não precisa de asset)

- **Screenshots de tela do sistema** (dashboard, tablet, cardápio público,
  caixa) usados no `DeviceStack` do Hero e na seção "Gestão inteligente":
  serão gerados via Playwright contra a aplicação real rodando localmente
  (não são fotografia de terceiros nem mockup inventado) — ver Fase 2.
- **QR Code** do CTA final: gerado via SVG (pacote `qrcode`, já usado no
  projeto para comandas), não é uma imagem estática — ver Fase 5.
