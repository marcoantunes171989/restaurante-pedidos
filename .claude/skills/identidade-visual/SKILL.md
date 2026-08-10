---
name: identidade-visual
description: Paleta de cores OFICIAL e regras de identidade visual do projeto restaurante-pedidos (Pedido Prime). Use SEMPRE que for criar, ajustar ou revisar qualquer coisa visual — telas, componentes, botões, fundos, ícones, textos, gráficos, e-mails, landing, PWA. Gatilhos: "cor", "cores", "paleta", "tema", "estilo", "identidade", "marca", "design", "UI", "layout", "botão", "fundo", "mude a cor", "deixe bonito", "redesenha", "visual". Esta é a fonte única de verdade das cores — aplique-a em todo o projeto daqui pra frente.
---

# Identidade visual — Paleta OFICIAL (Pedido Prime)

Esta é a **paleta oficial vigente**. A partir de agora, **todo trabalho visual usa estas
cores**. Para auditoria e substituição em massa, use a skill
**`padronizar-cores-pedido-prime`** (`references/paleta.md` +
`scripts/audit_palette.py`).

## Posicionamento da marca
Paleta para transmitir **confiança, praticidade e eficiência**, unindo
**tecnologia** com o **universo da alimentação**:
- 🟧 **Apetite / ação** → laranja `#F38525`
- 🔵 **Confiança / gestão** → azul-petróleo `#012E46`

## Paleta

| Cor | Hex | Papel | Uso |
|---|---|---|---|
| 🟧 **Laranja** | `#F38525` | **Principal / ação** | CTAs, item ativo, seleção, ênfase, séries de gráfico |
| 🔵 **Azul-petróleo** | `#012E46` | **Institucional** | Navegação, cabeçalhos, dados, texto sobre laranja |
| ⬜ **Branco** | `#FFFFFF` | **Fundo de tela** | Fundo geral das telas |
| ▫️ **Cinzas neutros** | (funcionais) | **Apoio** | Bordas, muted, desabilitado — sem matiz de marca |

## Contraste (obrigatório)
- Texto **branco** somente sobre `#012E46`.
- Texto/ícone sobre `#F38525` → `#012E46` (não branco).
- Fundo de tela → `#FFFFFF`.
- Gráficos → só `#012E46` e `#F38525` nas séries.

## Estados (hover, foco, sucesso, alerta, erro)
Não introduzir matiz nova. Preferir borda/sublinhado, opacidade das cores
oficiais ou cinzas neutros. Exceções normativas (conteúdo do usuário, logos
de terceiros, semântica regulatória) devem ser documentadas.

## Hexes legados (substituir)
| Legado | Oficial |
|---|---|
| `#0F4C5C`, `#17667A`, `#2E5FA8` | `#012E46` |
| `#E67E22`, `#D06E1A`, `#EC8B3E`, `#F2994A` | `#F38525` |
| `#F8F6F2` como fundo de tela | `#FFFFFF` |

## Tokens CSS sugeridos
```css
--pp-petroleo: #012E46;
--pp-laranja: #F38525;
--pp-fundo: #FFFFFF;
--pp-on-petroleo: #FFFFFF;
--pp-on-laranja: #012E46;
```
Aliases (`--pp-primary`, `--pp-info`, `--client-primary`, etc.) devem apontar
para estes valores.

## Ao trabalhar
1. Consulte esta paleta (e `padronizar-cores-pedido-prime/references/paleta.md`).
2. Priorize tokens centrais em `src/index.css` / `tailwind.config.js`.
3. Rode `python3 .claude/skills/padronizar-cores-pedido-prime/scripts/audit_palette.py .`
4. Combine com **designer-grafico-senior** para layout/tipografia.
