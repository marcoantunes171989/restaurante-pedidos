// E9 parte 1 — assistente "Ativar nota fiscal" (topo da aba Emissão).
import { useState } from "react";

const botao = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#012E46] px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45";
const botaoLeve = "inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-white px-3 py-2 text-[13px] font-semibold text-[#012E46] hover:border-[#012E46]";

/**
 * @param {object} p
 * @param {object} p.resultado   passosAtivacao(...)
 * @param {(alvo:string)=>void} p.onIr  leva ao lugar do passo
 * @param {()=>Promise<{ok:boolean, erro?:string}>} p.onLigar  liga a homologação
 */
export const PALAVRA_PRODUCAO = "PRODUÇÃO";
const confere = (t) => String(t || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === "PRODUCAO";

export default function AssistenteAtivacaoFiscal({ resultado, onIr, onLigar, producao = null, onLigarProducao = null }) {
  const [confirmando, setConfirmando] = useState(false);
  const [ligando, setLigando] = useState(false);
  const [msg, setMsg] = useState(null);
  const [palavra, setPalavra] = useState("");
  const [confirmandoProd, setConfirmandoProd] = useState(false);
  const { passos, prontos, ligada, feitos, total } = resultado;
  const proximo = passos.find((p) => !p.ok);

  async function ligar() {
    setLigando(true);
    const r = await onLigar();
    setLigando(false);
    setConfirmando(false);
    setMsg(r?.ok ? { ok: true, texto: "Emissão ligada em homologação. As vendas do caixa passam a gerar nota de teste (sem valor fiscal)." } : { ok: false, texto: r?.erro || "Não foi possível ligar." });
  }

  async function ligarProducao() {
    setLigando(true);
    const r = await onLigarProducao();
    setLigando(false);
    setConfirmandoProd(false);
    setPalavra("");
    setMsg(r?.ok ? { ok: true, texto: "Produção ligada: as próximas notas terão valor fiscal." } : { ok: false, texto: r?.erro || "Não foi possível ligar a produção." });
  }

  return (
    <section className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5" aria-labelledby="ativar-nota-titulo" data-testid="assistente-ativacao-fiscal">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="ativar-nota-titulo" className="text-[15px] font-bold text-[var(--pp-text)]">{ligada ? "Nota fiscal ativada" : "Ativar nota fiscal"}</h3>
        <span className="text-[12px] font-semibold text-[var(--pp-text-muted)]">{feitos} de {total} passos</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--pp-bg)]" aria-hidden="true">
        <div className="h-full rounded-full bg-[#1F7A3D] transition-all" style={{ width: `${Math.round((feitos / total) * 100)}%` }} />
      </div>

      <ol className="mt-3 space-y-2">
        {passos.map((p, i) => {
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
                {!p.ok && p.id !== "ligar" && <button type="button" className={botaoLeve} onClick={() => onIr(p.alvo)}>Fazer agora</button>}
              </div>
              {p.id === "ligar" && !ligada && (
                <div className="mt-2 pl-8">
                  {!confirmando ? (
                    <button type="button" className={botao} disabled={!prontos} onClick={() => setConfirmando(true)}>Ligar emissão em homologação</button>
                  ) : (
                    <div role="alertdialog" aria-label="Confirmar ligar emissão" className="rounded-xl border border-[#F8D9A8] bg-[#FEF3E2] p-3">
                      <p className="text-[13px] font-semibold text-[var(--pp-text)]">Ligar a emissão em homologação?</p>
                      <p className="mt-0.5 text-[12px] text-[var(--pp-text-body)]">Cada venda finalizada no caixa vai gerar uma nota de TESTE na SEFAZ (sem valor fiscal). Dá para voltar para simulação no cadastro da empresa.</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" className={botao} disabled={ligando} onClick={ligar}>{ligando ? "Ligando…" : "Sim, ligar"}</button>
                        <button type="button" className={botaoLeve} disabled={ligando} onClick={() => setConfirmando(false)}>Voltar</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {ligada && producao && onLigarProducao && (
        <div className={`mt-3 rounded-xl border px-3 py-2 ${producao.emProducao ? "border-[#1F7A3D]/30 bg-[#EAF6EE]" : "border-[var(--pp-border)]"}`} data-testid="passo-producao">
          <p className="text-[13px] font-semibold text-[var(--pp-text)]">9. Ligar em produção (nota com valor fiscal)</p>
          {producao.emProducao ? (
            <p className="text-[12px] font-semibold text-[#1F7A3D]">Ligada em produção.</p>
          ) : producao.liberada ? (
            <p className="text-[12px] text-[var(--pp-text-muted)]">Homologação validada: pode ligar.</p>
          ) : (
            <>
              <p className="text-[12px] text-[var(--pp-text-muted)]">Antes de ligar, falta:</p>
              <ul className="mt-0.5 list-disc pl-4 text-[12px] text-[var(--pp-text-body)]">{producao.faltas.map((f) => <li key={f}>{f}</li>)}</ul>
            </>
          )}
          {!producao.emProducao && (
            !confirmandoProd ? (
              <button type="button" className={`${botao} mt-2`} disabled={!producao.liberada} onClick={() => setConfirmandoProd(true)}>Ligar em produção</button>
            ) : (
              <div role="alertdialog" aria-label="Confirmar ligar produção" className="mt-2 rounded-xl border border-[#F5C2CD] bg-[#FDECEF] p-3">
                <p className="text-[13px] font-semibold text-[#C81E4A]">Atenção: a partir daqui as notas têm VALOR FISCAL.</p>
                <p className="mt-0.5 text-[12px] text-[var(--pp-text-body)]">Cada venda vai gerar uma nota de verdade na SEFAZ, com impostos. Confirme com o contador antes. Para confirmar, digite {PALAVRA_PRODUCAO}.</p>
                <input aria-label="Digite PRODUÇÃO para confirmar" value={palavra} onChange={(e) => setPalavra(e.target.value)} className="mt-2 min-h-10 w-full rounded-xl border border-[var(--pp-border)] bg-white px-3 text-[13px]" />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className={botao} disabled={ligando || !confere(palavra)} onClick={ligarProducao}>{ligando ? "Ligando…" : "Ligar produção"}</button>
                  <button type="button" className={botaoLeve} disabled={ligando} onClick={() => { setConfirmandoProd(false); setPalavra(""); }}>Voltar</button>
                </div>
              </div>
            )
          )}
        </div>
      )}
      {msg && <p role="status" className={`mt-2 text-[12px] font-semibold ${msg.ok ? "text-[#1F7A3D]" : "text-[#C81E4A]"}`}>{msg.texto}</p>}
      {!ligada && <p className="mt-3 text-[12px] text-[var(--pp-text-muted)]">Produção (nota com valor fiscal) só é liberada depois dos testes em homologação.</p>}
    </section>
  );
}
