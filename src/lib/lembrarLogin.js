// ════════════════════════════════════════════════════════════
//  "Lembrar login neste dispositivo" — e-mail e senha digitados ficam
//  salvos no localStorage (por pedido explícito do dono do projeto, uma
//  reversão consciente da trava anterior "a senha nunca é persistida";
//  ver App.jsx/login()). Só este dispositivo/navegador enxerga o valor —
//  nunca é enviado a lugar nenhum, só lido aqui para preencher o
//  formulário de login na próxima visita.
// ════════════════════════════════════════════════════════════
const CHAVE = "pedido-prime:lembrar-login";

export function lerLoginLembrado() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return null;
    const dados = JSON.parse(bruto);
    if (!dados || typeof dados.email !== "string" || typeof dados.password !== "string") return null;
    return dados;
  } catch {
    return null;
  }
}

export function salvarLoginLembrado(email, password) {
  try { localStorage.setItem(CHAVE, JSON.stringify({ email, password })); } catch { /* localStorage indisponível — segue sem lembrar */ }
}

export function limparLoginLembrado() {
  try { localStorage.removeItem(CHAVE); } catch { /* ignore */ }
}
