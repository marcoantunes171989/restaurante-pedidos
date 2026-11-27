import { useEffect, useState } from "react";
import { PrimeButton } from "../Prime";
import {
  TETO_PERCENTUAL, buscarParametrosCaixa, configDoFormulario, formularioDosParametros, mensagemDeRecusaDoCaixa, salvarParametrosCaixa,
} from "../../lib/parametrosCaixa";
import { lerConfigTaxaServico } from "../../pages/pdv/pdvHelpers";

// ════════════════════════════════════════════════════════════
//  Configurações › Parâmetros do caixa — por empresa, gravados no banco (migration 218).
//  Taxa de serviço e limites de desconto e acréscimo manual. O servidor confere tudo no fechamento.
// ════════════════════════════════════════════════════════════
const CAMPO = "min-h-11 w-full rounded-xl border border-[var(--pp-border)] bg-white px-3 text-sm font-semibold text-[var(--pp-text)] outline-none focus:border-[#012E46]";
const ROTULO = "mb-1 block text-xs font-semibold text-[var(--pp-text-body)]";
const REGRAS = [["fixa", "Fixa"], ["opcional", "Opcional"], ["nao_cobrar", "Não cobrar"]];
const PARCIAL = [["proporcional_itens", "Proporcional aos itens"], ["proporcional_valor", "Proporcional ao valor"], ["manual", "Manual"], ["nao_ratear", "Não ratear"]];
const pct = String(TETO_PERCENTUAL).replace(".", ",");

