import { useState } from "react";

// Campo que só grava quando a pessoa termina (ao sair ou com Enter). Evita gravar no banco a cada tecla.
export default function InputAoSair({ valor, onConfirmar, ...resto }) {
  const [rascunho, setRascunho] = useState(null); // null = não está sendo editado
  const confirmar = () => {
    if (rascunho != null && String(rascunho) !== String(valor ?? "")) onConfirmar(rascunho);
    setRascunho(null);
  };
  return (
    <input {...resto} value={rascunho ?? valor ?? ""}
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmar(); } }} />
  );
}
