// ════════════════════════════════════════════════════════════
//  Bottom nav única do módulo operacional (Central, Pedidos, Cozinha,
//  Bar, Caixa). Antes cada uma dessas 5 telas desenhava sua própria nav
//  (emojis diferentes, cor do item ativo divergente — OperationalCentral
//  usava laranja #e8622c, as demais douravam #D9A441) — este componente
//  substitui todas.
//
//  `active` não é recalculado aqui a partir da URL: vem pronto de
//  OperacaoMobileView (src/App.jsx), que já é a única fonte da verdade
//  para a aba atual (sincronizada com a rota /operacional/:sub via
//  history.pushState). Isso evita ter duas lógicas de "qual rota é essa"
//  competindo, e elimina o hardcode por tela (nenhuma tela decide mais
//  sozinha qual item destacar).
// ════════════════════════════════════════════════════════════
import { ChefHat, ClipboardList, CreditCard, Home, Wine } from "lucide-react";

const ICONS = {
  central: Home,
  pedidos: ClipboardList,
  cozinha: ChefHat,
  bar: Wine,
  caixa: CreditCard,
};

export default function OperationalBottomNav({ items, active, onNavigate }) {
  return (
    <nav
      aria-label="Navegação operacional"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[#EEF0F3] bg-white/92 shadow-[0_-6px_24px_rgba(16,24,40,.08)] backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-md items-stretch gap-0.5 px-1 sm:max-w-2xl lg:max-w-4xl lg:justify-between">
        {items.map((item) => {
          const Icon = ICONS[item.id] || Home;
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 rounded-[14px] py-2 text-[11px] transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9A441] focus-visible:ring-offset-2 sm:text-xs ${
                isActive ? "font-bold text-[#D9A441]" : "font-medium text-[#667085] hover:text-[#101828]"
              }`}
              style={isActive ? { background: "rgba(217,164,65,.10)" } : undefined}
            >
              {isActive && (
                <span aria-hidden="true" className="absolute top-1.5 h-[3px] w-[26px] rounded-full bg-[#D9A441]" />
              )}
              <Icon aria-hidden="true" strokeWidth={1.8} className="h-[22px] w-[22px] sm:h-6 sm:w-6" />
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
