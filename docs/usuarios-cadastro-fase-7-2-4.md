# Usuários — FASE 7.2.4 (cadastro/edição unificados)

**Base:** `82f61a9` · **Sem migration** (§60) — só frontend/API/testes.

## Causa da falha de salvamento

- **E-mail não salvava no Auth:** em `editarUsuario`, a sincronização do
  Supabase Auth só ocorria **quando havia senha nova** (`if (senhaNova)`).
  Mudança só de e-mail atualizava `tab_usuarios.email` mas **não**
  `auth.users.email` → login com o novo e-mail divergia.
- **Fluxo fragmentado:** perfil por `persistirUsuarioCampos` (RPC) + senha por
  outra chamada. Agora tudo é **uma** operação canônica.

## Componente único (§2)

`src/components/admin/usuarios/UsuarioFormModal.jsx` atende **novo** e
**editar** (`modo`). Seções: **Empresa** (radio-cards), **Dados**
(nome/e-mail), **Acesso** (senha + **confirmar senha**, mostrar/ocultar com
Lucide), **Cargo/Perfil** (radio-cards agrupados por contexto com ícone +
descrição), **Status** (toggle, só edição) e **resumo**. Validação **inline**
(`touched`/`submitAttempted`), botão desabilitado com motivo, estado
"Salvando…", paleta oficial clara (petróleo `#012E46`, laranja `#F38525`,
sem verde de ação, sem dark mode), responsivo, acessível (label/aria/role).

Os componentes antigos `UsuarioCadastroModal`/`UsuarioEditModal` foram
removidos (duplicação eliminada).

## Domínio testável (§52)

`src/lib/usuarioForm.js`: `validarUsuarioForm` (por modo — senha obrigatória
no novo, opcional na edição; **confirmação igual**), `emailValido`,
normalização (nome trim; e-mail lower+trim; **senha sem trim**, §47),
`agruparCargos`/`metaDoPerfil`, `mensagemErroUsuario` (mapeia códigos
server-side). 25 testes.

## Fluxo canônico (§33/§34)

- **Criar:** `addUser(dados)` → `gerenciarUsuarioAuth({acao:'criar'})` (Auth +
  `tab_usuarios` + `senha_hash` + validação + rollback), **fail-closed**.
- **Editar:** `editarUsuario(uid, dados)` → `gerenciarUsuarioAuth({acao:
  'atualizar', persistirPerfil:true})` — coordena **e-mail + senha + perfil**
  numa operação. Corrige a não-sincronização de e-mail. Sem senha → mantém a
  atual; só atualiza dados. **Fail-closed** (lança → o modal mostra inline).
- Erros do servidor recebem `.code` e são mapeados (§41): `DUPLICATE`,
  `AUTH_SYNC_FAILED`, `PASSWORD_INCONSISTENT`, `SERVICE_ROLE_INVALID`, etc.

## Atualização imediata (§37/§38/§39)

`setUsers(...)` após sucesso — a lista reflete criação/edição/status **sem
F5**. `tab_usuarios` **não** entra em Realtime (tabela sensível, §39).

## Segurança (§59)

Nenhuma resposta expõe `senha`/`senha_hash` (allowlist + sanitização das
fases anteriores). Senha/confirmação vivem **só** no state local do modal e
são zeradas ao salvar/fechar (§19/§32).

## Homologação obrigatória (§62/§68) — a validar por você

Não consigo testar visualmente nem logar. Validar no deploy:
1. Criar usuário → logout → **login do novo** (sem F5).
2. Editar **só e-mail** → login com o novo e-mail ✅ / antigo ❌.
3. **Alterar senha** → senha nova ✅ / antiga ❌.
4. Editar **sem senha** → senha atual continua funcionando.
5. Ativar/desativar reflete na hora.
6. Visual em desktop/tablet/mobile (sem overflow horizontal).

Fase 7.3 permanece **bloqueada** até esses gates passarem.
