import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Bot, Copy, Loader2, Search, Sparkles, Trash2 } from "lucide-react";
import FiltroPeriodo from "../../components/FiltroPeriodo.jsx";
import { AvisoErro, BotaoAcao, Cartao, SituacaoDados } from "../../components/graficos/Graficos.jsx";
import { useDadosVendas } from "../../components/graficos/contextoDados.js";
import { PERGUNTAS, interpretar, responder, resumoParaIA } from "../../lib/copiloto/motor.js";
import { intervaloAnterior, intervaloPeriodo, pedidosNoIntervalo } from "../../lib/relatorios/analiseVendas.js";
import { rotuloPeriodoSelecionado } from "../../lib/periodos.js";
import { perguntarCopilotoIA } from "../../lib/supabase.js";

const RELATORIOS = new Set(["geral", "vendas", "cupom", "estoque", "clientes", "satisfacao"]);
const ROTULO_DESTINO = { mesas: "Abrir Mesas", products: "Abrir Produtos" };

/**
 * Copiloto: perguntas e busca sobre a loja em foco. As respostas saem dos
 * dados carregados; a IA externa só entra quando a pergunta não é reconhecida
 * ou quando a pessoa pede para aprofundar.
 */
export default function CopilotoIA({ orders = [], products = [], pesquisas = [], lojaNome = "", irPara = () => {}, irParaRelatorio = () => {} }) {
  const [periodo, setPeriodo] = useState("30");
  const [ini, setIni] = useState("");
  const [fim, setFim] = useState("");
  const [texto, setTexto] = useState("");
  const [conversa, setConversa] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const cancelarRef = useRef(null);
  const contador = useRef(0);
  const dados = useDadosVendas();

  useEffect(() => () => cancelarRef.current?.abort(), []);

  const ctx = useMemo(() => {
    const intervalo = intervaloPeriodo(periodo, ini, fim);
    const noPeriodo = (data) => periodo === "tudo" || (!!data && new Date(data) >= intervalo[0] && new Date(data) <= intervalo[1]);
    return {
      lojaNome,
      rotuloPeriodo: periodo === "tudo" ? "todo o histórico" : rotuloPeriodoSelecionado(periodo, ini, fim),
      agora: new Date(),
      historico: orders,
      pedidos: periodo === "tudo" ? orders : pedidosNoIntervalo(orders, intervalo),
      anteriores: pedidosNoIntervalo(orders, intervaloAnterior(periodo, ini, fim)),
      produtos: products,
      pesquisas: pesquisas.filter((q) => noPeriodo(q.criadoEmISO)),
    };
  }, [orders, products, pesquisas, lojaNome, periodo, ini, fim]);

  const adicionar = (item) => {
    contador.current += 1;
    const chave = contador.current;
    setConversa((c) => [{ chave, ...item }, ...c].slice(0, 20));
    return chave;
  };
  const atualizar = (chave, campos) => setConversa((c) => c.map((m) => (m.chave === chave ? { ...m, ...campos } : m)));

  async function consultarIA(pergunta, chave) {
    cancelarRef.current?.abort();
    const controle = new AbortController();
    cancelarRef.current = controle;
    setOcupado(true);
    atualizar(chave, { carregandoIA: true, erroIA: "" });
    try {
      const { resultado } = await perguntarCopilotoIA({ pergunta, resumoDados: resumoParaIA(ctx), dataPeriod: ctx.rotuloPeriodo, signal: controle.signal });
      if (!resultado || resultado.fallback) throw new Error("sem resposta");
      atualizar(chave, { carregandoIA: false, ia: resultado });
    } catch (e) {
      if (e?.name !== "AbortError") atualizar(chave, { carregandoIA: false, erroIA: "A IA não respondeu agora. Use uma das perguntas prontas ou tente de novo." });
    } finally {
      if (cancelarRef.current === controle) setOcupado(false);
    }
  }

  function perguntarPronta(p) {
    adicionar({ pergunta: p.rotulo, local: responder(p.id, ctx) });
  }

  function enviar(e) {
    e.preventDefault();
    const pergunta = texto.trim();
    if (!pergunta || ocupado) return;
    setTexto("");
    const local = interpretar(pergunta, ctx);
    const chave = adicionar({ pergunta, local });
    if (!local) consultarIA(pergunta, chave);
  }

  async function copiar(m) {
    const linhas = m.local ? [m.local.resposta, ...m.local.itens] : [m.ia?.summary, ...(m.ia?.recommendations || [])];
    try {
      await navigator.clipboard.writeText([m.pergunta, ...linhas].filter(Boolean).join("\n"));
      atualizar(m.chave, { copiado: true });
    } catch { /* sem permissão de área de transferência */ }
  }

  const abrir = (destino) => (RELATORIOS.has(destino) ? irParaRelatorio(destino) : irPara(destino));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#012E46]" style={{ color: "#FFFFFF" }}><Bot className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <h1 className="page-title text-xl font-semibold tracking-tight text-[#012E46]">Copiloto IA</h1>
              <p className="truncate text-xs text-[#667085]" data-testid="copiloto-loja">Respostas com os dados de <b className="font-semibold text-[#012E46]">{lojaNome || "sua loja"}</b></p>
            </div>
          </div>
          <SituacaoDados dados={dados} />
        </div>
        <FiltroPeriodo valor={periodo} onMudar={setPeriodo} ini={ini} fim={fim} onIni={setIni} onFim={setFim} />
      </header>

      {dados.erro && <AvisoErro mensagem={dados.erro} onTentar={dados.atualizar} />}

      <Cartao>
        <form onSubmit={enviar} className="flex flex-col gap-2 sm:flex-row" role="search">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Pergunte ou busque na loja</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" aria-hidden="true" />
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Pergunte ou busque um produto, cliente, cupom ou mesa" maxLength={300}
              className="pdv-toque min-h-12 w-full rounded-2xl border border-[#D8E0E5] bg-white pl-10 pr-3 text-sm text-[#1F2933] outline-none focus:border-[#012E46]" />
          </label>
          <button type="submit" disabled={!texto.trim() || ocupado}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#012E46] px-5 text-sm font-semibold transition-opacity disabled:opacity-40" style={{ color: "#FFFFFF" }}>
            Perguntar <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Perguntas prontas">
          {PERGUNTAS.map((p) => (
            <button key={p.id} type="button" onClick={() => perguntarPronta(p)}
              className="min-h-9 rounded-full border border-[#D8E0E5] bg-white px-3.5 text-xs font-semibold text-[#012E46] transition-colors hover:border-[#012E46] hover:bg-[#F4F7F8]">
              {p.rotulo}
            </button>
          ))}
        </div>
      </Cartao>

      {conversa.length > 0 && (
        <div className="flex justify-end">
          <BotaoAcao icone={Trash2} onClick={() => { cancelarRef.current?.abort(); setOcupado(false); setConversa([]); }}>Limpar respostas</BotaoAcao>
        </div>
      )}

      <div className="space-y-3" aria-live="polite">
        {conversa.map((m) => (
          <article key={m.chave} className="pp-menu rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(1,46,70,0.05)]" data-testid="copiloto-resposta">
            <p className="text-xs font-semibold text-[#667085]">{m.pergunta}</p>
            {m.local && (
              <>
                <h2 className="mt-1 text-[15px] font-semibold text-[#012E46]">{m.local.titulo}</h2>
                <p className="mt-1 text-sm leading-relaxed text-[#1F2933]">{m.local.resposta}</p>
                {m.local.itens.length > 0 && (
                  <ul className="mt-2 divide-y divide-[#F1F4F6] rounded-xl border border-[#EEF2F4]">
                    {m.local.itens.map((item) => <li key={item} className="px-3 py-2 text-[13px] text-[#344054] [overflow-wrap:anywhere]">{item}</li>)}
                  </ul>
                )}
              </>
            )}
            {m.carregandoIA && <p role="status" className="mt-2 flex items-center gap-2 text-sm text-[#667085]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Consultando a IA…</p>}
            {m.erroIA && <p className="mt-2 text-sm text-[#9A4D0B]">{m.erroIA}</p>}
            {m.ia && (
              <div className="mt-3 rounded-xl bg-[#F4F7F8] p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#667085]"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Análise da IA</p>
                <p className="mt-1 text-sm leading-relaxed text-[#1F2933]">{m.ia.summary}</p>
                {m.ia.recommendations?.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] text-[#344054]">{m.ia.recommendations.slice(0, 3).map((r) => <li key={r}>{r}</li>)}</ul>
                )}
                {m.ia.limitations?.length > 0 && <p className="mt-2 text-[11px] text-[#667085]">Limite dos dados: {m.ia.limitations[0]}</p>}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {m.local?.destino && <BotaoAcao icone={ArrowRight} onClick={() => abrir(m.local.destino)}>{ROTULO_DESTINO[m.local.destino] || "Abrir relatório"}</BotaoAcao>}
              {!m.ia && !m.carregandoIA && <BotaoAcao icone={Sparkles} onClick={() => consultarIA(m.pergunta, m.chave)} disabled={ocupado}>{m.erroIA ? "Tentar de novo" : "Aprofundar com IA"}</BotaoAcao>}
              {(m.local || m.ia) && <BotaoAcao icone={Copy} onClick={() => copiar(m)}>{m.copiado ? "Copiado" : "Copiar"}</BotaoAcao>}
            </div>
          </article>
        ))}
      </div>

      {conversa.length === 0 && (
        <p className="pb-4 text-center text-xs text-[#667085]">Toque em uma pergunta pronta ou escreva a sua. Nada é estimado: sem dado, a resposta avisa.</p>
      )}
    </div>
  );
}
