// ════════════════════════════════════════════════════════════
//  Conteúdo centralizado da tela de login — textos naturais e
//  objetivos, sem promessas exageradas ou métricas inventadas.
// ════════════════════════════════════════════════════════════

export const INSTITUCIONAL = {
  selo: "Gestão gastronômica inteligente",
  headline: "Sua operação inteira, em um só lugar.",
  descricao: "Conecte pedidos, salão, cozinha, caixa e gestão para trabalhar com mais agilidade e controle.",
  beneficios: [
    { icon: "central", texto: "Operação centralizada" },
    { icon: "tempo", texto: "Visão em tempo real" },
    { icon: "dados", texto: "Gestão orientada por dados" },
  ],
  rodape: "Plataforma segura · acesso por usuário e permissão",
};

export const FORM = {
  titulo: "Bem-vindo ao Pedido Prime",
  subtitulo: "Acesse sua conta para continuar.",
  fraseValorMobile: "Pedidos, cozinha, caixa e gestão conectados.",
  labelEmail: "E-mail",
  placeholderEmail: "seu@email.com",
  labelSenha: "Senha",
  esqueciSenha: "Esqueci minha senha",
  avisoSenha: "Entre em contato com o administrador do sistema para redefinir sua senha.",
  botaoEntrar: "Entrar na plataforma",
  botaoEntrando: "Entrando...",
  botaoQr: "Entrar com QR Code",
  seguranca: "Acesso seguro e protegido.",
  voltarSite: "← Voltar ao site",
  offline: "Sistema offline — não foi possível conectar ao servidor. Acione o suporte.",
};

export const VALIDACAO = {
  emailVazio: "Informe um e-mail válido.",
  emailInvalido: "Informe um e-mail válido.",
  senhaVazia: "Digite sua senha.",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function emailValido(v) {
  return EMAIL_RE.test(String(v || "").trim());
}
