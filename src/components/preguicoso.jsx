import { Suspense, lazy } from "react";

// Tela ou janela baixada só quando é usada (abertura do sistema mais leve). Leva o próprio aviso de espera,
// para não trocar a tela inteira enquanto o código chega.
export default function preguicoso(carregar, rotulo = "Abrindo…") {
  const Parte = lazy(carregar);
  return function Preguicoso(props) {
    return (
      <Suspense fallback={(
        <div role="status" aria-label={rotulo} className="flex min-h-[8rem] w-full items-center justify-center gap-2.5 p-6 text-sm text-[#667085]">
          <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-[#012E46]/15 border-t-[#012E46]" />
          {rotulo}
        </div>
      )}>
        <Parte {...props} />
      </Suspense>
    );
  };
}
