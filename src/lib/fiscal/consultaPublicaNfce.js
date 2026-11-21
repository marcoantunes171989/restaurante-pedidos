// Links para consultar a NFC-e no portal PÚBLICO da SEFAZ (o cliente ou o contador abrem sem login).
// A URL "qrcode?p=chave|3|tpAmb" é a mesma que o QR Code do cupom abre: mostra a nota direto, sem digitar a chave.
// Só SP tem URL própria cadastrada aqui; as demais UFs caem no portal nacional (a pessoa cola a chave).

const SP = {
  producao: { qrcode: "https://www.nfce.fazenda.sp.gov.br/qrcode", portal: "https://www.nfce.fazenda.sp.gov.br/consulta" },
  homologacao: { qrcode: "https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode", portal: "https://www.homologacao.nfce.fazenda.sp.gov.br/consulta" },
};
const PORTAL_NACIONAL = "https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=7PhJ+gAVw2g=";

export const chaveValida = (chave) => /^[0-9]{44}$/.test(String(chave ?? "").replace(/\s/g, ""));
export const soDigitos = (chave) => String(chave ?? "").replace(/\D/g, "");

/** "3526 1144 …" — blocos de 4, como no cupom, para ler e conferir. */
export function chaveFormatada(chave) {
  const c = soDigitos(chave);
  return c.replace(/(.{4})/g, "$1 ").trim();
}

/** Links da consulta pública. `direta` abre a nota; `portal` abre a tela onde se cola a chave. */
export function linksConsultaNfce({ chave, ambiente, modelo = 65 } = {}) {
  const c = soDigitos(chave);
  if (!chaveValida(c)) return null;
  const amb = ambiente === "producao" ? "producao" : "homologacao";
  if (Number(modelo) === 65 && c.slice(0, 2) === "35") {
    return { uf: "SP", ambiente: amb, direta: `${SP[amb].qrcode}?p=${c}|3|${amb === "producao" ? 1 : 2}`, portal: SP[amb].portal };
  }
  return { uf: null, ambiente: amb, direta: null, portal: PORTAL_NACIONAL };
}
