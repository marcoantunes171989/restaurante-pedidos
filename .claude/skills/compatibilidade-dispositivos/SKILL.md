---
name: compatibilidade-dispositivos
description: Compatibilidade cross-platform e conforto por dispositivo para TODA alteração de tela no projeto restaurante-pedidos (PWA). Use SEMPRE que criar/alterar qualquer tela, componente ou layout. Garante que a mudança funcione e fique confortável em Windows, Android e iOS, e que o tamanho/uso se adapte bem a cada dispositivo — com foco em celular. Gatilhos: qualquer edição de UI/layout, "responsivo", "celular", "tablet", "iOS", "Android", "Windows", "PWA", "toque", "safe area", "não coube", "ficou apertado", "valida nos dispositivos".
---

# Compatibilidade de dispositivos — Windows · Android · iOS

Este projeto é um **PWA** usado em **celular, tablet e desktop**, instalado ou no
navegador. Toda alteração de tela deve ser **validada nos três sistemas
operacionais (Windows, Android, iOS)** e ficar **confortável de acordo com o
tamanho do dispositivo**, priorizando o **mobile**. O que funciona no desktop
redimensionado NÃO garante que funciona no aparelho real.

## Regra: validar nos 3 sistemas a cada alteração
Antes de concluir qualquer mudança de tela, verifique o comportamento em:
- 🪟 **Windows** (navegador desktop + PWA instalado): mouse/teclado, estados de
  hover/foco, janelas grandes e redimensionamento.
- 🤖 **Android** (Chrome + PWA): toque, gesto de voltar, barra de endereço que
  aparece/some (usar `dvh`), instalação/atualização do PWA.
- 🍏 **iOS** (Safari + PWA "adicionar à tela de início"): é o mais restritivo —
  ver checklist abaixo.

## Armadilhas por sistema (checar sempre)
### iOS (Safari / PWA) — o mais sensível
- **Safe areas** (notch/ilha/indicador): usar `env(safe-area-inset-*)` em topo,
  base e laterais fixas. A bottom nav e headers já dependem disso.
- **Altura**: usar `100dvh`/`dvh` (não `100vh`) — a barra do Safari muda a altura
  e corta conteúdo com `vh`.
- **Zoom automático em input**: campos com `font-size` **≥ 16px**, senão o iOS dá
  zoom ao focar. (Inputs do projeto usam 16px — manter.)
- **:hover** não existe em toque: nunca esconder ação só no hover; estados de
  toque/`active`/foco visíveis.
- **Scroll/overscroll**, `-webkit-tap-highlight`, `position: fixed` + teclado.

### Android (Chrome / PWA)
- Barra de endereço redimensiona o viewport → `dvh` e layouts flexíveis.
- Alvos de toque confortáveis (ver abaixo); gesto de voltar não deve prender o app.
- Testar instalação e atualização (service worker) — ver `src/main.jsx`.

### Windows (desktop / PWA)
- Hover/foco por mouse e teclado; layouts largos (não esticar demais — usar
  `max-w-*` já presente); janela do PWA redimensionável.

## Conforto por tamanho (mobile-first)
- **Alvos de toque ≥ 44px** (ideal 48px no Android). Botões, abas, ícones clicáveis.
- **Texto legível**: corpo ≥ 14–16px; inputs ≥ 16px (iOS). Nada de fonte minúscula.
- **Alcance do polegar**: ações primárias e navegação acessíveis (bottom nav fixa).
- **Respiro**: espaçamento que não fica apertado no celular; usar a escala do projeto
  e unidades fluidas (`clamp()`, `%`, `rem`) — evitar largura/altura fixa que estoura.
- **Sem scroll horizontal**: nada pode vazar a largura da tela; tabelas/carrosséis
  com scroll próprio.
- **Densidade adaptativa**: no celular menos colunas e mais empilhamento; no
  desktop aproveitar o espaço (grids `sm:`/`md:`/`lg:`), sem quebrar o mobile.

## Como validar na prática
1. Testar nos breakpoints: 📱 ~360–430px, 📲 ~768px, 💻 ~1280px+.
2. Conferir safe-areas e a bottom nav fixa não cobrindo conteúdo (`pb-*`).
3. Sempre que possível, **conferir no aparelho real** (iOS e Android) — é onde
   safe-area, `dvh`, zoom de input e toque realmente aparecem.
4. `npm run build` OK. Só então concluir a tela.
5. Combine com `responsabilidade-qualidade` (validação sequencial) e
   `identidade-visual` (paleta).

## Se algo não couber/ficar apertado
Ajuste o layout (empilhar, reduzir densidade, `clamp`, `flex-wrap`) até ficar
confortável no menor dispositivo — nunca deixe cortado, sobreposto ou espremido.
