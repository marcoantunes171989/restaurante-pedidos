// Cor de destaque por variante de status — mesma semântica de
// OrderStatusBadge.jsx (info=recebido, warning=em preparo, success=pronto,
// docs/design-tokens.md), em arquivo próprio (não-componente) para não
// misturar export de constante com export de componente no mesmo módulo.
export const STATUS_ACCENT = { novo: "var(--pp-info)", preparo: "var(--pp-warning)", pronto: "var(--pp-success)" };
