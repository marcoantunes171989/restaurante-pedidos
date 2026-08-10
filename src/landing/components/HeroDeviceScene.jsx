import { DeviceStack } from "./DeviceStack";
import {
  PrinterFrame,
  TelaCardapioCliente,
  TelaDashboard,
  TelaKanban,
  TelaMesa,
} from "../devices";

const COZINHA = [
  { titulo: "Fila", cards: ["Burger", "Fritas"] },
  { titulo: "Preparo", cards: ["Pizza"] },
  { titulo: "Pronto", cards: ["Suco"] },
];

/** Composição notebook + tablet + smartphone + impressora + painel (hero). */
export default function HeroDeviceScene() {
  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-8 -z-10 rounded-[2.5rem] opacity-70 blur-2xl"
        style={{
          background:
            "radial-gradient(55% 55% at 40% 30%, rgba(243,133,37,0.22), transparent), radial-gradient(50% 50% at 70% 70%, rgba(1,46,70,0.35), transparent)",
        }}
      />

      <div className="pp-float relative">
        <DeviceStack
          laptop={<TelaDashboard compacta />}
          tablet={<TelaMesa />}
          phone={<TelaCardapioCliente compacta />}
        />
      </div>

      <div
        className="pp-float absolute -left-2 bottom-8 z-20 hidden w-[34%] sm:block lg:-left-6"
        style={{ animationDelay: "-2.8s" }}
      >
        <PrinterFrame />
      </div>

      <div
        className="pp-float absolute -right-1 top-4 z-20 hidden w-[30%] min-[900px]:block lg:-right-4"
        style={{ animationDelay: "-4s" }}
      >
        <div className="rounded-2xl border border-white/10 bg-[#012E46]/90 p-1.5 shadow-2xl backdrop-blur">
          <div className="overflow-hidden rounded-xl bg-white">
            <TelaKanban colunas={COZINHA} />
          </div>
        </div>
      </div>

    </div>
  );
}
