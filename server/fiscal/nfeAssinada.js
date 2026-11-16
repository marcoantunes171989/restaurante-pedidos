// Monta e assina a NF-e/NFC-e de emissão normal (tpEmis 1) — só servidor.
// Determinístico: mesmos dados + mesmo certificado = mesmo XML assinado.
// Por isso a consulta (E7) consegue recompor a nota que ficou sem resposta
// e conferir com o digVal do protocolo antes de guardar.
import { montarXmlNFe } from "../../src/lib/fiscal/nfeXml.js";
import { assinarNFe } from "./assinarNFe.js";
import { urlQrCodeV3, grupoInfNFeSupl } from "./qrcodeNfce.js";
import { enderecoServico } from "./sefaz/transporte.js";

export function montarAssinadaNormal({ dados, modelo, ambiente, uf, cred }) {
  const { xml } = montarXmlNFe(dados);
  let supl = "";
  if (Number(modelo) === 65) {
    const qr = urlQrCodeV3({ urlBase: enderecoServico({ uf, modelo: 65, ambiente, servico: "QRCode" }), chave: dados.chave, tpAmb: dados.ide.tpAmb });
    supl = grupoInfNFeSupl({ qrCode: qr, urlChave: enderecoServico({ uf, modelo: 65, ambiente, servico: "ConsultaPublica" }) });
  }
  return assinarNFe(xml, { chavePrivadaPem: cred.chavePrivadaPem, certificadoBase64: cred.certificadoBase64, infNFeSupl: supl });
}
