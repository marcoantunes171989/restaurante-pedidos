import { useEffect, useState } from "react";
import {
  Utensils, Receipt, User, ClipboardList,
  Armchair, FileText, Clock, TrendingUp, ChevronRight,
  Calendar, Monitor, X, Minus, Plus, MoreVertical,
  QrCode, CreditCard, Banknote, Ticket, ArrowLeftRight, Check,
  Users, SplitSquareHorizontal, Pencil, Hourglass,
  HardDrive, ImageIcon,
} from "lucide-react";
import CheckoutKeypad from "../orders/checkout/CheckoutKeypad";

// ════════════════════════════════════════════════════════════════════
//  PDV — Caixa (Pedido Prime)
//  Tela de balcão fiel ao mockup: identificação da mesa, itens consumidos,
//  teclado numérico, formas de pagamento e divisão da conta. Usa a paleta
//  oficial (--pp-*: laranja de ação, petróleo institucional, verde de
//  sucesso, neutros quentes) e reutiliza o CheckoutKeypad já existente.
//  Conteúdo de exemplo (Mesa 12) reproduz o mockup; a interação local
//  (quantidades, forma de pagamento, divisão, teclado) funciona sem backend.
// ════════════════════════════════════════════════════════════════════

const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ITENS_INICIAIS = [
  { id: 1, nome: "Hambúrguer Prime", desc: "150g, cheddar, bacon", qtd: 1, unitario: 38.9 },
  { id: 2, nome: "Batata Frita", desc: "Porção", qtd: 1, unitario: 16.9 },
  { id: 3, nome: "Refrigerante Lata", desc: "Coca-Cola 350ml", qtd: 2, unitario: 6.9 },
  { id: 4, nome: "Milk Shake Ovomaltine", desc: "400ml", qtd: 1, unitario: 19.9 },
  { id: 5, nome: "Petit Gateau", desc: "Chocolate", qtd: 1, unitario: 22.9 },
];

const CONSULTAS = [
  { id: "mesa", label: "Mesa", icon: Utensils },
  { id: "comanda", label: "Comanda", icon: Receipt },
  { id: "cliente", label: "Cliente", icon: User },
  { id: "pedido", label: "Pedido", icon: ClipboardList },
];

const FORMAS = [
  { id: "pix", label: "Pix", icon: QrCode },
  { id: "credito", label: "Crédito", icon: CreditCard },
  { id: "debito", label: "Débito", icon: CreditCard },
  { id: "dinheiro", label: "Dinheiro", icon: Banknote },
  { id: "voucher", label: "Voucher", icon: Ticket },
  { id: "misto", label: "Misto", icon: ArrowLeftRight },
];

const DIVISOES = [
  { id: "igualmente", label: "Dividir igualmente", icon: Users },
  { id: "por", label: "Dividir por…", icon: SplitSquareHorizontal },
  { id: "valor", label: "Valor personalizado", icon: Pencil },
  { id: "parcial", label: "Pagamento parcial", icon: Hourglass },
];

const ATALHOS = [
  { tecla: "F2", label: "Buscar mesa" },
  { tecla: "F3", label: "Abrir comanda" },
  { tecla: "F4", label: "Pré-conta" },
  { tecla: "F5", label: "Fechar conta" },
  { tecla: "F6", label: "Pagamento" },
];

