import { MESA_STATUS_META } from "./pdvHelpers";

/**
 * Mockups esquemáticos da ajuda. São desenhados com os mesmos tokens da
 * tela, então acompanham qualquer mudança de paleta sem precisar refazer
 * imagem — a documentação nunca fica com a cor antiga do produto.
 */
export default function Ilustracao({ nome }) {
  const Componente = MAPA[nome];
  if (!Componente) return null;
  return (
    <figure className="my-3 overflow-hidden rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-3">
      <Componente />
    </figure>
  );
}

function MapaTela() {
  return (
    <div className="space-y-1.5">
      <Faixa titulo="Canais · busca · operador" tom="petroleo" />
      <Faixa titulo="Resumo do turno · status da cozinha" tom="neutro" />
      <div className="grid grid-cols-[0.9fr_1.6fr_0.9fr] gap-1.5">
        <Coluna titulo="Conta" itens={["Cliente", "Incluir produto", "Itens", "Totais"]} />
        <Coluna titulo="Salão / canal ativo" itens={["Mesas", "Delivery", "Comandas"]} destaque />
        <Coluna titulo="Pagamento" itens={["Cliente e pontos", "Formas", "Teclado", "Acréscimo / desconto", "Cupom"]} />
      </div>
      <Faixa titulo="Ações da conta · Fechar conta" tom="laranja" />
    </div>
  );
}

