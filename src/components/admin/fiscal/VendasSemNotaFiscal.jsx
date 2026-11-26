import { useCallback, useEffect, useMemo, useState } from "react";
import { listarDocumentosFiscais } from "../../../lib/fiscal/notasFiscais";
import { buscarConfigFiscalVenda, buscarEmitenteFiscal, configVendaParaSelo } from "../../../lib/fiscal/fiscalApi";
import { emitirNotaDaVenda, dadosDaNotaNoCaixa, tipoDaNota, ambienteNfceDaLoja, ambienteNfeDaLoja, postarApiFiscal, NOTA_VAZIA } from "../../../lib/fiscal/emissaoPdv";
import { imprimirNotaFiscal } from "../../../lib/fiscal/imprimirNota";
import { listarVendasCaixa, vendasDoBalcao, ROTULO_TIPO } from "../../../lib/fiscal/vendaCaixa";
import { normalizarEntregaNfce } from "../../../lib/fiscal/entregaNfce";
import { useEnderecoDoPedido } from "../../../hooks/useEnderecoDoPedido";
import PdvNotaFiscalCampos from "../../../pages/pdv/PdvNotaFiscalCampos";
import CupomVendaBalcao, { dadosDoCupom } from "./CupomVendaBalcao";

// Tela "Venda Balcão": vendas JÁ PAGAS que ainda não têm nota fiscal. A venda é consultada (cupom) e transformada em NFC-e ou NF-e
// com os MESMOS itens, valores e formas de pagamento do caixa: nada disso é editável aqui. Emitir de novo nunca duplica (a chave de
// idempotência vem dos pedidos) e venda que já tem nota (qualquer situação) nem aparece.
const botao = "inline-flex min-h-11 items-center justify-center rounded-xl bg-[#012E46] px-4 py-2 text-[13px] font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45";
const botaoLeve = "inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-white px-3 py-2 text-[13px] font-semibold text-[var(--pp-text-body)] transition hover:border-[#012E46] disabled:opacity-45";
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const PERIODOS = [{ dias: 1, rotulo: "Hoje" }, { dias: 7, rotulo: "7 dias" }, { dias: 30, rotulo: "30 dias" }, { dias: 90, rotulo: "90 dias" }];

// Aqui a nota não imprime sozinha: o texto dos botões é diferente do do caixa.
const AJUDAS_DA_TELA = {
  nfce: "Cupom fiscal do consumidor. Depois de autorizada, toque em Imprimir nota fiscal.",
  nfe: "Nota para empresa (CNPJ e endereço). Depois de autorizada, toque em Imprimir nota fiscal.",
};

function PainelNota({ venda, supabase, nfceDisponivel, nfeDisponivel, entregaConfig, ufEmitente, ocupado, onEmitir }) {
  const entregaDisponivel = nfceDisponivel && normalizarEntregaNfce(entregaConfig).ativo;
  const [nota, setNota] = useState(() => ({ ...NOTA_VAZIA, nfe: nfeDisponivel && (venda.tipo === "nfe" || !nfceDisponivel) }));
  const [erro, setErro] = useState("");
  const endereco = useEnderecoDoPedido(supabase, venda.pedidos);
  const tipo = tipoDaNota(nota, { nfceDisponivel, nfeDisponivel });
  const resumo = dadosDoCupom(venda);

  const emitir = () => {
    const d = dadosDaNotaNoCaixa(nota, { nfceDisponivel, nfeDisponivel, entregaDisponivel, ufEmitente });
    if (!d.ok) { setErro(d.erro); return; }
    if (d.balcao) { setErro("Escolha NFC-e ou NF-e."); return; }
    setErro("");
    onEmitir(venda, d);
  };

  return (
    <div className="mt-2 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-3" data-testid="painel-emissao-venda">
      <p className="text-[13px] font-bold text-[var(--pp-text)]" data-testid="total-nota">Total da nota: {brl(venda.total)}</p>
      <p className="text-[12px] text-[var(--pp-text-body)]" data-testid="pagamento-travado">
        Pago em: {resumo.pagamentos.map((p) => `${p.forma} ${brl(p.valor)}`).join(" + ")}{resumo.troco > 0 ? ` · troco ${brl(resumo.troco)}` : ""}
      </p>
      <p className="text-[11px] text-[var(--pp-text-muted)]">Itens, valores e forma de pagamento são os do caixa e não podem ser alterados aqui.</p>
      <PdvNotaFiscalCampos valor={nota} onChange={(v) => { setNota(v); setErro(""); }} permiteBalcao={false} ajudas={AJUDAS_DA_TELA} nfceDisponivel={nfceDisponivel} nfeDisponivel={nfeDisponivel}
        entregaDisponivel={entregaDisponivel} entregaConfig={entregaConfig} pedidoDeEntrega={/entreg/i.test(venda.mesa || "")}
        pedidoComEndereco={endereco ? { endereco, cliente: "" } : null} />
      {erro && <p role="alert" className="mt-2 text-[12px] font-semibold text-[#C81E4A]" data-testid="erro-nota">{erro}</p>}
      <button type="button" className={`${botao} mt-3 w-full sm:w-auto`} disabled={ocupado || (tipo !== "nfce" && tipo !== "nfe")} onClick={emitir} data-testid="btn-emitir-venda">
        {ocupado ? "Emitindo…" : tipo === "nfe" ? "Emitir NF-e" : "Emitir NFC-e"}
      </button>
    </div>
  );
}

