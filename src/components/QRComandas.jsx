import { useState, useEffect, useMemo, useRef } from "react";
import QRCode from "qrcode";
import { uploadImagemProduto, validarImagemProduto } from "../lib/supabase";
import {
  IconBusca, IconImpressora, IconQr, IconComanda, IconCheck, IconLixeira,
  IconChevronDown, IconMesas, IconRecibo, IconCardapio,
} from "./PrimeIcons";

// ── Helpers ───────────────────────────────────────────────────
function gerarCodigo(prefixo = "CMD", numero) {
  return `${prefixo}-${String(numero).padStart(6, "0")}`;
}
// Número (int) a partir do código "PREFIXO-000123" → 123 (ou null).
function numeroDoCodigo(codigo = "") {
  const n = parseInt(String(codigo).split("-")[1], 10);
  return Number.isFinite(n) ? n : null;
}
// densidade "alta" (correção H, maior) ou "media" (M) — na paleta oficial (petróleo).
async function gerarQR(texto, densidade = "alta") {
  return QRCode.toDataURL(texto, {
    width: densidade === "alta" ? 420 : 300, margin: 1,
    color: { dark: "#012E46", light: "#ffffff" },
    errorCorrectionLevel: densidade === "alta" ? "H" : "M",
  });
}
const TAMANHOS = [
  { id: "58x80", label: "58 × 80 mm (térmica)", w: 58 },
  { id: "80x120", label: "80 × 120 mm (térmica)", w: 80 },
  { id: "a4", label: "A4 (folha)", w: 0 },
];
const rotuloTamanho = (id) => (TAMANHOS.find((t) => t.id === id) || TAMANHOS[0]).label;
const chaveModelo = (lojaId) => `pp_modelo_comanda_${lojaId || "default"}`;

// ── Controles reutilizáveis (tema claro do painel) ────────────
const lbl = "mb-1.5 block text-xs font-bold uppercase tracking-wider text-[var(--pp-text-muted)]";
const inp = "w-full rounded-xl border border-[var(--pp-border)] bg-white px-3.5 py-2.5 text-sm text-dash-navy outline-none transition focus:border-[#F38525] placeholder:text-[var(--pp-text-muted)]";

function Switch({ ligado, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} onClick={() => onChange(!ligado)}
      className="flex items-center gap-2.5 text-sm font-semibold text-dash-navy">
      <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${ligado ? "bg-[#F38525]" : "bg-[var(--pp-border)]"}`}>
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${ligado ? "translate-x-5" : "translate-x-0.5"}`} />
      </span>
      {label}
    </button>
  );
}
// Cabeçalho numerado de seção (1, 2, 3, 4)
function SecaoTitulo({ n, children }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#012E46] text-xs font-black text-white">{n}</span>
      <h4 className="text-base font-black text-dash-navy">{children}</h4>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  Componente principal — cabeçalho + abas (Gerar | Visualizar)
// ══════════════════════════════════════════════════════════════
export function GeradorComandas({
  prefixoLoja = "CMD",
  empresa = "Restaurante",
  onGerar,
  comandasRegistradas = [],
  orders = [],
  onExcluirComanda,
  onRenomearComanda,
  onToggleComanda,
  lojaId,
  logoSalvo = "",
  onSalvarLogo,
  onIrCardapioExterno,
}) {
  const [aba, setAba] = useState("gerar"); // "gerar" | "visualizar"

  return (
    <main className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="page-title flex items-center gap-2.5 text-2xl font-bold tracking-tight text-dash-navy">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#F38525]/30 bg-[#F38525]/10 text-[#F38525] [&>svg]:h-5 [&>svg]:w-5"><IconQr /></span>
            Comandas QR — uso local nas mesas
          </h2>
          <p className="mt-1 text-sm text-[var(--pp-text-muted)]">Gere e imprima as comandas físicas das mesas. No atendimento, o tablet escaneia o QR da comanda para abrir o pedido.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setAba("gerar")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${aba === "gerar" ? "bg-[#012E46] text-white shadow-sm" : "border border-[var(--pp-border)] bg-white text-dash-navy hover:bg-[var(--pp-bg)]"}`}>
            <IconQr /> Gerar comandas
          </button>
          <button onClick={() => setAba("visualizar")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${aba === "visualizar" ? "bg-[#012E46] text-white shadow-sm" : "border border-[var(--pp-border)] bg-white text-dash-navy hover:bg-[var(--pp-bg)]"}`}>
            <IconRecibo /> Visualizar comandas ({comandasRegistradas.length})
          </button>
        </div>
      </div>

      {aba === "gerar" ? (
        <PainelGerar
          prefixoLoja={prefixoLoja}
          empresa={empresa}
          onGerar={onGerar}
          lojaId={lojaId}
          logoSalvo={logoSalvo}
          onSalvarLogo={onSalvarLogo}
          onIrCardapioExterno={onIrCardapioExterno}
          comandasRegistradas={comandasRegistradas}
        />
      ) : (
        <PainelVisualizar
          comandasRegistradas={comandasRegistradas}
          orders={orders}
          empresa={empresa}
          prefixoLoja={prefixoLoja}
          onExcluir={onExcluirComanda}
          onRenomear={onRenomearComanda}
          onToggle={onToggleComanda}
        />
      )}
    </main>
  );
}

