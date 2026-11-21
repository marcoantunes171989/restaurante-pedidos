import { useCallback, useEffect, useMemo, useState } from "react";
import { listarDocumentosFiscais } from "../../../lib/fiscal/notasFiscais";
import { buscarConfigFiscalVenda, buscarEmitenteFiscal, configVendaParaSelo } from "../../../lib/fiscal/fiscalApi";
import { emitirNotaDaVenda } from "../../../lib/fiscal/emissaoPdv";
import { conferirPagamentos, dadosDaEmissao, pagamentoSugerido, taxaSugeridaDasVendas, totaisDaEmissao, vendasSemNota } from "../../../lib/fiscal/vendasSemNota";
import { lerConfigTaxaServico } from "../../../pages/pdv/pdvHelpers";

// Tela "Vendas sem nota": pedidos JÁ PAGOS da loja que não aparecem em nenhuma nota fiscal (a emissão pelo caixa foi interrompida, a loja só
// passou a emitir depois…). O operador escolhe a venda, confere taxa de serviço, desconto e forma de pagamento e emite a NFC-e. Emitir de novo
// nunca duplica: a chave de idempotência vem dos pedidos, e pedido que já tem nota (qualquer situação) nem aparece aqui.
const botao = "inline-flex min-h-9 items-center justify-center rounded-xl bg-[#012E46] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45";
const botaoLeve = "inline-flex min-h-9 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--pp-text-body)] transition hover:border-[#012E46] disabled:opacity-45";
const campo = "min-h-9 w-full rounded-xl border border-[var(--pp-border)] bg-white px-3 text-[13px] text-[var(--pp-text)] outline-none focus:border-[#012E46]";
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const num = (t) => Number(String(t ?? "").replace(/\./g, "").replace(",", ".")) || 0;
const PERIODOS = [{ dias: 1, rotulo: "Hoje" }, { dias: 7, rotulo: "7 dias" }, { dias: 30, rotulo: "30 dias" }, { dias: 90, rotulo: "90 dias" }];

function PainelEmissao({ selecionadas, formas, cfgTaxa, ocupado, resultado, onEmitir, onFechar }) {
  const subtotal = useMemo(() => Math.round(selecionadas.reduce((s, v) => s + Math.round(v.subtotal * 100), 0)) / 100, [selecionadas]);
  const [taxa, setTaxa] = useState(() => String(taxaSugeridaDasVendas(selecionadas, cfgTaxa)).replace(".", ","));
  const [desconto, setDesconto] = useState("0");
  const [cpf, setCpf] = useState("");
  const inicial = pagamentoSugerido(selecionadas, formas);
  const [linhas, setLinhas] = useState(() => [{ forma: inicial, valor: "" }]);
  const t = totaisDaEmissao({ subtotal, taxa: num(taxa), desconto: num(desconto) });
  // Uma forma só: o valor acompanha o total até a pessoa mexer. Várias formas: cada linha leva o seu valor.
  const linhasEf = linhas.length === 1 ? [{ ...linhas[0], valor: linhas[0].valor === "" ? t.total : num(linhas[0].valor) }] : linhas.map((l) => ({ ...l, valor: num(l.valor) }));
  const conf = conferirPagamentos(t.total, linhasEf);
  const pode = !ocupado && conf.ok && t.total > 0;
  const mudar = (i, k, v) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return (
    <div className="mt-3 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-3" data-testid="painel-emissao-venda">
      <p className="text-[13px] font-bold text-[var(--pp-text)]">Emitir a NFC-e de {selecionadas.length} pedido(s) · subtotal {brl(subtotal)}</p>
      <p className="text-[12px] text-[var(--pp-text-muted)]">Confira o que foi cobrado de verdade no caixa: a nota precisa ter o mesmo valor e as mesmas formas de pagamento.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">Taxa de serviço (R$)
          <input className={`${campo} mt-0.5`} inputMode="decimal" value={taxa} onChange={(e) => setTaxa(e.target.value)} data-testid="campo-taxa" /></label>
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">Desconto (R$)
          <input className={`${campo} mt-0.5`} inputMode="decimal" value={desconto} onChange={(e) => setDesconto(e.target.value)} data-testid="campo-desconto" /></label>
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">CPF/CNPJ na nota (opcional)
          <input className={`${campo} mt-0.5`} inputMode="numeric" value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="Só números" /></label>
      </div>
      <p className="mt-2 text-[13px] font-bold text-[var(--pp-text)]" data-testid="total-nota">Total da nota: {brl(t.total)}</p>
      <div className="mt-2 space-y-1.5">
        {linhas.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_120px_auto] gap-2">
            <select className={campo} value={l.forma} onChange={(e) => mudar(i, "forma", e.target.value)} aria-label={`Forma de pagamento ${i + 1}`} data-testid={`forma-${i}`}>
              <option value="">Forma de pagamento…</option>
              {formas.map((f) => <option key={f.id ?? f.nome} value={f.nome}>{f.nome}</option>)}
            </select>
            <input className={campo} inputMode="decimal" value={linhas.length === 1 && l.valor === "" ? String(t.total).replace(".", ",") : l.valor} onChange={(e) => mudar(i, "valor", e.target.value)} aria-label={`Valor ${i + 1}`} />
            {linhas.length > 1 ? <button type="button" className={botaoLeve} onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}>Remover</button> : <span />}
          </div>
        ))}
        <button type="button" className={botaoLeve} onClick={() => setLinhas((ls) => [...ls.map((l, i) => (i === 0 && l.valor === "" ? { ...l, valor: String(t.total).replace(".", ",") } : l)), { forma: "", valor: "" }])}>+ Outra forma de pagamento</button>
      </div>
      {!conf.ok && <p className="mt-1 text-[12px] font-semibold text-[#B45309]" data-testid="aviso-pagamento">{conf.semForma ? "Escolha a forma de pagamento." : conf.diferenca > 0 ? `Faltam ${brl(conf.diferenca)} para fechar o total.` : conf.diferenca < 0 ? `Passou ${brl(-conf.diferenca)} do total.` : "Informe o pagamento."}</p>}
      {resultado && <p role="status" className={`mt-2 text-[12px] font-semibold ${resultado.ok ? "text-[#1F7A3D]" : "text-[#C81E4A]"}`} data-testid="resultado-emissao">{resultado.texto}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={botao} disabled={!pode} onClick={() => onEmitir({ taxa: num(taxa), desconto: num(desconto), cpf, linhas: linhasEf })} data-testid="btn-emitir-venda">{ocupado ? "Emitindo…" : "Emitir NFC-e"}</button>
        <button type="button" className={botaoLeve} disabled={ocupado} onClick={onFechar}>Fechar</button>
      </div>
    </div>
  );
}

