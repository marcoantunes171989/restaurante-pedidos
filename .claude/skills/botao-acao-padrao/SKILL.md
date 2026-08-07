---
name: botao-acao-padrao
description: Padrão OFICIAL do botão de AÇÃO principal (CTA de cabeçalho "Cadastrar/Novo…") do restaurante-pedidos (Pedido Prime). Laranja liso da paleta, SEM sombra/glow, fonte no padrão do sistema (13px, semibold), cantos e padding padronizados. É o componente PrimeButton. Use SEMPRE que criar/alterar um botão de ação de cabeçalho ("Cadastrar X", "Novo Y", "+ …") ou padronizar botões entre telas. Gatilhos: "botão cadastrar", "botão novo", "CTA", "sombra do botão", "remover sombra/glow", "diminuir a fonte do botão", "padronizar botão", "botão do cabeçalho". Trabalha com identidade-visual, botao-laranja-degrade, tipografia-clean e escala-de-fontes.
---

# Botão de ação padrão (PrimeButton)

O CTA de cabeçalho ("Cadastrar mesa", "Cadastrar categoria", "Novo lançamento",
"Criar setor"…) é **um só padrão** em todo o admin, via o componente
`PrimeButton` (`src/components/Prime.jsx`). Clean, sem peso visual extra.

## Regras

- **Cor:** laranja da paleta `#E67E22` (hover `#D06E1A`), texto **branco**.
- **SEM sombra/glow:** nada de `shadow-lg shadow-[#E67E22]/40`. A ênfase vem da
  COR, não de sombra. (Era o "sobre"/glow que pesava o botão.)
- **Fonte:** `text-[13px] font-semibold` (padrão do sistema — ver escala-de-fontes).
  Nunca `text-sm font-bold`/`font-black`.
- **Forma:** `rounded-xl px-4 py-2.5`, `inline-flex items-center gap-2`,
  `active:scale-95`, `disabled:opacity-40`.
- **Variantes:** `blue`/`gold` = laranja (ação); `ghost` = branco com borda
  (secundário); `danger` = branco com borda/text vermelho.

## Uso (copie/cole)

```jsx
import { PrimeButton } from "../../components/Prime";
// no cabeçalho da tela (PageHeader acao), sempre no topo à direita:
<PageHeader … acao={<PrimeButton onClick={abrirModal}><span className="text-lg leading-none">+</span> Cadastrar X</PrimeButton>} />
```

Para um botão de ação FORA do PrimeButton, use as mesmas classes:
```
inline-flex items-center gap-2 rounded-xl bg-[#E67E22] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#D06E1A] active:scale-95
```
(ou a utility `.btn-laranja` para o degradê gourmet — mesma fonte/forma.)

## Padrão de tela (cadastro em modal)

O botão de cadastro fica **no topo direito** do cabeçalho e **abre um modal**
sobre a tela (não um formulário fixo numa coluna). Ver telas de **Mesas** e
**Setores de Produtos** como referência. Mantém a tela de listagem limpa e o
cadastro padronizado.

## Já aplicado

- `PrimeButton` (todos os CTAs de cabeçalho do admin) — sem sombra, 13px semibold.
- Telas Mesas e Setores de Produtos: botão no topo direito + cadastro em modal.

> Fonte das cores: identidade-visual. Peso/tamanho: tipografia-clean +
> escala-de-fontes. Esta skill define a FORMA/uso do botão de ação.