function CoresMesa() {
  const exemplos = [
    { status: "livre", numero: "Mesa 01", linha1: "Livre", linha2: "4 lugares", valor: null },
    { status: "ocupada", numero: "Mesa 02", linha1: "Marina Souza", linha2: "38min · Em preparo", valor: "R$ 114,73" },
    { status: "pendente", numero: "Mesa 05", linha1: "Rafael Lima", linha2: "1h 14min · Pronto", valor: "R$ 143,00" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {exemplos.map((m) => {
        const meta = MESA_STATUS_META[m.status];
        return (
          <div key={m.numero} className={`rounded-lg border p-2 ${meta.card} ${meta.border}`}>
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-[11px] font-black text-[var(--pp-text)]">{m.numero}</span>
              <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
            </div>
            <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[8px] font-black uppercase ${meta.chip}`}>
              {meta.curto}
            </span>
            <p className="mt-1 truncate text-[9px] font-semibold text-[var(--pp-text-body)]">{m.linha1}</p>
            <p className="truncate text-[9px] text-[var(--pp-text-muted)]">{m.linha2}</p>
            {m.valor && <p className="mt-0.5 text-[10px] font-black text-[var(--pp-text)]">{m.valor}</p>}
          </div>
        );
      })}
    </div>
  );
}

function AnatomiaPagamento() {
  return (
    <div className="mx-auto max-w-[280px] space-y-1.5 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-surface)] p-2">
      <Bloco rotulo="1" texto="Total da conta e valor digitado" />
      <Bloco rotulo="2" texto="Cliente e saldo de pontos" tom="verde" />
      <Bloco rotulo="3" texto="Formas de pagamento · Dividir" />
      <Bloco rotulo="4" texto="Valor total · teclado · OK" tom="laranja" />
      <Bloco rotulo="5" texto="Recebimentos registrados" />
      <Bloco rotulo="6" texto="Desconto · Acréscimo · Remover taxa" />
      <Bloco rotulo="7" texto="Cupom de desconto" />
      <Bloco rotulo="8" texto="Recebido · Falta · Troco · Pontos" />
    </div>
  );
}

function AjusteFinanceiro() {
  return (
    <div className="mx-auto max-w-[300px] space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-lg border border-[var(--pp-danger)]/30 bg-[var(--pp-surface)] px-2 py-1.5">
          <p className="text-[8px] font-black uppercase tracking-wide text-[var(--pp-danger)]">Desconto</p>
          <p className="text-[12px] font-black tabular-nums text-[var(--pp-text)]">5,00</p>
        </div>
        <div className="rounded-lg border border-[#BFE3CB] bg-[#F2FBF5] px-2 py-1.5">
          <p className="text-[8px] font-black uppercase tracking-wide text-[#1F7A3D]">Acréscimo</p>
          <p className="text-[12px] font-black tabular-nums text-[var(--pp-text)]">0,00</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] px-2 py-1.5">
        <span className="truncate text-[10px] font-bold text-[var(--pp-text-body)]">Taxa de serviço 10% · R$ 7,23</span>
        <span className="shrink-0 text-[9px] font-black text-[var(--pp-primary-text)] underline decoration-dotted">Remover</span>
      </div>
    </div>
  );
}

function IncluirProduto() {
  return (
    <div className="mx-auto max-w-[300px] space-y-1.5">
      <div className="flex h-9 items-center justify-center gap-1 rounded-xl bg-[var(--pp-primary)] text-[11px] font-black text-white shadow-sm">
        + Incluir produto
      </div>
      <div className="rounded-lg border border-[#F5DFA3] bg-[#FFFBEB] px-2 py-1.5 text-[9px] font-semibold text-[#8D6708]">
        Comprovante emitido — informe a comanda do cliente.
      </div>
      <div className="rounded-lg border border-[var(--pp-border)] bg-[var(--pp-surface)] px-2 py-1.5">
        <p className="text-[8px] font-black uppercase tracking-wide text-[var(--pp-text-muted)]">Comanda do cliente</p>
        <p className="text-[11px] font-black tabular-nums text-[var(--pp-text)]">CMD-000245</p>
      </div>
    </div>
  );
}

function DividirConta() {
  const modos = [
    { titulo: "Por pessoa", exemplo: "R$ 120,00 ÷ 4", resultado: "R$ 30,00" },
    { titulo: "Percentual", exemplo: "50% de R$ 159,50", resultado: "R$ 79,75" },
    { titulo: "Por produto", exemplo: "Coca 1L ÷ 3", resultado: "R$ 5,50" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {modos.map((m) => (
        <div key={m.titulo} className="rounded-lg border border-[var(--pp-border)] bg-[var(--pp-surface)] p-2 text-center">
          <p className="text-[10px] font-black text-[var(--pp-text)]">{m.titulo}</p>
          <p className="mt-1 text-[9px] text-[var(--pp-text-muted)]">{m.exemplo}</p>
          <p className="mt-1 text-[12px] font-black text-[var(--pp-primary-text)]">{m.resultado}</p>
        </div>
      ))}
    </div>
  );
}

function ClientePontos() {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] px-2 py-1.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--pp-border)] text-[10px] font-black text-[var(--pp-text-body)]">?</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10px] font-black text-[var(--pp-text-body)]">Cliente não identificado</span>
          <span className="block truncate text-[9px] text-[var(--pp-text-muted)]">Identificar para ganhar pontos</span>
        </span>
        <span className="shrink-0 rounded border border-[var(--pp-border)] bg-[var(--pp-surface)] px-1.5 py-0.5 text-[9px] font-black text-[var(--pp-text-body)]">Identificar</span>
      </div>
      <p className="text-center text-[9px] font-bold text-[var(--pp-text-muted)]">↓ telefone consultado na base</p>
      <div className="flex items-center gap-2 rounded-lg border border-[#BFE3CB] bg-[#F2FBF5] px-2 py-1.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#DFF3E6] text-[10px] font-black text-[#1F7A3D]">✓</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10px] font-black text-[#1F7A3D]">Rafael Lima</span>
          <span className="block truncate text-[9px] text-[var(--pp-text-muted)]">3500 pontos disponíveis</span>
        </span>
        <span className="shrink-0 rounded border border-[var(--pp-border)] bg-[var(--pp-surface)] px-1.5 py-0.5 text-[9px] font-black text-[var(--pp-text-body)]">Trocar</span>
      </div>
    </div>
  );
}

function Cupom() {
  return (
    <div className="mx-auto max-w-[280px] space-y-1.5">
      <div className="flex items-center gap-1">
        <span className="flex h-7 flex-1 items-center rounded-lg border border-[var(--pp-border)] bg-[var(--pp-surface)] px-2 text-[10px] font-black uppercase tracking-wide text-[var(--pp-text)]">
          PRIME10
        </span>
        <span className="flex h-7 items-center rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] px-2 text-[10px] font-black text-[var(--pp-text-body)]">Aplicar</span>
      </div>
      <p className="px-0.5 text-[9px] font-bold text-[#1F7A3D]">Cupom válido · −R$ 11,99 · 2 restante(s)</p>
      <div className="flex items-center gap-1.5 rounded-lg border border-[#BFE3CB] bg-[#F2FBF5] px-2 py-1">
        <span className="min-w-0 flex-1 truncate text-[10px] font-black uppercase text-[#1F7A3D]">PRIME10</span>
        <span className="shrink-0 text-[10px] font-black text-[#1F7A3D]">−R$ 11,99</span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <p className="rounded border border-[#F5DFA3] bg-[#FFFBEB] px-1.5 py-1 text-[8px] font-bold text-[#8D6708]">Fora do prazo</p>
        <p className="rounded border border-[var(--pp-danger)]/25 bg-[var(--pp-danger-soft)] px-1.5 py-1 text-[8px] font-bold text-[var(--pp-danger)]">Quantidade esgotada</p>
      </div>
    </div>
  );
}

function Faixa({ titulo, tom = "neutro" }) {
  const tons = {
    neutro: "border-[var(--pp-border)] bg-[var(--pp-surface)] text-[var(--pp-text-body)]",
    petroleo: "border-[var(--op-nav-accent)]/25 bg-[var(--op-nav-accent-soft)] text-[var(--op-nav-accent)]",
    laranja: "border-[var(--pp-primary)]/35 bg-[var(--pp-primary-soft)] text-[var(--pp-primary-text)]",
  };
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-center text-[9px] font-black uppercase tracking-wide ${tons[tom]}`}>
      {titulo}
    </div>
  );
}

function Coluna({ titulo, itens, destaque }) {
  return (
    <div className={`rounded-lg border p-2 ${destaque ? "border-[var(--pp-primary)]/40 bg-[var(--pp-primary-soft)]" : "border-[var(--pp-border)] bg-[var(--pp-surface)]"}`}>
      <p className="mb-1 text-[9px] font-black uppercase tracking-wide text-[var(--pp-text-body)]">{titulo}</p>
      <ul className="space-y-0.5">
        {itens.map((i) => (
          <li key={i} className="truncate rounded bg-[var(--pp-bg)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--pp-text-muted)]">{i}</li>
        ))}
      </ul>
    </div>
  );
}

function Bloco({ rotulo, texto, tom = "neutro" }) {
  const tons = {
    neutro: "border-[var(--pp-border)] bg-[var(--pp-bg)] text-[var(--pp-text-body)]",
    verde: "border-[#BFE3CB] bg-[#F2FBF5] text-[#1F7A3D]",
    laranja: "border-[var(--pp-primary)]/35 bg-[var(--pp-primary-soft)] text-[var(--pp-primary-text)]",
  };
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${tons[tom]}`}>
      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[var(--pp-surface)] text-[8px] font-black">{rotulo}</span>
      <span className="truncate text-[10px] font-bold">{texto}</span>
    </div>
  );
}

const MAPA = {
  mapaTela: MapaTela,
  coresMesa: CoresMesa,
  anatomiaPagamento: AnatomiaPagamento,
  ajusteFinanceiro: AjusteFinanceiro,
  incluirProduto: IncluirProduto,
  dividirConta: DividirConta,
  clientePontos: ClientePontos,
  cupom: Cupom,
};
