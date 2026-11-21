import { useState } from "react";
import { chaveFormatada, linksConsultaNfce, soDigitos } from "../../../lib/fiscal/consultaPublicaNfce";

const link = "inline-flex min-h-8 items-center rounded-lg border border-[var(--pp-border)] bg-white px-2.5 py-1 text-[12px] font-semibold text-[var(--pp-text-body)] transition hover:border-[#012E46]";

/**
 * Chave de acesso da nota, para conferir e consultar na SEFAZ: chave em blocos de 4, copiar e abrir a consulta pública.
 * O link só aparece para nota que existe na SEFAZ (autorizada ou cancelada).
 */
export default function ChaveAcessoNota({ nota }) {
  const [copiada, setCopiada] = useState("");
  const chave = soDigitos(nota?.chave);
  if (chave.length !== 44) return null;
  const naSefaz = ["autorizado", "cancelado"].includes(nota.status);
  const links = naSefaz ? linksConsultaNfce({ chave, ambiente: nota.ambiente, modelo: nota.modelo }) : null;
  const homolog = nota.ambiente !== "producao";

  const copiar = async () => {
    try { await navigator.clipboard.writeText(chave); setCopiada("ok"); } catch { setCopiada("erro"); }
    setTimeout(() => setCopiada(""), 2500);
  };

  return (
    <div className="mt-1.5 rounded-xl border border-[var(--pp-border)] bg-white px-3 py-2" data-testid="chave-acesso">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">Chave de acesso</p>
      <p className="mt-0.5 break-all font-mono text-[12px] text-[var(--pp-text)]" data-testid="chave-texto">{chaveFormatada(chave)}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <button type="button" className={link} onClick={copiar} data-testid="btn-copiar-chave">
          {copiada === "ok" ? "Chave copiada" : copiada === "erro" ? "Não foi possível copiar" : "Copiar chave"}
        </button>
        {links?.direta && (
          <a className={link} href={links.direta} target="_blank" rel="noopener noreferrer" data-testid="link-consulta-direta">Abrir na SEFAZ</a>
        )}
        {links && (
          <a className={link} href={links.portal} target="_blank" rel="noopener noreferrer" data-testid="link-consulta-portal">
            {links.direta ? "Portal de consulta (colar a chave)" : "Consultar no portal da SEFAZ"}
          </a>
        )}
        {links && <span className="text-[11px] text-[var(--pp-text-muted)]">{homolog ? "Ambiente de homologação: a consulta mostra nota de teste, sem valor fiscal." : "Ambiente de produção."}</span>}
      </div>
    </div>
  );
}
