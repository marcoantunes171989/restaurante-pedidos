import ModalCentral from "../../../components/ModalCentral.jsx";
import { AvisoErro, Cartao, Carregando, Dado } from "../../../components/graficos/Graficos.jsx";
import { CANAIS, TIPOS_MOVIMENTO, buscarVenda, dataHora, mensagemDoHistorico, textoDaNota, textoDaVariacao, textoDasFormas } from "../../../lib/relatorios/historicos.js";
import { formatCurrency } from "../../pdv/pdvHelpers.js";
import { useConsulta } from "./useConsulta.js";

const GRADE = "grid grid-cols-2 gap-3 sm:grid-cols-3";
const dinheiro = (v) => (v == null ? "—" : formatCurrency(v));

/** Tudo o que o banco registrou de uma venda. */
export default function DetalheDaVenda({ supabase, vendaId, onFechar }) {
  const { dados, erro, atualizar } = useConsulta(() => buscarVenda(supabase, vendaId), String(vendaId));
  const v = dados?.venda;

  return (
    <ModalCentral ariaLabel="Detalhe da venda" titulo={v ? `Venda de ${formatCurrency(v.total)}` : "Venda"}
      subtitulo={v ? `${dataHora(v.vendido_em)} · ${(v.pedidos_ids || []).join(", ")}` : null} colunas={v ? 2 : 1} tamanho="xl" onFechar={onFechar}>
      {erro ? <AvisoErro mensagem={mensagemDoHistorico(erro)} onTentar={atualizar} /> : !v ? <Carregando rotulo="Carregando a venda…" /> : (
        <>
          <Cartao titulo="Resumo">
            <dl className={GRADE}>
              <Dado rotulo="Cliente">{v.cliente_nome || "Não identificado"}{v.cliente_telefone && <span className="block text-[11px] font-medium text-[#667085]">{v.cliente_telefone}</span>}</Dado>
              <Dado rotulo="Canal">{CANAIS[v.canal] || v.canal}</Dado>
              <Dado rotulo="Mesa">{v.mesa || "—"}</Dado>
              <Dado rotulo="Operador">{v.operador_nome || "—"}</Dado>
              <Dado rotulo="Registro">{v.origem === "reconstruida" ? "Reconstruído de venda anterior" : "Gravado na venda"}</Dado>
              <Dado rotulo="Pagamento">{textoDasFormas(v.formas)}</Dado>
            </dl>
          </Cartao>
          <Cartao titulo="Valores">
            <dl className={GRADE}>
              <Dado rotulo="Subtotal">{dinheiro(v.subtotal)}</Dado>
              <Dado rotulo="Taxa de serviço">{v.taxa_removida ? "Removida" : dinheiro(v.taxa_servico)}</Dado>
              <Dado rotulo="Acréscimo">{dinheiro(v.acrescimo)}</Dado>
              <Dado rotulo="Desconto">{dinheiro(v.desconto_manual)}</Dado>
              <Dado rotulo={v.cupom_codigo ? `Cupom ${v.cupom_codigo}` : "Cupom"}>{dinheiro(v.desconto_cupom)}</Dado>
              <Dado rotulo="Total">{dinheiro(v.total)}</Dado>
              <Dado rotulo="Troco">{dinheiro(v.troco)}</Dado>
              <Dado rotulo="Custo dos itens">{dinheiro(v.custo_total)}</Dado>
              <Dado rotulo="Motivo do ajuste">{v.motivo_ajuste || "—"}</Dado>
            </dl>
          </Cartao>
          <Cartao titulo="Itens">
            <ul className="divide-y divide-[#E5E7EB]">
              {(dados.itens || []).map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 py-2 text-[13px] text-[#1F2933]">
                  <span className="min-w-0">
                    <span className="font-semibold">{Number(i.quantidade).toLocaleString("pt-BR")}× {i.produto_nome}</span>
                    <span className="block text-[11px] text-[#667085]">{formatCurrency(i.preco_unitario)} cada · custo {dinheiro(i.custo_unitario)}{i.detalhes?.observation ? ` · ${i.detalhes.observation}` : ""}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(i.total)}</span>
                </li>
              ))}
            </ul>
          </Cartao>
          <Cartao titulo="Nota fiscal">
            {(dados.notas || []).length === 0 ? <p className="text-[13px] text-[#667085]">Venda sem nota fiscal.</p> : (
              <ul className="space-y-2 text-[13px] text-[#1F2933]">
                {dados.notas.map((n) => (
                  <li key={`${n.modelo}-${n.serie}-${n.numero}`}>
                    <span className="font-semibold">{textoDaNota(n)}</span>
                    <span className="block text-[11px] text-[#667085]">Série {n.serie} · {dataHora(n.emitidaEm)}{n.chave ? ` · chave ${n.chave}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
          <Cartao titulo="Baixa de estoque">
            {(dados.estoque || []).length === 0 ? <p className="text-[13px] text-[#667085]">Sem movimentação registrada para esta venda.</p> : (
              <ul className="divide-y divide-[#E5E7EB]">
                {dados.estoque.map((m, i) => (
                  <li key={i} className="flex justify-between gap-3 py-2 text-[13px] text-[#1F2933]">
                    <span className="min-w-0"><span className="font-semibold">{m.produto}</span><span className="block text-[11px] text-[#667085]">{TIPOS_MOVIMENTO[m.tipo] || m.tipo} · {dataHora(m.quando)}</span></span>
                    <span className="shrink-0 font-semibold tabular-nums">{textoDaVariacao(m)} ({m.antes} → {m.depois})</span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
          <Cartao titulo="Pontos de fidelidade">
            {(dados.pontos || []).length === 0 ? <p className="text-[13px] text-[#667085]">Sem pontos nesta venda.</p> : (
              <ul className="divide-y divide-[#E5E7EB]">
                {dados.pontos.map((p, i) => (
                  <li key={i} className="flex justify-between gap-3 py-2 text-[13px] text-[#1F2933]">
                    <span className="min-w-0">{p.descricao || p.tipo}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{p.pontos > 0 ? "+" : ""}{p.pontos} pts</span>
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
