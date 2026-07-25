---
name: botao-laranja-degrade
description: Padrão OFICIAL dos botões laranja do projeto restaurante-pedidos — laranja "gourmet" em DEGRADÊ quente com 3 estados (repouso claro, hover mais claro, ativo/pressionado mais escuro) e texto branco com leve sombra. Todo botão de AÇÃO laranja (e o estado ativo de chips/toggles) usa a utility `.btn-laranja` (definida em src/index.css). Use SEMPRE que criar/alterar um botão laranja, um chip/segmented ativo, ou quando pedirem "botão laranja", "degradê", "cor do botão", "laranja claro/gourmet", "botão premium", "hover do botão", "ao selecionar". Trabalha com identidade-visual, botao-colorido-texto-branco e responsabilidade-qualidade.
---

# Botão laranja "gourmet" — degradê quente, 3 estados (`.btn-laranja`)

Padrão único dos botões laranja do sistema. Em vez de um fundo laranja **chapado**,
todo botão de ação laranja usa um **degradê quente** (mais claro no topo, rico
embaixo) — visual mais apetitoso e premium, coerente com a marca (food service).

## A utility (fonte única de verdade: `src/index.css`)

```css
.btn-laranja {
  background-image: linear-gradient(180deg, #EC8636 0%, #C6551A 100%);
  text-shadow: 0 1px 1.5px rgba(90, 35, 0, 0.35);
}
.btn-laranja:hover:not(:disabled):not([aria-disabled="true"]) {
  background-image: linear-gradient(180deg, #F49A48 0%, #D66528 100%);
}
.btn-laranja:active:not(:disabled):not([aria-disabled="true"]) {
  background-image: none;
  background-color: #A8480F;
}
.btn-laranja:disabled,
.btn-laranja[disabled] {
  background-image: none;
  text-shadow: none;
}
```

## Os 3 estados (sempre estes)

| Estado | Resultado | Cor |
|---|---|---|
| **Repouso** | laranja CLARO/apetitoso | degradê `#EC8636 → #C6551A` |
| **Hover** | MAIS CLARO | degradê `#F49A48 → #D66528` |
| **Ativo/pressionado** | MAIS ESCURO (chapado) | `#A8480F` |
| Desabilitado | limpa o degradê | cai no fundo/opacidade do próprio botão |

## Como aplicar

- **É aditivo**: `.btn-laranja` pinta via `background-image`, que fica POR CIMA de um
  `background-color`. Então basta **adicionar** a classe `btn-laranja` ao botão, sem
  precisar remover o `bg-[var(--*-primary...)]` que ele já tenha — o degradê cobre o
  fundo sólido e o `:hover`/`:active`/`:disabled` da utility assumem o controle.
- **Mantenha `text-white`** como classe no botão (a utility NÃO define `color`, de
  propósito, para o estado `disabled:text-...` continuar funcionando).
- Em botão condicional (ternário `selecionado ? "..." : "..."`), coloque `btn-laranja`
  **só na string do ramo laranja** (ex.: chip ativo, estado habilitado).
- Combine com a skill **botao-colorido-texto-branco** (texto/ícone sempre brancos).

```jsx
// antes:  className="... rounded-xl bg-[var(--pp-primary-hover)] text-white hover:bg-[var(--pp-primary)] ..."
// depois: className="... rounded-xl btn-laranja bg-[var(--pp-primary-hover)] text-white ..."
//         (o hover:bg-... antigo pode sair; a utility já cuida do hover)
```

## Onde usar / onde NÃO usar

- ✅ **Usar**: botões de AÇÃO laranja (CTAs: Aceitar, Confirmar, Enviar pedido,
  Adicionar, Receber, Entrar…), e o **estado ATIVO** de chips/segmented/toggles laranja.
- ❌ **Não usar**: selos/badges/pills pequenos, indicadores/pontos, barras de
  progresso, bordas, textos, ícones, fundos tingidos (`-soft`, `/10`) — esses seguem
  os tokens normais (`--pp-primary`, `--client-primary`, etc.). O degradê é só para
  **superfície de botão** (e chip ativo).

## Por que degradê (e não um laranja claro chapado)

Branco puro sobre um laranja **claro chapado** não atinge contraste AA. O degradê
resolve: parece claro/apetitoso no topo, mas a **base rica** + a **leve sombra no
texto** preservam a legibilidade do rótulo branco. É a forma de ter "laranja claro
premium" e texto legível ao mesmo tempo.

## Manutenção

- Qualquer ajuste de cor/estado do botão laranja é feito **só na `.btn-laranja`**
  (`src/index.css`) — propaga para todos os botões de uma vez.
- Ao criar um botão laranja novo, já use `btn-laranja` (não reintroduza fundo laranja
  chapado). Rode o gate de **testes-apos-execucao** (build + test) após alterar.
