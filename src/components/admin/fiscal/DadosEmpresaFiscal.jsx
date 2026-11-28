import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Landmark, MapPin, Receipt, CheckCircle2, PencilLine } from "lucide-react";
import LojaCadastroModal from "../loja/LojaCadastroModal";
import { buscarEmitenteFiscal } from "../../../lib/fiscal/fiscalApi";
import { pendenciasEmitenteNfce, percentualCadastroFiscal } from "../../../lib/emitenteFiscalService";
import { secoesDadosFiscais, totalFaltando } from "../../../lib/fiscal/dadosEmpresaFiscal";

// ════════════════════════════════════════════════════════════
//  Dados da Empresa (etapa 4) — quem emite a nota. A tela MOSTRA os dados
//  fiscais do emitente; a edição abre o mesmo cadastro da empresa de sempre
//  (mesmas validações e mesmo caminho de gravação), já na aba certa.
//  Visual: um ícone por seção (só identidade visual — sem mudar dado/lógica
//  nenhuma) para o lojista reconhecer o bloco de relance; linhas com
//  pendência ganham um leve destaque âmbar para saltar aos olhos na leitura
//  rápida do dia a dia.
// ════════════════════════════════════════════════════════════

const botaoLeve = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--pp-border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#012E46] transition hover:border-[#012E46] hover:bg-[#012E46]/5";
const botao = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-[#012E46] px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110";

// Ícone de cada seção — só decorativo, a chave é o MESMO `s.id` que já vem
// de secoesDadosFiscais (lib/fiscal/dadosEmpresaFiscal.js).
const ICONE_SECAO = { empresa: Building2, regime: Landmark, endereco: MapPin, documentos: Receipt };

/**
 * @param {object} p
 * @param {object} p.emitenteApi  API do emitente (fetch/salvar/salvarIdentidade)
 * @param {(id:number, dados:object)=>Promise<void>} p.onSalvarIdentidade  grava nome/CNPJ (mesmo caminho do cadastro da empresa)
 */
export default function DadosEmpresaFiscal({ supabase, lojaInfo, emitenteApi = null, onSalvarIdentidade = async () => {}, abrirEdicao = false, onEdicaoAberta = null }) {
  const lojaId = lojaInfo?.id ?? null;
  const [estado, setEstado] = useState({ carregando: true, emitente: null });
  const [recarga, setRecarga] = useState(0);
  const [editando, setEditando] = useState(null); // aba inicial do cadastro

  // O App recria `emitenteApi` a cada renderização: guardamos em um ref para NÃO reler o cadastro a cada vez.
  const apiRef = useRef(emitenteApi);
  useEffect(() => { apiRef.current = emitenteApi; });

  useEffect(() => {
    if (lojaId == null) return undefined;
    let vivo = true;
    buscarEmitenteFiscal(supabase, lojaId, { legado: apiRef.current?.fetch || null })
      .then((e) => { if (vivo) setEstado({ carregando: false, emitente: e }); })
      .catch(() => { if (vivo) setEstado({ carregando: false, emitente: null }); });
    return () => { vivo = false; };
  }, [supabase, lojaId, recarga]);

  const doc = lojaInfo?.documento || "";
  const secoes = useMemo(() => secoesDadosFiscais(estado.emitente, doc), [estado.emitente, doc]);
  const faltando = totalFaltando(secoes);
  const pct = useMemo(() => percentualCadastroFiscal(estado.emitente || {}, doc), [estado.emitente, doc]);
  const pend = useMemo(() => pendenciasEmitenteNfce(estado.emitente || {}, doc), [estado.emitente, doc]);
  const barra = pct >= 100 ? "#1F7A3D" : pct >= 60 ? "#F38525" : "#C81E4A";

  // Vindo do assistente "Ativar nota fiscal": abre o cadastro já na aba do primeiro campo que falta.
  const aberturaFeita = useRef(false);
  useEffect(() => {
    if (!abrirEdicao || estado.carregando || aberturaFeita.current || !emitenteApi) return;
    aberturaFeita.current = true;
    const primeira = secoes.find((s) => s.campos.some((c) => c.faltando));
    setEditando(primeira?.aba || "documentos"); // nada faltando nos campos: o que resta é habilitar NFC-e/NF-e
    onEdicaoAberta?.();
  }, [abrirEdicao, estado.carregando, secoes, emitenteApi, onEdicaoAberta]);

  if (lojaId == null) return <p className="text-[13px] text-[var(--pp-text-muted)]">Selecione uma empresa.</p>;
  if (estado.carregando) return <p className="text-[13px] text-[var(--pp-text-muted)]">Carregando dados fiscais…</p>;

  const pronto = pend.length === 0;

  return (
    <div className="space-y-4" data-testid="dados-empresa-fiscal">
      <section className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5" aria-label="Situação do cadastro fiscal">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-[15px] font-black" style={{ background: `${barra}1A`, color: barra }} aria-hidden="true">{pct}%</span>
            <div>
              <p className="flex items-center gap-1.5 text-[15px] font-bold text-[var(--pp-text)]">
                Cadastro fiscal
                {pronto && <CheckCircle2 size={16} className="text-[#1F7A3D]" aria-hidden="true" />}
              </p>
              <p className="text-[12px] text-[var(--pp-text-muted)]">{pronto ? "Nada falta para a nota fiscal." : `${pend.length} pendência(s): ${pend.join(", ")}.`}</p>
            </div>
          </div>
          {emitenteApi && <button type="button" className={botao} onClick={() => setEditando("empresa")}><PencilLine size={15} aria-hidden="true" /> Editar dados fiscais</button>}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--pp-bg)]" aria-hidden="true">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barra }} />
        </div>
        {!estado.emitente && <p className="mt-2 text-[12px] font-semibold text-[#B45309]">Esta empresa ainda não tem cadastro fiscal. Use “Editar dados fiscais” para começar.</p>}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {secoes.map((s) => {
          const faltaNaSecao = s.campos.filter((c) => c.faltando).length;
          const Icone = ICONE_SECAO[s.id] || Receipt;
          return (
            <section key={s.id} className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5" aria-label={s.titulo}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-[15px] font-bold text-[var(--pp-text)]">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#012E46]/[0.06] text-[#012E46]" aria-hidden="true"><Icone size={16} /></span>
                  {s.titulo}
                  {faltaNaSecao > 0 && <span className="rounded-full bg-[#FEF3E2] px-2 py-0.5 text-[11px] font-bold text-[#B45309]">{faltaNaSecao} faltando</span>}
                </h3>
                {emitenteApi && <button type="button" className={botaoLeve} onClick={() => setEditando(s.aba)}><PencilLine size={13} aria-hidden="true" /> Editar</button>}
              </div>
              <dl className="mt-3 divide-y divide-[var(--pp-border)]">
                {s.campos.map((c) => (
                  <div key={c.rotulo} className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 first:pt-0 last:pb-0 ${c.faltando ? "-mx-2 rounded-lg bg-[#FEF3E2]/60 px-2" : ""}`}>
                    <dt className="text-[12px] font-semibold text-[var(--pp-text-muted)]">{c.rotulo}
                      {c.usos?.length > 0 && <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">{c.usos.map((u) => <span key={u} className={`rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wide ${u === "Gerencial" ? "bg-[#E5E7EB] text-[#4B5563]" : "bg-[#012E46] text-white"}`}>{u}</span>)}</span>}
                    </dt>
                    <dd className={`text-[13px] ${c.faltando ? "font-semibold text-[#B45309]" : c.valor === "Não informado" ? "text-[var(--pp-text-muted)]" : "font-semibold text-[var(--pp-text)]"}`}>{c.faltando ? "Falta preencher" : c.valor}</dd>
                    {c.aviso && <p role="alert" className="w-full text-[12px] font-semibold text-[#B45309]">⚠ {c.aviso}</p>}
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-2 text-[11px] text-[var(--pp-text-muted)]">
        <span className="inline-flex items-center gap-1"><span className="rounded bg-[#012E46] px-1.5 py-px text-[9px] font-bold uppercase text-white">NFC-e</span><span className="rounded bg-[#012E46] px-1.5 py-px text-[9px] font-bold uppercase text-white">NF-e</span> obrigatório para emitir</span>
        <span className="inline-flex items-center gap-1"><span className="rounded bg-[#E5E7EB] px-1.5 py-px text-[9px] font-bold uppercase text-[#4B5563]">Gerencial</span> usado em relatórios e análises</span>
      </p>
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