function Cartao({ titulo, descricao, children }) {
  return (
    <section className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5">
      <h3 className="text-base font-semibold text-[var(--pp-text)]">{titulo}</h3>
      <p className="mt-1 text-sm text-[var(--pp-text-body)]">{descricao}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Escolha({ rotulo, opcoes, valor, onEscolher }) {
  return (
    <div role="group" aria-label={rotulo}>
      <span className={ROTULO}>{rotulo}</span>
      <div className="flex flex-wrap gap-2">
        {opcoes.map(([id, texto]) => (
          <button key={id} type="button" aria-pressed={valor === id} onClick={() => onEscolher(id)}
            className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${valor === id ? "border-[#012E46] bg-[#012E46] text-white" : "border-[var(--pp-border)] bg-white text-[var(--pp-text-body)]"}`}>{texto}</button>
        ))}
      </div>
    </div>
  );
}

function Limite({ nome, form, campoPct, campoValor, mudar }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className={ROTULO}>{nome} máximo em percentual (%)</span>
        <input className={CAMPO} inputMode="decimal" value={form[campoPct]} onChange={(e) => mudar({ [campoPct]: e.target.value })} placeholder={`até ${pct}`} data-testid={`param-${campoPct}`} />
      </label>
      <label className="block">
        <span className={ROTULO}>{nome} máximo em reais (R$)</span>
        <input className={CAMPO} inputMode="decimal" value={form[campoValor]} onChange={(e) => mudar({ [campoValor]: e.target.value })} placeholder="sem limite em reais" data-testid={`param-${campoValor}`} />
      </label>
    </div>
  );
}

/** `semBanco`: o que mostrar quando o banco ainda não tem os parâmetros (migration 218 não rodada). */
export default function ParametrosCaixa({ supabase, lojaId, semBanco = null }) {
  const [estado, setEstado] = useState({ fase: "carregando" });
  const [form, setForm] = useState(() => formularioDosParametros());
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    if (lojaId == null) return undefined;
    let ativo = true;
    buscarParametrosCaixa(supabase, lojaId)
      .then((p) => {
        if (!ativo) return;
        if (!p) { setEstado({ fase: "sem-banco" }); return; }
        // Primeira vez: começa com a taxa que este aparelho já usava, para a empresa só confirmar.
        setForm(formularioDosParametros(p.definido ? p : { ...p, taxaServico: lerConfigTaxaServico(lojaId) }));
        setEstado({ fase: "pronto", definido: !!p.definido });
      })
      .catch((e) => { if (ativo) setEstado({ fase: "erro", texto: mensagemDeRecusaDoCaixa(e) || "Não foi possível carregar os parâmetros." }); });
    return () => { ativo = false; };
  }, [supabase, lojaId]);

  const mudar = (patch) => { setForm((f) => ({ ...f, ...patch })); setAviso(null); };

  async function salvar(e) {
    e.preventDefault();
    const r = configDoFormulario(form);
    if (!r.ok) { setAviso({ tipo: "erro", texto: r.erro }); return; }
    setSalvando(true);
    try {
      const salvo = await salvarParametrosCaixa(supabase, lojaId, r.config);
      setForm(formularioDosParametros(salvo));
      setEstado({ fase: "pronto", definido: true });
      setAviso({ tipo: "ok", texto: "Parâmetros salvos. Valem para todos os caixas desta empresa." });
    } catch (err) {
      setAviso({ tipo: "erro", texto: mensagemDeRecusaDoCaixa(err) || "Não foi possível salvar. Tente novamente." });
    } finally {
      setSalvando(false);
    }
  }

  if (lojaId == null) return <p className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 text-sm text-[var(--pp-text-body)]">Selecione uma empresa para configurar o caixa.</p>;
  if (estado.fase === "carregando") return <p className="text-sm text-[var(--pp-text-muted)]">Carregando parâmetros…</p>;
  if (estado.fase === "erro") return <p role="alert" className="rounded-2xl border border-[#C81E4A]/30 bg-[#C81E4A]/10 p-4 text-sm text-[#A0173B]">{estado.texto}</p>;
  if (estado.fase === "sem-banco") return semBanco;

  return (
    <form onSubmit={salvar} className="space-y-4" data-testid="parametros-caixa">
      {!estado.definido && (
        <p className="rounded-xl border border-[#F38525]/40 bg-[#F38525]/10 p-3 text-sm text-[#8A4A10]">Esta empresa ainda não definiu os parâmetros. Confira e salve.</p>
      )}
      <Cartao titulo="Taxa de serviço" descricao="Aplicada no fechamento de contas de consumo no local. Retirada e entrega externas não têm taxa.">
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2">
          <span className="text-sm font-semibold text-[var(--pp-text)]">Cobrar taxa de serviço</span>
          <input type="checkbox" checked={form.taxaAtiva} onChange={(e) => mudar({ taxaAtiva: e.target.checked })} className="h-5 w-5 accent-[#012E46]" />
        </label>
        <label className="block max-w-40">
          <span className={ROTULO}>Percentual da taxa (%)</span>
          <input className={CAMPO} inputMode="decimal" value={form.taxaPercentual} onChange={(e) => mudar({ taxaPercentual: e.target.value })} data-testid="param-taxa" />
        </label>
        <Escolha rotulo="Regra de cobrança" opcoes={REGRAS} valor={form.taxaRegra} onEscolher={(v) => mudar({ taxaRegra: v })} />
        <Escolha rotulo="Estratégia no pagamento parcial" opcoes={PARCIAL} valor={form.taxaParcial} onEscolher={(v) => mudar({ taxaParcial: v })} />
      </Cartao>
      <Cartao titulo="Limite de desconto" descricao={`Vale para o desconto manual do caixa, sobre a soma dos itens. Preenchendo percentual e reais, vale o menor. Nunca passa de ${pct}%, e a venda não pode ficar zerada.`}>
        <Limite nome="Desconto" form={form} campoPct="descontoPercentual" campoValor="descontoValor" mudar={mudar} />
      </Cartao>
      <Cartao titulo="Limite de acréscimo" descricao={`Vale para o acréscimo manual do caixa, sobre a soma dos itens. Preenchendo percentual e reais, vale o menor. Nunca passa de ${pct}%.`}>
        <Limite nome="Acréscimo" form={form} campoPct="acrescimoPercentual" campoValor="acrescimoValor" mudar={mudar} />
      </Cartao>
      {aviso && <p role={aviso.tipo === "erro" ? "alert" : "status"} className={`rounded-xl border p-3 text-sm ${aviso.tipo === "erro" ? "border-[#C81E4A]/30 bg-[#C81E4A]/10 text-[#A0173B]" : "border-[#5E8C31]/30 bg-[#5E8C31]/10 text-[#3F6420]"}`}>{aviso.texto}</p>}
      <div className="flex justify-end">
        <PrimeButton type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar parâmetros"}</PrimeButton>
      </div>
    </form>
  );
}
