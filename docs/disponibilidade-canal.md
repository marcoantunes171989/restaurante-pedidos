# Disponibilidade por canal — regra central (FASE 6.5.2)

## Função única de domínio
`src/lib/horarioFuncionamentoService.js`:
- `canaisHabilitadosPorModoUso(modoUso)` → `interno→[interno]`, `externo→[externo]`, `ambos→[interno,externo]`, desconhecido→`[]` (seguro).
- `canalHabilitadoPorModoUso(modoUso, canal)`
- `avaliarDisponibilidadeCanal({ modoUso, funcionamento, canal, agora })` → decisão única para **criar novo pedido**.

Ordem da decisão: **canal válido → modo de uso → horário → bloqueio**. Retorno padronizado (códigos, sem texto): `{ disponivel, canalHabilitado, abertoPorHorario, bloqueadoPorHorario, podeVisualizar, motivo, intervaloAtual, proximaAbertura, timezone }`. Motivos (`MOTIVO`): `disponivel`, `canal-desabilitado`, `fora-horario`, `sem-horario`, `bloqueio-horario-desativado`.

## Decisões deliberadas (cobertas por teste)
- Canal desligado pelo modo → **indisponível** de imediato (não avalia horário).
- **Sem grade** (loja legada) → **disponível** (`sem-horario`) — não bloqueia por horário inexistente. Corrige inclusive um bloqueio latente introduzido na 6.5 (default `bloquearForaHorario=true` sem grade).
- Fora do horário + `bloquearForaHorario=true` → indisponível (`fora-horario`).
- Fora do horário + `bloquearForaHorario=false` → disponível (`bloqueio-horario-desativado`).
- `permitirVisualizarForaHorario` só afeta `podeVisualizar` (externo) — nunca libera novo pedido.

## Fluxos que USAM a regra central
- **Cardápio público** (`CardapioPublico.jsx`): decisão única `disp = avaliarDisponibilidadeCanal(...)`.
  - **QR de mesa → canal `interno`**; **link/divulgação → canal `externo`**.
  - Guarda na **criação do pedido** (`onEnviar`) usa `!disp.disponivel` + mensagem por `motivo`.
  - `podeEnviar` e os avisos de UI derivam de `disp`.

## Débitos técnicos (a tratar em auditoria futura de APIs/RPC)
1. **Barreira só no frontend.** A criação pública ainda ocorre via client Supabase / RPC `pub_criar_pedido` — a regra é aplicada no cliente, **não** no backend. Um cliente malicioso poderia inserir pedido direto contornando a checagem. Aplicar a mesma regra numa RPC/trigger é o próximo passo (fora do escopo desta fase, por §22/§23).
2. **Fluxos internos de operador (Tablet/Caixa/Comanda em `App.jsx`)** criam pedidos por outro caminho e **ainda não** consultam `avaliarDisponibilidadeCanal`. Decisão consciente: são ferramentas de operador logado; bloquear no meio do turno é arriscado e exigiria refatoração maior. Integrar quando houver validação server-side.
3. `qrMesaEnabled` / `externalOrderingEnabled` (App.jsx) permanecem para UX do admin (Cardápio Externo) — equivalem a `canalHabilitadoPorModoUso`; não divergem, mas podem ser unificados numa limpeza futura.

## Sem migration
Usa `tab_lojas.modo_uso` + `tab_lojas.funcionamento` já existentes. Nenhum schema novo, nenhum dado alterado.
