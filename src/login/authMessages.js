// ════════════════════════════════════════════════════════════
//  Tradução de erros de autenticação para mensagens seguras e amigáveis.
//  Nunca repassa a string bruta do Supabase/rede para a tela — evita
//  vazar mensagem técnica, stack trace ou pista sobre a conta existir
//  ou não. Usado pelo login() em App.jsx antes de exibir a mensagem.
// ════════════════════════════════════════════════════════════
export function mensagemErroAcesso(erroBruto) {
  const raw = String(erroBruto || "").toLowerCase();
  if (!raw) return "Não foi possível acessar sua conta. Tente novamente.";
  // Fase 3 (gate R0H-C5C10D3): distinto de "senha incorreta" — não mascara
  // uma conta existente-porém-não-confirmada como credencial inválida.
  // Mensagem genérica o bastante para não revelar detalhe técnico.
  if (raw.includes("email_not_confirmed") || raw.includes("email not confirmed")) {
    return "Conta ainda não confirmada. Entre em contato com o administrador do sistema.";
  }
  if (raw.includes("fetch") || raw.includes("network") || raw.includes("timeout") || raw.includes("conex") || raw.includes("offline")) {
    return "Sua conexão parece estar indisponível.";
  }
  if (raw.includes("invalid") || raw.includes("credencial") || raw.includes("inválid") || raw.includes("incorret")) {
    return "E-mail ou senha incorretos.";
  }
  if (raw.includes("service_role") || raw.includes("não configurada")) {
    return "Login temporariamente indisponível. Peça ao administrador para configurar o acesso ao banco (SERVICE_ROLE) na Vercel.";
  }
  return "Não foi possível acessar sua conta. Tente novamente.";
}

// ════════════════════════════════════════════════════════════
//  Fase 7.2.3 (§21/§22) — mapeia o CÓDIGO estruturado de erro para uma
//  mensagem amigável, SEM mascarar problema de infraestrutura como
//  "senha inválida". Nunca expõe detalhe técnico ao usuário final.
// ════════════════════════════════════════════════════════════
const MSG_CREDENCIAL = "E-mail ou senha inválidos.";
const MSG_INATIVO = "Usuário inativo, entre em contato com o administrador do sistema.";
const MSG_INTERNO = "Não foi possível concluir a autenticação. Tente novamente em instantes.";

export function mensagemPorCodigoAuth(code) {
  switch (String(code || "").toUpperCase()) {
    case "INVALID_CREDENTIALS":
    case "INVALID_INPUT":
      return MSG_CREDENCIAL;
    case "INACTIVE":
      return MSG_INATIVO;
    case "AUTH_SYNC_FAILED":
    case "AUTH_SESSION_FAILED":
    case "SERVICE_ROLE_MISSING":
    case "SERVICE_ROLE_INVALID":
    case "SERVER_ERROR":
      return MSG_INTERNO;
    default:
      return MSG_INTERNO;
  }
}

// true = é um problema interno/infra (não credencial). Útil para telemetria
// e para decidir se convém sugerir "tente novamente".
export function ehErroInternoAuth(code) {
  return [
    "AUTH_SYNC_FAILED", "AUTH_SESSION_FAILED",
    "SERVICE_ROLE_MISSING", "SERVICE_ROLE_INVALID", "SERVER_ERROR",
  ].includes(String(code || "").toUpperCase());
}
