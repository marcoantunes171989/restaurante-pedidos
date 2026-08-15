// ════════════════════════════════════════════════════════════
//  Conteúdo centralizado da tela de login — textos naturais e
//  objetivos, sem promessas exageradas ou métricas inventadas.
// ════════════════════════════════════════════════════════════

export const INSTITUCIONAL = {
  selo: "Gestão gastronômica inteligente",
  headline: "Gestão que acompanha o ritmo da sua operação.",
  descricao: "Pedidos, salão, cozinha, caixa e indicadores conectados em uma experiência simples para a equipe e completa para a gestão.",
  beneficios: [
    { icon: "central", texto: "Operação centralizada" },
    { icon: "tempo", texto: "Visão em tempo real" },
    { icon: "dados", texto: "Gestão orientada por dados" },
  ],
  rodape: "Plataforma segura · acesso por usuário e permissão",
};

// Tipos de estabelecimento atendidos pelo Pedido Prime — reforça, na tela de
// login, para QUEM o sistema é feito (valoriza e cria pertencimento). Ícones
// leves (emoji) + paleta neutra; o acento fica só no ponto/realce.
export const ESTABELECIMENTOS = {
  titulo: "Feito para o seu negócio gastronômico",
  itens: [
    { icon: "🍔", nome: "Hamburgueria" },
    { icon: "🍕", nome: "Pizzaria" },
    { icon: "🍣", nome: "Japonês & Sushi" },
    { icon: "🍽️", nome: "Restaurante" },
    { icon: "🍧", nome: "Açaiteria" },
    { icon: "☕", nome: "Cafeteria" },
    { icon: "🍢", nome: "Espetaria" },
    { icon: "🍺", nome: "Bar & Boteco" },
  ],
};

export const FORM = {
  titulo: "Bem-vindo ao Pedido Prime",
  subtitulo: "Entre com suas credenciais para acessar seu ambiente de gestão.",
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