// ── Blocos de apoio ────────────────────────────────────────────────
function Cartao({ children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-surface)] shadow-[0_1px_2px_rgba(43,35,32,0.04)] ${className}`}>
      {children}
    </section>
  );
}
function Rotulo({ children, icon: Icon }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">
      {Icon && <Icon size={13} aria-hidden="true" />}{children}
    </p>
  );
}

// ── Cabeçalho ──────────────────────────────────────────────────────
function TopBar({ atendente, caixaNome, dataStr, horaStr, onFechar }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-[var(--pp-border)] bg-[var(--pp-surface)] px-4 lg:px-6">
      {/* Marca */}
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-[var(--pp-primary)] text-sm font-black text-[var(--pp-primary)]">PP</span>
        <span className="text-lg font-black leading-none">
          <span className="text-[var(--pp-primary)]">Pedido Prime</span> <span className="text-[var(--pp-text)]">PDV</span>
        </span>
        <span className="ml-1 hidden items-center gap-1.5 rounded-full bg-[var(--pp-success-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--pp-success-text)] sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--pp-success)]" /> OPERAÇÃO NORMAL
        </span>
      </div>

      {/* Data / hora */}
      <div className="ml-2 hidden items-center gap-4 text-sm font-semibold text-[var(--pp-text-body)] md:flex">
        <span className="flex items-center gap-1.5"><Calendar size={15} className="text-[var(--pp-text-muted)]" /> {dataStr}</span>
        <span className="flex items-center gap-1.5"><Clock size={15} className="text-[var(--pp-text-muted)]" /> {horaStr}</span>
      </div>

      {/* Caixa + usuário */}
      <div className="ml-auto flex items-center gap-4">
        <span className="hidden items-center gap-1.5 text-sm font-semibold text-[var(--pp-text-body)] sm:flex">
          <Monitor size={15} className="text-[var(--pp-text-muted)]" /> {caixaNome}
        </span>
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--pp-success)] text-sm font-black text-white">
            {(atendente || "L").charAt(0).toUpperCase()}
          </span>
          <span className="hidden leading-tight sm:block">
            <span className="block text-sm font-black text-[var(--pp-text)]">{atendente}</span>
            <span className="block text-[11px] text-[var(--pp-text-muted)]">Atendente</span>
          </span>
        </div>
        <button type="button" onClick={onFechar} aria-label="Fechar caixa"
          className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--pp-border)] bg-[var(--pp-surface)] text-[var(--pp-text-body)] transition-colors hover:bg-[var(--pp-bg)]">
          <X size={18} />
        </button>
      </div>
    </header>
  );
}

// ── Coluna esquerda ────────────────────────────────────────────────
function ConsultaRapida({ ativo, onSelecionar }) {
  return (
    <Cartao className="p-3.5">
      <Rotulo>Consulta rápida</Rotulo>
      <div className="mt-3 space-y-2">
        {CONSULTAS.map(({ id, label, icon: Icon }) => {
          const on = ativo === id;
          return (
            <button key={id} type="button" onClick={() => onSelecionar(id)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-3 text-sm font-bold transition ${
                on
                  ? "btn-laranja text-white"
                  : "border border-[var(--pp-border)] bg-[var(--pp-surface)] text-[var(--pp-text-body)] hover:bg-[var(--pp-bg)]"
              }`}>
              <Icon size={17} aria-hidden="true" /> {label}
            </button>
          );
        })}
      </div>
    </Cartao>
  );
}

function IndicadoresTurno() {
  const linhas = [
    { icon: Armchair, label: "Mesas ocupadas", valor: "18 / 32" },
    { icon: FileText, label: "Comandas em aberto", valor: "24" },
    { icon: Clock, label: "Contas aguardando", valor: "7" },
    { icon: TrendingUp, label: "Faturamento", valor: brl(7890.5) },
  ];
  return (
    <Cartao className="p-3.5">
      <Rotulo icon={TrendingUp}>Indicadores do turno</Rotulo>
      <div className="mt-2 divide-y divide-[var(--pp-border)]">
        {linhas.map(({ icon: Icon, label, valor }) => (
          <div key={label} className="flex items-center gap-2.5 py-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--pp-bg)] text-[var(--op-nav-accent)]"><Icon size={15} /></span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--pp-text-body)]">{label}</span>
            <span className="shrink-0 text-sm font-black tabular-nums text-[var(--pp-text)]">{valor}</span>
          </div>
        ))}
      </div>
      <button type="button" className="mt-1 flex w-full items-center justify-between px-1 py-1.5 text-[13px] font-bold text-[var(--pp-text-muted)] transition-colors hover:text-[var(--pp-text-body)]">
        Ver mais indicadores <ChevronRight size={15} />
      </button>
    </Cartao>
  );
}

// ── Coluna central ─────────────────────────────────────────────────
function Identificacao({ onFechar }) {
  return (
    <Cartao className="p-5">
      <div className="flex items-start justify-between">
        <Rotulo>Identificação</Rotulo>
        <button type="button" onClick={onFechar} aria-label="Fechar identificação"
          className="grid h-7 w-7 place-items-center rounded-lg text-[var(--pp-text-muted)] transition-colors hover:bg-[var(--pp-bg)]">
          <X size={16} />
        </button>
      </div>
      <h1 className="mt-1 text-3xl font-black tracking-tight text-[var(--pp-text)]">Mesa 12</h1>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-[var(--pp-text-muted)]">
        <span className="flex items-center gap-1.5"><Utensils size={13} /> Mesa 12</span>
        <span>·</span><span>Lucas Oliveira</span>
        <span>·</span><span>Aberta em 30/07/2026 às 09:57</span>
      </p>
      <span className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--pp-warning-soft)] px-2.5 py-1 text-xs font-bold text-[var(--pp-warning-text)]">
        <Clock size={13} /> Tempo aberta: 1h 25min
      </span>
    </Cartao>
  );
}

