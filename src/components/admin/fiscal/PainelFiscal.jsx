import { useEffect, useMemo, useState } from "react";
import {
  buscarEmitenteFiscal, resumoCredenciaisFiscais, listarSeriesFiscais, buscarConfigFiscalVenda, resumoTabelasIbpt,
} from "../../../lib/fiscal/fiscalApi";
import { listarDocumentosFiscais } from "../../../lib/fiscal/notasFiscais";
import { alertasFiscais } from "../../../lib/fiscal/alertasFiscais";
import { passosAtivacao } from "../../../lib/fiscal/ativacaoFiscal";
import { indicadoresNotas, alertaIbpt, destinoDoPasso, destinoDoAlerta, statusGeral } from "../../../lib/fiscal/painelFiscal";

// ════════════════════════════════════════════════════════════
//  Painel Fiscal (etapa 2) — visão geral SÓ DE LEITURA: nada aqui grava.
//  Junta o passo a passo "Ativar nota fiscal", os indicadores das notas e os
//  alertas; cada botão leva à tela/aba onde a ação de fato acontece.
// ════════════════════════════════════════════════════════════

const TOM_STATUS = {
  ok: "border-[#1F7A3D]/30 bg-[#EAF6EE] text-[#1F7A3D]",
  alerta: "border-[#F8D9A8] bg-[#FEF3E2] text-[#B45309]",
  erro: "border-[#F5C2CD] bg-[#FDECEF] text-[#C81E4A]",
  neutro: "border-[var(--pp-border)] bg-white text-[var(--pp-text-muted)]",
};
const botaoLeve = "inline-flex min-h-9 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#012E46] hover:border-[#012E46]";
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Indicador({ valor, rotulo, tom }) {
  const cor = tom === "erro" ? "text-[#C81E4A]" : tom === "alerta" ? "text-[#B45309]" : "text-[var(--pp-text)]";
  return (
    <div className="rounded-2xl border border-[var(--pp-border)] bg-white px-4 py-3">
      <p className={`text-[20px] font-bold leading-tight ${cor}`}>{valor}</p>
      <p className="text-[12px] text-[var(--pp-text-muted)]">{rotulo}</p>
    </div>
  );
}

/**
 * @param {object} p
 * @param {(destino:{tela:string, aba:string|null})=>void} p.onIr  navega (tela do menu + aba da Tributação)
 */
