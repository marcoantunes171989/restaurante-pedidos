// ════════════════════════════════════════════════════════════
//  Tradução de erros de autenticação para mensagens seguras e amigáveis.
//  Nunca repassa a string bruta do Supabase/rede para a tela — evita
//  vazar mensagem técnica, stack trace ou pista sobre a conta existir
//  ou não. Usado pelo login() em App.jsx antes de exibir a mensagem.
// ════════════════════════════════════════════════════════════
export function mensagemErroAcesso(erroBruto) {
  const raw = String(erroBruto || "").toLowerCase();
  if (!raw) return "Não foi possível acessar sua conta. Tente novamente.";
  if (raw.includes("fetch") || raw.includes("network") || raw.includes("timeout") || raw.includes("conex") || raw.includes("offline")) {
    return "Sua conexão parece estar indisponível.";
  }
  if (raw.includes("invalid") || raw.includes("credencial") || raw.includes("inválid") || raw.includes("incorret")) {
    return "E-mail ou senha incorretos.";
  }
  return "Não foi possível acessar sua conta. Tente novamente.";
}
