// Barra de indicadores do Hero — números em Space Grotesk (font-data, já
// carregada em index.html, ver tailwind.config.js) e nota de rodapé
// obrigatória (disclaimer de que os números variam por operação).
// Grid responsivo: 2 colunas no mobile, 3 no tablet, 6 no desktop.
export function StatBar({ indicadores, nota, className = "" }) {
  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 border-t border-[var(--pp-border)] pt-7 sm:grid-cols-3 lg:grid-cols-6">
        {indicadores.map((k) => (
          <div key={k.label}>
            <p className="font-data text-xl font-black text-[var(--pp-primary-hover)] sm:text-2xl">{k.valor}</p>
            <p className="mt-1 text-[11px] font-semibold leading-tight text-[var(--pp-text-muted)]">{k.label}</p>
          </div>
        ))}
      </div>
      {nota && <p className="mt-3 text-[11px] leading-5 text-[var(--pp-text-muted)]/80">{nota}</p>}
    </div>
  );
}
