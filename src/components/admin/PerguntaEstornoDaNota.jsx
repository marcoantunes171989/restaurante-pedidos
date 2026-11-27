import { useEffect, useState } from "react";
import ModalCentral from "../ModalCentral.jsx";
import EstornoDeVenda from "./EstornoDeVenda.jsx";
import { dataHora, vendasDaNota } from "../../lib/relatorios/historicos.js";
import { formatCurrency } from "../../pages/pdv/pdvHelpers.js";

/**
 * Depois de cancelar uma nota: pergunta se a venda também deve ser estornada. Só aparece para quem administra
 * a empresa e quando há venda ainda válida coberta pela nota; caso contrário, não mostra nada.
 */
export default function PerguntaEstornoDaNota({ supabase, documentoId, motivo = "", onFechar }) {
  const [vendas, setVendas] = useState(null);
  const [falhou, setFalhou] = useState(false);
  const [estornando, setEstornando] = useState(null);
  const [estornadas, setEstornadas] = useState([]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const lista = await vendasDaNota(supabase, documentoId);
        if (!vivo) return;
        if (lista.length === 0) onFechar();
        else setVendas(lista);
      } catch {
        if (vivo) setFalhou(true);
      }
    })();
    return () => { vivo = false; };
    // Consulta uma vez por nota; onFechar muda a cada atualização da tela e não deve refazer a consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, documentoId]);

  if (!vendas && !falhou) return null;

  return (
    <ModalCentral ariaLabel="Estornar também a venda" titulo="Nota cancelada" subtitulo="A venda ainda está valendo." tamanho="md" onFechar={onFechar}
      rodape={(
        <div className="flex justify-end">
          <button type="button" data-testid="so-a-nota" onClick={onFechar} className="h-11 w-full rounded-xl border border-[#D0D5DD] px-6 text-sm font-semibold text-[#344054] sm:w-auto">
            {estornadas.length ? "Fechar" : "Só a nota"}
          </button>
        </div>
      )}>
      {falhou ? (
        <p role="alert" className="text-[13px] text-[#1F2933]">Não foi possível conferir a venda desta nota. Se precisar estorná-la, use Relatórios › Vendas › Histórico de vendas.</p>
      ) : (
        <>
          <p className="text-[13px] text-[#1F2933]">Deseja estornar também a venda? O estorno devolve o estoque, desfaz os pontos e registra a saída no caixa.</p>
          <ul className="space-y-2">
            {vendas.map((v) => (
              <li key={v.vendaId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E5E7EB] p-3">
                <span className="min-w-0 text-[13px] text-[#1F2933]">
                  <span className="font-semibold">{formatCurrency(v.total)}</span> · {dataHora(v.quando)}
                  <span className="block text-[11px] text-[#667085]">{[v.cliente, (v.pedidos || []).join(", ")].filter(Boolean).join(" · ")}</span>
                </span>
                {estornadas.includes(v.vendaId)
                  ? <span className="text-[13px] font-semibold text-[#1F7A3D]">Estornada</span>
                  : <button type="button" data-testid={`estornar-venda-${v.vendaId}`} onClick={() => setEstornando(v.vendaId)} className="h-9 rounded-xl bg-[#012E46] px-4 text-[13px] font-semibold text-white">Estornar venda</button>}
              </li>
            ))}
          </ul>
        </>
      )}
      {estornando != null && (
        <EstornoDeVenda supabase={supabase} vendaId={estornando} motivoInicial={motivo} onFechar={() => setEstornando(null)}
          onEstornado={() => setEstornadas((l) => [...l, estornando])} />
      )}
    </ModalCentral>
  );
}
