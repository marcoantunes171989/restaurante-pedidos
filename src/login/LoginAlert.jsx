import { IconAlerta, IconCheck } from "../components/PrimeIcons";

// ════════════════════════════════════════════════════════════
//  Alerta geral de autenticação (acima do botão) — erro em crimson
//  exclusivo (nunca terracota), sucesso no verde já usado no resto do
//  sistema. Sempre montado com altura mínima reservada: só a opacidade
//  muda, para o formulário nunca "pular" quando a mensagem aparece.
// ════════════════════════════════════════════════════════════
export default function LoginAlert({ id, message }) {
  const ativo = !!message?.text;
  const erro = message?.type === "error";
  return (
    <div
      id={id}
      role="alert"
      aria-live="polite"
      aria-hidden={!ativo}
      className={`flex min-h-[44px] items-start gap-2 rounded-xl border p-3 text-sm transition-opacity duration-200 ${
        ativo
          ? `opacity-100 ${erro ? "border-[var(--login-error)]/25 bg-[var(--login-error-soft)]" : "border-[var(--login-success)]/25 bg-[var(--pp-success-soft)]"}`
          : "border-transparent bg-transparent opacity-0"
      }`}
    >
      {ativo && (
        <>
          <span className={`mt-0.5 shrink-0 ${erro ? "text-[var(--login-error)]" : "text-[var(--login-success)]"}`}>
            {erro ? <IconAlerta /> : <IconCheck />}
          </span>
          <span className={erro ? "text-[var(--login-error)]" : "text-[var(--login-success)]"}>{message.text}</span>
        </>
      )}
    </div>
  );
}
