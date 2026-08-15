import { LogoPP } from "../components/BrandLogo";
import { IconShield, IconCentral, IconRelogio, IconDados } from "./icons";
import { INSTITUCIONAL } from "./content";

const ICONES_BENEFICIO = { central: IconCentral, tempo: IconRelogio, dados: IconDados };

// ════════════════════════════════════════════════════════════
//  Área institucional (desktop/tablet) — creme, sofisticada, com
//  bastante respiro. Some no mobile (ver LoginPage), onde só a marca
//  e uma frase curta de valor aparecem acima do formulário.
// ════════════════════════════════════════════════════════════
export default function LoginBrandPanel() {
  return (
    <aside className="pp-anim-left relative hidden h-full shrink-0 overflow-hidden bg-[#012E46] px-[clamp(2rem,5vw,5.5rem)] py-[clamp(1.5rem,4vh,3.5rem)] md:block md:w-[46%] lg:w-[56%]">
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #FFFFFF 1px, transparent 0)", backgroundSize: "34px 34px" }} />
      <div className="pointer-events-none absolute -right-48 -top-48 h-[34rem] w-[34rem] rounded-full border border-white/10" />
      <div className="pointer-events-none absolute -right-28 -top-28 h-[22rem] w-[22rem] rounded-full border border-[#F38525]/20" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-1 w-32 bg-[#F38525]" />

      <div className="relative z-10 flex h-full min-h-0 w-full flex-col justify-between">
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-center gap-3">
            <LogoPP size={42} />
            <span className="text-sm font-extrabold tracking-tight text-white">PEDIDO <span className="text-[#F38525]">PRIME</span></span>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md">
          <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/65">
            <span className="h-1.5 w-1.5 rounded-full bg-[#F38525]" />
            {INSTITUCIONAL.selo}
          </span>

          <h1 className="font-display mt-6 text-[clamp(2rem,1.25rem+2.4vw,3.6rem)] font-extrabold leading-[1.06] tracking-[-0.035em] text-white">
            {INSTITUCIONAL.headline}
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-7 text-white/65">
            {INSTITUCIONAL.descricao}
          </p>

          <div className="mt-9 grid gap-4 sm:grid-cols-3">
            {INSTITUCIONAL.beneficios.map((b) => {
              const Icone = ICONES_BENEFICIO[b.icon];
              return (
                <div key={b.texto} className="border-l border-white/15 pl-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-[#F38525]"><Icone /></span>
                  <p className="mt-2 text-xs font-semibold leading-5 text-white/80">{b.texto}</p>
                </div>
              );
            })}
          </div>
        </div>

        <p className="mx-auto flex w-full max-w-md shrink-0 items-center gap-2 text-[11px] text-white/50">
          <IconShield />
          {INSTITUCIONAL.rodape}
        </p>
      </div>
    </aside>
  );
}
