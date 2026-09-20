import { useCallback, useEffect, useRef, useState } from "react";
import AdminHelpButton from "./AdminHelpButton.jsx";
import AdminHelpDrawer from "./AdminHelpDrawer.jsx";

// Botão "Ajuda" + drawer de documentação, prontos para o cabeçalho de uma página
// administrativa. `doc` vem de helpContent.js (HELP_DOCS); `secaoContextual` é o
// id da seção a priorizar ao abrir (opcional). Ao fechar, o foco volta para o
// botão — por ref, sem depender de o navegador ter focado o botão no clique
// (Safari não foca botões ao clicar).
export default function AdminHelp({ doc, secaoContextual = null }) {
  const [aberto, setAberto] = useState(false);
  const botaoRef = useRef(null);
  const jaAbriu = useRef(false);

  const abrir = useCallback(() => setAberto(true), []);
  const fechar = useCallback(() => setAberto(false), []);

  useEffect(() => {
    if (aberto) jaAbriu.current = true;
    else if (jaAbriu.current) botaoRef.current?.focus();
  }, [aberto]);

  return (
    <>
      <AdminHelpButton ref={botaoRef} onClick={abrir} expanded={aberto} />
      {aberto && <AdminHelpDrawer doc={doc} initialSectionId={secaoContextual} onFechar={fechar} />}
    </>
  );
}