function LinhaItem({ item, onQtd }) {
  const { nome, desc, qtd, unitario } = item;
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 py-3.5 sm:grid-cols-[minmax(0,1fr)_104px_84px_78px_84px_24px]">
      {/* Produto */}
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] text-[var(--pp-text-muted)]"><ImageIcon size={16} /></span>
        <div className="min-w-0">
          <p className="text-sm font-black leading-tight text-[var(--pp-text)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">{nome}</p>
          <p className="truncate text-xs text-[var(--pp-text-muted)]">{desc}</p>
        </div>
      </div>

      {/* Qtd. */}
      <div className="flex items-center justify-self-end sm:justify-self-center">
        <div className="flex items-center overflow-hidden rounded-lg border border-[var(--pp-border)]">
          <button type="button" onClick={() => onQtd(-1)} aria-label="Diminuir"
            className="grid h-8 w-8 place-items-center text-[var(--pp-text-body)] transition-colors hover:bg-[var(--pp-bg)]"><Minus size={14} /></button>
          <span className="grid h-8 w-9 place-items-center border-x border-[var(--pp-border)] text-sm font-black tabular-nums text-[var(--pp-text)]">{qtd}</span>
          <button type="button" onClick={() => onQtd(1)} aria-label="Aumentar"
            className="grid h-8 w-8 place-items-center text-[var(--pp-text-body)] transition-colors hover:bg-[var(--pp-bg)]"><Plus size={14} /></button>
        </div>
      </div>

      {/* Observação */}
      <button type="button" className="hidden truncate text-left text-xs font-medium text-[var(--pp-text-muted)] transition-colors hover:text-[var(--pp-text-body)] sm:block">
        Obs.: …
      </button>

      {/* Unitário */}
      <span className="hidden text-right text-sm text-[var(--pp-text-body)] tabular-nums sm:block">{brl(unitario)}</span>

      {/* Total */}
      <span className="col-start-2 row-start-1 text-right text-sm font-black text-[var(--pp-text)] tabular-nums sm:col-start-auto sm:row-start-auto">{brl(unitario * qtd)}</span>

      {/* Ações */}
      <button type="button" aria-label="Mais ações" className="hidden place-items-center text-[var(--pp-text-muted)] transition-colors hover:text-[var(--pp-text-body)] sm:grid">
        <MoreVertical size={16} />
      </button>
    </div>
  );
}

function ItensConsumidos({ itens, onQtd, onAdicionar }) {
  return (
    <Cartao className="p-5">
      <Rotulo>Itens consumidos</Rotulo>
      {/* Cabeçalho da tabela (desktop) */}
      <div className="mt-3 hidden grid-cols-[minmax(0,1fr)_104px_84px_78px_84px_24px] gap-x-3 border-b border-[var(--pp-border)] pb-2 text-[10px] font-black uppercase tracking-wider text-[var(--pp-text-muted)] sm:grid">
        <span>Produto</span>
        <span className="text-center">Qtd.</span>
        <span>Observação</span>
        <span className="text-right">Unitário</span>
        <span className="text-right">Total</span>
        <span />
      </div>
      <div className="divide-y divide-[var(--pp-border)]">
        {itens.map((it) => (
          <LinhaItem key={it.id} item={it} onQtd={(d) => onQtd(it.id, d)} />
        ))}
      </div>
      <button type="button" onClick={onAdicionar}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--pp-primary)] py-3 text-sm font-black text-[var(--pp-primary-text)] transition-colors hover:bg-[var(--pp-primary-soft)]">
        <Plus size={17} /> Adicionar item
      </button>
    </Cartao>
  );
}

// ── Coluna direita ─────────────────────────────────────────────────
function FormaPagamento({ selecionada, onSelecionar }) {
  return (
    <Cartao className="p-4">
      <Rotulo>Forma de pagamento</Rotulo>
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        {FORMAS.map(({ id, label, icon: Icon }) => {
          const on = selecionada === id;
          return (
            <button key={id} type="button" onClick={() => onSelecionar(id)}
              className={`relative grid place-items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-bold transition ${
                on
                  ? "border-[var(--pp-primary)] bg-[var(--pp-primary-soft)] text-[var(--pp-text)]"
                  : "border-[var(--pp-border)] bg-[var(--pp-surface)] text-[var(--pp-text-body)] hover:bg-[var(--pp-bg)]"
              }`}>
              {on && (
                <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-[var(--pp-primary)] text-white"><Check size={11} strokeWidth={3} /></span>
              )}
              <Icon size={19} aria-hidden="true" className={on ? "text-[var(--pp-primary-text)]" : "text-[var(--pp-text-body)]"} />
              {label}
            </button>
          );
        })}
      </div>
    </Cartao>
  );
}

