import { useCallback, useEffect, useMemo, useState } from "react";
import DetalhesNotaFiscal from "./DetalhesNotaFiscal";
import XmlDaNota from "./XmlDaNota";
import ChaveAcessoNota from "./ChaveAcessoNota";
import ManutencaoFiscal from "./ManutencaoFiscal";
import { podeManutencao } from "../../../lib/fiscal/manutencaoCampos";
import { nfceForaDoPrazo } from "../../../lib/fiscal/prazoCancelamento";
import { baixarXml, buscarXmlDaNota, nomeArquivoXml } from "../../../lib/fiscal/xmlNota";
import { FILTROS_NOTAS, AMBIENTES_NOTAS, POR_PAGINA_NOTAS, filtrarNotas, filtrarPorAmbiente, paginarNotas, situacaoDaNota, acoesDaNota, validarTextoEvento, listarDocumentosFiscais, pedirEventoFiscal, resumoContingencia, textoPrazo, buscarVendaDaNota, refazerNota, inutilizarNota } from "../../../lib/fiscal/notasFiscais";
import { refazerFiscalDaVenda } from "../../../lib/fiscal/vendaFiscal";
import { emitirReservada } from "../../../lib/fiscal/emissaoPdv";
import { imprimirNotaFiscal } from "../../../lib/fiscal/imprimirNota";
import { postarApiFiscal } from "../../../lib/fiscal/emissaoPdv";

// ════════════════════════════════════════════════════════════
//  Aba "Notas emitidas" (Etapa E6): lista as notas da loja e permite
//  cancelar (NF-e/NFC-e) ou corrigir (CC-e, NF-e). O pedido vai ao servidor,
//  que assina e envia à SEFAZ; a confirmação acontece na própria tela.
//  E7: aviso das notas em contingência (prazo), "Enviar agora" e
//  "Consultar na SEFAZ" para a nota que ficou sem resposta.
// ════════════════════════════════════════════════════════════

const botao = "inline-flex min-h-9 items-center justify-center rounded-xl bg-[#012E46] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45";
const botaoLeve = "inline-flex min-h-9 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--pp-text-body)] transition hover:border-[#012E46]";
const TOM = {
  ok: "bg-[#E8F5EC] text-[#1F7A3D]", erro: "bg-[#FDECEF] text-[#C81E4A]",
  alerta: "bg-[#FEF3E2] text-[#B45309]", neutro: "bg-[var(--pp-bg)] text-[var(--pp-text-body)]",
};
const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

