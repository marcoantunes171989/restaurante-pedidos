import OperationalHeader from "../OperationalHeader";

/**
 * Cabeçalho das telas de lista do operacional (Pedidos, Cozinha, Bar, Caixa).
 * Wrapper fino sobre o OperationalHeader unificado — o markup vive lá (mesmo
 * cabeçalho da Central); aqui só fixamos as opções desta variante: com marca e
 * com a linha de notificações (sino + config). A busca por pedido/cliente foi
 * removida do operacional; props de busca eventualmente passadas pelos pais são
 * ignoradas pelo OperationalHeader.
 */
export default function OrdersHeader(props) {
  return <OperationalHeader {...props} comLogo comNotificacoes />;
}
