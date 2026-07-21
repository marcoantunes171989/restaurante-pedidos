// ════════════════════════════════════════════════════════════
//  Selo de status financeiro do Caixa (tema claro) — vocabulário
//  diferente do fluxo de produção (Novo/Em preparo/Pronto, ver
//  OrderStatusBadge.jsx): aguardando/em_aberto/pago. Mesma semântica de
//  cor documentada para a tela Caixa (aguardando=âmbar, em_aberto=azul,
//  pago=verde) — igual em espírito a OrderStatusBadge, mas com o próprio
//  mapa de rótulo/cor, sem misturar os dois vocabulários num só arquivo.
// ════════════════════════════════════════════════════════════
const VARIANTE = {
  aguardando: { label: "Aguardando", bg: "bg-[var(--pp-warning-soft)]", text: "text-[var(--pp-warning-text)]" },
  em_aberto: { label: "Em aberto", bg: "bg-[var(--pp-info-soft)]", text: "text-[var(--pp-info)]" },
  pago: { label: "Pago", bg: "bg-[var(--pp-success-soft)]", text: "text-[var(--pp-success-text)]" },
};

export default function AccountStatusBadge({ categoria }) {
  const v = VARIANTE[categoria] || VARIANTE.aguardando;
  return (
    <span className={`inline-flex shrink-0 items-center rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${v.bg} ${v.text}`}>
      {v.label}
    </span>
  );
}
