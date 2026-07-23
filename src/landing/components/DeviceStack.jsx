import { LaptopFrame, TabletFrame, PhoneFrame } from "../devices";

// Pilha de dispositivos em 3D real: perspective + rotateY/rotateX no "palco"
// (a camada com transform-style: preserve-3d) e translateZ escalonado em
// cada dispositivo — o navegador compõe a rotação do palco com a
// profundidade de cada filho, dando o efeito de baralho angulado.
// Abaixo de 900px não há espaço horizontal para o notebook nem para a
// rotação 3D: o notebook some e tablet+celular ficam num empilhamento
// plano (sem transform), igual ao comportamento anterior do Hero.
// Conteúdo de tela é sempre um componente ilustrativo de src/landing/devices.jsx
// (o projeto não usa fotografia real nem screenshot — ver comentário no topo
// daquele arquivo); DeviceStack só resolve o "chrome" + a composição 3D.
export function DeviceStack({ laptop, tablet, phone, variant = "default", className = "" }) {
  const compact = variant === "compact";

  return (
    <div className={`relative mx-auto w-full ${compact ? "max-w-sm" : "max-w-lg"} ${className}`} style={{ perspective: "1600px" }}>
      <div
        className="relative min-[900px]:[transform:rotateY(-14deg)_rotateX(4deg)]"
        style={{ transformStyle: "preserve-3d" }}
      >
        {laptop && !compact && (
          <div className="relative hidden w-[62%] min-[900px]:block" style={{ transform: "translateZ(0px)" }}>
            <LaptopFrame>{laptop}</LaptopFrame>
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-2/3 rounded-t-2xl"
              style={{ background: "linear-gradient(120deg, rgba(255,255,255,0.06), transparent 45%)" }} />
          </div>
        )}

        <div className="relative z-10 -mt-16 ml-auto w-[72%] min-[900px]:-mt-24 min-[900px]:w-[58%]" style={{ transform: "translateZ(60px)" }}>
          <TabletFrame>{tablet}</TabletFrame>
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-2/3 rounded-t-[1.6rem]"
            style={{ background: "linear-gradient(120deg, rgba(255,255,255,0.06), transparent 45%)" }} />
        </div>

        <div className="absolute -bottom-6 left-0 z-20 w-[42%] min-w-[152px] min-[900px]:-bottom-10" style={{ transform: "translateZ(110px)" }}>
          <PhoneFrame>{phone}</PhoneFrame>
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-2/3 rounded-t-[2rem]"
            style={{ background: "linear-gradient(120deg, rgba(255,255,255,0.06), transparent 45%)" }} />
        </div>
      </div>
    </div>
  );
}
