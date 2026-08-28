// Fluxo Admin → Operação Mobile: navegação SEMPRE na MESMA aba.
//
// Antes, no desktop, o item abria `window.open(rota, "_blank", "noopener")`.
// Pela spec HTML, uma auxiliary browsing context aberta com `noopener` perde
// o vínculo com o `opener` e cai num browsing-context-group novo — o
// `sessionStorage` da aba original (incluindo o marcador `pp_sessao_ativa`)
// NÃO é herdado. A nova aba nascia "deslogada" (mesmo com o JWT válido em
// localStorage), o app forçava `/login`, e o pouso pós-credenciais nunca
// restaura a rota anterior (regra de segurança propositalmente preservada
// em `aplicarLogin`) — daí o usuário cair em `/app/tablet` em vez de
// `/operacional`. Navegando na mesma aba, sessionStorage e JWT continuam
// intactos e a rota cai direto em `/operacional`.
export function rotaOperacaoMobile(origin) {
  return `${origin}/operacional`;
}

export function abrirOperacaoMobile(loc = window.location) {
  loc.assign(rotaOperacaoMobile(loc.origin));
}