function DivisaoConta({ selecionada, onSelecionar }) {
  return (
    <Cartao className="p-4">
      <Rotulo>Divisão da conta</Rotulo>
      <div className="mt-3 grid grid-cols-4 gap-2.5">
        {DIVISOES.map(({ id, label, icon: Icon }) => {
          const on = selecionada === id;
          return (
            <button key={id} type="button" onClick={() => onSelecionar(id)}
              className={`grid place-items-center gap-1.5 rounded-xl border px-1.5 py-3 text-center text-[11px] font-bold leading-tight transition ${
                on
                  ? "btn-laranja border-transparent text-white"
                  : "border-[var(--pp-border)] bg-[var(--pp-surface)] text-[var(--pp-text-body)] hover:bg-[var(--pp-bg)]"
              }`}>
              <Icon size={18} aria-hidden="true" /> <span className="min-w-0">{label}</span>
            </button>
          );
        })}
      </div>
    </Cartao>
  );
}

// ── Rodapé ─────────────────────────────────────────────────────────
function AtalhosRodape({ horaStr }) {
  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--pp-border)] bg-[var(--pp-surface)] px-4 py-2.5 lg:px-6">
      <span className="text-[10px] font-black uppercase tracking-wider text-[var(--pp-text-muted)]">Atalhos rápidos</span>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {ATALHOS.map(({ tecla, label }) => (
          <span key={tecla} className="flex items-center gap-1.5 text-[13px] text-[var(--pp-text-body)]">
            <kbd className="rounded-md border border-[var(--pp-border)] bg-[var(--pp-bg)] px-1.5 py-0.5 text-[11px] font-black text-[var(--pp-text-body)]">{tecla}</kbd>
            {label}
          </span>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-4 text-[13px]">
        <span className="flex items-center gap-1.5 font-semibold text-[var(--pp-success-text)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--pp-success)]" /> Conexão ativa
        </span>
        <span className="hidden items-center gap-1.5 text-[var(--pp-text-muted)] sm:flex">
          <HardDrive size={14} /> Backup em dia {horaStr}
        </span>
      </div>
    </footer>
  );
}

// ── Tela ───────────────────────────────────────────────────────────
export default function PdvCaixa({ currentUser, lojaInfo, onFechar = () => {} }) {
  const [consulta, setConsulta] = useState("mesa");
  const [itens, setItens] = useState(ITENS_INICIAIS);
  const [forma, setForma] = useState("dinheiro");
  const [divisao, setDivisao] = useState("igualmente");
  const [codigo, setCodigo] = useState("");
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const dataStr = agora.toLocaleDateString("pt-BR");
  const horaStr = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const atendente = currentUser?.name || "Lucas Oliveira";
  const caixaNome = lojaInfo?.caixaNome || "Caixa 01";

  const alterarQtd = (id, delta) =>
    setItens((cur) => cur.map((it) => (it.id === id ? { ...it, qtd: Math.max(1, it.qtd + delta) } : it)));

  return (
    <div data-theme="light" className="tema-claro-area fixed inset-0 z-50 flex flex-col bg-[var(--pp-bg)] text-[var(--pp-text)]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <TopBar atendente={atendente} caixaNome={caixaNome} dataStr={dataStr} horaStr={horaStr} onFechar={onFechar} />

      <main className="flex flex-1 flex-col gap-4 overflow-auto p-4 lg:flex-row lg:gap-4 lg:overflow-hidden">
        {/* Esquerda */}
        <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[248px] lg:overflow-y-auto">
          <ConsultaRapida ativo={consulta} onSelecionar={setConsulta} />
          <IndicadoresTurno />
        </aside>

        {/* Centro */}
        <div className="flex min-w-0 flex-1 flex-col gap-4 lg:overflow-y-auto">
          <Identificacao onFechar={onFechar} />
          <ItensConsumidos itens={itens} onQtd={alterarQtd} onAdicionar={() => {}} />
        </div>

        {/* Direita */}
        <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[344px] lg:overflow-y-auto">
          <CheckoutKeypad
            onDigito={(d) => setCodigo((c) => (c + d).slice(0, 12))}
            onLimpar={() => setCodigo("")}
            onApagar={() => setCodigo((c) => c.slice(0, -1))}
            onConfirmar={() => setCodigo("")}
            confirmarDesabilitado={false}
          />
          <FormaPagamento selecionada={forma} onSelecionar={setForma} />
          <DivisaoConta selecionada={divisao} onSelecionar={setDivisao} />
        </aside>
      </main>

      <AtalhosRodape horaStr={horaStr} />
    </div>
  );
}
