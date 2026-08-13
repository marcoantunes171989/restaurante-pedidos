# Horários — legado `config_externo.horarios` (FASE 6.5)

## Fonte antiga (legado)
`tab_lojas.config_externo.horarios` (JSONB, migration 033):
```json
{ "seg": "18:00–23:00", "ter": "", "qua": "11:00–14:00", ... }
```
- Um único intervalo por dia (string `"HH:MM–HH:MM"`), **apenas canal externo**.
- Timezone em `config_externo.fusoHorario`; bloqueio em `config_externo.bloquearForaHorario`.
- Editado na aba "Horários" do Cardápio Digital Externo.

## Fonte nova (oficial)
`tab_lojas.funcionamento` (JSONB, migration 110) — **fonte única de verdade**:
```json
{
  "unificado": false,
  "timezone": "America/Sao_Paulo",
  "bloquearForaHorario": true,
  "permitirVisualizarForaHorario": true,
  "interno": { "seg": [{"abre":"18:00","fecha":"23:00"}], ... },
  "externo": { ... }
}
```
- Canais **interno** e **externo**; flag **unificado**; **múltiplos intervalos** por dia; **virada de meia-noite**.
- Editada **exclusivamente** no Cadastro da Empresa → Operação → Horário de funcionamento.
- Avaliação de aberto/fechado centralizada em `src/lib/horarioFuncionamentoService.js`.

## Fallback temporário
Enquanto a loja não re-salvar o cadastro, a grade **externa** é derivada do legado
em **tempo de leitura** por `normalizarFuncionamento(loja.funcionamento, loja.configExterno.horarios)`
(o serviço converte as strings do legado em intervalos). No primeiro salvamento
no Cadastro da Empresa, a grade canônica é persistida em `funcionamento`.

A migration 110 semeia apenas os **metadados** (timezone/flags/`unificado=false`)
para lojas com `config_externo`. As grades interno/externo iniciam vazias no banco
(a externa vem do fallback até o primeiro save). O horário **interno** não é
inventado — fica vazio até o gestor configurar.

## Estado do legado
- `config_externo.horarios`, `config_externo.fusoHorario`, `config_externo.bloquearForaHorario`
  **permanecem** no banco (nada foi apagado). Ainda servem de fallback de leitura.
- **Não** são mais a fonte oficial. **Não** se escrevem novos horários em `config_externo`
  (a aba do Cardápio Externo virou somente leitura).

## Remoção futura (pendência)
Após todas as lojas re-salvarem (ou um backfill SQL dedicado converter as strings
em intervalos direto na coluna `funcionamento.externo`), uma migration futura pode
remover `config_externo.horarios`/`fusoHorario`/`bloquearForaHorario`. **Não** nesta fase.

## Também pendente (não implementado nesta fase)
- Tabela normalizada `loja_horario_funcionamento` + RPC transacional + RPC pública
  (esta fase usa JSONB em nível de empresa por segurança/testabilidade).
- Exceções/feriados (fechamento especial por data) — arquitetura preparada, sem implementação.
