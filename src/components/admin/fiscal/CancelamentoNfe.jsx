import CancelamentoNota from "./CancelamentoNota";
import { listarDocumentosFiscais } from "../../../lib/fiscal/notasFiscais";
import {
  FUNDAMENTO_CANCELAMENTO_NFE, PRAZO_CANCELAMENTO_NFE_HORAS, janelaCancelamentoNfe, nfeForaDoPrazo, podeCancelarNfe, prazoExtemporaneoNfeHoras, textoContagemLonga,
} from "../../../lib/fiscal/prazoCancelamento";

// Cancelamento de NF-e: notas autorizadas nas últimas 24 horas e, onde a UF aceita (SP: até 480 horas), as de fora do prazo regular,
// separadas e com confirmação própria.
const dataHora = (v) => new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const PAGINA = 200, MAX_PAGINAS = 10;

/** As notas vêm da mais nova para a mais antiga: busca páginas até passar da maior janela de cancelamento (com 1 dia de folga). */
export async function listarNotasDoPeriodo(supabase, lojaId, { uf, agora = new Date() } = {}) {
  const horas = Math.max(PRAZO_CANCELAMENTO_NFE_HORAS, prazoExtemporaneoNfeHoras(uf)) + 24;
  const corte = new Date(agora).getTime() - horas * 3600000;
  const notas = [];
  let antes = null;
  for (let i = 0; i < MAX_PAGINAS; i++) {
    const pagina = await listarDocumentosFiscais(supabase, lojaId, { limite: PAGINA, antes });
    notas.push(...pagina);
    const ultima = pagina.at(-1);
    if (pagina.length < PAGINA || !ultima?.criadoEm || new Date(ultima.criadoEm).getTime() < corte) return { notas, parcial: false };
    antes = ultima.criadoEm;
  }
  return { notas, parcial: true };
}

const REGRAS_NFE = Object.freeze({
  id: "cancelamento-nfe",
  sigla: "NF-e",
  pode: podeCancelarNfe,
  janela: janelaCancelamentoNfe,
  fora: nfeForaDoPrazo,
  listar: listarNotasDoPeriodo,
  atualizaMs: 60000,
  urgenteMs: 2 * 3600000,
  contagem: textoContagemLonga,
  quando: (iso) => `em ${dataHora(iso)}`,
  ateQuando: dataHora,
  exemploMotivo: "Ex.: Venda desfeita antes da saída da mercadoria do estabelecimento",
  condicao: <>Confirmo que a <b>mercadoria não circulou</b> (não saiu do estabelecimento). A lei só permite cancelar nessa condição.</>,
  avisoExtemporaneo: "Fora do prazo regular de 24 horas",
  condicaoExtemporaneo: <>Estou ciente de que é um <b>cancelamento fora do prazo</b>: o RICMS/SP (art. 527, IV, z1) prevê multa de 1% do valor da operação, no mínimo 6 UFESPs por documento (R$ 230,52 em 2026); a SEFAZ-SP já respondeu que o pedido feito pelo sistema em até 480 horas, antes de qualquer fiscalização, é denúncia espontânea (RC 30111/2024). Confirme com o contador. A SEFAZ pode recusar nota com manifestação do destinatário ou documento de transporte.</>,
  regra: (uf) => {
    const extra = prazoExtemporaneoNfeHoras(uf);
    return <>Prazo regular: <b>{PRAZO_CANCELAMENTO_NFE_HORAS} horas</b> contadas da autorização. {FUNDAMENTO_CANCELAMENTO_NFE}{extra ? <> Em {uf}, o pedido ainda é aceito até <b>{extra} horas</b> ({extra / 24} dias), como cancelamento fora do prazo.</> : null}</>;
  },
  vazio: (uf) => `Só aparecem notas autorizadas há menos de ${prazoExtemporaneoNfeHoras(uf) || PRAZO_CANCELAMENTO_NFE_HORAS} horas. A lista atualiza sozinha.`,
  avisoFora: (n, uf) => (prazoExtemporaneoNfeHoras(uf)
    ? `${n} NF-e autorizada(s) passaram de ${prazoExtemporaneoNfeHoras(uf)} horas e não aparecem aqui. Depois disso é preciso a manifestação do destinatário ou pedido ao fisco (em SP, pelo SIPET); com a autorização, envie o cancelamento em Notas emitidas. Fale com o contador.`
    : `${n} NF-e autorizada(s) passaram de ${PRAZO_CANCELAMENTO_NFE_HORAS} horas e não aparecem aqui. Fora do prazo, siga a regra do fisco do estado. Fale com o contador.`),
});

export default function CancelamentoNfe({ supabase, lojaInfo }) {
  return <CancelamentoNota supabase={supabase} lojaInfo={lojaInfo} regras={REGRAS_NFE} />;
}
