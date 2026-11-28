// Ponte entre o evento `beforeinstallprompt` (capturado uma única vez na
// raiz, ver src/main.jsx) e telas que oferecem "Instalar o app" — hoje só o
// modal de Configurações de notificação (NotificationSettings.jsx), quando a
// ativação de push exige o app instalado. Sem sugestão proativa de
// instalação em nenhuma outra tela.
let evento = null;
const ouvintes = new Set();
const avisar = () => ouvintes.forEach((fn) => { try { fn(!!evento); } catch { /* ouvinte com erro não derruba os outros */ } });

export function guardarPromptInstalacao(e) { evento = e; avisar(); }
export function limparPromptInstalacao() { evento = null; avisar(); }
export function temPromptInstalacao() { return !!evento; }
export function ouvirPromptInstalacao(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }

/** Só chamar a partir de um clique do usuário. Retorna 'accepted' | 'dismissed' | 'unavailable'. */
export async function dispararPromptInstalacao() {
  const e = evento;
  if (!e) return "unavailable";
  evento = null; avisar();
  try {
    e.prompt();
    const escolha = await e.userChoice;
    return escolha?.outcome === "accepted" ? "accepted" : "dismissed";
  } catch { return "dismissed"; }
}
