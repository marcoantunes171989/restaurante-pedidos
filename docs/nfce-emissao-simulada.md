# NFC-e — Emissão SIMULADA (mod. 65)

Passo seguinte à pré-validação. Imita o ciclo real **NUMERAR → DOCUMENTO →
AUTORIZAR → CUPOM** — **sem certificado, sem CSC, sem SEFAZ e sem valor
fiscal**. Requer a **migration 117**.

## O que entra

- **`src/lib/nfceService.js`** (puro/testável): `montarDocumentoNfce`
  (estrutura do leiaute mod. 65 — ide/emit/dest/det/total/pag + chave definitiva
  do nº emitido), `simularAutorizacaoNfce` (protocolo/cStat/xMotivo
  determinísticos; protocolo de 15 dígitos com prefixo **9** = simulação),
  `montarUrlQrCodeNfce` (URL de consulta marcada como simulação — **sem** hash de
  CSC forjado), `emitirNfceSimulada` (orquestra rascunho→pré-validação→
  documento→autorização→QR) e `formatarChaveNfce`.
- **Migration 117** (`117_nfce_emissao_simulada.sql`):
  - `loja_fiscal_emitente.nfce_prox_numero` — contador por loja.
  - Tabela `loja_fiscal_nfce` — histórico das notas simuladas.
  - **RLS privada** espelhando a 107 (super **ou** a própria loja) + realtime.
  - RPCs `app_reservar_numero_nfce` (numeração **atômica** com lock do emitente)
    e `app_registrar_nfce_simulada` (grava a nota). Ambas `security definer`,
    autorizando por `app_pode_gerir_loja` (super ou a própria loja).
- **`src/lib/supabase.js`**: `reservarNumeroNfce`, `registrarNfceSimulada`,
  `fetchNfceEmitidas`, `escutarNfceEmitidas`, `dbParaNfce` — **tolerantes** se a
  117 ainda não foi aplicada (a UI segue funcionando na pré-validação; a emissão
  avisa e mostra o cupom em memória).
- **UI** (aba *NFC-e (simulação)* na Configuração Fiscal): botão **Emitir
  simulação** (habilitado só quando apto), **histórico** de notas emitidas e
  **cupom DANFE-NFC-e** em modal com **QR Code** — tudo com faixa
  “🧪 SIMULAÇÃO — SEM VALIDADE FISCAL”.

## Segurança / limites (mantidos)

- Numeração alocada **no banco** (atômica) — nunca no frontend; o número é
  “queimado” mesmo se a nota não for registrada (comportamento realista).
- `loja_id` definido pelo servidor (RLS + RPC) — o frontend não escolhe a loja.
- Não gera XML assinado, não usa certificado/CSC, não contata a SEFAZ. O QR
  **não** forja assinatura — leva a chave para conferência e é rotulado como
  simulação.

## Como aplicar

Rodar a **migration 117** no SQL Editor do Supabase (entregue à parte). Sem ela,
a aba mostra a pré-validação e a emissão avisa que o histórico não persiste.

## Homologação (no deploy)

1. Emitente completo (Minha Empresa) + produtos com config fiscal → aba fica
   **Apto**.
2. **Emitir simulação** → número incrementa, chave de 44 dígitos, protocolo
   “Autorizada (sim.)”, cupom com QR.
3. Emitir de novo → número seguinte (sequência por loja/série).
4. Recarregar → histórico persiste (com a 117 aplicada).
