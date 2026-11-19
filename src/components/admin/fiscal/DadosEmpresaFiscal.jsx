import { useEffect, useMemo, useState } from "react";
import LojaCadastroModal from "../loja/LojaCadastroModal";
import { buscarEmitenteFiscal } from "../../../lib/fiscal/fiscalApi";
import { pendenciasEmitenteNfce, percentualCadastroFiscal } from "../../../lib/emitenteFiscalService";
import { secoesDadosFiscais, totalFaltando } from "../../../lib/fiscal/dadosEmpresaFiscal";

// ════════════════════════════════════════════════════════════
//  Dados da Empresa (etapa 4) — quem emite a nota. A tela MOSTRA os dados
//  fiscais do emitente; a edição abre o mesmo cadastro da empresa de sempre
//  (mesmas validações e mesmo caminho de gravação), já na aba certa.
// ════════════════════════════════════════════════════════════

const botaoLeve = "inline-flex min-h-9 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#012E46] hover:border-[#012E46]";
const botao = "inline-flex min-h-10 items-center justify-center rounded-xl bg-[#012E46] px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110";

/**
 * @param {object} p
 * @param {object} p.emitenteApi  API do emitente (fetch/salvar/salvarIdentidade)
 * @param {(id:number, dados:object)=>Promise<void>} p.onSalvarIdentidade  grava nome/CNPJ (mesmo caminho do cadastro da empresa)
 */
export default function DadosEmpresaFiscal({ supabase, lojaInfo, emitenteApi = null, onSalvarIdentidade = async () => {} }) {
  const lojaId = lojaInfo?.id ?? null;
  const [estado, setEstado] = useState({ carregando: true, emitente: null });
  const [recarga, setRecarga] = useState(0);
  const [editando, setEditando] = useState(null); // aba inicial do cadastro

  useEffect(() => {
    if (lojaId == null) return undefined;
    let vivo = true;
    buscarEmitenteFiscal(supabase, lojaId, { legado: emitenteApi?.fetch || null })
      .then((e) => { if (vivo) setEstado({ carregando: false, emitente: e }); })
      .catch(() => { if (vivo) setEstado({ carregando: false, emitente: null }); });
    return () => { vivo = false; };
  }, [supabase, lojaId, emitenteApi, recarga]);

  const doc = lojaInfo?.documento || "";
  const secoes = useMemo(() => secoesDadosFiscais(estado.emitente, doc), [estado.emitente, doc]);
  const faltando = totalFaltando(secoes);
  const pct = useMemo(() => percentualCadastroFiscal(estado.emitente || {}, doc), [estado.emitente, doc]);
  const pend = useMemo(() => pendenciasEmitenteNfce(estado.emitente || {}, doc), [estado.emitente, doc]);
  const barra = pct >= 100 ? "#1F7A3D" : pct >= 60 ? "#F38525" : "#C81E4A";

  if (lojaId == null) return <p className="text-[13px] text-[var(--pp-text-muted)]">Selecione uma empresa.</p>;
  if (estado.carregando) return <p className="text-[13px] text-[var(--pp-text-muted)]">Carregando dados fiscais…</p>;

  return (
    <div className="space-y-4" data-testid="dados-empresa-fiscal">
      <section className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5" aria-label="Situação do cadastro fiscal">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[15px] font-bold text-[var(--pp-text)]">Cadastro fiscal <span style={{ color: barra }}>{pct}%</span> concluído</p>
            <p className="text-[12px] text-[var(--pp-text-muted)]">{pend.length === 0 ? "Nada falta para a nota fiscal." : `${pend.length} pendência(s): ${pend.join(", ")}.`}</p>
          </div>
          {emitenteApi && <button type="button" className={botao} onClick={() => setEditando("empresa")}>Editar dados fiscais</button>}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--pp-bg)]" aria-hidden="true">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barra }} />
        </div>
        {!estado.emitente && <p className="mt-2 text-[12px] font-semibold text-[#B45309]">Esta empresa ainda não tem cadastro fiscal. Use “Editar dados fiscais” para começar.</p>}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {secoes.map((s) => {
          const faltaNaSecao = s.campos.filter((c) => c.faltando).length;
          return (
            <section key={s.id} className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5" aria-label={s.titulo}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[15px] font-bold text-[var(--pp-text)]">{s.titulo}{faltaNaSecao > 0 && <span className="ml-2 rounded-full bg-[#FEF3E2] px-2 py-0.5 text-[11px] font-bold text-[#B45309]">{faltaNaSecao} faltando</span>}</h3>
                {emitenteApi && <button type="button" className={botaoLeve} onClick={() => setEditando(s.aba)}>Editar</button>}
              </div>
              <dl className="mt-3 space-y-2">
                {s.campos.map((c) => (
                  <div key={c.rotulo} className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <dt className="text-[12px] font-semibold text-[var(--pp-text-muted)]">{c.rotulo}</dt>
                    <dd className={`text-[13px] ${c.faltando ? "font-semibold text-[#B45309]" : c.valor === "Não informado" ? "text-[var(--pp-text-muted)]" : "text-[var(--pp-text)]"}`}>{c.faltando ? "Falta preencher" : c.valor}</dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>

      {faltando === 0 && pend.length === 0 && <p className="text-[12px] text-[var(--pp-text-muted)]">Para ligar a emissão, siga para o <b>Painel Fiscal</b>.</p>}

      {editando && emitenteApi && (
        <LojaCadastroModal
          mode="edit"
          loja={lojaInfo}
          emitenteApi={emitenteApi}
          operacaoEditavel={false}
          initialTab={editando}
          onSalvarOperacional={onSalvarIdentidade}
          onFechar={() => { setEditando(null); setRecarga((n) => n + 1); }}
        />
      )}
    </div>
  );
}
