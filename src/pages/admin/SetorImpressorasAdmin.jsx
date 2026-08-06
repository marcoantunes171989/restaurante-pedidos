import { useMemo, useRef, useState } from "react";
import { Printer, Wifi, HardDrive, Share2, FlaskConical } from "lucide-react";
import { PageHeader, PrimeButton } from "../../components/Prime";
import { IconBusca } from "../../components/PrimeIcons";
import {
  TIPOS_IMPRESSORA,
  htmlTesteImpressora,
  rotuloTipoImpressora,
} from "../../lib/impressaoCozinha";
import { abrirCupomTermico } from "../pdv/pdvCuponsTermicos";

/**
 * Cadastro de impressoras (driver local, IP/rede ou compartilhamento).
 * Usado por categorias (obrigatório) e produtos (opcional) para roteamento
 * da impressão automática e testes de apontamento.
 */
export default function SetorImpressorasAdmin({
  impressoras = [],
  categorias = [],
  produtos = [],
  api = null,
  lojaInfo = null,
}) {
  const [nome, setNome] = useState("");
  const [destino, setDestino] = useState("");
  const [tipo, setTipo] = useState("local");
  const [observacao, setObservacao] = useState("");
  const [impressaoAuto, setImpressaoAuto] = useState(true);
  const [ativoNovo, setAtivoNovo] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  const nomeRef = useRef(null);

  const aviso = (tipoMsg, texto) => {
    setMsg({ tipo: tipoMsg, texto });
    setTimeout(() => setMsg(null), 3500);
  };

  const placeholderDestino = tipo === "compartilhada"
    ? "\\\\SERVIDOR\\NomeDaFila"
    : tipo === "rede"
      ? "192.168.0.50:9100"
      : "Nome da impressora no Windows / CUPS";

  const dicaDestino = tipo === "compartilhada"
    ? "Use o caminho UNC do compartilhamento (\\\\PC\\Fila). A máquina do Pedido Prime precisa enxergar a fila."
    : tipo === "rede"
      ? "IP da impressora térmica na rede, com porta (padrão 9100 em muitas Epson/Bematech)."
      : "Mesmo nome exibido em Configurações → Impressoras do sistema operacional desta máquina.";

  const lista = useMemo(
    () => [...impressoras].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.nome).localeCompare(String(b.nome), "pt-BR")),
    [impressoras],
  );
  const termo = busca.trim().toLowerCase();
  const filtrados = termo
    ? lista.filter((i) => `${i.nome} ${i.destino} ${i.tipo} ${i.observacao || ""}`.toLowerCase().includes(termo))
    : lista;

  const ativas = lista.filter((i) => i.ativo !== false).length;
  const comAuto = lista.filter((i) => i.ativo !== false && i.impressaoAuto !== false).length;

  const categoriasVinculadas = (id) => categorias.filter((c) => String(c.impressoraId) === String(id)).length;
  const produtosVinculados = (id) => produtos.filter((p) => String(p.impressoraId) === String(id)).length;

  const nomeDuplicado = (n, exceto = null) =>
    impressoras.some((i) => i.id !== exceto && (i.nome || "").trim().toLowerCase() === n.trim().toLowerCase());

  async function criar() {
    const n = nome.trim();
    const d = destino.trim();
    if (!n) { aviso("erro", "Informe o nome da impressora."); nomeRef.current?.focus(); return; }
    if (!d) { aviso("erro", "Informe o destino do driver (obrigatório para o teste e a impressão)."); return; }
    if (nomeDuplicado(n)) { aviso("erro", "Já existe uma impressora com esse nome."); return; }
    setSalvando(true);
    try {
      await api?.add({
        nome: n,
        destino: d,
        tipo,
        observacao: observacao.trim(),
        impressaoAuto,
        ativo: ativoNovo,
        ordem: impressoras.length,
      });
      setNome(""); setDestino(""); setTipo("local"); setObservacao(""); setImpressaoAuto(true); setAtivoNovo(true);
      aviso("ok", "Impressora cadastrada. Faça um teste de impressão.");
    } catch (e) {
      aviso("erro", e?.message || "Não foi possível cadastrar a impressora.");
    } finally {
      setSalvando(false);
    }
  }

  function limpar() {
    setNome(""); setDestino(""); setTipo("local"); setObservacao(""); setImpressaoAuto(true); setAtivoNovo(true); setMsg(null);
  }

  async function salvarEdicao() {
    const n = (editando.nome || "").trim();
    const d = (editando.destino || "").trim();
    if (!n) { aviso("erro", "O nome não pode ficar vazio."); return; }
    if (!d) { aviso("erro", "O destino do driver é obrigatório."); return; }
    if (nomeDuplicado(n, editando.id)) { aviso("erro", "Já existe uma impressora com esse nome."); return; }
    try {
      await api?.editar(editando.id, {
        nome: n,
        destino: d,
        tipo: editando.tipo || "local",
        observacao: (editando.observacao || "").trim(),
        impressaoAuto: editando.impressaoAuto !== false,
        ativo: editando.ativo !== false,
        ordem: editando.ordem ?? 0,
      });
      setEditando(null);
      aviso("ok", "Impressora atualizada.");
    } catch (e) {
      aviso("erro", e?.message || "Não foi possível salvar.");
    }
  }

  async function alternarAtivo(imp, ativo) {
    try {
      await api?.editar(imp.id, { ativo });
      aviso("ok", ativo ? "Impressora reativada." : "Impressora inativada.");
    } catch {
      aviso("erro", "Não foi possível alterar o status.");
    }
    setConfirmar(null);
  }

  function testar(imp) {
    const ok = abrirCupomTermico(
      `Teste — ${imp.nome}`,
      htmlTesteImpressora(imp, lojaInfo),
    );
    if (ok) aviso("ok", "Janela de impressão aberta — escolha a fila apontada no destino.");
    else aviso("erro", "Pop-up bloqueado. Permita pop-ups e tente de novo.");
  }

  const iconeTipo = (t) => {
    if (t === "rede") return <Wifi className="h-4 w-4" />;
    if (t === "compartilhada") return <Share2 className="h-4 w-4" />;
    return <HardDrive className="h-4 w-4" />;
  };

  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-gold-400/60 transition placeholder:text-slate-600";

  return (
    <main className="space-y-5">
      {msg && (
        <div className={`fixed right-5 top-5 z-[60] rounded-2xl border px-4 py-3 text-sm font-bold shadow-xl ${msg.tipo === "ok" ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200" : "border-red-400/30 bg-red-500/15 text-red-200"}`}>
          {msg.texto}
        </div>
      )}

      <PageHeader
        icone={<Printer className="h-6 w-6" />}
        titulo="Setor Impressoras"
        descricao="Cadastre o apontamento do driver (instalado na máquina ou compartilhamento na rede), teste a impressão e vincule nas categorias/produtos."
        indicadores={[
          { valor: lista.length, rotulo: lista.length === 1 ? "impressora" : "impressoras" },
          { valor: ativas, rotulo: "ativas", tom: "ok" },
          { valor: comAuto, rotulo: "com auto-print", tom: "gold" },
          { valor: categorias.filter((c) => c.impressoraId).length, rotulo: "categorias vinculadas" },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
            <h4 className="page-title text-base font-bold text-white">Nova impressora</h4>
            <p className="mt-0.5 text-xs text-slate-500">Apontamento usado pelo Pedido Prime na impressão de teste e automática.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-500">Nome amigável *</label>
                <input ref={nomeRef} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Cozinha 80mm, Bar, Caixa" className={inp} onKeyDown={(e) => { if (e.key === "Enter") criar(); }} />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-500">Tipo de instalação *</label>
                <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inp}>
                  {TIPOS_IMPRESSORA.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-500">Destino do driver *</label>
                <input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder={placeholderDestino} className={inp} />
                <p className="mt-1 text-[11px] leading-4 text-slate-500">{dicaDestino}</p>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-500">Observação</label>
                <textarea value={observacao} maxLength={160} rows={2} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: USB na estação da chapa; fila compartilhada do notebook do bar" className={`${inp} resize-none`} />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                <span className="text-sm font-semibold text-slate-300">Impressão automática</span>
                <button type="button" onClick={() => setImpressaoAuto((v) => !v)} className={`relative h-6 w-11 rounded-full transition ${impressaoAuto ? "bg-emerald-500" : "bg-slate-600"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${impressaoAuto ? "left-[22px]" : "left-0.5"}`} />
                </button>
                <span className={`w-14 text-right text-xs font-bold ${impressaoAuto ? "text-emerald-300" : "text-slate-400"}`}>{impressaoAuto ? "Ativa" : "Manual"}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                <span className="text-sm font-semibold text-slate-300">Status</span>
                <button type="button" onClick={() => setAtivoNovo((v) => !v)} className={`relative h-6 w-11 rounded-full transition ${ativoNovo ? "bg-emerald-500" : "bg-slate-600"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${ativoNovo ? "left-[22px]" : "left-0.5"}`} />
                </button>
                <span className={`w-14 text-right text-xs font-bold ${ativoNovo ? "text-emerald-300" : "text-slate-400"}`}>{ativoNovo ? "Ativo" : "Inativo"}</span>
              </div>
              <div className="flex gap-2 pt-1">
                <PrimeButton onClick={criar} disabled={salvando} className="flex-1">
                  <span className="text-lg leading-none">+</span> {salvando ? "Salvando…" : "Cadastrar impressora"}
                </PrimeButton>
                <button onClick={limpar} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/10">Limpar</button>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-gold-400/25 bg-gold-400/[0.05] p-5">
            <h4 className="page-title text-sm font-bold text-gold-300">Como configurar rápido</h4>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-5 text-slate-300">
              <li>Instale ou compartilhe a impressora no Windows/Linux da estação.</li>
              <li>Cadastre aqui o nome e o destino (driver, IP ou \\\\PC\\Fila).</li>
              <li>Clique em <b>Testar impressão</b> e selecione a fila correta na janela do sistema.</li>
              <li>Vincule a impressora na <b>categoria</b> (obrigatório) e, se precisar, no produto (opcional).</li>
              <li>Acompanhe pendentes/reimpressão em <b>Impressões Setores</b>.</li>
            </ol>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="page-title text-base font-bold text-white">Impressoras cadastradas</h4>
              <p className="text-xs text-slate-500">Gerencie apontamentos e testes.</p>
            </div>
            <span className="text-xs font-semibold text-slate-400">{filtrados.length} de {lista.length}</span>
          </div>

          <div className="relative mt-4">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"><IconBusca /></span>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar impressora, destino ou tipo..." className={`${inp} pl-11`} />
          </div>

          {lista.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-12 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-400/30 bg-gold-400/10 text-gold-300"><Printer className="h-7 w-7" /></span>
              <p className="mt-3 font-bold text-white">Nenhuma impressora cadastrada.</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Cadastre ao menos uma para vincular nas categorias e liberar a impressão automática.</p>
            </div>
          ) : filtrados.length === 0 ? (
            <p className="mt-6 py-8 text-center text-sm text-slate-500">Nenhuma impressora encontrada para &quot;{busca}&quot;.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {filtrados.map((imp) => {
                const ativo = imp.ativo !== false;
                return (
                  <div key={imp.id} className={`rounded-2xl border p-4 transition ${ativo ? "border-white/10 bg-slate-950/40 hover:bg-slate-950/60" : "border-white/10 bg-white/[0.02] opacity-75"}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gold-400/25 bg-gold-400/10 text-gold-300">
                          {iconeTipo(imp.tipo)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="page-title truncate text-base font-bold text-white">{imp.nome}</p>
                            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${ativo ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-white/15 bg-white/[0.06] text-slate-400"}`}>
                              {ativo ? "Ativa" : "Inativa"}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold text-slate-300">
                              {rotuloTipoImpressora(imp.tipo)}
                            </span>
                          </div>
                          <p className="mt-1 break-all font-mono text-[11px] text-slate-300">{imp.destino || "—"}</p>
                          {imp.observacao ? <p className="mt-0.5 text-xs text-slate-500">{imp.observacao}</p> : null}
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                            <span>{imp.impressaoAuto === false ? "Impressão manual" : "Impressão automática"}</span>
                            <span><b className="text-slate-300">{categoriasVinculadas(imp.id)}</b> categoria(s)</span>
                            <span><b className="text-slate-300">{produtosVinculados(imp.id)}</b> produto(s) com override</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <button type="button" onClick={() => testar(imp)} className="inline-flex items-center gap-1.5 rounded-xl border border-gold-400/30 bg-gold-400/10 px-3 py-1.5 text-xs font-bold text-gold-200 transition hover:bg-gold-400/20">
                          <FlaskConical className="h-3.5 w-3.5" /> Testar impressão
                        </button>
                        <button type="button" onClick={() => setEditando({ ...imp })} className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-white/10">Editar</button>
                        {ativo
                          ? <button type="button" onClick={() => setConfirmar(imp)} className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-500/20">Inativar</button>
                          : <button type="button" onClick={() => alternarAtivo(imp, true)} className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/20">Ativar</button>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {categorias.some((c) => !c.impressoraId && c.active !== false) && (
            <p className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
              Há categorias ativas sem impressora. Vincule em <b>Gestão → Categorias</b> para a impressão automática funcionar.
              {categorias.filter((c) => !c.impressoraId && c.active !== false).slice(0, 3).map((c) => ` “${c.nome}”`).join(",")}
            </p>
          )}
        </div>
      </div>

      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button aria-label="Fechar" onClick={() => setEditando(null)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-[2rem] border border-white/10 bg-blue-950 p-6 shadow-2xl">
            <h4 className="page-title text-lg font-bold text-white">Editar impressora</h4>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-500">Nome *</label>
                <input value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} className={inp} autoFocus />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-500">Tipo *</label>
                <select value={editando.tipo || "local"} onChange={(e) => setEditando({ ...editando, tipo: e.target.value })} className={inp}>
                  {TIPOS_IMPRESSORA.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-500">Destino do driver *</label>
                <input value={editando.destino || ""} onChange={(e) => setEditando({ ...editando, destino: e.target.value })} className={inp} />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-500">Observação</label>
                <textarea value={editando.observacao || ""} maxLength={160} rows={2} onChange={(e) => setEditando({ ...editando, observacao: e.target.value })} className={`${inp} resize-none`} />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                <span className="text-sm font-semibold text-slate-300">Impressão automática</span>
                <button type="button" onClick={() => setEditando({ ...editando, impressaoAuto: editando.impressaoAuto === false })} className={`relative h-6 w-11 rounded-full transition ${editando.impressaoAuto !== false ? "bg-emerald-500" : "bg-slate-600"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${editando.impressaoAuto !== false ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                <span className="text-sm font-semibold text-slate-300">Status</span>
                <button type="button" onClick={() => setEditando({ ...editando, ativo: editando.ativo === false })} className={`relative h-6 w-11 rounded-full transition ${editando.ativo !== false ? "bg-emerald-500" : "bg-slate-600"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${editando.ativo !== false ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={salvarEdicao} className="flex-1 rounded-2xl bg-gold-400 px-4 py-2.5 text-sm font-bold text-blue-950 transition hover:bg-gold-300">Salvar</button>
              <button type="button" onClick={() => testar(editando)} className="rounded-2xl border border-gold-400/30 bg-gold-400/10 px-4 py-2.5 text-sm font-bold text-gold-200 transition hover:bg-gold-400/20">Testar</button>
              <button type="button" onClick={() => setEditando(null)} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-slate-300 transition hover:bg-white/10">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {confirmar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button aria-label="Fechar" onClick={() => setConfirmar(null)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-[2rem] border border-white/10 bg-blue-950 p-6 shadow-2xl">
            <h4 className="page-title text-lg font-bold text-white">Inativar impressora?</h4>
            <p className="mt-2 text-sm leading-6 text-slate-400">Ela deixa de aparecer na seleção de categorias/produtos. Histórico da fila de impressão é preservado.</p>
            <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold text-white">{confirmar.nome}</p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => alternarAtivo(confirmar, false)} className="flex-1 rounded-2xl border border-red-400/30 bg-red-500/15 px-4 py-2.5 text-sm font-bold text-red-200 transition hover:bg-red-500/25">Confirmar inativação</button>
              <button type="button" onClick={() => setConfirmar(null)} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-slate-300 transition hover:bg-white/10">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