export default function VendasSemNotaFiscal({ supabase, lojaInfo, orders = [], produtos = [], formasPagamento = [], ctxFiscal = {} }) {
  const lojaId = lojaInfo?.id ?? null;
  const [dias, setDias] = useState(7);
  const [docs, setDocs] = useState({ carregando: true, lista: [], erro: "" });
  const [fiscal, setFiscal] = useState({ emitente: null, config: null });
  const [sel, setSel] = useState(() => new Set());
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [recarga, setRecarga] = useState(0);
  const [base, setBase] = useState(() => Date.now()); // "agora" do período: só muda ao recarregar a lista
  const cfgTaxa = useMemo(() => lerConfigTaxaServico(lojaId), [lojaId]);
  const formas = useMemo(() => formasPagamento.filter((f) => f.active !== false && (f.lojaId == null || Number(f.lojaId) === Number(lojaId))), [formasPagamento, lojaId]);

  useEffect(() => {
    let vivo = true;
    listarDocumentosFiscais(supabase, lojaId, { limite: 200 })
      .then((lista) => { if (vivo) { setDocs({ carregando: false, lista, erro: "" }); setBase(Date.now()); } })
      .catch((e) => { if (vivo) setDocs({ carregando: false, lista: [], erro: e.message }); });
    return () => { vivo = false; };
  }, [supabase, lojaId, recarga]);
  useEffect(() => {
    let vivo = true;
    Promise.all([buscarEmitenteFiscal(supabase, lojaId), buscarConfigFiscalVenda(supabase, lojaId)])
      .then(([emitente, c]) => { if (vivo) setFiscal({ emitente, config: configVendaParaSelo(c) }); })
      .catch(() => { if (vivo) setFiscal({ emitente: null, config: null }); });
    return () => { vivo = false; };
  }, [supabase, lojaId]);

  const desde = useMemo(() => new Date(base - dias * 24 * 3600 * 1000), [base, dias]);
  const vendas = useMemo(() => vendasSemNota({ orders, documentos: docs.lista, lojaId, desde }), [orders, docs.lista, lojaId, desde]);
  const selecionadas = useMemo(() => vendas.filter((v) => sel.has(v.id)), [vendas, sel]);
  const alternar = (id) => { setResultado(null); setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };

  const emitir = useCallback(async ({ taxa, desconto, cpf, linhas }) => {
    setOcupado(true); setResultado(null);
    try {
      const d = dadosDaEmissao({ selecionadas, taxa, desconto, linhas });
      const n = await emitirNotaDaVenda({
        supabase, emitente: fiscal.emitente, pedidos: d.pedidos, produtos, composicao: d.composicao, pagamento: d.pagamento,
        formas: formasPagamento, config: fiscal.config || {}, ctxFiscal, modelo: 65, cpf, tentativa: Math.max(0, ...selecionadas.map((v) => v.tentativa || 0)),
      });
      const existe = !!n.documentoId || ["autorizada", "contingencia"].includes(n.estado);
      setResultado({ ok: n.estado === "autorizada" || n.estado === "contingencia", texto: [n.titulo, n.detalhe].filter(Boolean).join(": ") + (existe && n.estado !== "autorizada" ? " A nota está em Notas emitidas." : "") });
      if (existe) { setSel(new Set()); setAberto(false); setRecarga((r) => r + 1); }
    } catch {
      setResultado({ ok: false, texto: "Não foi possível emitir agora. Tente de novo." });
    } finally { setOcupado(false); }
  }, [selecionadas, supabase, fiscal, produtos, formasPagamento, ctxFiscal]);

  const emissaoLigada = fiscal.emitente?.nfceHabilitada === true && ["homologacao", "producao"].includes(fiscal.emitente?.nfceAmbiente);

  return (
    <section className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5" aria-labelledby="vsn-titulo" data-testid="vendas-sem-nota-tela">
      <h2 id="vsn-titulo" className="text-[15px] font-black text-[var(--pp-text)]">Vendas pagas sem nota fiscal</h2>
      <p className="mt-0.5 text-[12px] text-[var(--pp-text-muted)]">Pedidos já pagos que não têm nenhuma nota. Escolha a venda, confira o valor cobrado e emita a NFC-e. Pedido que já tem nota (mesmo rejeitada) não aparece: resolva em Notas emitidas.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-xl border border-[var(--pp-border)]" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button key={p.dias} type="button" aria-pressed={dias === p.dias} onClick={() => { setDias(p.dias); setSel(new Set()); }}
              className={`px-3 py-1.5 text-[12px] font-semibold ${dias === p.dias ? "bg-[#012E46] text-white" : "bg-white text-[var(--pp-text-body)]"}`}>{p.rotulo}</button>
          ))}
        </div>
        <button type="button" className={botaoLeve} onClick={() => setRecarga((r) => r + 1)}>Atualizar</button>
      </div>

      {docs.erro && <p className="mt-2 text-[12px] font-semibold text-[#C81E4A]" data-testid="vsn-erro">{docs.erro}</p>}
      {!docs.carregando && !emissaoLigada && <p className="mt-2 text-[12px] font-semibold text-[#B45309]" data-testid="vsn-sem-emissao">A emissão de NFC-e desta empresa não está ligada (Fiscal › Dados da Empresa / Emissão). Ligue antes de emitir.</p>}
      {docs.carregando && <p className="mt-2 text-[12px] text-[var(--pp-text-muted)]">Conferindo quais vendas já têm nota…</p>}

      {!docs.carregando && !docs.erro && vendas.length === 0 && <p className="mt-3 rounded-xl border border-dashed border-[var(--pp-border)] p-4 text-center text-[13px] text-[var(--pp-text-muted)]" data-testid="vsn-vazio">Nenhuma venda paga sem nota neste período.</p>}

      {vendas.length > 0 && (
        <ul className="mt-3 divide-y divide-[var(--pp-border)] rounded-xl border border-[var(--pp-border)]" data-testid="vsn-lista">
          {vendas.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <input type="checkbox" checked={sel.has(v.id)} onChange={() => alternar(v.id)} aria-label={`Selecionar ${v.id}`} className="h-4 w-4" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-[var(--pp-text)]">{v.mesa || "Pedido"} {v.comanda ? `· ${v.comanda}` : ""} <span className="font-normal text-[var(--pp-text-muted)]">· {v.id}</span>{v.tentativa > 0 && <span className="ml-1 rounded-md bg-[#FEF3E2] px-1.5 py-0.5 text-[10px] font-bold text-[#8A5200]">número anterior descartado</span>}</p>
                <p className="text-[12px] text-[var(--pp-text-muted)]">{dataHora(v.quando)} · {v.itens} item(ns){v.forma ? ` · pago em ${v.forma}` : ""}</p>
              </div>
              <span className="text-[13px] font-bold tabular-nums text-[var(--pp-text)]">{brl(v.subtotal)}</span>
            </li>
          ))}
        </ul>
      )}

      {vendas.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className={botao} disabled={!selecionadas.length || !emissaoLigada || aberto} onClick={() => { setAberto(true); setResultado(null); }} data-testid="btn-abrir-emissao">
            {selecionadas.length > 1 ? `Emitir uma nota para as ${selecionadas.length} vendas` : "Emitir nota da venda selecionada"}
          </button>
          <span className="text-[12px] text-[var(--pp-text-muted)]">Selecione mais de uma só se foram pagas juntas, na mesma conta.</span>
        </div>
      )}

      {aberto && selecionadas.length > 0 && (
        <PainelEmissao key={selecionadas.map((v) => v.id).join("|")} selecionadas={selecionadas} formas={formas} cfgTaxa={cfgTaxa} ocupado={ocupado} resultado={resultado} onEmitir={emitir} onFechar={() => setAberto(false)} />
      )}
      {!aberto && resultado && <p role="status" className={`mt-2 text-[12px] font-semibold ${resultado.ok ? "text-[#1F7A3D]" : "text-[#C81E4A]"}`} data-testid="resultado-emissao">{resultado.texto}</p>}
    </section>
  );
}