function PainelEvento({ nota, acao, onFechar, onConcluido, supabase }) {
  const [texto, setTexto] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const cancelar = acao === "cancelar";
  const erroTexto = validarTextoEvento(acao, texto);
  const max = cancelar ? 255 : 1000;
  const numero = `${nota.modelo === 65 ? "NFC-e" : "NF-e"} nº ${nota.numero} (série ${nota.serie})`;

  async function enviar() {
    setEnviando(true);
    try {
      const corpo = cancelar ? { acao: "cancelar", documentoId: nota.id, xJust: texto } : { acao: "cce", documentoId: nota.id, xCorrecao: texto };
      const r = await pedirEventoFiscal(supabase, corpo);
      setResultado({ ok: true, texto: cancelar ? `Nota cancelada na SEFAZ. Protocolo ${r.protocolo}.` : `Correção registrada na SEFAZ (carta nº ${r.nSeq}). Protocolo ${r.protocolo}.` });
      onConcluido();
    } catch (err) {
      setResultado({ ok: false, texto: err.message });
    } finally {
      setEnviando(false);
      setConfirmando(false);
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-3" role="region" aria-label={cancelar ? "Cancelar nota" : "Carta de correção"}>
      <p className="text-[13px] font-bold text-[var(--pp-text)]">{cancelar ? `Cancelar ${numero}` : `Carta de correção da ${numero}`}</p>
      {!cancelar && <p className="mt-1 text-[12px] text-[var(--pp-text-muted)]">Não pode mudar valores, impostos, quantidade, quem vende ou quem compra, nem a data.</p>}
      <label htmlFor={`evento-texto-${nota.id}`} className="mt-2 block text-[12px] font-semibold text-[var(--pp-text-body)]">
        {cancelar ? "Motivo do cancelamento" : "O que deve ser corrigido"}
      </label>
      <textarea id={`evento-texto-${nota.id}`} rows={cancelar ? 2 : 4} maxLength={max} value={texto} onChange={(e) => setTexto(e.target.value)}
        className="mt-1 w-full rounded-xl border border-[var(--pp-border)] bg-white px-3 py-2 text-[13px] text-[var(--pp-text)] outline-none focus:border-[#012E46]" />
      <p className={`text-[11px] ${erroTexto && texto ? "text-[#B45309]" : "text-[var(--pp-text-muted)]"}`}>{erroTexto && texto ? erroTexto : `${texto.trim().length}/${max} caracteres (mínimo 15).`}</p>
      {resultado && <p role="status" className={`mt-2 text-[12px] font-semibold ${resultado.ok ? "text-[#1F7A3D]" : "text-[#C81E4A]"}`}>{resultado.texto}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {!resultado?.ok && !confirmando && (
          <button type="button" className={botao} disabled={!!erroTexto} onClick={() => setConfirmando(true)}>{cancelar ? "Cancelar nota" : "Enviar correção"}</button>
        )}
        {confirmando && (
          <>
            <span className="self-center text-[12px] font-semibold text-[#B45309]">{cancelar ? "O cancelamento não pode ser desfeito. Confirmar?" : "A correção fica registrada na SEFAZ. Confirmar?"}</span>
            <button type="button" className={botao} disabled={enviando} onClick={enviar}>{enviando ? "Enviando…" : "Sim, confirmar"}</button>
            <button type="button" className={botaoLeve} disabled={enviando} onClick={() => setConfirmando(false)}>Voltar</button>
          </>
        )}
        <button type="button" className={botaoLeve} disabled={enviando} onClick={onFechar}>Fechar</button>
      </div>
    </div>
  );
}

function mensagemDoResultado(acao, r) {
  if (acao === "consultar") {
    if (r.situacao === "autorizada") return { ok: true, texto: r.deveCancelar ? "A SEFAZ autorizou esta nota. Como a venda saiu em contingência, cancele esta nota." : `Nota autorizada. Protocolo ${r.protocolo}.` };
    if (r.situacao === "nao_encontrada") return r.numeroNaoUsado
      ? { ok: true, texto: "Consulta feita: a SEFAZ não recebeu esta nota e este número não foi usado." }
      : { ok: true, sugerir: "reenviar", texto: `Consulta feita: a SEFAZ NÃO recebeu esta nota (código ${r.cStat || 217}). Pode reenviar com segurança: clique em Reenviar à SEFAZ.` };
    if (r.code === "XML_NAO_CONFERE") return { ok: false, texto: r.erro };
    return { ok: false, texto: r.situacao === "indisponivel" ? "A SEFAZ continua sem responder. Tente de novo mais tarde." : (r.xMotivo || r.erro || "Não foi possível consultar.") };
  }
  if (r.situacao === "autorizada") return { ok: true, texto: `Nota autorizada. Protocolo ${r.protocolo}.` };
  if (r.situacao === "rejeitada") return { ok: false, texto: `A SEFAZ recusou: ${r.xMotivo || "motivo não informado"}.` };
  if (r.code === "FALHA_APOS_ENVIO") return { ok: false, sugerir: "consultar", texto: `Falha técnica depois do envio: a SEFAZ PODE ter recebido a nota. Clique em Consultar na SEFAZ antes de reenviar. (${r.detalhe || "erro interno"})` };
  if (r.code === "FALHA_ENVIO") return { ok: false, texto: `Falha técnica no sistema (a nota NÃO chegou à SEFAZ): ${r.detalhe || "erro interno"}. Abra Detalhes e histórico e copie o diagnóstico.` };
  const base = r.situacao === "indisponivel" ? "A SEFAZ continua fora do ar. A nota segue guardada." : (r.xMotivo || r.erro || "Não foi possível enviar.");
  // Falhas de validação do servidor (ex.: XML fora do padrão) trazem o campo exato: mostra para dar para corrigir o cadastro.
  return { ok: false, texto: r.detalhe && r.situacao !== "indisponivel" ? `${base} (${r.detalhe})` : base };
}

function AvisoContingencia({ resumo, supabase, onConcluido }) {
  const [enviando, setEnviando] = useState(false);
  const [texto, setTexto] = useState("");
  async function enviarTodas() {
    setEnviando(true);
    let ok = 0;
    for (const id of resumo.ids) {
      try {
        const r = await pedirEventoFiscal(supabase, { acao: "transmitir_contingencia", documentoId: id });
        if (r.situacao === "autorizada") ok += 1;
      } catch { /* segue para a próxima */ }
    }
    const faltam = resumo.ids.length - ok;
    setTexto(faltam ? `${ok} autorizada(s). ${faltam} continua(m) guardada(s) para enviar depois.` : `Todas as ${ok} nota(s) foram autorizadas.`);
    setEnviando(false);
    onConcluido();
  }
  const urgente = resumo.vencidas > 0;
  return (
    <div role="alert" className={`mt-3 rounded-xl border p-3 ${urgente ? "border-[#F5C2CD] bg-[#FDECEF]" : "border-[#F8D9A8] bg-[#FEF3E2]"}`}>
      <p className={`text-[13px] font-bold ${urgente ? "text-[#C81E4A]" : "text-[#B45309]"}`}>
        {resumo.pendentes} nota(s) em contingência aguardando envio à SEFAZ
      </p>
      <p className="mt-0.5 text-[12px] text-[var(--pp-text-body)]">
        {urgente ? `${resumo.vencidas} com prazo vencido: envie agora.` : resumo.proximoPrazo ? `Envie ${textoPrazo(resumo.proximoPrazo)}.` : "NF-e da SVC (servidor reserva): envie assim que ele responder."}
      </p>
      {texto && <p role="status" className="mt-1 text-[12px] font-semibold text-[var(--pp-text)]">{texto}</p>}
      <button type="button" className={`${botao} mt-2`} disabled={enviando} onClick={enviarTodas}>{enviando ? "Enviando…" : "Enviar pendentes agora"}</button>
    </div>
  );
}

// Inutilizar / descartar o número de uma nota que nunca foi autorizada. O servidor consulta a SEFAZ antes; onde o serviço existe envia a
// inutilização e guarda o protocolo; em SP, BA e AC (sem o serviço desde 11/11/2026) registra só como número não usado.
function PainelDescartar({ nota, supabase, onFechar, onConcluido }) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState(null);
  async function confirmar() {
    setEnviando(true); setErro("");
    try { const r = await inutilizarNota(supabase, nota.id, motivo.trim()); setFeito(r); onConcluido(); }
    catch (e) { setErro(e.message); } finally { setEnviando(false); }
  }
  if (feito) {
    return (
      <div className="mt-2 rounded-xl border border-[var(--pp-border)] p-3" data-testid="inutilizacao-resultado">
        <p role="status" className="text-[13px] font-semibold text-[#1F7A3D]">
          {feito.inutilizado ? `Número inutilizado na SEFAZ. Protocolo ${feito.protocolo}.` : "Número registrado como não usado."}
        </p>
        {!feito.inutilizado && feito.aviso && <p className="mt-1 text-[12px] text-[var(--pp-text-muted)]">{feito.aviso}</p>}
        <button type="button" className={`${botaoLeve} mt-2`} onClick={onFechar}>Fechar</button>
      </div>
    );
  }
  const curto = motivo.trim().length < 15;
  return (
    <div className="mt-2 rounded-xl border border-[var(--pp-border)] p-3" data-testid="painel-inutilizar">
      <label className="block text-[12px] font-semibold text-[var(--pp-text-body)]" htmlFor={`descartar-${nota.id}`}>Por que este número não será usado? (mínimo 15 letras)</label>
      <input id={`descartar-${nota.id}`} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-[var(--pp-border)] bg-white px-3 text-[13px]" placeholder="Ex.: venda cancelada antes de ser transmitida" />
      <p className="mt-1 text-[12px] text-[var(--pp-text-muted)]">Antes de inutilizar, o sistema confere na SEFAZ que esta nota não existe lá. Se o seu estado ainda tem o serviço, a inutilização é enviada e o protocolo fica guardado. Em SP, BA e AC (sem o serviço desde 11/11/2026) o número fica só registrado como não usado, sem protocolo. Nota autorizada não se inutiliza: se foi cancelada, use Cancelar nota.</p>
      {erro && <p role="status" className="mt-1 text-[12px] font-semibold text-[#C81E4A]">{erro}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={botao} disabled={enviando || curto} onClick={confirmar}>{enviando ? "Conferindo na SEFAZ…" : "Inutilizar número"}</button>
        <button type="button" className={botaoLeve} disabled={enviando} onClick={onFechar}>Voltar</button>
      </div>
    </div>
  );
}

const CHAVE_POR_PAGINA = "pp.notasFiscais.porPagina";
const lerPorPagina = () => { try { const v = Number(window.localStorage.getItem(CHAVE_POR_PAGINA)); return POR_PAGINA_NOTAS.includes(v) ? v : 10; } catch { return 10; } };
const gravarPorPagina = (v) => { try { window.localStorage.setItem(CHAVE_POR_PAGINA, String(v)); } catch { /* sem armazenamento: só não lembra */ } };

// Navegação da lista: quantas notas por página (10 a 50) e anterior / próxima.
function Paginacao({ pag, onPagina, onPorPagina }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2" data-testid="notas-paginacao">
      <p className="text-[12px] text-[var(--pp-text-muted)]" data-testid="notas-intervalo">{pag.total ? `Mostrando ${pag.de}–${pag.ate} de ${pag.total}` : "Nenhuma nota"}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12px] text-[var(--pp-text-body)]">Por página
          <select value={pag.porPagina} onChange={(e) => onPorPagina(Number(e.target.value))} data-testid="notas-por-pagina"
            className="min-h-9 rounded-xl border border-[var(--pp-border)] bg-white px-2 text-[12px] font-semibold text-[var(--pp-text)] outline-none focus:border-[#012E46]">
            {POR_PAGINA_NOTAS.map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
        </label>
        <button type="button" className={botaoLeve} disabled={pag.pagina <= 1} onClick={() => onPagina(pag.pagina - 1)} data-testid="notas-anterior">Anterior</button>
        <span className="text-[12px] font-semibold tabular-nums text-[var(--pp-text)]" data-testid="notas-pagina">Página {pag.pagina} de {pag.paginas}</span>
        <button type="button" className={botaoLeve} disabled={pag.pagina >= pag.paginas} onClick={() => onPagina(pag.pagina + 1)} data-testid="notas-proxima">Próxima</button>
      </div>
    </div>
  );
}

const AUTO_ATUALIZAR_MS = 15000;

export default function NotasFiscaisEmitidas({ supabase, lojaInfo, produtos = [], regrasLoja = [], ctxFiscal = {} }) {
  const lojaId = lojaInfo?.id ?? null;
  const [notas, setNotas] = useState([]);
  const [estado, setEstado] = useState({ carregando: true, erro: "" });
  const [aberto, setAberto] = useState(null); // { id, acao }
  const [ocupado, setOcupado] = useState(null); // nota com envio/consulta em andamento
  const [avisos, setAvisos] = useState({}); // id → { ok, texto }
  const [filtro, setFiltro] = useState("todas");
  const [ambiente, setAmbiente] = useState("todos"); // todos | producao | homologacao
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(lerPorPagina);
  const [expandidas, setExpandidas] = useState(() => new Set()); // notas com as informações abertas (+)
  const alternarNota = (id) => setExpandidas((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [manutId, setManutId] = useState(null); // nota com a tela de Manutenção fiscal aberta
  const [xmlId, setXmlId] = useState(null); // nota com o painel "XML" aberto
  const [detalhesId, setDetalhesId] = useState(null); // nota com o painel "Detalhes e histórico" aberto
  const [tentativas, setTentativas] = useState({}); // id → ações feitas nesta tela (quando, o quê, resultado): o "log" imediato, antes da migration 191
  const anotar = (id, acao, ok, texto) => setTentativas((m) => ({ ...m, [id]: [...(m[id] || []), { quando: new Date().toISOString(), acao, ok, texto }] }));

  const buscar = useCallback(async () => {
    try { return { notas: await listarDocumentosFiscais(supabase, lojaId) }; } catch (e) { return { erro: e.message }; }
  }, [supabase, lojaId]);
  const aplicar = useCallback((r) => {
    if (r.erro) setEstado({ carregando: false, erro: r.erro });
    else { setNotas(r.notas); setEstado({ carregando: false, erro: "" }); }
  }, []);
  const recarregar = useCallback(async () => aplicar(await buscar()), [aplicar, buscar]);

  useEffect(() => {
    if (lojaId == null) return undefined;
    let vivo = true;
    buscar().then((r) => { if (vivo) aplicar(r); });
    return () => { vivo = false; };
  }, [lojaId, buscar, aplicar]);

  // A lista só era lida ao abrir a tela: uma nota emitida no caixa depois disso não aparecia até o usuário clicar em
  // "Atualizar" ou reabrir. Agora relê sozinha a cada 15 s e ao voltar para esta aba do navegador.
  useEffect(() => {
    if (lojaId == null) return undefined;
    let vivo = true;
    const reler = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const r = await buscar();
      if (vivo && !r.erro) setNotas(r.notas); // erro passageiro não troca a lista por uma mensagem de erro
    };
    const t = setInterval(reler, AUTO_ATUALIZAR_MS);
    document.addEventListener("visibilitychange", reler);
    return () => { vivo = false; clearInterval(t); document.removeEventListener("visibilitychange", reler); };
  }, [lojaId, buscar]);

  // A nota que recebeu o retorno de uma ação (enviar, consultar, baixar…) abre sozinha para a pessoa ver o resultado.
  useEffect(() => {
    const ids = Object.keys(avisos);
    if (ids.length) setExpandidas((cur) => (ids.every((id) => cur.has(id)) ? cur : new Set([...cur, ...ids])));
  }, [avisos]);

  async function acaoRapida(nota, acao) {
    setOcupado(nota.id);
    try {
      const r = await pedirEventoFiscal(supabase, { acao: acao === "enviar" ? "transmitir_contingencia" : "consultar", documentoId: nota.id });
      const m = mensagemDoResultado(acao, r);
      setAvisos((v) => ({ ...v, [nota.id]: m }));
      anotar(nota.id, acao === "enviar" ? "Enviar (contingência)" : "Consultar na SEFAZ", m.ok, m.texto);
    } catch (e) {
      setAvisos((v) => ({ ...v, [nota.id]: { ok: false, texto: e.message } }));
      anotar(nota.id, acao === "enviar" ? "Enviar (contingência)" : "Consultar na SEFAZ", false, e.message);
    } finally {
      setOcupado(null);
      recarregar();
    }
  }
  const postar = (corpo) => postarApiFiscal(supabase, corpo);
  // U1: nota reservada e nunca enviada → envia agora (SEFAZ fora → contingência, como no caixa).
  async function emitirAgora(nota) {
    setOcupado(nota.id);
    try {
      const r = await emitirReservada({ documentoId: nota.id, numero: nota.numero, nfe: Number(nota.modelo) === 55, postar });
      const ok = r.estado === "autorizada" || r.estado === "contingencia";
      const texto = [r.titulo, r.detalhe].filter(Boolean).join(": ");
      setAvisos((v) => ({ ...v, [nota.id]: { ok, texto } }));
      anotar(nota.id, "Reenviar / emitir", ok, texto);
    } catch (e) {
      const texto = e?.message || "Não foi possível falar com o servidor de emissão.";
      setAvisos((v) => ({ ...v, [nota.id]: { ok: false, texto } }));
      anotar(nota.id, "Reenviar / emitir", false, texto);
    } finally { setOcupado(null); recarregar(); }
  }
  // U2: rejeitada → refaz a parte fiscal com o cadastro atual dos produtos e envia de novo.
  async function corrigirEEmitir(nota) {
    setOcupado(nota.id);
    try {
      const atual = await buscarVendaDaNota(supabase, nota.id);
      const venda = refazerFiscalDaVenda(atual.venda, produtos, { ...ctxFiscal, lojaFiscalRegras: regrasLoja });
      if (!venda.apto) {
        const falta = venda.itens.flatMap((it) => it.pendencias.map((p) => (p.includes(it.nome) ? p : `${it.nome}: ${p}`)));
        setAvisos((v) => ({ ...v, [nota.id]: { ok: false, texto: `Corrija o cadastro antes: ${falta.slice(0, 3).join(" ")}` } }));
        return;
      }
      await refazerNota(supabase, nota.id, venda);
      const r = await emitirReservada({ documentoId: nota.id, numero: nota.numero, nfe: Number(nota.modelo) === 55, postar });
      setAvisos((v) => ({ ...v, [nota.id]: { ok: r.estado === "autorizada" || r.estado === "contingencia", texto: [r.titulo, r.detalhe].filter(Boolean).join(": ") } }));
    } catch (e) {
      setAvisos((v) => ({ ...v, [nota.id]: { ok: false, texto: e.message } }));
    } finally { setOcupado(null); recarregar(); }
  }
  async function imprimir(nota) {
    const r = await imprimirNotaFiscal({ documentoId: nota.id, buscar: (corpo) => postarApiFiscal(supabase, corpo) });
    if (!r.ok) setAvisos((v) => ({ ...v, [nota.id]: { ok: false, texto: r.erro } }));
  }
  // Download direto, sem abrir o painel: busca o XML guardado e salva o arquivo.
  async function baixarDireto(nota) {
    const r = await buscarXmlDaNota({ documentoId: nota.id, buscar: (corpo) => postarApiFiscal(supabase, corpo) });
    if (!r.ok) { setAvisos((v) => ({ ...v, [nota.id]: { ok: false, texto: r.erro } })); return; }
    const arq = nomeArquivoXml(r);
    baixarXml(r.xml, arq);
    setAvisos((v) => ({ ...v, [nota.id]: { ok: true, texto: `XML baixado: ${arq}` } }));
  }
  const resumo = resumoContingencia(notas);
  const doAmbiente = useMemo(() => filtrarPorAmbiente(notas, ambiente), [notas, ambiente]);
  const filtradas = useMemo(() => filtrarNotas(doAmbiente, filtro), [doAmbiente, filtro]);
  const pag = paginarNotas(filtradas, pagina, porPagina);
  const trocarFiltro = (f) => { setFiltro(f); setPagina(1); };
  const trocarAmbiente = (a) => { setAmbiente(a); setPagina(1); };
  const trocarPorPagina = (q) => { setPorPagina(q); gravarPorPagina(q); setPagina(1); };

  if (lojaId == null) return <p className="text-[13px] text-[var(--pp-text-muted)]">Selecione uma empresa.</p>;
  if (estado.carregando) return <p className="text-[13px] text-[var(--pp-text-muted)]">Carregando…</p>;
  if (estado.erro) return <div className="rounded-2xl border border-[var(--pp-border)] bg-white p-4"><p className="text-[13px] font-semibold text-[#C81E4A]">{estado.erro}</p></div>;

  return (
    <section className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5" aria-labelledby="notas-titulo" data-testid="notas-fiscais-emitidas">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="notas-titulo" className="text-[15px] font-bold text-[var(--pp-text)]">Notas emitidas</h3>
          <p className="text-[12px] text-[var(--pp-text-muted)]" data-testid="notas-empresa">Empresa: {lojaInfo?.nome || "—"} (código {lojaId})</p>
        </div>
        <button type="button" className={botaoLeve} onClick={recarregar}>Atualizar</button>
      </div>
      {resumo.pendentes > 0 && <AvisoContingencia resumo={resumo} supabase={supabase} onConcluido={recarregar} />}
      {notas.length > 0 && (
        <div className="mt-3 rounded-xl border border-[var(--pp-border)] bg-white p-3" role="group" aria-label="Filtros das notas" data-testid="notas-filtros">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Ambiente">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">Ambiente</span>
              <div className="inline-flex overflow-hidden rounded-xl border border-[var(--pp-border)]">
                {AMBIENTES_NOTAS.map((a) => {
                  const on = ambiente === a.id;
                  return (
                    <button key={a.id} type="button" aria-pressed={on} onClick={() => trocarAmbiente(a.id)} data-testid={`amb-${a.id}`}
                      className={`inline-flex min-h-9 items-center gap-1.5 px-3 text-[12px] transition ${on ? "bg-[#012E46] font-semibold text-white" : "bg-white font-medium text-[var(--pp-text-body)] hover:bg-[var(--pp-bg)]"}`}>
                      {a.rotulo}<span className="text-[11px] font-black opacity-80">{filtrarPorAmbiente(notas, a.id).length}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar notas">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">Tipo e situação</span>
              {FILTROS_NOTAS.map((f) => {
                const qtd = filtrarNotas(doAmbiente, f.id).length;
                const on = filtro === f.id;
                return (
                  <button key={f.id} type="button" aria-pressed={on} onClick={() => trocarFiltro(f.id)}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] transition ${on ? "border-[#012E46] bg-[#012E46] font-semibold text-white" : "border-[var(--pp-border)] bg-white font-medium text-[var(--pp-text-body)] hover:border-[#012E46]"}`}>
                    {f.rotulo}<span className="text-[11px] font-black opacity-80">{qtd}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {notas.length === 0 ? (
        <div className="mt-2 text-[13px] text-[var(--pp-text-muted)]">
          <p>Nenhuma nota emitida por esta empresa ainda.</p>
          <p className="mt-1 text-[12px]">Emitiu uma nota e ela não aparece? As notas ficam na empresa da venda. Confira, no seletor de empresa do topo, se esta é a mesma empresa em que a venda foi feita no caixa.</p>
        </div>
      ) : filtradas.length === 0 ? (
        <p className="mt-3 text-[13px] text-[var(--pp-text-muted)]">Nenhuma nota neste filtro.</p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-[var(--pp-border)]">
            {pag.itens.map((n) => {
              const s = situacaoDaNota(n);
              const a = acoesDaNota(n);
              const aberta = expandidas.has(n.id);
              const rotulo = `${n.modelo === 65 ? "NFC-e" : "NF-e"} ${n.numero}`;
              return (
                <li key={n.id} className="py-2" data-testid="nota-linha" data-nota={n.id} data-ambiente={n.ambiente}>
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <button type="button" onClick={() => alternarNota(n.id)} aria-expanded={aberta} aria-label={`${aberta ? "Recolher" : "Expandir"} ${rotulo}`} data-testid="btn-expandir"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--pp-border)] bg-white text-[16px] font-bold leading-none text-[var(--pp-text-body)] transition hover:border-[#012E46]">{aberta ? "−" : "+"}</button>
                    <span className="text-[13px] font-bold text-[var(--pp-text)]">{rotulo}<span className="font-medium text-[var(--pp-text-muted)]"> · série {n.serie}</span></span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${TOM[s.tom]}`}>{s.rotulo}</span>
                    {n.ambiente === "producao"
                      ? <span className="rounded-full border border-[#012E46] px-2 py-0.5 text-[11px] font-semibold text-[#012E46]" data-testid="badge-ambiente">Produção</span>
                      : <span className="rounded-full bg-[var(--pp-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--pp-text-muted)]" data-testid="badge-ambiente" title="Nota de teste, sem valor fiscal">Homologação</span>}
                    <span className="ml-auto flex items-center gap-3">
                      <span className="hidden text-[12px] text-[var(--pp-text-muted)] sm:inline">{data(n.dhAutorizacao || n.criadoEm)}</span>
                      <span className="text-[13px] font-semibold tabular-nums text-[var(--pp-text)]">{moeda(n.valorTotal)}</span>
                    </span>
                  </div>
                  {aberta && (
                    <div className="mt-1.5 border-l-2 border-[var(--pp-border)] pl-3 sm:ml-10" data-testid="nota-detalhe">
                        <p className="mt-0.5 text-[12px] text-[var(--pp-text-muted)]">
                          {data(n.dhAutorizacao || n.criadoEm)}{n.protocolo ? ` · protocolo ${n.protocolo}` : ""}{n.cartasCorrecao ? ` · ${n.cartasCorrecao} correção(ões)` : ""}
                        </p>
                        <ChaveAcessoNota nota={n} />
                        {(n.status === "rejeitado" || n.status === "erro") && n.xMotivo && <p className={`mt-0.5 text-[12px] ${n.contingenciaNumero && Number(n.cStat) === 217 ? "text-[var(--pp-text-muted)]" : "text-[#C81E4A]"}`}>{n.xMotivo}</p>}
                        {n.ultimoEvento?.status === "rejeitado" && <p className="mt-0.5 text-[12px] text-[#B45309]">Último pedido recusado pela SEFAZ: {n.ultimoEvento.xmotivo}</p>}
                        {[6, 7].includes(n.tpEmis) && n.contingencia && !n.contingencia.prazo && !["autorizado", "cancelado"].includes(n.status) && (
                          <p className="mt-0.5 text-[12px] text-[var(--pp-text-body)]">
                            Emitida pela SVC (servidor reserva da SEFAZ){n.contingencia.numeroOrigem ? ` no lugar da nº ${n.contingencia.numeroOrigem}` : ""}
                            {n.contingencia.tentativas ? ` · ${n.contingencia.tentativas} tentativa(s)` : ""}
                          </p>
                        )}
                        {[4, 9].includes(n.tpEmis) && n.contingencia && !["autorizado", "cancelado"].includes(n.status) && (
                          <p className="mt-0.5 text-[12px] text-[var(--pp-text-body)]">
                            Emitida em contingência{n.tpEmis === 4 ? (n.contingencia.epecProtocolo ? ` EPEC (protocolo ${n.contingencia.epecProtocolo})` : " EPEC — aviso ainda não registrado: não imprima") : ""}{n.contingencia.numeroOrigem ? ` (no lugar da nº ${n.contingencia.numeroOrigem})` : ""} · {n.contingencia.vencida ? "" : "enviar "}{textoPrazo(n.contingencia.prazo)}
                            {n.contingencia.tentativas ? ` · ${n.contingencia.tentativas} tentativa(s)` : ""}
                          </p>
                        )}
                        {n.contingenciaNumero && !["autorizado", "cancelado"].includes(n.status) && Number(n.cStat) !== 217 && (
                          <p className="mt-0.5 text-[12px] text-[var(--pp-text-body)]">A venda saiu na {n.modelo === 65 ? "NFC-e" : "NF-e"} nº {n.contingenciaNumero} (contingência). Esta nota não será reenviada: só consultada.</p>
                        )}
                        {avisos[n.id] && <p role="status" data-testid="aviso-nota" className={`mt-1 text-[12px] font-semibold ${avisos[n.id].sugerir ? "text-[#B45309]" : avisos[n.id].ok ? "text-[#1F7A3D]" : "text-[#C81E4A]"}`}>{avisos[n.id].texto}</p>}
                        {aberto?.id !== n.id && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {a.emitir && <button type="button" className={botao} disabled={ocupado === n.id} onClick={() => emitirAgora(n)}>{ocupado === n.id ? "Enviando…" : "Emitir agora"}</button>}
                            {a.reenviar && <button type="button" data-testid="btn-reenviar" className={`${botao}${avisos[n.id]?.sugerir === "reenviar" ? " ring-2 ring-[#F38525] ring-offset-2" : ""}`} disabled={ocupado === n.id} onClick={() => emitirAgora(n)} title="Reenvia com a mesma numeração; o sistema consulta a SEFAZ antes e nunca duplica uma nota já autorizada.">{ocupado === n.id ? "Reenviando…" : "Reenviar à SEFAZ"}</button>}
                            {a.refazer && <button type="button" className={botao} disabled={ocupado === n.id} onClick={() => corrigirEEmitir(n)}>{ocupado === n.id ? "Enviando…" : "Corrigir e emitir de novo"}</button>}
                            {a.descartar && <button type="button" className={botaoLeve} disabled={ocupado === n.id} onClick={() => setAberto({ id: n.id, acao: "descartar" })}>Inutilizar número</button>}
                            {a.imprimir && <button type="button" className={botaoLeve} onClick={() => imprimir(n)}>{n.modelo === 55 ? "Imprimir DANFE" : "Imprimir NFC-e"}</button>}
                            {podeManutencao(n) && <button type="button" className={botaoLeve} aria-expanded={manutId === n.id} onClick={() => setManutId((cur) => (cur === n.id ? null : n.id))} data-testid="btn-manutencao">{manutId === n.id ? "Fechar manutenção" : "Manutenção fiscal"}</button>}
                            {a.imprimir && <button type="button" className={botaoLeve} onClick={() => baixarDireto(n)} data-testid="btn-baixar-xml">Baixar XML</button>}
                            {a.imprimir && <button type="button" className={botaoLeve} aria-expanded={xmlId === n.id} onClick={() => setXmlId((cur) => (cur === n.id ? null : n.id))} data-testid="btn-ver-xml">{xmlId === n.id ? "Ocultar XML" : "Ver / pesquisar XML"}</button>}
                            {a.enviar && <button type="button" className={botao} disabled={ocupado === n.id} onClick={() => acaoRapida(n, "enviar")}>{ocupado === n.id ? "Enviando…" : "Enviar agora"}</button>}
                            {a.consultar && <button type="button" className={botaoLeve} disabled={ocupado === n.id} onClick={() => acaoRapida(n, "consultar")}>{ocupado === n.id ? "Consultando…" : "Consultar na SEFAZ"}</button>}
                            {a.cancelar && !(Number(n.modelo) === 65 && !n.contingenciaNumero && Number(n.tpEmis || 1) === 1 && nfceForaDoPrazo(n)) && <button type="button" className={botaoLeve} onClick={() => setAberto({ id: n.id, acao: "cancelar" })}>Cancelar nota</button>}
                            {a.cancelar && Number(n.modelo) === 65 && !n.contingenciaNumero && Number(n.tpEmis || 1) === 1 && nfceForaDoPrazo(n) && <span className="self-center text-[11px] text-[var(--pp-text-muted)]" data-testid="canc-expirado">Prazo de cancelamento da NFC-e (30 min) encerrado.</span>}
                            {a.cce && <button type="button" className={botaoLeve} onClick={() => setAberto({ id: n.id, acao: "cce" })}>Carta de correção</button>}
                            <button type="button" className={botaoLeve} aria-expanded={detalhesId === n.id} onClick={() => setDetalhesId((cur) => (cur === n.id ? null : n.id))}>{detalhesId === n.id ? "Ocultar detalhes" : "Detalhes e histórico"}</button>
                          </div>
                        )}
                        {manutId === n.id && <ManutencaoFiscal nota={n} supabase={supabase} buscar={(corpo) => postarApiFiscal(supabase, corpo)} mensagemEmissao={(r) => mensagemDoResultado("emitir", r)}
                          onConcluido={({ ok, texto }) => { setAvisos((v) => ({ ...v, [n.id]: { ok, texto } })); recarregar(); }} onFechar={() => setManutId(null)} />}
                        {xmlId === n.id && <XmlDaNota nota={n} buscar={(corpo) => postarApiFiscal(supabase, corpo)} onFechar={() => setXmlId(null)} />}
                        {detalhesId === n.id && <DetalhesNotaFiscal nota={n} supabase={supabase} tentativas={tentativas[n.id] || []} onFechar={() => setDetalhesId(null)} />}
                        {aberto?.id === n.id && aberto.acao === "descartar" && <PainelDescartar nota={n} supabase={supabase} onFechar={() => setAberto(null)} onConcluido={recarregar} />}
                        {aberto?.id === n.id && aberto.acao !== "descartar" && <PainelEvento nota={n} acao={aberto.acao} supabase={supabase} onFechar={() => setAberto(null)} onConcluido={recarregar} />}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <Paginacao pag={pag} onPagina={setPagina} onPorPagina={trocarPorPagina} />
        </>
      )}
    </section>
  );
}
