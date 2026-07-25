---
name: botao-colorido-texto-branco
description: Regra de contraste do projeto restaurante-pedidos — todo botão/badge/ícone com PREENCHIMENTO SÓLIDO colorido (laranja de ação, verde de sucesso, azul petróleo de info, vermelho de erro, etc.) usa TEXTO/ÍCONE BRANCO, para máxima legibilidade do cliente. Use SEMPRE que criar/alterar botão, chip, selo, badge ou círculo de status com fundo colorido. Gatilhos: "botão laranja", "cor do texto do botão", "texto branco", "botão colorido", "badge", "selo", "contraste do botão", "ícone no verde/laranja". Trabalha com identidade-visual e responsabilidade-qualidade.
---

# Botão/preenchimento colorido = texto e ícone BRANCOS

Regra fixa da identidade: **fundo sólido colorido → texto e ícone brancos**. Vale
para o laranja de ação (CTAs: "Confirmar e enviar pedido", "Adicionar", "Ver
cardápio"...), o verde de sucesso (✓ do stepper, selos "pago/pronto"), o azul
petróleo de info ("recebido", "conta em aberto"), o vermelho de erro, o âmbar de
aviso e o verde-oferta. Branco sobre a cor cheia é o padrão de maior legibilidade
e o que dá acabamento consistente ao produto.

## Como aplicar
- Preenchimento sólido colorido → `text-white` (e ícones SVG com
  `stroke="currentColor"`/`fill` herdam o branco automaticamente).
- **Nunca** deixar texto grafite/preto sobre um fundo de ação/status colorido.
- O TOM do fundo colorido deve ser escuro o bastante para o branco passar no
  WCAG AA (ver `identidade-visual`): no cliente, os CTAs sólidos repousam em
  `--client-primary-hover` (#B25E15, ~4,66:1 com branco), não no laranja claro.
- Fundos **-soft** (tinta clara: `--client-*-soft`) são o contrário: texto na
  cor cheia (ex.: `bg-[var(--client-info-soft)] text-[var(--client-info)]`),
  **não** branco. A regra aqui é só para preenchimento SÓLIDO.

## Armadilha conhecida deste projeto (IMPORTANTE)
O cardápio do cliente roda dentro de `.tema-claro-area` (`[data-theme="light"]`).
Existe uma regra global em `src/index.css`:

```css
[data-theme="light"] .tema-claro-area .text-white { color: var(--pp-graphite) !important; }
```

Ela serve para remapear telas **admin** de tema escuro para claro, mas
**escurece por engano** o `text-white` legítimo dos botões/badges/ícones
coloridos do cliente. Por isso há uma exceção (também em `src/index.css`) que
restaura o branco em TODOS os fills de token do cliente:

```css
[data-theme="light"] .tema-claro-area [class*="bg-[var(--client"].text-white { color:#FFFFFF !important; }
```

**Ao criar um novo elemento colorido do cliente**, use um fundo `bg-[var(--client-…)]`
(token) + `text-white`: a exceção acima já o cobre automaticamente (à prova de
futuro). Se, por algum motivo, usar um fundo colorido que NÃO seja um token
`--client-*` (hex direto, classe Tailwind de cor), garanta a exceção equivalente
ou o texto branco vai escurecer dentro de `.tema-claro-area`.

## Checklist ao mexer em botão/badge colorido
1. Fundo sólido colorido? → `text-white`.
2. O tom passa AA com branco? (senão, usar o tom `-hover`/mais escuro — ver
   identidade-visual). 
3. Está dentro de `.tema-claro-area`? → confirmar que o branco não é escurecido
   (usar token `--client-*` ou garantir a exceção CSS).
4. Validar: `npm run build` + conferir no CSS/na tela que o texto saiu branco
   (combina com `testes-apos-execucao`).
