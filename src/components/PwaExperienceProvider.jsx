import { usePwaEnvironment } from "../lib/usePwaEnvironment";
import { usePwaPromptTimer } from "../lib/usePwaPromptTimer";
import PwaExperienceDialog from "./PwaExperienceDialog";
import PwaUpdateBanner from "./PwaUpdateBanner";

/**
 * PwaExperienceProvider — montado uma única vez na raiz (src/main.jsx).
 * Única fonte de verdade para: detecção de ambiente (usePwaEnvironment),
 * temporização/gating de exibição (usePwaPromptTimer) e renderização do
 * diálogo de instalação/abertura + do aviso de atualização. Nenhuma tela
 * implementa essa lógica separadamente.
 *
 * O aviso de atualização (`PwaUpdateBanner`) só aparece rodando como
 * app (standalone) e o diálogo de instalação/abertura nunca aparece
 * rodando como app (usePwaPromptTimer ignora o status "running-as-app")
 * — mutuamente exclusivos por construção, sem necessidade de
 * coordenação extra.
 */
export default function PwaExperienceProvider({ swAtivado = false }) {
  const { status, so, navegador, promptInstalar, recemInstalado } = usePwaEnvironment();
  const { visivel, dispensar, fechar } = usePwaPromptTimer(status);

  return (
    <>
      <PwaUpdateBanner swAtivado={swAtivado} />
      <PwaExperienceDialog
        status={status}
        visivel={visivel}
        so={so}
        navegador={navegador}
        onDispensar={dispensar}
        onFechar={fechar}
        promptInstalar={promptInstalar}
        recemInstalado={recemInstalado}
      />
    </>
  );
}