export default function VendasSemNotaFiscal({ supabase, lojaInfo, orders = [], produtos = [], formasPagamento = [], ctxFiscal = {} }) {
  const lojaId = lojaInfo?.id ?? null;
  const [dias, setDias] = useState(7);
  const [dados, setDados] = useState({ carregando: true, documentos: [], registros: [], erro: "", avisoRegistro: "" });
  const [fiscal, setFiscal] = useState({ carregando: true, emitente: null, config: null });
  const [abertaId, setAbertaId] = useState(null);
  const [cupom, setCupom] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [recarga, setRecarga] = useState(0);
  const [base, setBase] = useState(() => Date.now()); // "agora" do período: só muda ao recarregar a lista

  useEffect(() => {
    let vivo = true;
    Promise.all([listarDocumentosFiscais(supabase, lojaId, { limite: 200 }), listarVendasCaixa(supabase, lojaId)])
      .then(([documentos, reg]) => { if (vivo) { setDados({ carregando: false, documentos, registros: reg.vendas, erro: "", avisoRegistro: reg.ok ? "" : reg.erro }); setBase(Date.now()); } })
      .catch((e) => { if (vivo) setDados({ carregando: false, documentos: [], registros: [], erro: e.message, avisoRegistro: "" }); });
    return () => { vivo = false; };
  }, [supabase, lojaId, recarga]);
  useEffect(() => {
    let vivo = true;
    Promise.all([buscarEmitenteFiscal(supabase, lojaId), buscarConfigFiscalVenda(supabase, lojaId)])
      .then(([emitente, c]) => { if (vivo) setFiscal({ carregando: false, emitente, config: configVendaParaSelo(c) }); })
      .catch(() => { if (vivo) setFiscal({ carregando: false, emitente: null, config: null }); });
    return () => { vivo = false; };
  }, [supabase, lojaId]);

  const desde = useMemo(() => new Date(base - dias * 24 * 3600 * 1000), [base, dias]);
  const vendas = useMemo(() => vendasDoBalcao({ registros: dados.registros, orders, documentos: dados.documentos, lojaId, desde }), [dados.registros, orders, dados.documentos, lojaId, desde]);
  const nfceDisponivel = !!ambienteNfceDaLoja(fiscal.emitente);
  const nfeDisponivel = !!ambienteNfeDaLoja(fiscal.emitente);
  const emissaoLigada = nfceDisponivel || nfeDisponivel;

  const emitir = useCallback(async (venda, nota) => {
    setOcupado(true); setResultado(null);
    try {
      const n = await emitirNotaDaVenda({
        supabase, emitente: fiscal.emitente, pedidos: venda.pedidos, produtos, composicao: venda.composicao, pagamento: venda.pagamento,
        formas: formasPagamento, config: fiscal.config || {}, ctxFiscal, modelo: nota.modelo, cpf: nota.cpf, destinatario: nota.destinatario,
        entrega: nota.entrega, entregaOpcoes: nota.entregaOpcoes, tentativa: venda.tentativa || 0,
      });
      const ok = ["autorizada", "contingencia"].includes(n.estado);
      const existe = !!n.documentoId || ok;
      if (n.estado === "fora") setResultado({ ok: false, texto: "A emissão de notas está desligada neste ambiente." });
      else setResultado({ ok, documentoId: ok ? n.documentoId : null, texto: [n.titulo, n.detalhe].filter(Boolean).join(": ") + (existe && n.estado !== "autorizada" ? " A nota está em Notas emitidas." : "") });
      if (existe) { setAbertaId(null); setRecarga((r) => r + 1); }
    } catch {
      setResultado({ ok: false, texto: "Não foi possível emitir agora. Tente de novo." });
    } finally { setOcupado(false); }
  }, [supabase, fiscal, produtos, formasPagamento, ctxFiscal]);

  const imprimir = async () => {
    const r = await imprimirNotaFiscal({ documentoId: resultado.documentoId, buscar: (corpo) => postarApiFiscal(supabase, corpo) });
    if (!r.ok) setResultado((x) => ({ ...x, texto: r.erro }));
  };

  return (
    <section className="pdv-toque rounded-2xl border border-[var(--pp-border)] bg-white p-3 sm:p-5" aria-labelledby="vsn-titulo" data-testid="vendas-sem-nota-tela">
      <h2 id="vsn-titulo" className="text-[15px] font-black text-[var(--pp-text)]">Vendas pagas sem nota fiscal</h2>
      <p className="mt-0.5 text-[12px] text-[var(--pp-text-muted)]">Consulte o cupom e transforme a venda em NFC-e ou NF-e. Para não emitir, não faça nada. Venda que já tem nota (mesmo rejeitada) não aparece: resolva em Notas emitidas.</p>
      <p className="mt-1 text-[12px] font-semibold text-[#8A5200]">Venda Balcão não é documento fiscal. A lei exige a nota na venda: confirme com o contador antes de deixar uma venda sem emitir.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-xl border border-[var(--pp-border)]" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button key={p.dias} type="button" aria-pressed={dias === p.dias} onClick={() => { setDias(p.dias); setAbertaId(null); }}
              className={`min-h-11 whitespace-nowrap px-3 text-[12px] font-semibold ${dias === p.dias ? "bg-[#012E46] text-white" : "bg-white text-[var(--pp-text-body)]"}`}>{p.rotulo}</button>
          ))}
        </div>
        <button type="button" className={botaoLeve} onClick={() => setRecarga((r) => r + 1)}>Atualizar</button>
      </div>

      {dados.erro && <p className="mt-2 text-[12px] font-semibold text-[#C81E4A]" data-testid="vsn-erro">{dados.erro}</p>}
      {dados.avisoRegistro && <p className="mt-2 text-[12px] font-semibold text-[#B45309]" data-testid="vsn-sem-registro">{dados.avisoRegistro}</p>}
      {!dados.carregando && !fiscal.carregando && !emissaoLigada && <p className="mt-2 text-[12px] font-semibold text-[#B45309]" data-testid="vsn-sem-emissao">A emissão de NFC-e e de NF-e desta empresa não está ligada (Configurações › Dados da Empresa / Emissão). Ligue antes de emitir.</p>}
      {dados.carregando && <p className="mt-2 text-[12px] text-[var(--pp-text-muted)]">Conferindo quais vendas já têm nota…</p>}
      {resultado && (
        <div role="status" className={`mt-2 flex flex-wrap items-center gap-2 text-[13px] font-semibold ${resultado.ok ? "text-[#1F7A3D]" : "text-[#C81E4A]"}`}>
          <span data-testid="resultado-emissao">{resultado.texto}</span>
          {resultado.documentoId && <button type="button" className={botaoLeve} onClick={imprimir} data-testid="btn-imprimir-nota">Imprimir nota fiscal</button>}
        </div>
      )}

      {!dados.carregando && !dados.erro && vendas.length === 0 && <p className="mt-3 rounded-xl border border-dashed border-[var(--pp-border)] p-4 text-center text-[13px] text-[var(--pp-text-muted)]" data-testid="vsn-vazio">Nenhuma venda paga sem nota neste período.</p>}

      {vendas.length > 0 && (
        <ul className="mt-3 space-y-2" data-testid="vsn-lista">
          {vendas.map((v) => {
            const aberta = abertaId === v.id;
            return (
              <li key={v.id} className="rounded-xl border border-[var(--pp-border)] p-3" data-testid="venda-balcao">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1 basis-52">
                    <p className="text-[13px] font-bold text-[var(--pp-text)]">{v.mesa || "Pedido"}{v.comandas.length ? ` · ${v.comandas.join(", ")}` : ""}
                      {v.tipo && <span className="ml-1 rounded-md bg-[var(--pp-bg)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--pp-text-body)]">{v.tipo === "balcao" ? ROTULO_TIPO.balcao : `${ROTULO_TIPO[v.tipo]} não emitida`}</span>}
                      {v.tentativa > 0 && <span className="ml-1 rounded-md bg-[#FEF3E2] px-1.5 py-0.5 text-[10px] font-bold text-[#8A5200]">número anterior descartado</span>}</p>
                    <p className="break-words text-[12px] text-[var(--pp-text-muted)]">{dataHora(v.quando)} · {v.itens} item(ns) · {v.pedidosIds.join(", ")}</p>
                  </div>
                  <span className="text-[14px] font-black tabular-nums text-[var(--pp-text)]">{brl(v.total)}</span>
                  <div className="flex w-full gap-2 sm:w-auto">
                    <button type="button" className={`${botaoLeve} flex-1 sm:flex-none`} onClick={() => setCupom(v)} data-testid="btn-cupom">Cupom fiscal</button>
                    {v.registrada && (
                      <button type="button" className={`${botao} flex-1 sm:flex-none`} disabled={!emissaoLigada || ocupado} aria-expanded={aberta}
                        onClick={() => { setAbertaId(aberta ? null : v.id); setResultado(null); }} data-testid="btn-abrir-emissao">{aberta ? "Fechar" : "Emitir nota"}</button>
                    )}
                  </div>
                </div>
                {!v.registrada && <p className="mt-1.5 text-[12px] text-[#8A5200]" data-testid="venda-sem-registro">Venda sem o registro do fechamento (anterior a esta versão ou não guardada): sem os valores cobrados, não é possível emitir a nota por aqui.</p>}
                {aberta && (
                  <PainelNota venda={v} supabase={supabase} nfceDisponivel={nfceDisponivel} nfeDisponivel={nfeDisponivel} entregaConfig={fiscal.config?.entregaNfce}
                    ufEmitente={fiscal.emitente?.uf} ocupado={ocupado} onEmitir={emitir} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {cupom && <CupomVendaBalcao venda={cupom} lojaInfo={lojaInfo} emitente={fiscal.emitente} onFechar={() => setCupom(null)} />}
    </section>
  );
}
