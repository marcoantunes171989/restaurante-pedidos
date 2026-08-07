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
  const [criando, setCriando] = useState(false);
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
      setNome(""); setDestino(""); setTipo("local"); setObservacao(""); setImpressaoAuto(true); setAtivoNovo(true); setCriando(false);
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

  const inp = "w-full rounded-xl border border-[var(--pp-border)] bg-white px-3.5 py-2.5 text-sm text-[var(--pp-text)] outline-none transition focus:border-[#0F4C5C] focus:ring-2 focus:ring-[rgba(15,76,92,0.12)] placeholder:text-[var(--pp-text-muted)]";
  const lbl = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]";
  const toggleRow = "flex items-center justify-between rounded-xl border border-[var(--pp-border)] bg-white px-4 py-2.5 shadow-[0_1px_2px_rgba(15,76,92,0.04)]";
  // Campos do formulário (reaproveitados no modal de novo)
  const camposNovo = (
    <div className="space-y-3">
      <div>
        <label className={lbl}>Nome amigável *</label>
        <input ref={nomeRef} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Cozinha 80mm, Bar, Caixa" className={inp} autoFocus onKeyDown={(e) => { if (e.key === "Enter") criar(); }} />
      </div>
      <div>
        <label className={lbl}>Tipo de instalação *</label>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inp}>
          {TIPOS_IMPRESSORA.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label className={lbl}>Destino do driver *</label>
        <input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder={placeholderDestino} className={inp} />
        <p className="mt-1 text-[11px] leading-4 text-[var(--pp-text-muted)]">{dicaDestino}</p>
      </div>
      <div>
        <label className={lbl}>Observação</label>
        <textarea value={observacao} maxLength={160} rows={2} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: USB na estação da chapa; fila compartilhada do notebook do bar" className={`${inp} resize-none`} />
      </div>
      <div className={toggleRow}>
        <span className="text-sm font-semibold text-[var(--pp-text-body)]">Impressão automática</span>
        <button type="button" onClick={() => setImpressaoAuto((v) => !v)} className={`relative h-6 w-11 rounded-full transition ${impressaoAuto ? "bg-[#2F9E52]" : "bg-[var(--pp-border)]"}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${impressaoAuto ? "left-[22px]" : "left-0.5"}`} />
        </button>
        <span className={`w-14 text-right text-xs font-semibold ${impressaoAuto ? "text-[#2F9E52]" : "text-[var(--pp-text-muted)]"}`}>{impressaoAuto ? "Ativa" : "Manual"}</span>
      </div>
      <div className={toggleRow}>
        <span className="text-sm font-semibold text-[var(--pp-text-body)]">Status</span>
        <button type="button" onClick={() => setAtivoNovo((v) => !v)} className={`relative h-6 w-11 rounded-full transition ${ativoNovo ? "bg-[#2F9E52]" : "bg-[var(--pp-border)]"}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${ativoNovo ? "left-[22px]" : "left-0.5"}`} />
        </button>
        <span className={`w-14 text-right text-xs font-semibold ${ativoNovo ? "text-[#2F9E52]" : "text-[var(--pp-text-muted)]"}`}>{ativoNovo ? "Ativo" : "Inativo"}</span>
      </div>
    </div>
  );

  return (
    <main className="space-y-5">
      {msg && (
        <div className={`fixed right-5 top-5 z-[60] rounded-2xl border px-4 py-3 text-sm font-semibold shadow-xl ${msg.tipo === "ok" ? "border-[rgba(47,158,82,0.3)] bg-[rgba(47,158,82,0.12)] text-[#2F9E52]" : "border-[rgba(200,30,74,0.3)] bg-[rgba(200,30,74,0.1)] text-[#C81E4A]"}`}>
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
        acao={<PrimeButton onClick={() => setCriando(true)}><span className="text-lg leading-none">+</span> Cadastrar impressora</PrimeButton>}
      />

      {/* Listagem (largura total) — cadastro abre em modal */}
      <div className="rounded-[2rem] border border-[var(--pp-border)] bg-white p-5 shadow-[0_1px_2px_rgba(15,76,92,0.05)]">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="page-title text-base font-semibold text-[var(--pp-text)]">Impressoras cadastradas</h4>
            <p className="text-xs text-[var(--pp-text-muted)]">Gerencie apontamentos e testes.</p>
          </div>
          <span className="text-xs font-semibold text-[var(--pp-text-muted)]">{filtrados.length} de {lista.length}</span>
        </div>

        <div className="relative mt-4">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--pp-text-muted)]"><IconBusca /></span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar impressora, destino ou tipo..." className={`${inp} pl-11`} />
        </div>

        {lista.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-[var(--pp-border)] py-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[rgba(230,126,34,0.3)] bg-[rgba(230,126,34,0.1)] text-[#E67E22]"><Printer className="h-7 w-7" /></span>
            <p className="mt-3 font-semibold text-[var(--pp-text)]">Nenhuma impressora cadastrada.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-[var(--pp-text-muted)]">Cadastre ao menos uma para vincular nas categorias e liberar a impressão automática.</p>
            <button onClick={() => setCriando(true)} className="btn-laranja mt-4 rounded-xl px-5 py-2.5 text-sm font-semibold text-white">Cadastrar impressora</button>
          </div>
        ) : filtrados.length === 0 ? (
          <p className="mt-6 py-8 text-center text-sm text-[var(--pp-text-muted)]">Nenhuma impressora encontrada para &quot;{busca}&quot;.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {filtrados.map((imp) => {
              const ativo = imp.ativo !== false;
              return (
                <div key={imp.id} className={`rounded-2xl border p-4 transition ${ativo ? "border-[var(--pp-border)] bg-white shadow-[0_1px_2px_rgba(15,76,92,0.04)] hover:border-[rgba(15,76,92,0.24)]" : "border-[var(--pp-border)] bg-white opacity-70"}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[rgba(15,76,92,0.2)] bg-[rgba(15,76,92,0.06)] text-[#0F4C5C]">
                        {iconeTipo(imp.tipo)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="page-title truncate text-sm font-semibold text-[var(--pp-text)]">{imp.nome}</p>
                          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ativo ? "border-[rgba(47,158,82,0.3)] bg-[rgba(47,158,82,0.1)] text-[#2F9E52]" : "border-[var(--pp-border)] bg-[rgba(15,76,92,0.06)] text-[var(--pp-text-muted)]"}`}>
                            {ativo ? "Ativa" : "Inativa"}
                          </span>
                          <span className="rounded-full border border-[var(--pp-border)] bg-[rgba(15,76,92,0.05)] px-2 py-0.5 text-[10px] font-semibold text-[var(--pp-text-body)]">
                            {rotuloTipoImpressora(imp.tipo)}
                          </span>
                        </div>
                        <p className="mt-1 break-all font-mono text-[11px] text-[var(--pp-text-body)]">{imp.destino || "—"}</p>
                        {imp.observacao ? <p className="mt-0.5 text-xs text-[var(--pp-text-muted)]">{imp.observacao}</p> : null}
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--pp-text-muted)]">
                          <span>{imp.impressaoAuto === false ? "Impressão manual" : "Impressão automática"}</span>
                          <span><b className="font-semibold text-[#0F4C5C]">{categoriasVinculadas(imp.id)}</b> categoria(s)</span>
                          <span><b className="font-semibold text-[#0F4C5C]">{produtosVinculados(imp.id)}</b> produto(s) com override</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <button type="button" onClick={() => testar(imp)} className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(230,126,34,0.3)] bg-white px-3 py-1.5 text-xs font-semibold text-[#E67E22] shadow-[0_1px_2px_rgba(15,76,92,0.05)] transition hover:bg-[rgba(230,126,34,0.08)]">
                        <FlaskConical className="h-3.5 w-3.5" /> Testar impressão
                      </button>
                      <button type="button" onClick={() => setEditando({ ...imp })} className="rounded-xl border border-[var(--pp-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--pp-text-body)] shadow-[0_1px_2px_rgba(15,76,92,0.05)] transition hover:bg-[rgba(15,76,92,0.04)]">Editar</button>
                      {ativo
                        ? <button type="button" onClick={() => setConfirmar(imp)} className="rounded-xl border border-[rgba(200,30,74,0.24)] bg-white px-3 py-1.5 text-xs font-semibold text-[#C81E4A] shadow-[0_1px_2px_rgba(15,76,92,0.05)] transition hover:bg-[rgba(200,30,74,0.08)]">Inativar</button>
                        : <button type="button" onClick={() => alternarAtivo(imp, true)} className="rounded-xl border border-[rgba(47,158,82,0.3)] bg-white px-3 py-1.5 text-xs font-semibold text-[#2F9E52] shadow-[0_1px_2px_rgba(15,76,92,0.05)] transition hover:bg-[rgba(47,158,82,0.08)]">Ativar</button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {categorias.some((c) => !c.impressoraId && c.active !== false) && (
          <p className="mt-4 rounded-2xl border border-[rgba(230,126,34,0.3)] bg-[rgba(230,126,34,0.08)] px-4 py-3 text-xs text-[#B4611A]">
            Há categorias ativas sem impressora. Vincule em <b className="font-semibold">Gestão → Categorias</b> para a impressão automática funcionar.
            {categorias.filter((c) => !c.impressoraId && c.active !== false).slice(0, 3).map((c) => ` “${c.nome}”`).join(",")}
          </p>
        )}
      </div>

      {/* Como configurar rápido (largura total, informativo) */}
      <div className="rounded-[2rem] border border-[rgba(230,126,34,0.25)] bg-white p-5 shadow-[0_1px_2px_rgba(15,76,92,0.05)]">
        <h4 className="page-title text-sm font-semibold text-[#E67E22]">Como configurar rápido</h4>
        <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-5 text-[var(--pp-text-body)]">
          <li>Instale ou compartilhe a impressora no Windows/Linux da estação.</li>
          <li>Cadastre aqui o nome e o destino (driver, IP ou \\\\PC\\Fila).</li>
          <li>Clique em <b className="font-semibold">Testar impressão</b> e selecione a fila correta na janela do sistema.</li>
          <li>Vincule a impressora na <b className="font-semibold">categoria</b> (obrigatório) e, se precisar, no produto (opcional).</li>
          <li>Acompanhe pendentes/reimpressão em <b className="font-semibold">Impressões Setores</b>.</li>
        </ol>
      </div>

      {/* Modal: nova impressora (padrão Mesas) */}
      {criando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button aria-label="Fechar" onClick={() => setCriando(false)} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative flex max-h-[88vh] w-full max-w-md flex-col rounded-3xl border border-[var(--pp-border)] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--pp-border)] px-6 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[rgba(230,126,34,0.12)] text-[#E67E22]"><Printer className="h-[18px] w-[18px]" /></span>
                <h4 className="page-title text-base font-semibold text-[var(--pp-text)]">Nova impressora</h4>
              </div>
              <button onClick={() => setCriando(false)} aria-label="Fechar" className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-white text-lg text-[var(--pp-text-muted)] transition hover:bg-[rgba(15,76,92,0.04)]">✕</button>
            </div>
            <div className="overflow-y-auto px-6 py-4">{camposNovo}</div>
            <div className="flex gap-2 border-t border-[var(--pp-border)] px-6 py-4">
              <button onClick={limpar} className="rounded-xl border border-[var(--pp-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--pp-text-body)] transition hover:bg-[rgba(15,76,92,0.04)]">Limpar</button>
              <PrimeButton onClick={criar} disabled={salvando} className="flex-1"><span className="text-lg leading-none">+</span> {salvando ? "Salvando…" : "Cadastrar impressora"}</PrimeButton>
            </div>
          </div>
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button aria-label="Fechar" onClick={() => setEditando(null)} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative flex max-h-[88vh] w-full max-w-md flex-col rounded-3xl border border-[var(--pp-border)] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--pp-border)] px-6 py-4">
              <h4 className="page-title text-base font-semibold text-[var(--pp-text)]">Editar impressora</h4>
              <button onClick={() => setEditando(null)} aria-label="Fechar" className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-white text-lg text-[var(--pp-text-muted)] transition hover:bg-[rgba(15,76,92,0.04)]">✕</button>
            </div>
            <div className="space-y-3 overflow-y-auto px-6 py-4">
              <div>
                <label className={lbl}>Nome *</label>
                <input value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} className={inp} autoFocus />
              </div>
              <div>
                <label className={lbl}>Tipo *</label>
                <select value={editando.tipo || "local"} onChange={(e) => setEditando({ ...editando, tipo: e.target.value })} className={inp}>
                  {TIPOS_IMPRESSORA.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Destino do driver *</label>
                <input value={editando.destino || ""} onChange={(e) => setEditando({ ...editando, destino: e.target.value })} className={inp} />
              </div>
              <div>
                <label className={lbl}>Observação</label>
                <textarea value={editando.observacao || ""} maxLength={160} rows={2} onChange={(e) => setEditando({ ...editando, observacao: e.target.value })} className={`${inp} resize-none`} />
              </div>
              <div className={toggleRow}>
                <span className="text-sm font-semibold text-[var(--pp-text-body)]">Impressão automática</span>
                <button type="button" onClick={() => setEditando({ ...editando, impressaoAuto: editando.impressaoAuto === false })} className={`relative h-6 w-11 rounded-full transition ${editando.impressaoAuto !== false ? "bg-[#2F9E52]" : "bg-[var(--pp-border)]"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${editando.impressaoAuto !== false ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>
              <div className={toggleRow}>
                <span className="text-sm font-semibold text-[var(--pp-text-body)]">Status</span>
                <button type="button" onClick={() => setEditando({ ...editando, ativo: editando.ativo === false })} className={`relative h-6 w-11 rounded-full transition ${editando.ativo !== false ? "bg-[#2F9E52]" : "bg-[var(--pp-border)]"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${editando.ativo !== false ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>
            </div>
            <div className="flex gap-2 border-t border-[var(--pp-border)] px-6 py-4">
              <PrimeButton onClick={salvarEdicao} className="flex-1">Salvar</PrimeButton>
              <button type="button" onClick={() => testar(editando)} className="rounded-xl border border-[rgba(230,126,34,0.3)] bg-white px-4 py-2.5 text-sm font-semibold text-[#E67E22] transition hover:bg-[rgba(230,126,34,0.08)]">Testar</button>
              <button type="button" onClick={() => setEditando(null)} className="rounded-xl border border-[var(--pp-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--pp-text-body)] transition hover:bg-[rgba(15,76,92,0.04)]">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {confirmar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button aria-label="Fechar" onClick={() => setConfirmar(null)} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-3xl border border-[var(--pp-border)] bg-white p-6 shadow-2xl">
            <h4 className="page-title text-base font-semibold text-[var(--pp-text)]">Inativar impressora?</h4>
            <p className="mt-2 text-sm leading-6 text-[var(--pp-text-muted)]">Ela deixa de aparecer na seleção de categorias/produtos. Histórico da fila de impressão é preservado.</p>
            <p className="mt-3 rounded-xl border border-[var(--pp-border)] bg-[rgba(15,76,92,0.04)] px-3 py-2 text-sm font-semibold text-[var(--pp-text)]">{confirmar.nome}</p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => alternarAtivo(confirmar, false)} className="flex-1 rounded-xl bg-[#C81E4A] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#B01A40]">Confirmar inativação</button>
              <button type="button" onClick={() => setConfirmar(null)} className="rounded-xl border border-[var(--pp-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--pp-text-body)] transition hover:bg-[rgba(15,76,92,0.04)]">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
