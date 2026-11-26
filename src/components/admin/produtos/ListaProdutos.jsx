import { useState } from "react";
import { Search, X, Pencil, Star, Trash2, Plus } from "lucide-react";
import { canaisOcultos, filtrarProdutos, filtrosDeSituacao, margemDoProduto, paginar, semFoto, semParametroFiscal, situacaoEstoque } from "../../../lib/listaProdutos";

// Lista de produtos: busca sempre à mão, atalhos por situação e por categoria, e cartões que cabem do celular ao computador.
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const chip = (ligado) => `min-h-11 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-semibold transition ${ligado ? "border-[#012E46] bg-[#012E46] text-white" : "border-[var(--pp-border)] bg-white text-[var(--pp-text-body)] hover:border-[#012E46]"}`;
const acao = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--pp-border)] bg-white px-2 text-[13px] font-semibold text-[#012E46] transition hover:border-[#012E46] sm:px-3 [&>svg]:shrink-0";
const selo = "rounded-md px-1.5 py-0.5 text-[11px] font-bold";
const fileira = "flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden";

function CartaoProduto({ p, imagemPadrao, usaParametroFiscal, onEditar, onOpcoes, onExcluir, onAlternar }) {
  const estoque = situacaoEstoque(p);
  const margem = margemDoProduto(p);
  const ocultos = canaisOcultos(p);
  const promo = Number(p.precoPromocional) > 0;
  return (
    <article className={`flex flex-col gap-2.5 rounded-2xl border bg-white p-3 transition hover:border-[#012E46]/40 ${p.active ? "border-[var(--pp-border)]" : "border-dashed border-[var(--pp-border)]"}`} data-testid="cartao-produto">
      <div className="flex items-start gap-3">
        <img src={p.imageUrl || imagemPadrao || undefined} alt="" loading="lazy" decoding="async" className={`h-16 w-16 shrink-0 rounded-xl object-cover ${p.active ? "" : "opacity-50 grayscale"}`} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[14px] font-bold leading-snug text-[var(--pp-text)]">{p.name}</h3>
          <p className="truncate text-[12px] text-[var(--pp-text-muted)]">{p.category}</p>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
            {promo && <s className="text-[12px] text-[var(--pp-text-muted)]">{brl(p.price)}</s>}
            <b className="text-[15px] tabular-nums text-[var(--pp-text)]">{brl(promo ? p.precoPromocional : p.price)}</b>
            {margem != null && <span className="text-[11px] font-semibold text-[#1F7A3D]">margem {margem}%</span>}
          </p>
        </div>
        <button type="button" role="switch" aria-checked={!!p.active} aria-label={`${p.name}: ${p.active ? "ativo, tocar para inativar" : "inativo, tocar para ativar"}`} onClick={() => onAlternar(p)}
          className="flex min-h-11 shrink-0 flex-col items-center justify-center gap-0.5 px-1" data-testid="alternar-produto">
          <span className={`relative h-6 w-11 rounded-full transition ${p.active ? "bg-[#2F9E52]" : "bg-[#CBD2D9]"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${p.active ? "left-[22px]" : "left-0.5"}`} /></span>
          <span className={`text-[10px] font-bold ${p.active ? "text-[#1F7A3D]" : "text-[var(--pp-text-muted)]"}`}>{p.active ? "Ativo" : "Inativo"}</span>
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 empty:hidden">
        {promo && <span className={`${selo} bg-[#FEF1E3] text-[#8A5200]`}>Promoção</span>}
        {estoque && <span className={`${selo} ${estoque.baixo ? "bg-[#FDECEA] text-[#B42318]" : "bg-[var(--pp-bg)] text-[var(--pp-text-body)]"}`}>{estoque.texto}{estoque.baixo ? " · baixo" : ""}</span>}
        {semFoto(p, imagemPadrao) && <span className={`${selo} bg-[var(--pp-bg)] text-[var(--pp-text-muted)]`}>Sem foto</span>}
        {usaParametroFiscal && semParametroFiscal(p) && <span className={`${selo} bg-[#FEF3E2] text-[#8A5200]`}>Sem parâmetro fiscal</span>}
        {ocultos.length > 0 && <span className={`${selo} bg-[#FEF3E2] text-[#8A5200]`}>Oculto: {ocultos.join(", ")}</span>}
      </div>
      <div className="mt-auto flex gap-2">
        <button type="button" className={`${acao} flex-1`} onClick={() => onEditar(p)} data-testid="editar-produto"><Pencil size={15} aria-hidden="true" /> Editar</button>
        {onOpcoes && <button type="button" className={`${acao} flex-1`} onClick={() => onOpcoes(p)} data-testid="opcoes-produto"><Star size={15} aria-hidden="true" /> Opções</button>}
        <button type="button" className={`${acao} w-11 shrink-0 !px-0 text-[#B42318]`} onClick={() => onExcluir(p)} aria-label={`Excluir ${p.name}`} title="Excluir" data-testid="excluir-produto"><Trash2 size={16} aria-hidden="true" /></button>
      </div>
    </article>
  );
}

export default function ListaProdutos({ produtos = [], categorias = [], imagemPadrao = "", usaParametroFiscal = false, onNovo, onEditar, onOpcoes = null, onExcluir, onAlternar }) {
  const [filtro, setFiltro] = useState({ busca: "", categoria: "Todas", situacao: "todos", pagina: 1 });
  const mudar = (patch) => setFiltro((f) => ({ ...f, pagina: 1, ...patch }));
  const situacoes = filtrosDeSituacao(produtos, { imagemPadrao, usaParametroFiscal });
  const situacao = situacoes.find((s) => s.id === filtro.situacao) || situacoes[0];
  const filtrados = filtrarProdutos(produtos, { busca: filtro.busca, categoria: filtro.categoria, situacao });
  const pag = paginar(filtrados, filtro.pagina);
  const filtrando = !!filtro.busca || filtro.categoria !== "Todas" || situacao.id !== "todos";
  const limpar = () => setFiltro({ busca: "", categoria: "Todas", situacao: "todos", pagina: 1 });

  if (produtos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--pp-border)] bg-white px-4 py-12 text-center" data-testid="produtos-vazio">
        <p className="text-[15px] font-bold text-[var(--pp-text)]">Nenhum produto cadastrado ainda</p>
        <p className="mt-1 text-[13px] text-[var(--pp-text-muted)]">Para começar basta nome, categoria e preço.</p>
        <button type="button" onClick={onNovo} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#012E46] px-5 text-sm font-bold text-white"><Plus size={16} aria-hidden="true" /> Cadastrar o primeiro produto</button>
      </div>
    );
  }

  return (
    <section aria-label="Produtos" className="pdv-toque space-y-3">
      {/* Fica presa no topo ao rolar: a busca e o "Novo" estão sempre à mão. */}
      <div className="sticky -top-4 z-10 -mx-1 flex gap-2 bg-white px-1 py-2 sm:-top-5 lg:-top-6">
        <div className="relative min-w-0 flex-1">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--pp-text-muted)]" />
          <input value={filtro.busca} onChange={(e) => mudar({ busca: e.target.value })} aria-label="Buscar produto" placeholder="Buscar produto"
            className="min-h-11 w-full rounded-xl border border-[var(--pp-border)] bg-white pl-10 pr-10 text-sm text-[var(--pp-text)] outline-none focus:border-[#012E46]" />
          {filtro.busca && <button type="button" onClick={() => mudar({ busca: "" })} aria-label="Limpar busca" className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-[var(--pp-text-muted)]"><X size={15} /></button>}
        </div>
        <button type="button" onClick={onNovo} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[#012E46] px-3.5 text-sm font-bold text-white" data-testid="novo-produto-barra"><Plus size={16} aria-hidden="true" /> Novo</button>
      </div>

      <div className={fileira} role="group" aria-label="Situação">
        {situacoes.map((s) => (
          <button key={s.id} type="button" aria-pressed={s.id === situacao.id} className={chip(s.id === situacao.id)} onClick={() => mudar({ situacao: s.id })} data-testid={`situacao-${s.id}`}>
            {s.rotulo} <span className="tabular-nums opacity-70">{s.total}</span>
          </button>
        ))}
      </div>
      {categorias.length > 0 && (
        <div className={fileira} role="group" aria-label="Categoria">
          {["Todas", ...categorias].map((c) => (
            <button key={c} type="button" aria-pressed={filtro.categoria === c} className={chip(filtro.categoria === c)} onClick={() => mudar({ categoria: c })}>{c === "Todas" ? "Todas as categorias" : c}</button>
          ))}
        </div>
      )}

      <p className="text-[12px] text-[var(--pp-text-muted)]" role="status" data-testid="contagem-produtos">
        {filtrados.length} de {produtos.length} produto(s){filtrando && <> · <button type="button" onClick={limpar} className="font-bold text-[#012E46] underline">limpar filtros</button></>}
      </p>

      {filtrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--pp-border)] bg-white px-4 py-10 text-center" data-testid="produtos-sem-resultado">
          <p className="text-[13px] text-[var(--pp-text-muted)]">Nenhum produto com esse filtro.</p>
          <button type="button" onClick={limpar} className={`${acao} mt-3`}>Ver todos</button>
        </div>
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
          {pag.itens.map((p) => (
            <CartaoProduto key={p.id} p={p} imagemPadrao={imagemPadrao} usaParametroFiscal={usaParametroFiscal} onEditar={onEditar} onOpcoes={onOpcoes} onExcluir={onExcluir} onAlternar={onAlternar} />
          ))}
        </div>
      )}

      {pag.total > 1 && (
        <nav aria-label="Páginas" className="flex items-center justify-center gap-3 pt-1">
          <button type="button" className={`${acao} disabled:opacity-40`} disabled={pag.atual <= 1} onClick={() => setFiltro((f) => ({ ...f, pagina: pag.atual - 1 }))}>‹ Anterior</button>
          <span className="text-[13px] font-semibold text-[var(--pp-text-body)]">{pag.atual} de {pag.total}</span>
          <button type="button" className={`${acao} disabled:opacity-40`} disabled={pag.atual >= pag.total} onClick={() => setFiltro((f) => ({ ...f, pagina: pag.atual + 1 }))}>Próxima ›</button>
        </nav>
      )}
    </section>
  );
}
