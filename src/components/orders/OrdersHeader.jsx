import OperationalHeader from "../OperationalHeader";

/**
 * Cabeçalho + busca (Pedidos, Cozinha, Bar, Caixa). Wrapper fino sobre o
 * OperationalHeader unificado — o markup vive lá (mesmo cabeçalho da Central),
 * aqui só fixamos as opções desta variante: com marca e com busca.
 */
export default function OrdersHeader({ searchPlaceholder = "Buscar pedido, cliente ou código…", ...props }) {
  return <OperationalHeader {...props} comLogo comBusca searchPlaceholder={searchPlaceholder} />;
}
