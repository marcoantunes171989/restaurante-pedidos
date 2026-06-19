// ════════════════════════════════════════════════════════════
//  Configuração central de contato comercial (consultor)
// ════════════════════════════════════════════════════════════
export const WHATSAPP_CONSULTOR = "5518981465499";

export const HORARIO_ATENDIMENTO = ["Segunda a sexta, das 09h às 18h", "Exceto feriados"];

export const ASSUNTOS_CONSULTOR = [
  "Quero contratar o módulo Fidelidade",
  "Quero conhecer os planos",
  "Tenho dúvidas sobre implantação",
  "Preciso falar com um consultor",
  "Outro assunto",
];

// Mensagem amigável para o consultor (WhatsApp/registro), com os dados do form.
export function mensagemConsultor({ nome = "", email = "", telefone = "", assunto = "", mensagem = "", modulo = "Fidelidade" } = {}) {
  const linhas = [
    "Olá, tenho interesse no Pedido Prime.",
    `Gostaria de falar com um consultor sobre o módulo ${modulo}.`,
    "",
    nome && `Nome: ${nome}`,
    email && `E-mail: ${email}`,
    telefone && `Telefone: ${telefone}`,
    assunto && `Assunto: ${assunto}`,
    mensagem && `Mensagem: ${mensagem}`,
  ].filter(Boolean);
  return linhas.join("\n");
}

export function linkWhatsappConsultor(texto) {
  return `https://wa.me/${WHATSAPP_CONSULTOR}?text=${encodeURIComponent(texto || "")}`;
}