export default function PainelFiscal({ supabase, lojaInfo, formasPagamento = [], produtos = [], regrasLoja = [], ctxFiscal = {}, emitenteLegado = null, onIr = () => {} }) {
  const lojaId = lojaInfo?.id ?? null;
  const [estado, setEstado] = useState({ carregando: true, erro: "", dados: null });

  useEffect(() => {
    if (lojaId == null) return undefined;
    let vivo = true;
    (async () => {
      try {
        const [emitente, credenciais, series, config, notas, ibpt] = await Promise.all([
          buscarEmitenteFiscal(supabase, lojaId, { legado: emitenteLegado }),
          resumoCredenciaisFiscais(supabase, lojaId).catch(() => []),
          listarSeriesFiscais(supabase, lojaId).catch(() => []),
          buscarConfigFiscalVenda(supabase, lojaId).catch(() => ({ mapaMeios: {}, taxaServicoTratamento: null })),
          listarDocumentosFiscais(supabase, lojaId, { limite: 200 }).catch(() => []),
          resumoTabelasIbpt(supabase, lojaId).catch(() => null),
        ]);
        if (vivo) setEstado({ carregando: false, erro: "", dados: { emitente, credenciais, series, config, notas, ibpt } });
      } catch (e) {
        if (vivo) setEstado({ carregando: false, erro: e?.message || "Não foi possível carregar o painel fiscal.", dados: null });
      }
    })();
    return () => { vivo = false; };
  }, [supabase, lojaId, emitenteLegado]);

  const formas = useMemo(() => formasPagamento.filter((f) => f.active !== false && (f.nome || "").trim()), [formasPagamento]);

  const calc = useMemo(() => {
    const d = estado.dados;
    if (!d) return null;
    const bruta = passosAtivacao({ emitente: d.emitente, documentoLoja: lojaInfo?.documento || "", credenciais: d.credenciais, series: d.series, formas, config: d.config, produtos, regrasLoja, ctxFiscal, teste: null });
    // O teste de conexão só existe na tela Emissão (fica na memória dela): com a emissão já ligada, o passo é considerado feito.
    const passos = bruta.passos.map((p) => (p.id === "teste" && bruta.ligada ? { ...p, ok: true, detalhe: "Emissão em operação." } : p));
    const feitos = passos.filter((p) => p.ok).length;
    const ativacao = { ...bruta, passos, feitos, prontos: passos.filter((p) => p.id !== "ligar").every((p) => p.ok) };
    const alertas = [
      ...alertasFiscais({ notas: d.notas, credenciais: d.credenciais }),
      ...[alertaIbpt(d.ibpt)].filter(Boolean),
    ].sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "erro" ? -1 : 1));
    return { ativacao, alertas, ind: indicadoresNotas(d.notas), status: statusGeral({ ativacao, alertas }) };
  }, [estado.dados, formas, produtos, regrasLoja, ctxFiscal, lojaInfo?.documento]);

  if (lojaId == null) return <p className="text-[13px] text-[var(--pp-text-muted)]">Selecione uma empresa.</p>;
  if (estado.carregando) return <p className="text-[13px] text-[var(--pp-text-muted)]">Carregando painel fiscal…</p>;
  if (estado.erro || !calc) return <div className="rounded-2xl border border-[var(--pp-border)] bg-white p-4"><p className="text-[13px] font-semibold text-[#C81E4A]">{estado.erro || "Sem dados."}</p></div>;

  const { ativacao, alertas, ind, status } = calc;
  const amb = estado.dados.emitente?.nfceAmbiente;
  const proximo = ativacao.passos.find((p) => !p.ok);

  return (
    <div className="space-y-4" data-testid="painel-fiscal">
      <div className={`rounded-2xl border px-4 py-3 ${TOM_STATUS[status.tom]}`} role="status">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[15px] font-bold">{status.titulo}</p>
            <p className="text-[12px] opacity-90">{status.detalhe}</p>
          </div>
          <span className="rounded-full border border-current px-3 py-1 text-[12px] font-bold">
            {amb === "producao" ? "Produção (valor fiscal)" : amb === "homologacao" ? "Homologação (sem valor fiscal)" : "Simulação (emissão desligada)"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador valor={ind.hoje} rotulo="notas hoje" />
        <Indicador valor={brl(ind.valorHoje)} rotulo="autorizado hoje" />
        <Indicador valor={ind.comProblema} rotulo="com problema (7 dias)" tom={ind.comProblema ? "erro" : undefined} />
        <Indicador valor={ind.emContingencia} rotulo="em contingência" tom={ind.emContingencia ? "alerta" : undefined} />
      </div>

      {alertas.length > 0 && (
        <section className="space-y-2" aria-label="Alertas fiscais" data-testid="painel-alertas">
          {alertas.map((a) => (
            <div key={a.id} className={`flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-2.5 text-[13px] font-semibold ${TOM_STATUS[a.nivel]}`}>
              <span aria-hidden="true">{a.nivel === "erro" ? "⛔" : "⚠"}</span>
              <span className="min-w-0 flex-1">{a.texto}</span>
              <button type="button" className={botaoLeve} onClick={() => onIr(destinoDoAlerta(a.destino))}>
                {a.destino === "emissao" ? "Abrir Emissão" : a.destino === "ibpt" ? "Abrir Tributos (IBPT)" : "Ver notas"}
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5" aria-labelledby="painel-passos">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="painel-passos" className="text-[15px] font-bold text-[var(--pp-text)]">{ativacao.ligada && ativacao.prontos ? "Nota fiscal ativada" : "Ativar nota fiscal"}</h3>
          <span className="text-[12px] font-semibold text-[var(--pp-text-muted)]">{ativacao.feitos} de {ativacao.total} passos</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--pp-bg)]" aria-hidden="true">
          <div className="h-full rounded-full bg-[#1F7A3D]" style={{ width: `${Math.round((ativacao.feitos / ativacao.total) * 100)}%` }} />
        </div>
        <ol className="mt-3 space-y-2">
          {ativacao.passos.map((p, i) => {
            const atual = proximo?.id === p.id;
            return (
              <li key={p.id} className={`rounded-xl border px-3 py-2 ${atual ? "border-[#012E46] bg-[#F3F7F9]" : "border-[var(--pp-border)]"}`}>
                <div className="flex flex-wrap items-start gap-2">
                  <span aria-hidden="true" className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-black ${p.ok ? "bg-[#1F7A3D] text-white" : atual ? "bg-[#012E46] text-white" : "bg-[var(--pp-bg)] text-[var(--pp-text-muted)]"}`}>{p.ok ? "✓" : i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[13px] ${p.ok ? "text-[var(--pp-text-body)]" : "font-semibold text-[var(--pp-text)]"}`}>{p.titulo}<span className="sr-only">{p.ok ? " — pronto" : " — pendente"}</span></p>
                    <p className="text-[12px] text-[var(--pp-text-muted)]">{p.detalhe}</p>
                    {!p.ok && p.lista?.length > 0 && (
                      <ul className="mt-1 list-disc pl-4 text-[12px] text-[var(--pp-text-body)]">
                        {p.lista.map((x) => <li key={x.id}>{x.nome}: {x.pendencias.join(", ")}</li>)}
                      </ul>
                    )}
                  </div>
                  {!p.ok && <button type="button" className={botaoLeve} onClick={() => onIr(destinoDoPasso(p.alvo))}>{p.id === "ligar" ? "Ir para Emissão" : `${p.acao || "Fazer agora"} →`}</button>}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-[12px] text-[var(--pp-text-muted)]">Este painel só mostra a situação. As ações (cadastrar certificado, ligar a emissão, corrigir produtos) são feitas nas telas indicadas pelos botões.</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Atalhos">
        <button type="button" className={`${botaoLeve} justify-start py-3`} onClick={() => onIr({ tela: "notas-fiscais", aba: null })}>📄 Notas emitidas</button>
        <button type="button" className={`${botaoLeve} justify-start py-3`} onClick={() => onIr({ tela: "emissao-fiscal", aba: null })}>🔐 Certificado, CSC e séries</button>
        <button type="button" className={`${botaoLeve} justify-start py-3`} onClick={() => onIr({ tela: "tributos-ibpt", aba: null })}>🧮 Tributos (IBPT)</button>
      </section>
    </div>
  );
}
