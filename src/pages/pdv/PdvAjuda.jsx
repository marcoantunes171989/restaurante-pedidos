import { useMemo, useRef, useState } from "react";
import { ChevronRight, FileDown, Lightbulb, Search, TriangleAlert, X } from "lucide-react";
import Ilustracao from "./PdvAjudaIlustracoes";
import { PDV_DOC_ATUALIZADO_EM, PDV_DOC_VERSAO, secoesDocumentacao } from "./pdvDocumentacao";

/**
 * Central de Ajuda do PDV — documentação navegável por índice, com busca,
 * ilustrações e exportação em PDF (via impressão do navegador).
 * O conteúdo vem de pdvDocumentacao.js e é contextualizado com os dados
 * reais da loja, então a ajuda descreve a tela que o operador tem na frente.
 */
export default function PdvAjuda({ contexto = {}, onFechar }) {
  const secoes = useMemo(() => secoesDocumentacao(contexto), [contexto]);
  const [ativa, setAtiva] = useState(secoes[0]?.id);
  const [busca, setBusca] = useState("");
  const conteudoRef = useRef(null);

  const termo = busca.trim().toLowerCase();
  const secoesFiltradas = useMemo(() => {
    if (!termo) return secoes;
    return secoes.filter((s) => textoDaSecao(s).toLowerCase().includes(termo));
  }, [secoes, termo]);

  const secaoAtual = secoesFiltradas.find((s) => s.id === ativa) || secoesFiltradas[0] || null;

  function irPara(id) {
    setAtiva(id);
    conteudoRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Central de ajuda do PDV"
        className="flex h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-[var(--pp-border)] bg-[var(--pp-surface)] shadow-2xl sm:h-[88dvh] sm:rounded-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Cabeçalho */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--pp-border)] px-3 py-2.5 sm:px-4">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-1.5 text-[15px] font-black text-[var(--pp-text)]">
              Central de ajuda do PDV
              <span className="rounded-md bg-[var(--pp-bg)] px-1.5 py-0.5 text-[9px] font-black text-[var(--pp-text-muted)]">
                v{PDV_DOC_VERSAO}
              </span>
            </h2>
            <p className="truncate text-[10px] font-semibold text-[var(--pp-text-muted)]">
              Documentação da tela em uso · atualizada em {PDV_DOC_ATUALIZADO_EM}
            </p>
          </div>

          <div className="relative w-full sm:w-56">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--pp-text-muted)]" aria-hidden="true" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar na ajuda…"
              aria-label="Buscar na ajuda"
              className="h-9 w-full rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] pl-8 pr-2 text-[12px] font-semibold text-[var(--pp-text)] outline-none focus:border-[var(--pp-primary)] focus:bg-[var(--pp-surface)]"
            />
          </div>

          <button
            type="button"
            onClick={() => imprimirDocumentacao(secoes, contexto)}
            title="Gerar PDF da documentação"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] px-2.5 text-[11px] font-black text-[var(--pp-text-body)] transition hover:border-[var(--pp-primary)] hover:text-[var(--pp-primary-text)]"
          >
            <FileDown size={14} aria-hidden="true" /> PDF
          </button>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar ajuda"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--pp-border)] text-[var(--pp-text-body)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Índice */}
          <nav
            aria-label="Índice da documentação"
            className="shrink-0 overflow-x-auto overflow-y-auto border-b border-[var(--pp-border)] bg-[var(--pp-bg)] p-2 lg:w-[236px] lg:border-b-0 lg:border-r"
          >
            <p className="mb-1 hidden px-1 text-[9px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)] lg:block">
              Índice
            </p>
            <ul className="flex gap-1 lg:block lg:space-y-0.5">
              {secoesFiltradas.map((s, i) => {
                const on = secaoAtual?.id === s.id;
                return (
                  <li key={s.id} className="shrink-0 lg:shrink">
                    <button
                      type="button"
                      onClick={() => irPara(s.id)}
                      aria-current={on ? "true" : undefined}
                      className={`flex w-full items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-left text-[11px] font-bold transition lg:whitespace-normal ${
                        on
                          ? "bg-[var(--pp-primary-soft)] text-[var(--pp-primary-text)]"
                          : "text-[var(--pp-text-body)] hover:bg-[var(--pp-surface)]"
                      }`}
                    >
                      <span className={`grid h-4 w-4 shrink-0 place-items-center rounded text-[9px] font-black ${
                        on ? "bg-[var(--pp-primary)] text-white" : "bg-[var(--pp-border)] text-[var(--pp-text-body)]"
                      }`}>
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate lg:whitespace-normal">{s.titulo}</span>
                      <ChevronRight size={12} className="hidden shrink-0 opacity-50 lg:block" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
              {secoesFiltradas.length === 0 && (
                <li className="px-2 py-3 text-[11px] text-[var(--pp-text-muted)]">Nada encontrado para “{busca}”.</li>
              )}
            </ul>
          </nav>

          {/* Conteúdo */}
          <div ref={conteudoRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4">
            {secaoAtual ? (
              <article>
                <h3 className="text-[17px] font-black tracking-tight text-[var(--pp-text)]">{secaoAtual.titulo}</h3>
                {secaoAtual.resumo && (
                  <p className="mt-0.5 text-[12px] font-semibold text-[var(--pp-text-muted)]">{secaoAtual.resumo}</p>
                )}
                <div className="mt-3 space-y-3">
                  {secaoAtual.blocos.map((b, i) => <Bloco key={i} bloco={b} />)}
                </div>
              </article>
            ) : (
              <p className="text-[12px] text-[var(--pp-text-muted)]">Use a busca para encontrar um tópico.</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--pp-border)] px-3 py-2 sm:px-4">
          <p className="truncate text-[10px] font-semibold text-[var(--pp-text-muted)]">
            Pedido Prime · documentação viva: acompanha a versão da tela.
          </p>
          <button type="button" onClick={onFechar} className="btn-laranja h-9 shrink-0 rounded-lg px-4 text-[12px] font-black text-white">
            Voltar ao PDV
          </button>
        </div>
      </div>
    </div>
  );
}

function Bloco({ bloco }) {
  if (bloco.tipo === "p") {
    return <p className="text-[12.5px] leading-relaxed text-[var(--pp-text-body)]">{bloco.texto}</p>;
  }

  if (bloco.tipo === "lista") {
    return (
      <div>
        {bloco.titulo && <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-[var(--pp-text-muted)]">{bloco.titulo}</p>}
        <ul className="space-y-1">
          {bloco.itens.map((i) => (
            <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-[var(--pp-text-body)]">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--pp-primary)]" />
              <span>{i}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (bloco.tipo === "passos") {
    return (
      <div>
        {bloco.titulo && <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-[var(--pp-text-muted)]">{bloco.titulo}</p>}
        <ol className="space-y-1.5">
          {bloco.itens.map((i, idx) => (
            <li key={i} className="flex gap-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--pp-primary-soft)] text-[10px] font-black text-[var(--pp-primary-text)]">
                {idx + 1}
              </span>
              <span className="text-[12.5px] leading-relaxed text-[var(--pp-text-body)]">{i}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (bloco.tipo === "tabela") {
    return (
      <div className="overflow-x-auto rounded-xl border border-[var(--pp-border)]">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-[var(--pp-bg)]">
              {bloco.cabecalho.map((c) => (
                <th key={c} className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-[var(--pp-text-muted)]">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bloco.linhas.map((linha, i) => (
              <tr key={i} className="border-t border-[var(--pp-border)] align-top">
                {linha.map((celula, j) => (
                  <td key={j} className={`px-2.5 py-1.5 text-[12px] leading-snug ${j === 0 ? "font-bold text-[var(--pp-text)]" : "text-[var(--pp-text-body)]"}`}>
                    {celula}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (bloco.tipo === "aviso" || bloco.tipo === "dica") {
    const aviso = bloco.tipo === "aviso";
    const Icon = aviso ? TriangleAlert : Lightbulb;
    return (
      <div className={`flex gap-2 rounded-xl border px-2.5 py-2 ${
        aviso ? "border-[#F5DFA3] bg-[#FFFBEB]" : "border-[#BFE3CB] bg-[#F2FBF5]"
      }`}>
        <Icon size={15} className={`mt-0.5 shrink-0 ${aviso ? "text-[#8D6708]" : "text-[#1F7A3D]"}`} aria-hidden="true" />
        <div className="min-w-0">
          {bloco.titulo && <p className={`text-[11.5px] font-black ${aviso ? "text-[#8D6708]" : "text-[#1F7A3D]"}`}>{bloco.titulo}</p>}
          <p className="text-[12px] leading-relaxed text-[var(--pp-text-body)]">{bloco.texto}</p>
        </div>
      </div>
    );
  }

  if (bloco.tipo === "ilustracao") return <Ilustracao nome={bloco.nome} />;

  if (bloco.tipo === "imagem") {
    return <FiguraComFallback src={bloco.src} legenda={bloco.legenda} />;
  }

  return null;
}

/** Imagem da tela real — se o arquivo ainda não existir, some sem quebrar o layout. */
function FiguraComFallback({ src, legenda }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    <figure className="overflow-hidden rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)]">
      <img
        src={src}
        alt={legenda || "Captura da tela do PDV"}
        loading="lazy"
        onError={() => setOk(false)}
        className="block w-full"
      />
      {legenda && (
        <figcaption className="border-t border-[var(--pp-border)] px-2.5 py-1.5 text-[10.5px] font-semibold text-[var(--pp-text-muted)]">
          {legenda}
        </figcaption>
      )}
    </figure>
  );
}

function textoDaSecao(s) {
  const partes = [s.titulo, s.resumo];
  s.blocos.forEach((b) => {
    if (b.texto) partes.push(b.texto);
    if (b.titulo) partes.push(b.titulo);
    if (b.itens) partes.push(...b.itens);
    if (b.linhas) b.linhas.forEach((l) => partes.push(...l));
    if (b.legenda) partes.push(b.legenda);
  });
  return partes.filter(Boolean).join(" ");
}

const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Gera o PDF abrindo uma janela de impressão com o manual completo
 * (capa, índice numerado e todas as seções). O usuário escolhe
 * "Salvar como PDF" no diálogo do navegador.
 */
function imprimirDocumentacao(secoes, contexto) {
  const janela = window.open("", "_blank", "width=980,height=720");
  if (!janela) return;

  const indice = secoes
    .map((s, i) => `<li><span class="n">${i + 1}</span> <span>${esc(s.titulo)}</span><span class="dots"></span></li>`)
    .join("");

  const corpo = secoes.map((s, i) => `
    <section class="sec">
      <h2><span class="num">${i + 1}</span> ${esc(s.titulo)}</h2>
      ${s.resumo ? `<p class="resumo">${esc(s.resumo)}</p>` : ""}
      ${s.blocos.map(blocoParaHtml).join("")}
    </section>`).join("");

  janela.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Pedido Prime — Manual do PDV v${PDV_DOC_VERSAO}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1F2933; margin: 0; font-size: 11pt; line-height: 1.55; }
  .capa { text-align: center; padding: 40mm 0 18mm; border-bottom: 3px solid #F2994A; margin-bottom: 10mm; }
  .capa h1 { margin: 0; font-size: 26pt; letter-spacing: -0.5px; }
  .capa p { margin: 6px 0 0; color: #7B8794; font-size: 11pt; }
  .capa .selo { display: inline-block; margin-top: 12px; padding: 5px 12px; border-radius: 999px; background: #FFF7EF; color: #B3600E; font-weight: 800; font-size: 10pt; }
  h2 { font-size: 14pt; margin: 0 0 4px; display: flex; align-items: center; gap: 8px; }
  h2 .num { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: #F2994A; color: #fff; font-size: 10pt; }
  h3 { font-size: 11pt; margin: 12px 0 4px; text-transform: uppercase; letter-spacing: .08em; color: #7B8794; }
  .resumo { color: #52606D; margin: 0 0 8px; font-style: italic; }
  .sec { page-break-inside: avoid; margin-bottom: 9mm; }
  .indice { page-break-after: always; }
  .indice ol, .indice ul { list-style: none; padding: 0; margin: 0; }
  .indice li { display: flex; align-items: baseline; gap: 8px; padding: 5px 0; border-bottom: 1px dotted #E3E8EF; }
  .indice .n { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 5px; background: #F4F6F9; font-weight: 800; font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; page-break-inside: avoid; }
  th { background: #F4F6F9; text-align: left; font-size: 9pt; text-transform: uppercase; letter-spacing: .06em; color: #7B8794; padding: 6px 8px; border: 1px solid #E3E8EF; }
  td { padding: 6px 8px; border: 1px solid #E3E8EF; vertical-align: top; font-size: 10pt; }
  td:first-child { font-weight: 700; }
  ol, ul { margin: 4px 0 8px; padding-left: 18px; }
  li { margin: 3px 0; }
  .box { border-left: 4px solid #F0B429; background: #FFFBEB; padding: 8px 10px; margin: 8px 0; page-break-inside: avoid; }
  .box.dica { border-left-color: #2F9E52; background: #F2FBF5; }
  .box b { display: block; margin-bottom: 2px; }
  figure { margin: 8px 0; page-break-inside: avoid; }
  figure img { width: 100%; border: 1px solid #E3E8EF; border-radius: 6px; }
  figcaption { font-size: 9pt; color: #7B8794; margin-top: 4px; }
  .rodape { margin-top: 12mm; padding-top: 6px; border-top: 1px solid #E3E8EF; font-size: 9pt; color: #7B8794; text-align: center; }
</style></head><body>
<div class="capa">
  <h1>Manual do PDV</h1>
  <p>${esc(contexto.nomeLoja || "Pedido Prime")}</p>
  <span class="selo">Versão ${PDV_DOC_VERSAO} · atualizado em ${PDV_DOC_ATUALIZADO_EM}</span>
</div>
<div class="indice">
  <h2><span class="num">•</span> Índice</h2>
  <ul>${indice}</ul>
</div>
${corpo}
<p class="rodape">Pedido Prime · documentação gerada pela própria tela do PDV — sempre na versão em uso.</p>
<script>window.onload=function(){setTimeout(function(){window.print()},400)}</scr` + `ipt>
</body></html>`);
  janela.document.close();
}

function blocoParaHtml(b) {
  if (b.tipo === "p") return `<p>${esc(b.texto)}</p>`;
  if (b.tipo === "lista") {
    return `${b.titulo ? `<h3>${esc(b.titulo)}</h3>` : ""}<ul>${b.itens.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
  }
  if (b.tipo === "passos") {
    return `${b.titulo ? `<h3>${esc(b.titulo)}</h3>` : ""}<ol>${b.itens.map((i) => `<li>${esc(i)}</li>`).join("")}</ol>`;
  }
  if (b.tipo === "tabela") {
    return `<table><thead><tr>${b.cabecalho.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${
      b.linhas.map((l) => `<tr>${l.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")
    }</tbody></table>`;
  }
  if (b.tipo === "aviso" || b.tipo === "dica") {
    return `<div class="box ${b.tipo === "dica" ? "dica" : ""}">${b.titulo ? `<b>${esc(b.titulo)}</b>` : ""}${esc(b.texto)}</div>`;
  }
  if (b.tipo === "imagem") {
    const url = `${window.location.origin}${b.src}`;
    return `<figure><img src="${url}" alt="${esc(b.legenda || "")}">${b.legenda ? `<figcaption>${esc(b.legenda)}</figcaption>` : ""}</figure>`;
  }
  if (b.tipo === "ilustracao") {
    const rotulos = {
      mapaTela: "Mapa da tela: canais, conta, mesas e pagamento.",
      coresMesa: "Cores das mesas: disponível, ocupada e conta pedida.",
      anatomiaPagamento: "Anatomia da coluna de pagamento.",
      ajusteFinanceiro: "Desconto, acréscimo e remoção de taxa.",
      incluirProduto: "Incluir produto e comanda após comprovante.",
      dividirConta: "Modos de divisão: pessoa, percentual e produto.",
      clientePontos: "Identificação do cliente e pontos.",
      cupom: "Aplicação de cupom de desconto.",
    };
    return `<p class="resumo">[Ilustração] ${esc(rotulos[b.nome] || b.nome)}</p>`;
  }
  return "";
}
