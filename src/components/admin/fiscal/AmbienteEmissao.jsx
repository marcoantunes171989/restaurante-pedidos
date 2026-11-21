import { useState } from "react";
import { AMBIENTES, ambienteAtual, destinosPossiveis, palavraConfere, resumoDaTroca } from "../../../lib/fiscal/ambienteEmissao";

const botao = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#012E46] px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45";
const botaoLeve = "inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-white px-3 py-2 text-[13px] font-semibold text-[#012E46] transition hover:border-[#012E46] disabled:opacity-45";

/**
 * Cartão "Ambiente de emissão": mostra onde as notas estão saindo e troca entre homologação e produção.
 * Só troca depois que a pessoa digita a palavra do ambiente de destino (HOMOLOGAÇÃO ou PRODUÇÃO).
 *
 * @param {object} p
 * @param {string} p.nfceAmbiente  "simulacao" | "homologacao" | "producao"
 * @param {object|null} p.producao retorno da trava (faltas, liberada)
 * @param {object[]} p.series      séries cadastradas
 * @param {(destino:string)=>Promise<{ok:boolean, erro?:string}>} p.onTrocar  grava o ambiente (o banco ainda confere a trava da produção)
 */
export default function AmbienteEmissao({ nfceAmbiente, producao = null, series = [], onTrocar }) {
  const [destino, setDestino] = useState(null);
  const [palavra, setPalavra] = useState("");
  const [trocando, setTrocando] = useState(false);
  const [msg, setMsg] = useState(null);
  const atual = ambienteAtual(nfceAmbiente);
  const emProd = atual.id === "producao";
  const resumo = destino ? resumoDaTroca(destino, { producao, series }) : null;

  function abrir(d) { setDestino(d); setPalavra(""); setMsg(null); }
  function fechar() { setDestino(null); setPalavra(""); }
  async function confirmar() {
    setTrocando(true);
    let r;
    try { r = await onTrocar(destino); } catch (e) { r = { ok: false, erro: e?.message }; }
    setTrocando(false);
    if (r?.ok) {
      setMsg({ ok: true, texto: destino === "producao" ? "Ambiente alterado para PRODUÇÃO: as próximas notas têm valor fiscal." : "Ambiente alterado para HOMOLOGAÇÃO: as próximas notas são de teste." });
      fechar();
    } else {
      setMsg({ ok: false, texto: r?.erro || "Não foi possível trocar o ambiente." });
    }
  }

  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${emProd ? "border-[#012E46] bg-white" : "border-[var(--pp-border)] bg-white"}`} aria-labelledby="ambiente-emissao" data-testid="ambiente-emissao" data-ambiente={atual.id}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 id="ambiente-emissao" className="text-[15px] font-bold text-[var(--pp-text)]">Ambiente de emissão</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-[var(--pp-text-body)]">
            <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${emProd ? "bg-[#012E46] text-white" : "bg-[var(--pp-bg)] text-[var(--pp-text)]"}`} data-testid="ambiente-atual">{atual.rotulo}</span>
            {atual.texto}
          </p>
        </div>
        {!destino && (
          <div className="flex flex-wrap gap-2">
            {destinosPossiveis(nfceAmbiente).map((d) => (
              <button key={d} type="button" className={d === "homologacao" ? botaoLeve : botao} onClick={() => abrir(d)} data-testid={`trocar-${d}`}>
                {d === "homologacao" ? "Voltar para homologação" : "Mudar para produção"}
              </button>
            ))}
          </div>
        )}
      </div>

      {resumo && (
        <div role="alertdialog" aria-label={`Confirmar troca para ${AMBIENTES[destino].rotulo}`} data-testid="troca-confirmacao"
          className={`mt-3 rounded-xl border p-3 ${destino === "producao" ? "border-[#F5C2CD] bg-[#FDECEF]" : "border-[var(--pp-border)] bg-[var(--pp-bg)]"}`}>
          <p className={`text-[13px] font-bold ${destino === "producao" ? "text-[#C81E4A]" : "text-[var(--pp-text)]"}`}>{resumo.titulo}</p>
          <p className="mt-0.5 text-[12px] text-[var(--pp-text-body)]">{resumo.aviso}</p>
          <p className="mt-1 text-[12px] font-semibold text-[var(--pp-text)]" data-testid="troca-proximo">{resumo.proximo}</p>
          {resumo.bloqueio && (
            <div className="mt-2" data-testid="troca-bloqueio">
              <p className="text-[12px] font-semibold text-[#C81E4A]">Ainda não dá para mudar. Falta:</p>
              {Array.isArray(resumo.bloqueio)
                ? <ul className="mt-0.5 list-disc pl-4 text-[12px] text-[var(--pp-text-body)]">{resumo.bloqueio.map((f) => <li key={f}>{f}</li>)}</ul>
                : <p className="text-[12px] text-[var(--pp-text-body)]">{resumo.bloqueio}</p>}
            </div>
          )}
          {!resumo.bloqueio && (
            <>
              <label htmlFor="troca-palavra" className="mt-2 block text-[12px] font-semibold text-[var(--pp-text-body)]">Para confirmar, digite {AMBIENTES[destino].palavra}</label>
              <input id="troca-palavra" value={palavra} onChange={(e) => setPalavra(e.target.value)} autoComplete="off" data-testid="troca-palavra"
                className="mt-1 min-h-10 w-full rounded-xl border border-[var(--pp-border)] bg-white px-3 text-[13px] outline-none focus:border-[#012E46]" />
            </>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {!resumo.bloqueio && (
              <button type="button" className={botao} disabled={trocando || !palavraConfere(destino, palavra)} onClick={confirmar} data-testid="troca-confirmar">
                {trocando ? "Trocando…" : destino === "producao" ? "Mudar para produção" : "Voltar para homologação"}
              </button>
            )}
            <button type="button" className={botaoLeve} disabled={trocando} onClick={fechar} data-testid="troca-cancelar">{resumo.bloqueio ? "Fechar" : "Cancelar"}</button>
          </div>
        </div>
      )}
      {msg && <p role="status" data-testid="troca-msg" className={`mt-2 text-[12px] font-semibold ${msg.ok ? "text-[#1F7A3D]" : "text-[#C81E4A]"}`}>{msg.texto}</p>}
    </section>
  );
}
