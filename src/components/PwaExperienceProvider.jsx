import { usePwaEnvironment } from "../lib/usePwaEnvironment";
import { usePwaPromptTimer } from "../lib/usePwaPromptTimer";
import PwaExperienceDialog from "./PwaExperienceDialog";

/**
 * PwaExperienceProvider — montado uma única vez na raiz (src/main.jsx).
 * Única fonte de verdade para: detecção de ambiente (usePwaEnvironment),
 * temporização/gating de exibição (usePwaPromptTimer) e renderização do
 * diálogo de instalação/abertura. Nenhuma tela implementa essa lógica
 * separadamente.
 */
export default function PwaExperienceProvider() {
  const { status, so, navegador, promptInstalar, recemInstalado } = usePwaEnvironment();
  const { visivel, dispensar, fechar } = usePwaPromptTimer(status);

  return (
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
  );
}
