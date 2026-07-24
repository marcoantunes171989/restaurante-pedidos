---
name: identidade-visual
description: Paleta de cores OFICIAL e regras de identidade visual do projeto restaurante-pedidos (Pedido Prime). Use SEMPRE que for criar, ajustar ou revisar qualquer coisa visual — telas, componentes, botões, fundos, ícones, textos, gráficos, e-mails, landing, PWA. Gatilhos: "cor", "cores", "paleta", "tema", "estilo", "identidade", "marca", "design", "UI", "layout", "botão", "fundo", "mude a cor", "deixe bonito", "redesenha", "visual". Esta é a fonte única de verdade das cores — aplique-a em todo o projeto daqui pra frente.
---

# Identidade visual — Paleta OFICIAL (Pedido Prime)

Esta é a **paleta oficial vigente**. A partir de agora, **todo trabalho visual usa estas
cores** — ao criar ou tocar em qualquer tela/componente, aplique-as e substitua cores
divergentes de rebrands anteriores (namespaces legados `brand`, `gold`, `admin`, `pp`).

## Paleta

| Cor | Hex | Papel | Uso |
|---|---|---|---|
| 🟧 **Laranja** | `#E67E22` | **Principal** | Energia, apetite e destaque → CTAs, botões primários, ações, ênfase, seleção ativa |
| 🔵 **Azul petróleo** | `#0F4C5C` | **Secundária** | Tecnologia, confiança e estabilidade → cabeçalhos, navegação, barras, elementos institucionais |
| 🟩 **Verde** | `#5E8C31` | **Destaque** | Frescor, naturalidade e equilíbrio → sucesso, confirmações, selos "fresco/ok", acentos pontuais |
| ⬜ **Off-white** | `#F8F6F2` | **Fundo** | Leveza, limpeza e respiro visual → fundo geral das telas |
| ▫️ **Cinza claro** | `#E6E6E6` | **Apoio** | Elementos de apoio e divisões → bordas, divisores, superfícies sutis, estados desabilitados |
| ⬛ **Grafite** | `#2D3436` | **Texto** | Textos, títulos e ícones |

## Regras de aplicação
- **Laranja `#E67E22`** é a cor de AÇÃO — use com parcimônia, só onde quer que o olho vá
  (botão principal, link de destaque, item ativo). Não pinte áreas grandes de laranja.
- **Azul petróleo `#0F4C5C`** ancora a marca — headers, navegação, rodapés, blocos institucionais.
- **Verde `#5E8C31`** = feedback positivo/frescor. Não use verde para ação primária (isso é o laranja).
- **Off-white `#F8F6F2`** é o fundo padrão; **branco puro `#FFFFFF`** só para cards/superfícies elevadas.
- **Cinza claro `#E6E6E6`** para bordas e divisórias — nunca para texto.
- **Grafite `#2D3436`** para todo texto/ícone. Para texto secundário, use grafite com opacidade
  (~70%) ou um cinza médio derivado, mantendo contraste AA.

## Contraste / acessibilidade (WCAG AA)
- Texto grafite `#2D3436` sobre off-white/branco/cinza claro → OK.
- Texto **branco** sobre **laranja `#E67E22`** e sobre **azul petróleo `#0F4C5C`** → OK (botões).
- Evite texto verde/laranja sobre fundos claros para blocos de leitura (baixo contraste); use
  essas cores em fundos/ícones/realces, não em corpo de texto longo.

## Como aplicar no código (Tailwind)
O projeto usa Tailwind. Ao consolidar a paleta, registre estes tokens em
`tailwind.config.js` (`theme.extend.colors`) para usar classes utilitárias e manter consistência:
```js
marca: {
  laranja:   '#E67E22', // principal / ação
  petroleo:  '#0F4C5C', // secundária / institucional
  verde:     '#5E8C31', // destaque / sucesso
  offwhite:  '#F8F6F2', // fundo
  cinza:     '#E6E6E6', // apoio / bordas
  grafite:   '#2D3436', // texto / ícones
},
```
Uso: `bg-marca-offwhite`, `text-marca-grafite`, `bg-marca-laranja`, `border-marca-cinza`, etc.
Enquanto a migração dos namespaces legados não estiver completa, ao **editar uma tela**,
troque as cores antigas daquela tela pelas equivalentes desta paleta.

## Ao trabalhar
1. Consulte esta paleta antes de escolher qualquer cor.
2. Prefira os tokens `marca-*`; se precisar de hex, use os exatos acima.
3. Mantenha hierarquia: fundo off-white → superfícies brancas → texto grafite → ação laranja →
   apoio azul petróleo → feedback verde.
4. Combine com a skill **designer-grafico-senior** para as decisões de layout/tipografia.
