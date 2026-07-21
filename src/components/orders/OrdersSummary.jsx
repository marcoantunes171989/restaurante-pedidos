import { Bell, Clock, CheckCircle2 } from "lucide-react";
import OperationalMetricCard from "../OperationalMetricCard";

// Reaproveita o mesmo componente/variantes semânticas já criados para a
// Central Operacional (info=recebido, warning=em preparo, success=pronto —
// docs/design-tokens.md). Os indicadores não são clicáveis: a tela atual
// nunca teve filtro por clique nesses 3 cards (sem inventar ação nova).
export default function OrdersSummary({ novos = 0, preparo = 0, prontos = 0 }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <OperationalMetricCard title="Novos" value={String(novos)} icon={Bell} variant="info" />
      <OperationalMetricCard title="Em preparo" value={String(preparo)} icon={Clock} variant="warning" />
      <div className="col-span-2 sm:col-span-1">
        <OperationalMetricCard title="Prontos" value={String(prontos)} icon={CheckCircle2} variant="success" />
      </div>
    </div>
  );
}
