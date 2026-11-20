import { useEffect, useState } from "react";
import { buscarHistoricoDocumento, explicarNota, textoDiagnostico } from "../../../lib/fiscal/notasFiscais";

// Painel "Detalhes e histórico" de uma nota: o que aconteceu (motivo), o que fazer, os dados da nota e o log passo a passo.
const botaoLeve = "inline-flex min-h-9 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#012E46] hover:border-[#012E46]";
const dataHora = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—");

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch { /* sem permissão de área de transferência */ }
  try {
    const t = document.createElement("textarea");
    t.value = texto; t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  } catch { return false; }
}

export default function DetalhesNotaFiscal({ nota, supabase, tentativas = [], onFechar }) {
  const [hist, setHist] = useState({ carregando: true, linhas: [], erro: "", pendente: false });
  const [copiado, setCopiado] = useState("");
  const explicacao = explicarNota(nota);

  useEffect(() => {
    let vivo = true;
    buscarHistoricoDocumento(supabase, nota.id)
      .then((linhas) => { if (vivo) setHist({ carregando: false, linhas, erro: "", pendente: false }); })
      .catch((e) => { if (vivo) setHist({ carregando: false, linhas: [], erro: e.message, pendente: e.code === "MIGRACAO_PENDENTE" }); });
    return () => { vivo = false; };
  }, [supabase, nota.id, nota.status, nota.cStat]);

  async function copiarDiagnostico() {
    const ok = await copiar(textoDiagnostico(nota, hist.linhas, tentativas));
    setCopiado(ok ? "Diagnóstico copiado. Cole na conversa com o suporte." : "Não foi possível copiar: selecione e copie o texto manualmente.");
  }

  const campos = [
    ["Situação", `${nota.status}${nota.cStat != null ? ` · código ${nota.cStat}` : ""}`],
    ["Motivo / resposta", nota.xMotivo || "—"],
    ["Chave de acesso", nota.chave || "ainda não gerada"],
    ["Protocolo", nota.protocolo || "—"],
    ["Ambiente", nota.ambiente === "homologacao" ? "Homologação (teste, sem valor fiscal)" : "Produção"],
    ["Tipo de emissão", Number(nota.tpEmis || 1) === 1 ? "Normal" : `Contingência (${nota.tpEmis})`],
    ["Criada em", dataHora(nota.criadoEm)],
    ["Autorizada em", nota.dhAutorizacao ? dataHora(nota.dhAutorizacao) : "—"],
  ];

  return (
    <div className="mt-2 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-3" data-testid="detalhes-nota">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-[var(--pp-text)]">Detalhes e histórico</p>
        <div className="flex gap-2">
          <button type="button" className={botaoLeve} onClick={copiarDiagnostico}>Copiar diagnóstico</button>
          <button type="button" className={botaoLeve} onClick={onFechar}>Fechar</button>
        </div>
      </div>
      {copiado && <p role="status" className="mt-1 text-[12px] font-semibold text-[#1F7A3D]">{copiado}</p>}

      {explicacao && (
        <div className={`mt-2 rounded-lg border px-3 py-2 ${explicacao.tom === "erro" ? "border-[#F5C2CD] bg-[#FDECEF]" : "border-[#F8D9A8] bg-[#FEF3E2]"}`} data-testid="explicacao-nota">
          <p className={`text-[13px] font-bold ${explicacao.tom === "erro" ? "text-[#C81E4A]" : "text-[#8A5200]"}`}>{explicacao.titulo}</p>
          <p className="mt-0.5 text-[12px] text-[var(--pp-text-body)]">{explicacao.causa}</p>
          {explicacao.passos.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-[12px] font-semibold text-[var(--pp-text)]">
              {explicacao.passos.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
        </div>
      )}

      <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {campos.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">{k}</dt>
            <dd className="break-words text-[12px] text-[var(--pp-text)]">{v}</dd>
          </div>
        ))}
      </dl>

      {tentativas.length > 0 && (
        <>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">Ações feitas nesta tela</p>
          <ol className="mt-1 space-y-1.5" data-testid="tentativas-lista">
            {tentativas.map((x, i) => (
              <li key={`${x.quando}-${i}`} className="flex gap-2 text-[12px]">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${x.ok ? "bg-[#1F7A3D]" : "bg-[#C81E4A]"}`} aria-hidden="true" />
                <span className="min-w-0"><span className="font-semibold text-[var(--pp-text)]">{x.acao}</span><span className="text-[var(--pp-text-muted)]"> · {dataHora(x.quando)}</span><span className="block break-words text-[var(--pp-text-body)]">{x.texto}</span></span>
              </li>
            ))}
          </ol>
        </>
      )}

      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">Histórico (log)</p>
      {hist.carregando && <p className="text-[12px] text-[var(--pp-text-muted)]">Carregando o histórico…</p>}
      {!hist.carregando && hist.erro && (
        <p className={`text-[12px] ${hist.pendente ? "text-[#B45309]" : "text-[#C81E4A]"}`} data-testid="historico-erro">
          {hist.erro}{hist.pendente ? " Peça para rodar o script no banco. Enquanto isso, os dados acima já mostram a situação e o motivo atuais." : ""}
        </p>
      )}
      {!hist.carregando && !hist.erro && hist.linhas.length === 0 && <p className="text-[12px] text-[var(--pp-text-muted)]">Nenhum evento registrado ainda.</p>}
      {hist.linhas.length > 0 && (
        <ol className="mt-1 space-y-1.5" data-testid="historico-lista">
          {hist.linhas.map((h) => (
            <li key={h.id} className="flex gap-2 text-[12px]">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${h.falha ? "bg-[#C81E4A]" : "bg-[#1F7A3D]"}`} aria-hidden="true" />
              <span className="min-w-0">
                <span className="font-semibold text-[var(--pp-text)]">{h.titulo}</span>
                <span className="text-[var(--pp-text-muted)]"> · {dataHora(h.quando)}</span>
                {h.mudanca && <span className="text-[var(--pp-text-muted)]"> · {h.mudanca}</span>}
                {h.texto && <span className="block break-words text-[var(--pp-text-body)]">{h.texto}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
