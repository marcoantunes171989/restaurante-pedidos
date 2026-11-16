// ════════════════════════════════════════════════════════════
//  DANFE NFC-e (Etapa E8, parte 2) — dados para impressão tirados do XML
//  guardado da nota. Fonte: Manual de Especificações Técnicas do DANFE
//  NFC-e e QR Code, versão 6.0 (mar/2025), itens 2 e 3.1:
//   - o DANFE só mostra o que está no XML (e o protocolo do retorno);
//   - divisões I a IX (cabeçalho, itens, totais, consulta pela chave,
//     QR Code, consumidor, identificação/protocolo, mensagem fiscal e
//     mensagem do contribuinte);
//   - contingência: sem protocolo e com o aviso "EMITIDA EM CONTINGÊNCIA /
//     Pendente de autorização"; homologação: "EMITIDA EM AMBIENTE DE
//     HOMOLOGAÇÃO – SEM VALOR FISCAL".
//  Só leitura de texto: nenhum segredo sai daqui.
// ════════════════════════════════════════════════════════════

const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
const desc = (v) => (v == null ? null : String(v).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENT[m]));
const bloco = (xml, n) => (new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`).exec(xml || "") || [])[1] || "";
const blocos = (xml, n) => [...String(xml || "").matchAll(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, "g"))].map((m) => m[1]);
const de = (xml, n) => desc((new RegExp(`<${n}>([\\s\\S]*?)</${n}>`).exec(xml || "") || [])[1] ?? null);
const num = (v) => (v == null || v === "" ? 0 : Number(v));

/**
 * @param {object} p
 * @param {string} p.xml        XML guardado (nfeProc autorizado ou NFe de contingência).
 * @param {object} p.documento  metadados da nota (migration 185).
 * @param {string} p.fonte      'autorizada' | 'contingencia'
 */
export function dadosDanfeNfce({ xml, documento = {}, fonte } = {}) {
  const x = String(xml || "");
  const inf = bloco(x, "infNFe");
  const ide = bloco(inf, "ide");
  if (de(ide, "mod") !== "65") throw new Error("DANFE NFC-e só para o modelo 65.");
  const chave = (/<infNFe[^>]*\sId="NFe([0-9A-Z]{44})"/.exec(x) || [])[1];
  if (!chave) throw new Error("XML sem chave de acesso.");
  const emit = bloco(inf, "emit"), ender = bloco(emit, "enderEmit"), dest = bloco(inf, "dest");
  const tot = bloco(bloco(inf, "total"), "ICMSTot"), pag = bloco(inf, "pag"), supl = bloco(x, "infNFeSupl");
  const prot = bloco(x, "infProt");
  const tpEmis = Number(de(ide, "tpEmis") || 1);
  const autorizada = fonte === "autorizada" && de(prot, "cStat") === "100";

  const itens = blocos(inf, "det").map((d) => {
    const p = bloco(d, "prod");
    return { cProd: de(p, "cProd"), xProd: de(p, "xProd"), qCom: num(de(p, "qCom")), uCom: de(p, "uCom"),
      vUnCom: num(de(p, "vUnCom")), vProd: num(de(p, "vProd")) };
  });
  const enderecoEmit = [
    [de(ender, "xLgr"), de(ender, "nro"), de(ender, "xCpl")].filter(Boolean).join(", "),
    de(ender, "xBairro"), [de(ender, "xMun"), de(ender, "UF")].filter(Boolean).join(" - "),
    de(ender, "CEP") ? `CEP ${de(ender, "CEP")}` : null,
  ].filter(Boolean).join(" · ");

  return {
    chave,
    emitente: { cnpj: de(emit, "CNPJ"), cpf: de(emit, "CPF"), nome: de(emit, "xNome"), fantasia: de(emit, "xFant"), endereco: enderecoEmit, ie: de(emit, "IE") },
    itens,
    totais: {
      qtdItens: itens.length, vProd: num(de(tot, "vProd")), vDesc: num(de(tot, "vDesc")),
      vAcresc: num(de(tot, "vFrete")) + num(de(tot, "vSeg")) + num(de(tot, "vOutro")), vNF: num(de(tot, "vNF")),
    },
    pagamentos: blocos(pag, "detPag").map((p) => ({ tPag: de(p, "tPag"), xPag: de(p, "xPag"), vPag: num(de(p, "vPag")) })),
    troco: num(de(pag, "vTroco")),
    consumidor: dest ? { cnpj: de(dest, "CNPJ"), cpf: de(dest, "CPF"), idEstrangeiro: de(dest, "idEstrangeiro"), nome: de(dest, "xNome") } : null,
    numero: Number(de(ide, "nNF")), serie: Number(de(ide, "serie")), dhEmi: de(ide, "dhEmi"),
    homologacao: de(ide, "tpAmb") === "2",
    contingencia: tpEmis !== 1 && !autorizada,
    tpEmis,
    protocolo: autorizada ? { nProt: de(prot, "nProt"), dhRecbto: de(prot, "dhRecbto") } : null,
    qrCode: de(supl, "qrCode"), urlChave: de(supl, "urlChave"),
    infAdFisco: de(bloco(inf, "infAdic"), "infAdFisco"), infCpl: de(bloco(inf, "infAdic"), "infCpl"),
    xMsg: autorizada ? de(prot, "xMsg") : null,
    documentoId: documento.id ?? null,
  };
}
