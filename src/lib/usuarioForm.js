// ════════════════════════════════════════════════════════════
//  Domínio do formulário de usuário (FASE 7.2.4) — puro e testável.
//  Validação de Novo/Editar, agrupamento de perfis e metadados de UI.
//  Não importa React nem toca no DOM.
// ════════════════════════════════════════════════════════════

export const SENHA_MIN = 6;

// Normalização (§47): nome trim; e-mail lower+trim; senha SEM trim (espaço
// pode fazer parte da credencial).
export const normalizarNome = (v) => String(v ?? "").trim();
export const normalizarEmail = (v) => String(v ?? "").trim().toLowerCase();

// Formato de e-mail conservador (evita "marco", "marco@", "@x.com", com espaço).
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const emailValido = (v) => RE_EMAIL.test(normalizarEmail(v));

/**
 * Valida o formulário de usuário conforme o modo ("novo" | "editar").
 * Retorna { valido, erros: { campo: mensagem } }.
 *  - novo:  senha + confirmação OBRIGATÓRIAS.
 *  - editar: senha opcional; se preenchida, exige confirmação igual.
 */
export function validarUsuarioForm(dados = {}, opcoes = {}) {
  const modo = opcoes.modo === "editar" ? "editar" : "novo";
  const exigeEmpresa = opcoes.exigeEmpresa !== false; // super admin escolhe; gestor tem loja fixa
  const erros = {};

  const nome = normalizarNome(dados.nome);
  if (nome.length < 2) erros.nome = "Informe o nome do usuário.";

  const email = normalizarEmail(dados.email);
  if (!email) erros.email = "Informe o e-mail de acesso.";
  else if (!emailValido(email)) erros.email = "E-mail inválido. Ex.: usuario@empresa.com";

  if (exigeEmpresa && (dados.lojaId == null || dados.lojaId === "")) {
    erros.lojaId = "Selecione a empresa do usuário.";
  }

  if (dados.cargoId == null || dados.cargoId === "") {
    erros.cargoId = "Selecione o cargo/perfil.";
  }

  const senha = dados.senha != null ? String(dados.senha) : "";
  const confirmar = dados.confirmarSenha != null ? String(dados.confirmarSenha) : "";
  const senhaObrigatoria = modo === "novo";

  if (senhaObrigatoria || senha.length > 0) {
    if (senha.length < SENHA_MIN) {
      erros.senha = `A senha deve ter no mínimo ${SENHA_MIN} caracteres.`;
    }
    if (confirmar !== senha) {
      erros.confirmarSenha = "As senhas não conferem.";
    }
  }

  return { valido: Object.keys(erros).length === 0, erros };
}

// Indicador simples de força (não bloqueia — §17).
export function forcaSenha(senha) {
  const s = String(senha || "");
  if (!s) return null;
  let score = 0;
  if (s.length >= SENHA_MIN) score++;
  if (s.length >= 10) score++;
  if (/[A-Z]/.test(s) && /[a-z]/.test(s)) score++;
  if (/\d/.test(s)) score++;
  if (/[^A-Za-z0-9]/.test(s)) score++;
  if (score <= 2) return "fraca";
  if (score === 3) return "media";
  return "forte";
}

// ── Metadados de perfil (ícone Lucide + descrição) e agrupamento (§21/§22) ──
// Chave = nome do perfil em minúsculas. `icone` é o nome do ícone Lucide.
export const PERFIL_META = {
  gestor:        { icone: "ShieldCheck",      descricao: "Acesso administrativo e gerencial." },
  administrador: { icone: "ShieldCheck",      descricao: "Acesso administrativo e gerencial." },
  caixa:         { icone: "CircleDollarSign", descricao: "PDV, fechamento e recebimentos." },
  garçom:        { icone: "Utensils",         descricao: "Mesas, comandas e pedidos." },
  garcom:        { icone: "Utensils",         descricao: "Mesas, comandas e pedidos." },
  operador:      { icone: "BadgeCheck",       descricao: "Acesso operacional conforme permissões." },
  cozinha:       { icone: "ChefHat",          descricao: "Produção e atualização de pedidos." },
  produção:      { icone: "ChefHat",          descricao: "Produção e atualização de pedidos." },
  painel:        { icone: "Monitor",          descricao: "Visualização do andamento dos pedidos." },
  cliente:       { icone: "User",             descricao: "Perfil de cliente quando aplicável." },
};

export const GRUPOS_PERFIL = [
  { grupo: "Gestão",      chaves: ["gestor", "administrador"] },
  { grupo: "Atendimento", chaves: ["garçom", "garcom", "caixa", "operador"] },
  { grupo: "Produção",    chaves: ["cozinha", "produção"] },
  { grupo: "Exibição",    chaves: ["painel"] },
  { grupo: "Outros",      chaves: ["cliente"] },
];

export function metaDoPerfil(nome) {
  const k = String(nome || "").trim().toLowerCase();
  return PERFIL_META[k] || { icone: "BadgeCheck", descricao: "Acesso conforme permissões." };
}

/**
 * Organiza a lista de cargos (do banco) nos grupos de UI, preservando os
 * valores técnicos (id/nome). Cargos que não casam com nenhum grupo caem em
 * "Outros". Só UX — não altera dados.
 */
export function agruparCargos(cargos = []) {
  const restantes = [...cargos];
  const grupos = [];
  for (const { grupo, chaves } of GRUPOS_PERFIL) {
    const doGrupo = [];
    for (let i = restantes.length - 1; i >= 0; i--) {
      const nome = String(restantes[i]?.nome || "").trim().toLowerCase();
      if (chaves.includes(nome)) {
        doGrupo.unshift(restantes[i]);
        restantes.splice(i, 1);
      }
    }
    if (doGrupo.length) grupos.push({ grupo, cargos: doGrupo });
  }
  if (restantes.length) {
    const outros = grupos.find((g) => g.grupo === "Outros");
    if (outros) outros.cargos.push(...restantes);
    else grupos.push({ grupo: "Outros", cargos: restantes });
  }
  return grupos;
}

// Mapeia códigos de erro server-side → mensagem amigável (§41/§42/§43).
export function mensagemErroUsuario(code, fallback) {
  switch (String(code || "").toUpperCase()) {
    case "DUPLICATE":
      return "Este e-mail já está vinculado a outro usuário.";
    case "INVALID_INPUT":
      return "Dados inválidos. Revise os campos e tente novamente.";
    case "FORBIDDEN":
      return "Você não tem permissão para esta operação.";
    case "AUTH_SYNC_FAILED":
    case "PASSWORD_SYNC_FAILED":
    case "PASSWORD_INCONSISTENT":
    case "SERVICE_ROLE_INVALID":
    case "SERVICE_ROLE_MISSING":
    case "CREATE_INCONSISTENT":
      return "Não foi possível atualizar o acesso do usuário. Tente novamente.";
    case "SERVER_ERROR":
      return "Erro no servidor. Tente novamente em instantes.";
    default:
      return fallback || "Não foi possível concluir a operação. Tente novamente.";
  }
}
