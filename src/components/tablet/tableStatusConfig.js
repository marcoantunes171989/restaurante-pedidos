// Mapeamento central dos estados de mesa da tela de acesso do tablet —
// única fonte de verdade para rótulo/variante/tom visual, para não
// espalhar condicionais de cor pelos componentes. Reflete só os sinais
// REAIS já existentes no projeto (ver App.jsx/TabletView):
//   - "occupiedDevice": outro dispositivo reportou essa mesa há menos de
//     5 min (heartbeat em tab_dispositivos) — bloqueia a seleção.
//   - "occupiedOrder": a mesa tem pedido em aberto (não pago, não
//     cancelado), mas NENHUM outro tablet está com ela agora — seleção
//     permitida, mediante confirmação.
//   - "available": nem um nem outro.
//   - "current": é a mesa já vinculada a ESTE tablet.
export const TABLE_STATUS = {
  available: { label: "Disponível", variant: "success" },
  occupiedOrder: { label: "Ocupada", variant: "warning" },
  occupiedDevice: { label: "Em uso em outro dispositivo", variant: "error" },
  current: { label: "Selecionada", variant: "primary" },
};

// Classes por variante — usadas tanto no selo/legenda quanto no card da mesa.
export const STATUS_VARIANT_CLASSES = {
  success: {
    surface: "border-[var(--client-success-border)] bg-[var(--client-success-soft)]",
    text: "text-[var(--client-success)]",
    dot: "bg-[var(--client-success)]",
  },
  warning: {
    surface: "border-[var(--client-warning-border)] bg-[var(--client-warning-soft)]",
    text: "text-[var(--client-warning)]",
    dot: "bg-[var(--client-warning)]",
  },
  error: {
    surface: "border-[var(--client-error-border)] bg-[var(--client-error-soft)]",
    text: "text-[var(--client-error)]",
    dot: "bg-[var(--client-error)]",
  },
  primary: {
    surface: "border-[var(--client-primary)] bg-[var(--client-primary-soft)]",
    text: "text-[var(--client-primary-active)]",
    dot: "bg-[var(--client-primary)]",
  },
};

export function statusDaMesa({ numero, tableNumberAtual, ocupadaPorDispositivo, temPedidoAberto }) {
  if (String(numero) === String(tableNumberAtual)) return "current";
  if (ocupadaPorDispositivo) return "occupiedDevice";
  if (temPedidoAberto) return "occupiedOrder";
  return "available";
}
