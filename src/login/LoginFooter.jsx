import { IconShield } from "./icons";
import { linkWhatsappConsultor } from "../config/contato";
import { FORM } from "./content";

// ════════════════════════════════════════════════════════════
//  Rodapé da autenticação — selo de segurança, suporte (canal real,
//  já usado em toda a plataforma) e retorno ao site público. Sem
//  número de versão (não pertence à tela principal).
// ════════════════════════════════════════════════════════════
export default function LoginFooter({ onVoltar }) {
  return (
    <div className="mt-5 flex flex-col items-center gap-2.5 text-center">
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--login-text-secondary)]">
        <IconShield /> {FORM.seguranca}
      </p>
      <div className="flex items-center gap-4 text-xs font-bold">
        <a href={linkWhatsappConsultor("Olá! Preciso de ajuda para acessar minha conta no Pedido Prime.")} target="_blank" rel="noopener noreferrer"
          className="text-[var(--login-text-secondary)] transition hover:text-[var(--login-primary-hover)]">
          Falar com o suporte
        </a>
        <span className="h-3 w-px bg-[var(--login-border)]" />
        <button type="button" onClick={onVoltar} className="text-[var(--login-text-secondary)] transition hover:text-[var(--login-primary-hover)]">
          {FORM.voltarSite}
        </button>
      </div>
    </div>
  );
}
