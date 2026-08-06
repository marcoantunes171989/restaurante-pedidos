import { useEffect, useRef } from "react";
import { imprimirFilaProducao } from "../pages/pdv/pdvCuponsTermicos";

/**
 * Estação silenciosa: quando há filas pendentes com impressão automática,
 * tenta imprimir no navegador desta máquina e atualiza o status na fila.
 * Deve ficar montada na Operação / Cozinha do estabelecimento.
 */
export default function EstacaoImpressaoAuto({
  impressoes = [],
  lojaInfo = null,
  ativo = true,
  onAtualizarStatus = async () => {},
}) {
  const processandoRef = useRef(new Set());

  useEffect(() => {
    if (!ativo) return undefined;
    const pendentes = (impressoes || []).filter((j) =>
      j.status === "pendente"
      && j.impressaoAuto !== false
      && !processandoRef.current.has(j.id),
    );
    if (!pendentes.length) return undefined;

    let cancelado = false;
    (async () => {
      for (let i = 0; i < pendentes.length; i += 1) {
        if (cancelado) break;
        const job = pendentes[i];
        processandoRef.current.add(job.id);
        // Espaça pop-ups para não serem bloqueados em sequência.
        if (i > 0) await new Promise((r) => setTimeout(r, 400));
        try {
          const ok = imprimirFilaProducao(job, { lojaInfo });
          if (ok) {
            await onAtualizarStatus(job.id, {
              status: "impresso",
              tentativas: (job.tentativas || 0) + 1,
              precisaIntervencao: false,
            });
          } else {
            await onAtualizarStatus(job.id, {
              status: "erro",
              erroMsg: "Falha na impressão automática (pop-up bloqueado ou cancelado). Reimprima no painel.",
              tentativas: (job.tentativas || 0) + 1,
              precisaIntervencao: true,
            });
          }
        } catch (err) {
          await onAtualizarStatus(job.id, {
            status: "erro",
            erroMsg: err?.message || "Erro inesperado na impressão automática.",
            tentativas: (job.tentativas || 0) + 1,
            precisaIntervencao: true,
          });
        }
      }
    })();

    return () => { cancelado = true; };
  }, [impressoes, ativo, lojaInfo, onAtualizarStatus]);

  return null;
}
