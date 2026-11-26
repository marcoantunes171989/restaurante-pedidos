import CancelamentoNota from "./CancelamentoNota";
import { listarDocumentosFiscais } from "../../../lib/fiscal/notasFiscais";
import { FUNDAMENTO_CANCELAMENTO_NFCE, janelaCancelamentoNfce, nfceForaDoPrazo, podeCancelarNfce, prazoCancelamentoNfceMin, textoContagem } from "../../../lib/fiscal/prazoCancelamento";

// Cancelamento de NFC-e: só as notas autorizadas, normais e dentro do prazo legal da UF (30 minutos). O servidor confere o prazo de novo
// antes de enviar à SEFAZ.
const hora = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" });

const REGRAS_NFCE = Object.freeze({
  id: "cancelamento-nfce",
  sigla: "NFC-e",
  pode: podeCancelarNfce,
  janela: janelaCancelamentoNfce,
  fora: nfceForaDoPrazo,
  listar: async (supabase, lojaId) => ({ notas: await listarDocumentosFiscais(supabase, lojaId, { limite: 100 }) }),
  atualizaMs: 15000,
  urgenteMs: 5 * 60000,
  contagem: textoContagem,
  quando: (iso) => `às ${hora(iso)}`,
  ateQuando: hora,
  exemploMotivo: "Ex.: Venda desfeita pelo cliente no caixa antes da entrega do pedido",
  condicao: <>Confirmo que a <b>mercadoria não saiu</b> (a venda não foi concluída). A lei só permite cancelar nessa condição.</>,
  regra: (uf) => <>Prazo legal{uf ? ` em ${uf}` : ""}: <b>{prazoCancelamentoNfceMin(uf)} minutos</b> contados da autorização, desde que a mercadoria não tenha saído. {FUNDAMENTO_CANCELAMENTO_NFCE}</>,
  vazio: (uf) => `Só aparecem notas autorizadas há menos de ${prazoCancelamentoNfceMin(uf)} minutos. A lista atualiza sozinha.`,
  avisoFora: (n) => `${n} NFC-e autorizada(s) já passaram do prazo e não aparecem aqui. Fora do prazo, o cancelamento só por pedido de regularização ao fisco do estado (em SP: Posto Fiscal, via SIPET). Fale com o contador.`,
});

export default function CancelamentoNfce({ supabase, lojaInfo }) {
  return <CancelamentoNota supabase={supabase} lojaInfo={lojaInfo} regras={REGRAS_NFCE} />;
}
