import { useState } from "react";
import { planosFidelidade, precoMensalNoAnual, precoAnualTotal, planoFidelidadePorId } from "../../config/pricing";
import { ASSUNTOS_CONSULTOR, HORARIO_ATENDIMENTO, mensagemConsultor, linkWhatsappConsultor } from "../../config/contato";
import { formatCurrencyBRL } from "../../utils/formatCurrency";

// ════════════════════════════════════════════════════════════
//  Telas/modais padrão de UPGRADE (reutilizáveis em todo o sistema)
//  • ConsultorModal — "Falar com consultor"
//  • PlanosModal     — "Ver planos" (consome a fonte única de preços)
//  Use o hook useUpgradeModais() para abrir/renderizar de qualquer lugar.
// ════════════════════════════════════════════════════════════

// ── Ícones de linha (dourados, herdam currentColor) ──────────
const sv = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", viewBox: "0 0 24 24", "aria-hidden": true };
const IcoHeadset = (p) => (<svg {...sv} {...p}><path d="M4 13v-1a8 8 0 0 1 16 0v1" /><path d="M4 13h2.4a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4Z" /><path d="M20 13h-2.4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1H19a1 1 0 0 0 1-1v-4Z" /><path d="M20 17v1a3 3 0 0 1-3 3h-3" /></svg>);
const IcoUser = (p) => (<svg {...sv} {...p}><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c.7-3.3 3.2-5 6.5-5s5.8 1.7 6.5 5" /></svg>);
const IcoRocket = (p) => (<svg {...sv} {...p}><path d="M5 15c-1.2.6-2 2-2 4 2 0 3.4-.8 4-2" /><path d="M9 17c-1.5-.6-3-2.1-3.6-3.6 0-5 3-9 9.6-10.4C16.4 9.6 12.4 12.6 9 17Z" /><path d="M9 13.5 7 12m4.5 4.5L13 15" /></svg>);
const IcoShield = (p) => (<svg {...sv} {...p}><path d="M12 3 5 6v5c0 4.4 2.9 8 7 10 4.1-2 7-5.6 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4.5" /></svg>);
const IcoRelogio = (p) => (<svg {...sv} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
const IcoGema = (p) => (<svg {...sv} {...p}><path d="m6 3 12 0 3 6-9 12L3 9l3-6Z" /><path d="M3 9h18M9 3 12 9l3-6M12 9l-2 0 2 12 2-12-2 0Z" /></svg>);
const IcoCheck = (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.3 2.3L15.5 9.6" /></svg>);
const IcoWhats = (p) => (<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}><path d="M.06 24l1.69-6.16a11.9 11.9 0 0 1-1.6-5.96C.15 5.32 5.5 0 12.06 0a11.8 11.8 0 0 1 8.41 3.49 11.8 11.8 0 0 1 3.48 8.41c0 6.56-5.34 11.9-11.9 11.9a11.9 11.9 0 0 1-5.7-1.45L.06 24Zm6.6-3.8c1.68.99 3.28 1.59 5.4 1.59 5.45 0 9.9-4.43 9.9-9.89 0-5.46-4.42-9.9-9.89-9.9-5.46 0-9.89 4.44-9.89 9.9 0 2.22.65 3.88 1.74 5.62l-1 3.65 3.74-.97Zm11.39-5.55c-.07-.12-.27-.2-.57-.35-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.42.25-.7.25-1.29.17-1.42Z"/></svg>);

const overlay = "fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4";
const cardModal = "flex w-full flex-col overflow-hidden rounded-[2rem] border border-gold-400/20 bg-[#0A1424] shadow-2xl max-h-[94vh]";
const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-gold-400/60 placeholder:text-slate-600 transition";
const lbl = "mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500";
const btnFechar = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-sm font-bold text-slate-300 hover:bg-white/15 transition";

// ── Modal: Falar com consultor ───────────────────────────────
export function ConsultorModal({ modulo = "Fidelidade", assuntoInicial = "", onFechar }) {
  const [f, setF] = useState({ nome: "", email: "", telefone: "", assunto: assuntoInicial || "", mensagem: "" });
  const [erro, setErro] = useState("");
  const valido = f.nome.trim() && f.telefone.trim() && f.assunto.trim() && f.mensagem.trim();

  function abrirWhats() {
    window.open(linkWhatsappConsultor(mensagemConsultor({ ...f, modulo })), "_blank", "noopener");
  }
  function enviar() {
    if (!valido) { setErro("Preencha nome, telefone, assunto e mensagem."); return; }
    setErro("");
    abrirWhats(); // sem backend de envio → encaminha pelo WhatsApp com a mensagem formatada
  }

  const infos = [
    { icon: <IcoUser />, t: "Atendimento personalizado", d: "Fale com um especialista e receba orientações de acordo com as necessidades do seu negócio." },
    { icon: <IcoRocket />, t: "Implantação assistida", d: `Cuidamos de todo o processo de configuração e implantação do módulo ${modulo} para você.` },
    { icon: <IcoShield />, t: "Suporte especializado", d: "Suporte dedicado para garantir o melhor uso do módulo e o sucesso do seu programa." },
  ];

  return (
    <div className={overlay} onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className={`${cardModal} max-w-4xl`} style={{ fontFamily: "'Inter','Sora',sans-serif" }}>
        {/* Cabeçalho */}
        <div className="relative shrink-0 px-6 pt-6 text-center">
          <button onClick={onFechar} className={`${btnFechar} absolute right-5 top-5`}>✕</button>
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-gold-400/50 text-gold-400"><IcoHeadset className="h-7 w-7" /></span>
          <h2 className="page-title mt-3 text-2xl font-bold tracking-tight text-white">Falar com consultor</h2>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-400">Nossa equipe está pronta para ajudar com dúvidas, implantação e contratação do módulo {modulo}.</p>
          <div className="mx-auto mt-3 flex max-w-xs items-center gap-3"><div className="h-px flex-1 bg-gold-400/25" /><span className="text-gold-400">◆</span><div className="h-px flex-1 bg-gold-400/25" /></div>
        </div>

        {/* Corpo: info + formulário */}
        <div className="grid flex-1 gap-6 overflow-y-auto px-6 py-5 lg:grid-cols-2">
          {/* Coluna info */}
          <div className="space-y-4">
            {infos.map((it) => (
              <div key={it.t} className="flex gap-3 border-b border-white/5 pb-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold-400/40 text-gold-400">{it.icon}</span>
                <div><p className="font-display font-bold text-white">{it.t}</p><p className="mt-0.5 text-xs leading-5 text-slate-400">{it.d}</p></div>
              </div>
            ))}
            <div className="flex gap-3 rounded-2xl border border-gold-400/20 bg-gold-400/[0.05] p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold-400/40 text-gold-400"><IcoRelogio /></span>
              <div><p className="font-display font-bold text-gold-300">Horário de atendimento</p>{HORARIO_ATENDIMENTO.map((l) => <p key={l} className="text-xs text-slate-400">{l}</p>)}</div>
            </div>
          </div>

          {/* Coluna formulário */}
          <div className="space-y-3">
            <div><span className={lbl}>Nome completo</span><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Digite seu nome completo" className={inp} /></div>
            <div><span className={lbl}>E-mail</span><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="seu@email.com" className={inp} /></div>
            <div><span className={lbl}>Telefone / WhatsApp</span><input value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} placeholder="(11) 99999-9999" className={inp} /></div>
            <div><span className={lbl}>Assunto</span>
              <select value={f.assunto} onChange={(e) => setF({ ...f, assunto: e.target.value })} className={inp}>
                <option value="">Selecione um assunto</option>
                {ASSUNTOS_CONSULTOR.map((a) => <option key={a} value={a}>{a}</option>)}
                {assuntoInicial && !ASSUNTOS_CONSULTOR.includes(assuntoInicial) && <option value={assuntoInicial}>{assuntoInicial}</option>}
              </select>
            </div>
            <div><span className={lbl}>Mensagem</span><textarea rows={3} value={f.mensagem} onChange={(e) => setF({ ...f, mensagem: e.target.value })} placeholder="Descreva sua dúvida ou necessidade..." className={`${inp} resize-none`} /></div>
            {erro && <p className="text-xs font-bold text-red-400">{erro}</p>}
            <button onClick={enviar} disabled={!valido}
              className="font-display flex w-full items-center justify-center gap-2 rounded-2xl bg-gold-400 py-3.5 text-sm font-bold text-blue-950 hover:bg-gold-300 transition active:scale-95 shadow-lg shadow-gold-900/30 disabled:opacity-50 disabled:cursor-not-allowed">
              ✈ Enviar mensagem
            </button>
            <button onClick={abrirWhats} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gold-400/40 bg-gold-400/10 py-3 text-sm font-black text-gold-200 hover:bg-gold-400/20 transition">
              <IcoWhats className="h-4 w-4" /> Abrir WhatsApp
            </button>
          </div>
        </div>

        {/* Rodapé */}
        <div className="shrink-0 flex flex-col items-center justify-between gap-3 border-t border-white/10 px-6 py-4 sm:flex-row">
          <div className="flex items-center gap-2.5 text-center sm:text-left">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400"><IcoWhats className="h-4 w-4" /></span>
            <div><p className="text-sm font-black text-white">Prefere falar agora?</p><p className="text-xs text-slate-500">Converse com um consultor pelo WhatsApp.</p></div>
          </div>
          <button onClick={abrirWhats} className="flex items-center gap-2 rounded-2xl border border-gold-400/40 bg-gold-400/10 px-5 py-2.5 text-sm font-black text-gold-200 hover:bg-gold-400/20 transition">
            <IcoWhats className="h-4 w-4" /> Abrir WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Ver planos (consome a fonte única de preços) ──────
export function PlanosModal({ modulo = "Fidelidade", onFechar, onEscolherPlano, onFalarConsultor }) {
  const [anual, setAnual] = useState(false);

  function escolher(p) {
    if (onEscolherPlano) onEscolherPlano(p);
  }

  return (
    <div className={overlay} onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className={`${cardModal} max-w-5xl`} style={{ fontFamily: "'Inter','Sora',sans-serif" }}>
        <div className="relative shrink-0 px-6 pt-6 text-center">
          <button onClick={onFechar} className={`${btnFechar} absolute right-5 top-5`}>✕</button>
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-400/40 bg-gold-400/10 text-gold-400"><IcoGema className="h-7 w-7" /></span>
          <h2 className="page-title mt-3 text-2xl font-bold tracking-tight text-white">Planos do módulo {modulo}</h2>
          <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-slate-400">Escolha o plano ideal para o seu negócio e comece a fidelizar mais clientes.</p>
          {/* Alternância mensal/anual */}
          <div className="mx-auto mt-4 inline-flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/60 p-1">
            <button onClick={() => setAnual(false)} className={`rounded-full px-4 py-1.5 text-xs font-black transition ${!anual ? "bg-gold-400 text-blue-950" : "text-slate-300 hover:text-white"}`}>Mensal</button>
            <button onClick={() => setAnual(true)} className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-black transition ${anual ? "bg-gold-400 text-blue-950" : "text-slate-300 hover:text-white"}`}>Anual <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${anual ? "bg-blue-950/20 text-blue-950" : "bg-emerald-500/20 text-emerald-300"}`}>-10%</span></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 lg:grid-cols-3">
            {planosFidelidade.map((p) => {
              const mensal = anual ? precoMensalNoAnual(p.precoMensal) : p.precoMensal;
              return (
                <div key={p.id} className={`relative flex flex-col rounded-[1.6rem] border bg-[#0B0F1A] p-5 transition ${p.destaque ? "border-gold-400/70 shadow-[0_0_0_1px_rgba(214,168,79,.35),0_16px_44px_-12px_rgba(214,168,79,.3)]" : "border-white/10"}`}>
                  {p.selo && <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-gold-400 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-blue-950 shadow-lg">★ {p.selo}</span>}
                  <div className="text-center">
                    <h3 className="font-display text-xl font-bold tracking-tight text-white">{p.nome}</h3>
                    <p className="mx-auto mt-1 min-h-[40px] max-w-[14rem] text-xs leading-5 text-slate-400">{p.descricao}</p>
                  </div>
                  <div className="mt-2 border-y border-white/10 py-4 text-center">
                    <p className="font-display leading-none">
                      <span className="align-top text-base font-bold text-gold-400">R$ </span>
                      <span className="text-4xl font-black text-gold-400">{formatCurrencyBRL(mensal).replace("R$", "").trim()}</span>
                      <span className="ml-1 text-sm font-medium text-slate-400">/mês</span>
                    </p>
                    {anual && <p className="mt-1 text-[11px] text-slate-500">cobrado {formatCurrencyBRL(precoAnualTotal(p.precoMensal))}/ano</p>}
                  </div>
                  <ul className="mt-4 flex-1 space-y-2.5">
                    {p.recursos.map((r) => (
                      <li key={r} className="flex items-start gap-2.5 text-[13px] leading-snug text-slate-200"><span className="mt-px shrink-0 text-gold-400"><IcoCheck className="h-[18px] w-[18px]" /></span> {r}</li>
                    ))}
                  </ul>
                  <button onClick={() => escolher(p)} className={`font-display mt-5 w-full rounded-xl px-4 py-3 text-sm font-bold transition active:scale-95 ${p.destaque ? "bg-gold-400 text-blue-950 hover:bg-gold-300 shadow-lg shadow-gold-900/30" : "border border-gold-400/50 bg-gold-400/10 text-gold-200 hover:bg-gold-400/20"}`}>Escolher plano</button>
                </div>
              );
            })}
          </div>

          {/* Faixa "Sem fidelidade" */}
          <div className="mt-5 flex flex-col items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 sm:flex-row">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-slate-300"><IcoShield className="h-5 w-5" /></span>
              <div><p className="font-display font-bold text-white">Sem fidelidade</p><p className="text-xs text-slate-500">Cancele quando quiser. Sem taxas ou multas.</p></div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-slate-500 sm:block">Dúvidas? Fale com um consultor</span>
              <button onClick={onFalarConsultor} className="flex items-center gap-2 rounded-2xl border border-gold-400/40 bg-gold-400/10 px-4 py-2.5 text-sm font-black text-gold-200 hover:bg-gold-400/20 transition"><IcoHeadset className="h-4 w-4" /> Falar com consultor</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Hook reutilizável: abre/renderiza os modais de qualquer lugar ──
export function useUpgradeModais(modulo = "Fidelidade") {
  const [aberto, setAberto] = useState(null);        // 'consultor' | 'planos' | null
  const [assunto, setAssunto] = useState("");

  const abrirConsultor = (assuntoInicial = "") => { setAssunto(assuntoInicial || ""); setAberto("consultor"); };
  const abrirPlanos = () => setAberto("planos");
  const escolherPlano = (planoOuId) => {
    const p = typeof planoOuId === "string" ? planoFidelidadePorId(planoOuId) : planoOuId;
    abrirConsultor(`Quero contratar o plano ${p?.nome || ""} do módulo ${modulo}`.trim());
  };
  const fechar = () => setAberto(null);

  const modais = (
    <>
      {aberto === "consultor" && <ConsultorModal modulo={modulo} assuntoInicial={assunto} onFechar={fechar} />}
      {aberto === "planos" && <PlanosModal modulo={modulo} onFechar={fechar} onFalarConsultor={() => abrirConsultor()} onEscolherPlano={escolherPlano} />}
    </>
  );

  return { abrirConsultor, abrirPlanos, escolherPlano, fechar, modais };
}
