import { LogoPP } from "../components/BrandLogo";
import { IconShield, IconCentral, IconRelogio, IconDados } from "./icons";
import ProductPreview from "./ProductPreview";
import { INSTITUCIONAL } from "./content";

const ICONES_BENEFICIO = { central: IconCentral, tempo: IconRelogio, dados: IconDados };

// ════════════════════════════════════════════════════════════
//  Área institucional (desktop/tablet) — creme, sofisticada, com
//  bastante respiro. Some no mobile (ver LoginPage), onde só a marca
//  e uma frase curta de valor aparecem acima do formulário.
// ════════════════════════════════════════════════════════════
export default function LoginBrandPanel() {
  return (
    <aside className="pp-anim-left relative hidden h-full shrink-0 overflow-hidden border-r border-[var(--login-border)] bg-[var(--login-background)] px-[clamp(1.75rem,4vw,4.5rem)] py-[clamp(1rem,3vh,3rem)] md:block md:w-[42%] lg:w-[54%]">
      {/* Textura e formas orgânicas — muito discretas, nunca competem com o conteúdo */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #211814 1px, transparent 0)", backgroundSize: "30px 30px" }} />
      <div className="pointer-events-none absolute -top-28 -right-24 h-[24rem] w-[24rem] rounded-full bg-[var(--login-primary-soft)] opacity-60 blur-[2px]" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 h-[20rem] w-[20rem] rounded-full bg-[var(--login-surface-secondary)] opacity-70" />

      <div className="relative z-10 flex h-full min-h-0 w-full flex-col justify-center gap-[clamp(1rem,3vh,2.25rem)] overflow-y-auto">
        <div className="mx-auto w-full max-w-md">
          <LogoPP size={40} />
        </div>

        <div className="mx-auto max-w-md">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--login-border)] bg-[var(--login-surface)] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--login-text-secondary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--login-primary)]" />
            {INSTITUCIONAL.selo}
          </span>

          <h1 className="font-display mt-5 text-[clamp(1.75rem,1.2rem+2vh,2.75rem)] font-black leading-[1.12] tracking-tight text-[var(--login-text-primary)]">
            {INSTITUCIONAL.headline}
          </h1>
          <p className="mt-4 max-w-sm text-[15px] leading-7 text-[var(--login-text-secondary)]">
            {INSTITUCIONAL.descricao}
          </p>

          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2.5">
            {INSTITUCIONAL.beneficios.map((b) => {
              const Icone = ICONES_BENEFICIO[b.icon];
              return (
                <div key={b.texto} className="flex items-center gap-2 text-sm font-semibold text-[var(--login-text-primary)]">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--login-primary-soft)] text-[var(--login-primary-hover)]"><Icone /></span>
                  {b.texto}
                </div>
              );
            })}
          </div>

          <div className="mt-7">
            <ProductPreview />
          </div>
        </div>

        <p className="mx-auto flex max-w-md shrink-0 items-center justify-center gap-2 text-xs text-[var(--login-text-secondary)]">
          <IconShield />
          {INSTITUCIONAL.rodape}
        </p>
      </div>
    </aside>
  );
}
