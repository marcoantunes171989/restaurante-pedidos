// E8 parte 4: resumo das notas fiscais do caixa, no fechamento. Não impede fechar.
import { useEffect, useState } from "react";
import { listarDocumentosFiscais } from "../../lib/fiscal/notasFiscais";
import { resumoFiscalDoCaixa } from "../../lib/fiscal/envioAutomatico";

const brl = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ResumoFiscalCaixa({ supabase, lojaId, desdeIso }) {
  const [estado, setEstado] = useState({ carregando: true });
  useEffect(() => {
    if (!supabase || lojaId == null) return undefined;
    let vivo = true;
    listarDocumentosFiscais(supabase, lojaId, { limite: 200 })
      .then((notas) => { if (vivo) setEstado({ carregando: false, resumo: resumoFiscalDoCaixa(notas, desdeIso), cheio: notas.length >= 200 }); })
      .catch((e) => { if (vivo) setEstado({ carregando: false, erro: e.message }); });
    return () => { vivo = false; };
  }, [supabase, lojaId, desdeIso]);

  if (estado.carregando) return <p className="mt-3 text-xs text-slate-400">Conferindo as notas fiscais do caixa…</p>;
  if (estado.erro) return <p className="mt-3 text-xs text-amber-300">Notas fiscais: {estado.erro}</p>;
  const r = estado.resumo;
  if (!r.total) return <p className="mt-3 text-xs text-slate-400">Nenhuma nota fiscal emitida neste caixa.</p>;
  const alerta = r.pendentes > 0 || r.rejeitadas > 0;
  return (
    <div role="status" className={`mt-3 rounded-2xl border p-3 text-sm ${alerta ? "border-amber-400/40 bg-amber-500/10" : "border-emerald-400/30 bg-emerald-500/10"}`}>
      <p className="text-xs font-bold uppercase tracking-widest text-slate-300">Notas fiscais deste caixa</p>
      <div className="mt-1 space-y-0.5 text-slate-200">
        <div className="flex justify-between"><span>Autorizadas</span><strong className="text-white">{r.autorizadas} · {brl(r.valorAutorizado)}</strong></div>
        {r.pendentes > 0 && <div className="flex justify-between text-amber-300"><span>Pendentes (contingência ou sem resposta)</span><strong>{r.pendentes}</strong></div>}
        {r.rejeitadas > 0 && <div className="flex justify-between text-red-300"><span>Rejeitadas</span><strong>{r.rejeitadas}</strong></div>}
        {r.canceladas > 0 && <div className="flex justify-between"><span>Canceladas</span><strong>{r.canceladas}</strong></div>}
      </div>
      {alerta && <p className="mt-1 text-xs text-amber-200">Veja em Fiscal › Notas Emitidas. Isso não impede fechar o caixa.</p>}
      {estado.cheio && <p className="mt-1 text-xs text-slate-400">Contadas as últimas 200 notas da loja.</p>}
    </div>
  );
}
