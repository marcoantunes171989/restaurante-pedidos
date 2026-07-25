---
name: botao-verde-degrade
description: Padrão OFICIAL dos botões verdes do projeto restaurante-pedidos — verde "gourmet" em DEGRADÊ (repouso claro, hover mais claro, ativo/pressionado mais escuro) e texto branco com leve sombra, para AÇÕES POSITIVAS/DE CONFIRMAÇÃO (confirmar, marcar pronto, retirada, entregue). Usa a utility `.btn-verde` (definida em src/index.css). É o irmão verde da skill botao-laranja-degrade (laranja = ação principal; verde = sucesso/confirmação). Use SEMPRE que criar/alterar um botão verde de sucesso, ou quando pedirem "botão verde", "degradê verde", "confirmar", "marcar pronto", "retirada", "entregue", "botão de sucesso". Trabalha com identidade-visual, botao-colorido-texto-branco e responsabilidade-qualidade.
---

# Botão verde "gourmet" — degradê, 3 estados (`.btn-verde`)

Mesma receita da skill **botao-laranja-degrade**, mas na cor de
**SUCESSO/CONFIRMAÇÃO** (verde da paleta). O laranja é a ação principal; o verde
sinaliza a ação positiva/de conclusão (confirmar, marcar pronto, retirada,
entregue). Em vez de um verde chapado, usa um **degradê** (claro no topo, rico
embaixo) — mais fresco e premium.

## A utility (fonte única de verdade: `src/index.css`)

```css
.btn-verde {
  background-image: linear-gradient(180deg, #3FB463 0%, #2A8548 100%);
  text-shadow: 0 1px 1.5px rgba(0, 45, 18, 0.35);
}
.btn-verde:hover:not(:disabled):not([aria-disabled="true"]) {
  background-image: linear-gradient(180deg, #52C075 0%, #319556 100%);
}
.btn-verde:active:not(:disabled):not([aria-disabled="true"]) {
  background-image: none;
  background-color: #1F6E3A;
}
.btn-verde:disabled,
.btn-verde[disabled] {
  background-image: none;
  text-shadow: none;
}
```

## Os 3 estados (sempre estes)

| Estado | Resultado | Cor |
|---|---|---|
| **Repouso** | verde CLARO/fresco | degradê `#3FB463 → #2A8548` |
| **Hover** | MAIS CLARO | degradê `#52C075 → #319556` |
| **Ativo/pressionado** | MAIS ESCURO (chapado) | `#1F6E3A` |
| Desabilitado | limpa o degradê | cai no fundo/opacidade do próprio botão |

## Como aplicar

- **É aditivo** (igual ao `.btn-laranja`): o degradê é `background-image` e fica POR
  CIMA do `background-color`, então basta **adicionar** `btn-verde` ao botão, sem
  remover o `bg-[var(--pp-success)]` que ele já tenha.
- **Mantenha `text-white`** (a utility não define `color`, para o `disabled:text-...`
  continuar funcionando).
- **Remova `hover:brightness-95`** do botão ao adicionar `btn-verde` — a utility já
  faz o hover (mais claro); manter o `brightness` escureceria e brigaria com isso.
- Em botão condicional, coloque `btn-verde` só na string do ramo verde.

```jsx
// antes:  className="... rounded-xl bg-[var(--pp-success)] text-white hover:brightness-95 ..."
// depois: className="... rounded-xl btn-verde bg-[var(--pp-success)] text-white ..."
```

## Quando usar verde vs laranja

- 🟩 **`.btn-verde`** → ação POSITIVA/de conclusão: **Retirada**, **Marcar pronto**,
  **Baixa/entregue**, confirmar, dar baixa — o passo que "fecha" com sucesso.
- 🟧 **`.btn-laranja`** → ação PRINCIPAL/CTA: Aceitar, Confirmar pedido, Enviar,
  Adicionar, Receber, Entrar. (ver skill botao-laranja-degrade)

## Onde NÃO usar

Selos/badges, pontos de status, pings, barras de progresso, bordas, texto, ícones e
fundos tingidos (`-soft`, `/10`) seguem os tokens normais (`--pp-success`). O degradê
é só para **superfície de botão**.

## Manutenção

- Ajuste de cor/estado do botão verde é feito **só na `.btn-verde`** (`src/index.css`)
  — propaga para todos de uma vez.
- Ao criar botão verde novo, já use `btn-verde`. Rode o gate de
  **testes-apos-execucao** (build + test) após alterar.