// ══════════════════════════════════════════════════════════════
//  Aba 1 — Gerar novas comandas
// ══════════════════════════════════════════════════════════════
function PainelGerar({ prefixoLoja, empresa, onGerar, lojaId, logoSalvo = "", onSalvarLogo, onIrCardapioExterno, comandasRegistradas = [] }) {
  const [nomeEmpresa, setNomeEmpresa] = useState(empresa);
  const [logoUrl, setLogoUrl]         = useState(logoSalvo || "");
  // Modelo (preferências de impressão) salvo no dispositivo — lido uma vez.
  const modeloRef = useRef(null);
  if (modeloRef.current === null) {
    try { modeloRef.current = JSON.parse(localStorage.getItem(chaveModelo(lojaId)) || "{}") || {}; }
    catch { modeloRef.current = {}; }
  }
  const m0 = modeloRef.current;
  const [chamada, setChamada]         = useState(m0.chamada ?? "Escaneie e faça seu pedido");
  const [prefixo, setPrefixo]         = useState(prefixoLoja);
  const [inicio, setInicio]           = useState(1);
  const [quantidade, setQuantidade]   = useState(10);
  const [colunas, setColunas]         = useState(m0.colunas ?? 3);
  // Configurações inteligentes (afetam a geração/impressão)
  const [tamanho, setTamanho]         = useState(m0.tamanho ?? "58x80");
  const [instrucaoUso, setInstrucaoUso] = useState(typeof m0.instrucaoUso === "boolean" ? m0.instrucaoUso : true);
  const [mostrarLogo, setMostrarLogo] = useState(typeof m0.mostrarLogo === "boolean" ? m0.mostrarLogo : true);
  const [densidade, setDensidade]     = useState(m0.densidade ?? "alta");
  const [layout, setLayout]           = useState(m0.layout ?? "padrao");
  const [comandas, setComandas]       = useState([]);
  const [gerando, setGerando]         = useState(false);
  const [uploadandoLogo, setUploadandoLogo] = useState(false);
  const [erroLogo, setErroLogo]       = useState("");
  const [aviso, setAviso]             = useState("");
  const [verPreview, setVerPreview]   = useState("frente"); // frente | verso
  const fileLogoRef = useRef(null);

  // Sincroniza identidade quando muda a empresa/logo do banco
  useEffect(() => { setLogoUrl(logoSalvo || ""); }, [logoSalvo]);
  useEffect(() => { setNomeEmpresa(empresa); }, [empresa]);
  useEffect(() => { setPrefixo(prefixoLoja); }, [prefixoLoja]);

  const opcoesImpressao = () => ({ nomeEmpresa, logoUrl: mostrarLogo ? logoUrl : "", chamada, colunas, tamanho, instrucao: instrucaoUso, layout });

  // ── KPIs 100% derivados do banco (tab_comandas: codigo, ativo) ──
  const kpis = useMemo(() => {
    const total = comandasRegistradas.length;
    const ativas = comandasRegistradas.filter((c) => c.ativo !== false).length;
    const inativas = total - ativas;
    const numeros = comandasRegistradas.map((c) => numeroDoCodigo(c.codigo)).filter((n) => n != null).sort((a, b) => a - b);
    const minN = numeros[0], maxN = numeros[numeros.length - 1];
    const faixa = numeros.length ? `${gerarCodigo(prefixoLoja, minN)} → ${gerarCodigo(prefixoLoja, maxN)}` : "—";
    const proximo = gerarCodigo(prefixoLoja, numeros.length ? maxN + 1 : 1);
    return { total, ativas, inativas, faixa, proximo };
  }, [comandasRegistradas, prefixoLoja]);

  // Total de páginas (estimativa real pelo layout escolhido)
  const cardsPorPagina = colunas * (tamanho === "a4" ? 5 : 3);
  const totalPaginas = Math.max(1, Math.ceil((comandas.length || quantidade) / cardsPorPagina));

  // Prévia do QR (amostra do primeiro código do lote)
  const [qrAmostra, setQrAmostra] = useState("");
  useEffect(() => {
    let ativo = true;
    gerarQR(gerarCodigo(prefixo || "CMD", inicio), densidade).then((u) => { if (ativo) setQrAmostra(u); });
    return () => { ativo = false; };
  }, [prefixo, inicio, densidade]);

  // Importa logo → Storage → salva no banco → reflete no preview/impressão
  async function importarLogo(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErroLogo("");
    const erroVal = validarImagemProduto(f);
    if (erroVal) { setErroLogo(erroVal); return; }
    setUploadandoLogo(true);
    try {
      const url = await uploadImagemProduto(f, lojaId || "logos");
      setLogoUrl(url);
      if (onSalvarLogo) await onSalvarLogo(url);
    } catch (err) {
      setErroLogo(err.message || "Falha ao enviar a logo.");
    }
    setUploadandoLogo(false);
  }
  function removerLogo() {
    setLogoUrl("");
    if (onSalvarLogo) onSalvarLogo("");
  }
  function salvarIdentidade() {
    if (onSalvarLogo) onSalvarLogo(logoUrl.trim());
    flash("Identidade salva na empresa.");
  }
  function salvarModelo() {
    try {
      localStorage.setItem(chaveModelo(lojaId), JSON.stringify({ chamada, colunas, tamanho, instrucaoUso, mostrarLogo, densidade, layout }));
      flash("Modelo salvo neste dispositivo.");
    } catch { flash("Não foi possível salvar o modelo."); }
  }
  function flash(msg) { setAviso(msg); setTimeout(() => setAviso(""), 2500); }

  async function gerar() {
    setGerando(true);
    const lista = [];
    for (let i = 0; i < quantidade; i++) {
      const codigo = gerarCodigo(prefixo, inicio + i);
      const qrUrl  = await gerarQR(codigo, densidade);
      lista.push({ codigo, qrUrl });
    }
    setComandas(lista);
    setGerando(false);
    if (lista[0]) setQrAmostra(lista[0].qrUrl);
    if (onGerar) onGerar(lista.map((c) => c.codigo));
    flash(`${lista.length} comanda(s) gerada(s) e registrada(s).`);
  }
  function gerarPDF() {
    const alvo = comandas.length ? comandas : null;
    if (!alvo) { flash("Gere o lote antes de exportar o PDF."); return; }
    imprimirComandas(alvo, opcoesImpressao());
  }
  async function imprimirTeste() {
    const codigo = gerarCodigo(prefixo || "CMD", inicio);
    const qrUrl = qrAmostra || await gerarQR(codigo, densidade);
    imprimirComandas([{ codigo, qrUrl }], opcoesImpressao());
  }

  const codigoExemplo = gerarCodigo(prefixo || "CMD", inicio);
  const KPI_CARDS = [
    { rot: "Total de comandas geradas", val: kpis.total, sub: "registradas nesta empresa", cor: "#012E46", Icone: IconComanda, mono: false },
    { rot: "Faixa numérica atual", val: kpis.faixa, sub: `Próximo: ${kpis.proximo}`, cor: "#012E46", Icone: IconRecibo, mono: true },
    { rot: "Comandas ativas", val: kpis.ativas, sub: kpis.inativas > 0 ? `${kpis.inativas} inativa(s)` : "todas ativas", cor: "#5E8C31", Icone: IconCheck, mono: false },
    { rot: "Prontas para impressão", val: comandas.length, sub: comandas.length ? "comandas neste lote" : "gere um lote", cor: "#F38525", Icone: IconImpressora, mono: false },
  ];
  const PASSOS = [
    { n: "1", Icone: IconImpressora, t: "Gere e imprima", d: "Crie as comandas com a identidade da empresa e imprima." },
    { n: "2", Icone: IconMesas, t: "Distribua nas mesas", d: "Cada comanda fica disponível para o atendimento local." },
    { n: "3", Icone: IconQr, t: "Escaneie no tablet", d: "O tablet lê o QR e vincula o pedido à comanda da mesa." },
  ];

  return (
    <div className="space-y-5">
      {/* Passos */}
      <div className="grid gap-2 rounded-2xl border border-[var(--pp-border)] bg-white p-3 sm:grid-cols-3 sm:items-stretch">
        {PASSOS.map((p, i) => (
          <div key={p.n} className="relative flex items-start gap-3 rounded-xl px-3 py-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--pp-bg)] text-[#012E46] [&>svg]:h-5 [&>svg]:w-5"><p.Icone /></span>
            <div className="min-w-0">
              <p className="text-sm font-black text-dash-navy">{p.n}. {p.t}</p>
              <p className="mt-0.5 text-[12px] leading-snug text-[var(--pp-text-muted)]">{p.d}</p>
            </div>
            {i < PASSOS.length - 1 && <span className="absolute -right-1 top-1/2 hidden -translate-y-1/2 text-[var(--pp-border)] sm:block [&>svg]:-rotate-90"><IconChevronDown /></span>}
          </div>
        ))}
      </div>

      {/* Banner — link do cardápio externo */}
      <div className="flex flex-col gap-2 rounded-2xl border border-[#012E46]/20 bg-[#012E46]/[0.04] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 text-[#012E46] [&>svg]:h-4 [&>svg]:w-4"><IconCardapio /></span>
          <p className="text-sm text-dash-navy">Procurando o link do <b>cardápio digital do cliente</b> (externo)? Ele fica na tela <b>Cardápio externo</b>.</p>
        </div>
        {onIrCardapioExterno && (
          <button onClick={onIrCardapioExterno} className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-[#012E46] hover:underline">
            Abrir Cardápio externo ↗
          </button>
        )}
      </div>

      {/* KPIs (dados reais do banco) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {KPI_CARDS.map((k) => (
          <div key={k.rot} className="flex items-start gap-3 rounded-2xl border border-[var(--pp-border)] bg-white p-4 shadow-[0_2px_8px_rgba(43,35,32,0.04)]">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl [&>svg]:h-5 [&>svg]:w-5" style={{ background: `${k.cor}1A`, color: k.cor }}><k.Icone /></span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[var(--pp-text-muted)]">{k.rot}</p>
              <p className={`text-dash-navy ${k.mono ? "font-mono text-sm font-black" : "page-title text-xl font-black"}`}>{k.val}</p>
              {k.sub && <p className="mt-0.5 truncate text-[11px] font-semibold text-[var(--pp-text-muted)]">{k.sub}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Corpo — formulário + pré-visualização */}
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Formulário */}
        <div className="space-y-5">
          {/* 1. Identidade */}
          <section className="space-y-4 rounded-2xl border border-[var(--pp-border)] bg-white p-5">
            <SecaoTitulo n="1">Identidade da comanda</SecaoTitulo>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-1">
                <span className={lbl}>Nome da empresa</span>
                <input value={nomeEmpresa} onChange={(e) => setNomeEmpresa(e.target.value)} placeholder="Ex.: Pizzaria do Bairro" className={inp} />
              </div>
              <div className="sm:col-span-1">
                <span className={lbl}>Frase no rodapé</span>
                <input value={chamada} onChange={(e) => setChamada(e.target.value)} placeholder="Escaneie e faça seu pedido" className={inp} />
              </div>
              <div className="sm:col-span-2">
                <span className={lbl}>Logo da empresa</span>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)]">
                    {logoUrl ? <img src={logoUrl} alt="logo" className="h-full w-full object-contain p-1" onError={() => {}} /> : <span className="text-[var(--pp-text-muted)] [&>svg]:h-6 [&>svg]:w-6"><IconMesas /></span>}
                    {uploadandoLogo && <div className="absolute inset-0 flex items-center justify-center bg-white/70"><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#F38525] border-t-transparent" /></div>}
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    <input ref={fileLogoRef} type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" className="hidden" onChange={importarLogo} />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => fileLogoRef.current?.click()} disabled={uploadandoLogo}
                        className="inline-flex items-center gap-2 rounded-xl border border-[var(--pp-border)] bg-white px-3.5 py-2 text-sm font-bold text-dash-navy transition hover:bg-[var(--pp-bg)] disabled:opacity-50">
                        Trocar logo
                      </button>
                      {logoUrl && (
                        <button type="button" onClick={removerLogo} className="inline-flex items-center gap-1.5 rounded-xl border border-[#DC2626]/25 bg-[#DC2626]/[0.06] px-3 py-2 text-sm font-bold text-[#B91C1C] transition hover:bg-[#DC2626]/12 [&>svg]:h-4 [&>svg]:w-4">
                          <IconLixeira />
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--pp-text-muted)]">PNG, JPG ou JPEG · Máx. 2 MB</p>
                    <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="ou cole uma URL da logo…" className={`${inp} text-xs`} />
                  </div>
                </div>
                {erroLogo && <p className="mt-1.5 text-[11px] font-semibold text-[#B91C1C]">{erroLogo}</p>}
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={salvarIdentidade} className="inline-flex items-center gap-2 rounded-xl border border-[#5E8C31]/30 bg-[#5E8C31]/10 px-4 py-2 text-sm font-bold text-[#3F6021] transition hover:bg-[#5E8C31]/20 [&>svg]:h-4 [&>svg]:w-4">
                <IconCheck /> Salvar identidade
              </button>
            </div>
          </section>

          {/* 2. Numeração e lote */}
          <section className="space-y-4 rounded-2xl border border-[var(--pp-border)] bg-white p-5">
            <SecaoTitulo n="2">Numeração e lote</SecaoTitulo>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className={lbl}>Prefixo</span>
                <input value={prefixo} onChange={(e) => setPrefixo(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5))} maxLength={5} className={`${inp} font-mono font-black tracking-widest`} />
              </div>
              <div>
                <span className={lbl}>Número inicial</span>
                <input type="number" min={1} max={999999} value={inicio} onChange={(e) => setInicio(Math.max(1, Number(e.target.value)))} className={inp} />
              </div>
              <div>
                <span className={lbl}>Quantidade</span>
                <input type="number" min={1} max={120} value={quantidade} onChange={(e) => setQuantidade(Math.min(120, Math.max(1, Number(e.target.value))))} className={inp} />
              </div>
              <div>
                <span className={lbl}>Colunas por linha</span>
                <select value={colunas} onChange={(e) => setColunas(Number(e.target.value))} className={inp}>
                  <option value={2}>2 por linha</option>
                  <option value={3}>3 por linha (padrão)</option>
                  <option value={4}>4 por linha</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border border-[#F38525]/25 bg-[#F38525]/[0.06] px-4 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F38525]/15 text-[#F38525] [&>svg]:h-4 [&>svg]:w-4"><IconRecibo /></span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--pp-text-muted)]">Resumo automático deste lote</p>
                <p className="truncate font-mono text-sm font-black text-dash-navy">{codigoExemplo} até {gerarCodigo(prefixo || "CMD", inicio + quantidade - 1)}</p>
              </div>
            </div>
          </section>

          {/* 3. Configurações inteligentes */}
          <section className="space-y-4 rounded-2xl border border-[var(--pp-border)] bg-white p-5">
            <SecaoTitulo n="3">Configurações inteligentes</SecaoTitulo>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <span className={lbl}>Tamanho de impressão</span>
                <select value={tamanho} onChange={(e) => setTamanho(e.target.value)} className={inp}>
                  {TAMANHOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <span className={lbl}>Densidade do QR</span>
                <select value={densidade} onChange={(e) => setDensidade(e.target.value)} className={inp}>
                  <option value="alta">Alta (mais robusto)</option>
                  <option value="media">Média (mais leve)</option>
                </select>
              </div>
              <div>
                <span className={lbl}>Layout</span>
                <select value={layout} onChange={(e) => setLayout(e.target.value)} className={inp}>
                  <option value="padrao">Padrão</option>
                  <option value="compacto">Compacto</option>
                </select>
              </div>
              <div className="flex items-center pt-1 sm:pt-6"><Switch ligado={instrucaoUso} onChange={setInstrucaoUso} label="Instrução de uso" /></div>
              <div className="flex items-center pt-1 sm:pt-6"><Switch ligado={mostrarLogo} onChange={setMostrarLogo} label="Mostrar logo" /></div>
            </div>
            <p className="text-[11px] text-[var(--pp-text-muted)]">Configurações otimizadas para melhor leitura do QR e apresentação.</p>
          </section>

          {/* 4. Ações */}
          <section className="space-y-3 rounded-2xl border border-[var(--pp-border)] bg-white p-5">
            <SecaoTitulo n="4">Ações</SecaoTitulo>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <button onClick={salvarModelo} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--pp-border)] bg-white px-4 py-2.5 text-sm font-bold text-dash-navy transition hover:bg-[var(--pp-bg)] [&>svg]:h-4 [&>svg]:w-4"><IconCheck /> Salvar modelo</button>
              <button onClick={gerarPDF} disabled={!comandas.length} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--pp-border)] bg-white px-4 py-2.5 text-sm font-bold text-dash-navy transition hover:bg-[var(--pp-bg)] disabled:opacity-50 [&>svg]:h-4 [&>svg]:w-4"><IconRecibo /> Gerar PDF</button>
              <button onClick={imprimirTeste} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--pp-border)] bg-white px-4 py-2.5 text-sm font-bold text-dash-navy transition hover:bg-[var(--pp-bg)] [&>svg]:h-4 [&>svg]:w-4"><IconImpressora /> Imprimir teste</button>
              <button onClick={gerar} disabled={gerando || prefixo.length < 1} className="btn-laranja inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-60 [&>svg]:h-4 [&>svg]:w-4">
                {gerando ? "Gerando…" : <><IconQr /> Gerar lote de comandas</>}
              </button>
            </div>
            {aviso && <p className="rounded-xl border border-[#5E8C31]/25 bg-[#5E8C31]/10 px-3.5 py-2 text-sm font-semibold text-[#3F6021]">{aviso}</p>}
          </section>
        </div>

        {/* Pré-visualização em tempo real */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--pp-border)] bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-black text-dash-navy"><span className="text-[#012E46] [&>svg]:h-4 [&>svg]:w-4"><IconBusca /></span> Pré-visualização em tempo real</p>
              <select value={verPreview} onChange={(e) => setVerPreview(e.target.value)} className="rounded-lg border border-[var(--pp-border)] bg-white px-2.5 py-1.5 text-xs font-bold text-dash-navy outline-none">
                <option value="frente">Ver frente</option>
                <option value="verso">Ver verso</option>
              </select>
            </div>

            {/* Card modelo */}
            <div className="mx-auto w-full max-w-[240px] overflow-hidden rounded-2xl border border-[var(--pp-border)] bg-white shadow-[0_8px_24px_rgba(1, 46, 70,0.12)]">
              <div className="h-1.5 w-full bg-[#012E46]" />
              {verPreview === "frente" ? (
                <div className="flex flex-col items-center px-4 pb-4 pt-3 text-center">
                  {mostrarLogo && logoUrl ? <img src={logoUrl} alt="logo" className="mb-1 h-11 w-11 rounded-lg object-contain" /> : null}
                  <p className="text-[15px] font-black leading-tight text-dash-navy">{nomeEmpresa || "Restaurante"}</p>
                  <p className="text-[8px] font-bold uppercase tracking-[2px] text-[var(--pp-text-muted)]">Comanda do cliente</p>
                  <div className="my-2 h-[150px] w-[150px] overflow-hidden rounded-lg bg-[var(--pp-bg)]">
                    {qrAmostra ? <img src={qrAmostra} alt="qr" className="h-full w-full" /> : <div className="flex h-full w-full items-center justify-center text-xs text-[var(--pp-text-muted)]">QR</div>}
                  </div>
                  <p className="font-mono text-lg font-black tracking-widest text-dash-navy">{codigoExemplo}</p>
                  {chamada && <p className="mt-1 text-[10px] text-[var(--pp-text-muted)]">{chamada}</p>}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 px-4 pb-5 pt-4 text-center">
                  <p className="text-[13px] font-black text-dash-navy">Como pedir</p>
                  <ol className="space-y-1.5 text-left text-[11px] text-[var(--pp-text-muted)]">
                    <li><b className="text-dash-navy">1.</b> Abra a câmera e aponte para o QR.</li>
                    <li><b className="text-dash-navy">2.</b> Escolha os itens no cardápio.</li>
                    <li><b className="text-dash-navy">3.</b> Envie — o pedido vai para a comanda da mesa.</li>
                  </ol>
                  <p className="mt-1 font-mono text-sm font-black tracking-widest text-dash-navy">{codigoExemplo}</p>
                </div>
              )}
            </div>

            {/* Mini-status */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { r: "Tamanho", v: rotuloTamanho(tamanho).split(" (")[0] },
                { r: "Total de páginas", v: `${totalPaginas} pág.` },
                { r: "Status", v: comandas.length ? "Pronto para imprimir" : "Aguardando geração", ok: comandas.length > 0 },
              ].map((s) => (
                <div key={s.r} className="rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-2.5 py-2 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--pp-text-muted)]">{s.r}</p>
                  <p className={`mt-0.5 text-[11px] font-black ${s.ok ? "text-[#3F6021]" : "text-dash-navy"}`}>{s.v}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-[10px] text-[var(--pp-text-muted)]">A pré-visualização pode variar levemente da impressão real.</p>
          </div>

          {comandas.length > 0 && (
            <div className="rounded-2xl border border-[var(--pp-border)] bg-white p-4">
              <p className="mb-3 text-sm font-black text-dash-navy">Lote gerado ({comandas.length})</p>
              <div className="grid grid-cols-3 gap-2">
                {comandas.slice(0, 12).map(({ codigo, qrUrl }) => (
                  <div key={codigo} className="flex flex-col items-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-1.5 text-center">
                    <img src={qrUrl} alt={codigo} className="h-14 w-14 rounded-md bg-white p-0.5" />
                    <p className="mt-1 font-mono text-[9px] font-black text-dash-navy">{codigo}</p>
                  </div>
                ))}
              </div>
              {comandas.length > 12 && <p className="mt-2 text-center text-[11px] text-[var(--pp-text-muted)]">+ {comandas.length - 12} no lote</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  Aba 2 — Visualizar / Reimprimir / Editar comandas existentes
// ══════════════════════════════════════════════════════════════
function PainelVisualizar({ comandasRegistradas, orders, empresa, prefixoLoja, onExcluir, onRenomear, onToggle }) {
  const [busca, setBusca]               = useState("");
  const [selecionadas, setSelecionadas] = useState(new Set());
  const [editando, setEditando]         = useState(null);
  const [confirmExcluir, setConfirmExcluir] = useState(null);
  const [bloqueioExcluir, setBloqueioExcluir] = useState(null);

  const pedidosDaComanda = (codigo) => (orders || []).filter((o) => o.command === codigo);
  const temHistorico = (codigo) => pedidosDaComanda(codigo).length > 0;
  const [qrCache, setQrCache]           = useState({});
  const [gerando, setGerando]           = useState(false);
  const [nomeEmpresa]                   = useState(empresa);
  const [chamada]                       = useState("Escaneie e faça seu pedido");

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t ? comandasRegistradas.filter((c) => c.codigo.toLowerCase().includes(t)) : comandasRegistradas;
  }, [comandasRegistradas, busca]);

  useEffect(() => {
    let ativo = true;
    const faltam = filtradas.filter((c) => !qrCache[c.codigo]).slice(0, 50);
    if (faltam.length === 0) return;
    (async () => {
      const novos = {};
      for (const c of faltam) {
        if (!ativo) break;
        novos[c.codigo] = await gerarQR(c.codigo);
      }
      if (ativo) setQrCache((prev) => ({ ...prev, ...novos }));
    })();
    return () => { ativo = false; };
  }, [filtradas]);

  function toggleSel(codigo) {
    setSelecionadas((s) => { const n = new Set(s); n.has(codigo) ? n.delete(codigo) : n.add(codigo); return n; });
  }
  function toggleTodos() {
    setSelecionadas((s) => s.size === filtradas.length ? new Set() : new Set(filtradas.map((c) => c.codigo)));
  }

  async function reimprimir() {
    const alvo = selecionadas.size > 0 ? filtradas.filter((c) => selecionadas.has(c.codigo)) : filtradas;
    if (alvo.length === 0) return;
    setGerando(true);
    const lista = [];
    for (const c of alvo) {
      const qrUrl = qrCache[c.codigo] || await gerarQR(c.codigo);
      lista.push({ codigo: c.codigo, qrUrl });
    }
    setGerando(false);
    imprimirComandas(lista, { nomeEmpresa, logoUrl: "", chamada, colunas: 3 });
  }
  async function reimprimirUma(codigo) {
    const qrUrl = qrCache[codigo] || await gerarQR(codigo);
    imprimirComandas([{ codigo, qrUrl }], { nomeEmpresa, logoUrl: "", chamada, colunas: 3 });
  }

  const totalSel = selecionadas.size;

  return (
    <div className="space-y-5">
      {/* Cabeçalho da aba */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--pp-border)] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-black text-dash-navy">Comandas registradas</h3>
          <p className="mt-0.5 text-sm text-[var(--pp-text-muted)]">
            {comandasRegistradas.length} comanda(s) gerada(s) nesta empresa.
            {totalSel > 0 && <span className="ml-2 font-bold text-[#F38525]">{totalSel} selecionada(s)</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {totalSel > 0 && (
            <button onClick={() => setSelecionadas(new Set())} className="rounded-xl border border-[var(--pp-border)] bg-white px-4 py-2.5 text-sm font-bold text-dash-navy transition hover:bg-[var(--pp-bg)]">✕ Limpar seleção</button>
          )}
          <button onClick={reimprimir} disabled={gerando || filtradas.length === 0} className="btn-laranja inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold disabled:opacity-50 [&>svg]:h-4 [&>svg]:w-4">
            <IconImpressora /> {gerando ? "Gerando…" : `${totalSel > 0 ? `Reimprimir ${totalSel}` : "Reimprimir todas"}`}
          </button>
        </div>
      </div>

      {/* Busca + lista */}
      <div className="rounded-2xl border border-[var(--pp-border)] bg-white p-5">
        <label className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-2.5">
          <span className="text-[var(--pp-text-muted)] [&>svg]:h-4 [&>svg]:w-4"><IconBusca /></span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar comanda pelo código…" className="w-full bg-transparent text-sm text-dash-navy outline-none placeholder:text-[var(--pp-text-muted)]" />
        </label>

        {filtradas.length === 0 && (
          <div className="py-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--pp-bg)] text-[var(--pp-text-muted)] [&>svg]:h-6 [&>svg]:w-6"><IconComanda /></span>
            <p className="mt-3 text-sm text-[var(--pp-text-muted)]">
              {comandasRegistradas.length === 0 ? "Nenhuma comanda registrada. Gere as primeiras na aba Gerar comandas." : "Nenhuma comanda encontrada para esta busca."}
            </p>
          </div>
        )}

        {filtradas.length > 0 && (
          <>
            <div className="mb-3 flex items-center gap-3 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-4 py-2.5">
              <input type="checkbox" checked={selecionadas.size === filtradas.length && filtradas.length > 0} onChange={toggleTodos} className="h-4 w-4 accent-[#F38525]" />
              <span className="text-xs font-bold text-[var(--pp-text-muted)]">{selecionadas.size === filtradas.length ? "Desmarcar todas" : `Selecionar todas (${filtradas.length})`}</span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtradas.map((c) => {
                const sel = selecionadas.has(c.codigo);
                const qr  = qrCache[c.codigo];
                return (
                  <div key={c.codigo} onClick={() => toggleSel(c.codigo)}
                    className={`group cursor-pointer rounded-xl border p-3 transition ${sel ? "border-[#F38525]/60 bg-[#F38525]/[0.06]" : "border-[var(--pp-border)] bg-white hover:bg-[var(--pp-bg)]"}`}>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={sel} onChange={() => toggleSel(c.codigo)} onClick={(e) => e.stopPropagation()} className="h-4 w-4 shrink-0 accent-[#F38525]" />
                      <div className="min-w-0 flex-1">
                        <div className="relative mb-1 inline-block">
                          {qr ? <img src={qr} alt={c.codigo} className={`h-16 w-16 rounded-lg border border-[var(--pp-border)] bg-white p-0.5 ${c.ativo === false ? "opacity-40 grayscale" : ""}`} />
                              : <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] text-[10px] text-[var(--pp-text-muted)]">QR</div>}
                          {c.ativo === false && <span className="absolute -bottom-1 left-0 right-0 rounded-full bg-[var(--pp-text-muted)] px-1 py-0.5 text-center text-[9px] font-black text-white">INATIVA</span>}
                          {temHistorico(c.codigo) && <span title={`${pedidosDaComanda(c.codigo).length} pedido(s)`} className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#F38525] text-[9px] font-black text-[#012E46]">{pedidosDaComanda(c.codigo).length}</span>}
                        </div>
                        <p className={`font-mono text-xs font-black ${c.ativo === false ? "text-[var(--pp-text-muted)] line-through" : "text-dash-navy"}`}>{c.codigo}</p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => reimprimirUma(c.codigo)} title="Reimprimir esta comanda" className="rounded-lg border border-[var(--pp-border)] bg-white p-2 text-[#012E46] transition hover:bg-[var(--pp-bg)] [&>svg]:h-4 [&>svg]:w-4"><IconImpressora /></button>
                        <button onClick={() => setEditando(c)} title="Editar código" className="rounded-lg border border-[var(--pp-border)] bg-white p-2 text-dash-navy transition hover:bg-[var(--pp-bg)] text-xs font-black">✎</button>
                        {onToggle && (
                          <button onClick={() => onToggle(c.codigo, c.ativo === false ? true : false)} title={c.ativo === false ? "Reativar comanda" : "Inativar comanda"}
                            className={`rounded-lg border p-2 text-xs font-black transition ${c.ativo === false ? "border-[#5E8C31]/30 bg-[#5E8C31]/10 text-[#3F6021] hover:bg-[#5E8C31]/20" : "border-[var(--pp-border)] bg-white text-[var(--pp-text-muted)] hover:bg-[var(--pp-bg)]"}`}>
                            {c.ativo === false ? "▶" : "⏸"}
                          </button>
                        )}
                        {onExcluir && (
                          <button onClick={() => temHistorico(c.codigo) ? setBloqueioExcluir(c) : setConfirmExcluir(c)} title={temHistorico(c.codigo) ? "Comanda com histórico — veja opções" : "Excluir comanda"}
                            className="rounded-lg border border-[#DC2626]/25 bg-[#DC2626]/[0.06] p-2 text-[#B91C1C] transition hover:bg-[#DC2626]/12 [&>svg]:h-4 [&>svg]:w-4"><IconLixeira /></button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Modal editar comanda */}
      {editando && (
        <ModalEditarComanda comanda={editando} prefixoLoja={prefixoLoja}
          onSalvar={async (novoCode) => { if (onRenomear) await onRenomear(editando.codigo, novoCode); setEditando(null); }}
          onFechar={() => setEditando(null)} />
      )}

      {/* Confirm excluir (sem histórico) */}
      {confirmExcluir && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(33,24,20,0.4)] p-4 backdrop-blur-sm" onClick={() => setConfirmExcluir(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm space-y-4 rounded-2xl border border-[var(--pp-border)] bg-white p-6 shadow-xl">
            <div>
              <h2 className="text-lg font-black text-dash-navy">Excluir comanda?</h2>
              <p className="mt-1 text-sm text-[var(--pp-text-muted)]">A comanda <span className="font-mono font-black text-dash-navy">{confirmExcluir.codigo}</span> será removida do sistema permanentemente.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmExcluir(null)} className="flex-1 rounded-xl border border-[var(--pp-border)] bg-white py-3 text-sm font-bold text-dash-navy transition hover:bg-[var(--pp-bg)]">Cancelar</button>
              <button onClick={async () => { await onExcluir?.(confirmExcluir.codigo); setConfirmExcluir(null); }} className="flex-[1.5] rounded-xl bg-[#DC2626] py-3 text-sm font-black text-white transition hover:opacity-90">Excluir</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal bloqueio: comanda com histórico */}
      {bloqueioExcluir && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(33,24,20,0.4)] p-4 backdrop-blur-sm" onClick={() => setBloqueioExcluir(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl border border-[#F38525]/30 bg-white shadow-xl">
            <div className="flex items-center gap-3 border-b border-[#F38525]/20 bg-[#F38525]/[0.06] px-6 py-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F38525]/15 text-[#F38525] [&>svg]:h-5 [&>svg]:w-5"><IconComanda /></span>
              <div>
                <h2 className="text-base font-black text-dash-navy">Comanda com histórico de pedidos</h2>
                <p className="text-xs text-[#012E46]">Exclusão bloqueada para preservar as referências</p>
              </div>
            </div>
            <div className="space-y-4 px-6 py-5">
              <p className="text-sm text-dash-navy">
                A comanda <span className="font-mono font-black text-[#F38525]">{bloqueioExcluir.codigo}</span> possui{" "}
                <span className="font-black">{pedidosDaComanda(bloqueioExcluir.codigo).length} pedido(s)</span> registrado(s). Excluí-la quebraria o histórico financeiro e de pedidos.
              </p>
              <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--pp-text-muted)]">Pedidos vinculados</p>
                {pedidosDaComanda(bloqueioExcluir.codigo).slice(0, 10).map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-dash-navy">{o.id}</span>
                    <span className="text-[var(--pp-text-muted)]">{o.table} · {o.createdAt}</span>
                    <span className={`rounded-full px-2 py-0.5 font-black ${o.paymentStatus === "paid" ? "bg-[#5E8C31]/15 text-[#3F6021]" : "bg-[#F38525]/15 text-[#F38525]"}`}>{o.paymentStatus === "paid" ? "Pago" : "Em aberto"}</span>
                  </div>
                ))}
                {pedidosDaComanda(bloqueioExcluir.codigo).length > 10 && <p className="text-center text-xs text-[var(--pp-text-muted)]">+ {pedidosDaComanda(bloqueioExcluir.codigo).length - 10} pedido(s)</p>}
              </div>
              <div className="rounded-xl border border-[#012E46]/20 bg-[#012E46]/[0.05] px-4 py-3">
                <p className="text-xs font-bold text-[#012E46]">Recomendação</p>
                <p className="mt-0.5 text-xs text-dash-navy">Inative a comanda para que ela não aceite novos pedidos, mantendo o histórico intacto. Você pode reativá-la a qualquer momento.</p>
              </div>
            </div>
            <div className="flex gap-2 border-t border-[var(--pp-border)] px-6 py-4">
              <button onClick={() => setBloqueioExcluir(null)} className="flex-1 rounded-xl border border-[var(--pp-border)] bg-white py-3 text-sm font-bold text-dash-navy transition hover:bg-[var(--pp-bg)]">Cancelar</button>
              {onToggle && bloqueioExcluir.ativo !== false && (
                <button onClick={async () => { await onToggle?.(bloqueioExcluir.codigo, false); setBloqueioExcluir(null); }} className="flex-[1.5] rounded-xl bg-[#F38525] py-3 text-sm font-black text-[#012E46] transition hover:opacity-90">⏸ Inativar comanda</button>
              )}
              {onToggle && bloqueioExcluir.ativo === false && (
                <button onClick={async () => { await onToggle?.(bloqueioExcluir.codigo, true); setBloqueioExcluir(null); }} className="flex-[1.5] rounded-xl bg-[#5E8C31] py-3 text-sm font-black text-white transition hover:opacity-90">▶ Reativar comanda</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal: editar código de uma comanda ──────────────────────
function ModalEditarComanda({ comanda, prefixoLoja, onSalvar, onFechar }) {
  const [codigo, setCodigo] = useState(comanda.codigo);
  const [qr, setQr]         = useState("");
  const campo = "w-full rounded-xl border border-[var(--pp-border)] bg-white px-3.5 py-2.5 font-mono text-lg font-black tracking-widest text-dash-navy outline-none transition focus:border-[#F38525]";
  const alterado = codigo.trim().toUpperCase() !== comanda.codigo;
  const valido   = /^[A-Z]{2,5}-\d{1,6}$/.test(codigo.trim().toUpperCase());

  useEffect(() => { const c = codigo.trim().toUpperCase(); if (c) gerarQR(c).then(setQr); }, [codigo]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(33,24,20,0.4)] p-4 backdrop-blur-sm" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-[var(--pp-border)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--pp-border)] px-6 py-4">
          <h2 className="text-lg font-black text-dash-navy">Editar comanda</h2>
          <button onClick={onFechar} className="rounded-lg border border-[var(--pp-border)] bg-white px-3 py-1.5 text-sm font-bold text-dash-navy hover:bg-[var(--pp-bg)]">✕</button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-[var(--pp-text-muted)]">Código atual</p>
            <p className="font-mono text-base font-black text-[var(--pp-text-muted)]">{comanda.codigo}</p>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-[var(--pp-text-muted)]">Novo código *</p>
            <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder={`Ex.: ${prefixoLoja}-000001`} className={campo} />
            {!valido && codigo.trim() && <p className="mt-1 text-xs text-[#F38525]">Formato: PREFIXO-NNNNNN (ex.: {prefixoLoja}-000001)</p>}
          </div>
          {qr && valido && (
            <div className="flex items-center gap-4 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-3">
              <img src={qr} alt={codigo} className="h-20 w-20 shrink-0 rounded-lg border border-[var(--pp-border)] bg-white p-1" />
              <div>
                <p className="text-xs text-[var(--pp-text-muted)]">Novo QR Code</p>
                <p className="font-mono text-sm font-black text-dash-navy">{codigo.trim().toUpperCase()}</p>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3 border-t border-[var(--pp-border)] px-6 py-4">
          <button onClick={onFechar} className="flex-1 rounded-xl border border-[var(--pp-border)] bg-white py-3 text-sm font-bold text-dash-navy transition hover:bg-[var(--pp-bg)]">Cancelar</button>
          <button onClick={() => onSalvar(codigo.trim().toUpperCase())} disabled={!valido || !alterado} className="btn-laranja flex-[2] rounded-xl py-3 text-sm font-bold disabled:opacity-50">Salvar novo código</button>
        </div>
      </div>
    </div>
  );
}

// ── Impressão (reutilizada pelas duas abas) ──────────────────
function imprimirComandas(comandas, opts = {}) {
  if (comandas.length === 0) return;
  const { nomeEmpresa = "Restaurante", logoUrl = "", chamada = "", colunas = 3, tamanho = "a4", instrucao = false, layout = "padrao" } = opts;
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const termica = tamanho !== "a4";
  const larguraMm = termica ? (TAMANHOS.find((t) => t.id === tamanho)?.w || 58) : 0;
  const cols = termica ? 1 : colunas;
  const pad = layout === "compacto" ? 8 : 14;
  const logoTag = logoUrl ? `<img class="logo" src="${logoUrl}" alt="logo" />` : "";
  const instrTag = instrucao ? `<div class="instr">1. Aponte a câmera no QR · 2. Peça pelo cardápio · 3. Envie</div>` : "";
  const cards = comandas.map(({ codigo, qrUrl }) => `
    <div class="card">
      <div class="top">${logoTag}<div class="emp">${esc(nomeEmpresa) || "Restaurante"}</div><div class="tag">Comanda do cliente</div></div>
      <img class="qr" src="${qrUrl}" alt="${esc(codigo)}" />
      <div class="num">${esc(codigo)}</div>
      ${chamada ? `<div class="cta">${esc(chamada)}</div>` : ""}
      ${instrTag}
    </div>`).join("");
  const pageCss = termica ? `@page{size:${larguraMm}mm auto;margin:4mm}` : `@page{size:A4;margin:8mm}`;
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>Comandas — ${esc(nomeEmpresa)}</title>
  <style>
    ${pageCss}*{box-sizing:border-box;margin:0;padding:0}
    body{background:#fff;font-family:'Segoe UI',Arial,sans-serif;color:#012E46}
    .grade{display:grid;grid-template-columns:repeat(${cols},1fr);gap:${layout === "compacto" ? 6 : 8}px}
    .card{position:relative;border:1.5px dashed #cbd5e1;border-radius:14px;padding:${pad}px 10px ${pad - 2}px;display:flex;flex-direction:column;align-items:center;text-align:center;break-inside:avoid;page-break-inside:avoid;overflow:hidden}
    .card::before{content:"";position:absolute;top:0;left:0;right:0;height:6px;background:#012E46}
    .top{display:flex;flex-direction:column;align-items:center;margin-top:4px}
    .logo{width:44px;height:44px;object-fit:contain;border-radius:10px;margin-bottom:4px}
    .emp{font-size:15px;font-weight:800;letter-spacing:.3px;line-height:1.1;color:#2D3436}
    .tag{font-size:8px;color:#8A7D73;text-transform:uppercase;letter-spacing:2.5px;margin-top:2px}
    .qr{width:${termica ? 130 : 150}px;height:${termica ? 130 : 150}px;margin:8px 0 6px}
    .num{font-family:'Inter', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;font-size:18px;font-weight:800;letter-spacing:3px;color:#2D3436}
    .cta{font-size:9.5px;color:#5b6b6f;margin-top:5px}
    .instr{margin-top:6px;font-size:8px;color:#8A7D73;line-height:1.3}
  </style></head><body>
  <div class="grade">${cards}</div>
  <script>window.onload=function(){setTimeout(function(){window.print();},250)}<\/script>
  </body></html>`;
  const j = window.open("", "_blank");
  if (!j) return;
  j.document.write(html);
  j.document.close();
}
