import ModalCentral from "../../../components/ModalCentral.jsx";
import { AvisoErro, Cartao, Carregando, Dado } from "../../../components/graficos/Graficos.jsx";
import { dataHora, mensagemDoHistorico, textoDaNota, textoDasFormas } from "../../../lib/relatorios/historicos.js";
import { buscarHistoricoDoCliente, comSinal, dia, rotuloDoLancamento } from "../../../lib/relatorios/pontos.js";
import { formatCurrency } from "../../pdv/pdvHelpers.js";
import { useConsulta } from "../relatorios/useConsulta.js";

const LISTA = "divide-y divide-[#E5E7EB]";
const LINHA = "flex items-start justify-between gap-3 py-2 text-[13px] text-[#1F2933]";
const APOIO = "block text-[11px] text-[#667085]";

/** Saldo, pontos a vencer, lançamentos e compras de um cliente. */
export default function HistoricoDoCliente({ supabase, lojaId, clienteId, onFechar }) {
  const { dados, erro, atualizar } = useConsulta(() => buscarHistoricoDoCliente(supabase, lojaId, clienteId), `${lojaId}-${clienteId}`);
  const c = dados?.cliente;

  return (
    <ModalCentral ariaLabel="Histórico do cliente" titulo={c?.nome || "Histórico do cliente"} subtitulo={c?.telefone || null} colunas={c ? 2 : 1} tamanho="xl" onFechar={onFechar}>
      {erro ? <AvisoErro mensagem={mensagemDoHistorico(erro)} onTentar={atualizar} /> : !dados ? <Carregando rotulo="Carregando o histórico…" /> : dados.ausente ? (
        <p className="text-[13px] text-[#667085]">O histórico fica disponível depois da atualização do banco de dados.</p>
      ) : (
        <>
          <Cartao titulo="Pontos">
            <dl className="grid grid-cols-2 gap-3">
              <Dado rotulo="Saldo disponível">{Number(dados.saldo || 0).toLocaleString("pt-BR")} pts</Dado>
              <Dado rotulo="Próximo vencimento">{dados.aVencer?.length ? `${Number(dados.aVencer[0].pontos).toLocaleString("pt-BR")} pts em ${dia(dados.aVencer[0].venceEm)}` : "Nada a vencer"}</Dado>
            </dl>
            {dados.aVencer?.length > 1 && (
              <ul className={`mt-3 ${LISTA}`}>
                {dados.aVencer.map((l, i) => (
                  <li key={i} className={LINHA}><span className="min-w-0">Vence em {dia(l.venceEm)}<span className={APOIO}>{l.origem || "—"}</span></span><span className="shrink-0 font-semibold tabular-nums">{Number(l.pontos).toLocaleString("pt-BR")} pts</span></li>
                ))}
              </ul>
            )}
          </Cartao>
          <Cartao titulo="Lançamentos" descricao="Os 200 mais recentes.">
            {(dados.movimentos || []).length === 0 ? <p className="text-[13px] text-[#667085]">Sem lançamentos.</p> : (
              <ul className={LISTA}>
                {dados.movimentos.map((m) => (
                  <li key={m.id} className={LINHA}>
                    <span className="min-w-0"><span className="font-semibold">{rotuloDoLancamento(m)}</span> · {dataHora(m.quando)}
                      <span className={APOIO}>{[m.descricao, m.pedidos?.join(", "), m.pedidos && textoDaNota(m.notas?.[0]), m.cupom && `Cupom ${m.cupom}`, m.tipo !== "expire" && m.pontos > 0 && m.venceEm && `vence em ${dia(m.venceEm)}`].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className={`shrink-0 font-semibold tabular-nums ${m.pontos < 0 ? "text-[#C81E4A]" : "text-[#1F7A3D]"}`}>{comSinal(m.pontos)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
          <Cartao titulo="Compras" descricao="As 50 mais recentes.">
            {(dados.compras || []).length === 0 ? <p className="text-[13px] text-[#667085]">Sem compras registradas.</p> : (
              <ul className={LISTA}>
                {dados.compras.map((v) => (
                  <li key={v.vendaId} className={LINHA}>
                    <span className="min-w-0"><span className="font-semibold">{dataHora(v.quando)}</span>
                      <span className={APOIO}>{v.itens || "—"}</span>
                      <span className={APOIO}>{[textoDasFormas(v.formas), textoDaNota(v.notas?.[0]), v.cupom && `Cupom ${v.cupom}`].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 text-right font-semibold tabular-nums">
                      <span className={v.estornada ? "line-through opacity-60" : ""}>{formatCurrency(v.total)}</span>
                      {v.estornada && <span className="block text-[11px] text-[#C81E4A]">Estornada</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </>
      )}
    </ModalCentral>
  );
}
