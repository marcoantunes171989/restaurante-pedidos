// ════════════════════════════════════════════════════════════
//  QR Code de login — gera/lê um payload compacto (email+senha em
//  base64) para autenticação por leitura de QR. Prefixo próprio para
//  nunca ser confundido com um QR de comanda/mesa (o scanner só aceita
//  este formato e rejeita qualquer outro). Compartilhado entre a tela
//  de login (leitura) e a tela de Usuários do admin (geração do selo).
// ════════════════════════════════════════════════════════════
const LOGIN_QR_PREFIX = "PPLOGIN1:";

export function gerarLoginQRTexto(user) {
  try {
    const json = JSON.stringify({ e: user.email, p: user.password });
    return LOGIN_QR_PREFIX + btoa(unescape(encodeURIComponent(json)));
  } catch { return ""; }
}

export function lerLoginQRTexto(texto) {
  const t = String(texto || "").trim();
  if (!t.startsWith(LOGIN_QR_PREFIX)) return null;
  try {
    const json = decodeURIComponent(escape(atob(t.slice(LOGIN_QR_PREFIX.length))));
    const o = JSON.parse(json);
    if (o && o.e && o.p) return { email: String(o.e), password: String(o.p) };
    return null;
  } catch { return null; }
}
