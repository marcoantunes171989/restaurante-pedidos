import { Hourglass, Receipt, Wallet, CalendarCheck } from "lucide-react";
import OperationalMetricCard from "../OperationalMetricCard";

// Reaproveita o mesmo componente/variantes semânticas já usados na
// Central Operacional e em Pedidos/Cozinha/Bar — aguardando=warning
// (âmbar), contas em aberto=info (azul), valores financeiros=financial
// (dourado, mesmo tratamento das 3 métricas financeiras da Central, para
// consistência visual entre as telas). Nenhum cálculo aqui: os 4 valores
// já vêm prontos de CentralDoCaixa.jsx/OperacaoMobileView.
export default function CashierSummary({ aguardando, abertas, totalReceber, faturadoHoje }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <OperationalMetricCard title="Aguardando pagamento" value={String(aguardando)} icon={Hourglass} variant="warning" />
      <OperationalMetricCard title="Contas em aberto" value={String(abertas)} icon={Receipt} variant="info" />
      <OperationalMetricCard title="Total a receber" value={totalReceber} icon={Wallet} variant="financial" />
      <OperationalMetricCard title="Faturado hoje" value={faturadoHoje} icon={CalendarCheck} variant="financial" />
    </div>
  );
}
