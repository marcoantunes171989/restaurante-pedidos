---
name: limpeza-e-documentacao
description: Remover com segurança registros/código SEM USO (após validação, sem afetar o projeto atual) e manter a DOCUMENTAÇÃO em sincronia com o estado real do projeto — sem deixar informação desatualizada. Use ao finalizar mudanças (especialmente de paleta de cores e desenvolvimento), em manutenção, ou quando notar código morto, tokens/variáveis órfãos, comentários/docs que citam algo que não existe mais. Gatilhos: "limpar", "código morto", "não usado", "órfão", "remover resquício", "documentação desatualizada", "manter limpo", "sincronizar doc", "aparar registros".
---

# Limpeza validada + documentação em sincronia

Manter o projeto **limpo** e a **documentação fiel ao estado atual**. Duas
responsabilidades: (1) remover registros que não estão mais em uso, **sempre
depois de validar** que a remoção não afeta o projeto; (2) manter comentários e
docs alinhados ao que o código realmente faz hoje — sem informação obsoleta.

## Parte 1 — Remover o que não está em uso (com validação)
O que procurar: código morto (funções/componentes/variáveis/imports sem uso),
**tokens/variáveis CSS órfãos** (ex.: `--pp-brand`, cores de rebrands antigos sem
nenhum consumidor), arquivos/assets não referenciados, blocos comentados obsoletos.

Processo OBRIGATÓRIO antes de remover:
1. **Provar que está sem uso:** buscar referências em TODO o projeto
   (`grep -rn` do símbolo/token/arquivo). Zero consumidores reais = candidato.
2. **Validar sem afetar o projeto atual:** `npm run build` (e `npm run lint`
   quando fizer sentido) — antes e depois. O que renderiza/importa não pode mudar.
3. **Remover** só então, em escopo pequeno e commit próprio/descritivo.
4. **Re-validar:** build OK. Se quebrar, reverter.

Nunca remover:
- Algo ainda referenciado (mesmo que indiretamente).
- Tokens/estilos que só "parecem" sem uso mas são consumidos por classes dinâmicas.
- Código que muda comportamento ao sair (isso é refatoração, não limpeza — ver
  `manutencao-continua`).

## Parte 2 — Documentação em sincronia com o projeto
Toda vez que um valor/decisão/estrutura muda, **atualize ou remova** a documentação
relacionada para refletir a realidade — não deixe doc contradizendo o código.
Inclui: comentários no código, `docs/` (ex.: `docs/design-tokens.md`), READMEs, e
as próprias skills quando descrevem cores/decisões.

Casos comuns (paleta e desenvolvimento):
- Comentário citando cor/token antigo (ex.: "dourado", "terracota", hex `#...`
  que não é mais usado) → atualizar para o valor atual da paleta oficial, ou remover.
- Doc de tokens/cores que lista um valor já trocado → alinhar ao `identidade-visual`.
- Referência a componente/fluxo que foi unificado/removido → corrigir a menção.

Regras:
- Documentação **reflete o presente**: sem valores/decisões vencidos.
- **Sem churn desnecessário:** só mexer no que está de fato desatualizado; não
  reescrever doc correta.
- Preferir a **fonte única** (ex.: cores → skill `identidade-visual`); doc
  espalhada deve apontar/coincidir com ela, nunca divergir.

## Fluxo ao concluir uma tarefa
1. Rodar a limpeza: há token/código/arquivo que ficou órfão por causa da mudança?
   Provar sem uso → validar (build) → remover.
2. Rodar a sincronia de doc: algum comentário/doc/skill agora está desatualizado?
   Ajustar para o estado atual.
3. Build OK; commit descritivo (ex.: `chore(limpeza): ...`).
4. Combina com `manutencao-continua` (melhorias) e `responsabilidade-qualidade`
   (nada quebra, valida). Paleta como fonte de verdade: `identidade-visual`.
