import { useState } from "react";
import { IconLock, IconEyeOpen, IconEyeClosed } from "./icons";

const FIELD_CLS = "box-border min-h-[44px] w-full rounded-[11px] border bg-[var(--login-surface)] py-2.5 pl-10 pr-11 text-[15px] text-[var(--login-text-primary)] caret-[var(--login-primary)] outline-none transition placeholder:text-[var(--login-text-secondary)]/60";

// ════════════════════════════════════════════════════════════
//  Campo de senha — label, ícone neutro, alternância mostrar/ocultar
//  com nome acessível, estado de erro (crimson) e anel de foco
//  terracota. Nunca muda de largura/altura ao focar ou errar.
// ════════════════════════════════════════════════════════════
export default function PasswordField({ id, label, value, onChange, onBlur, error, describedById, topRight, autoComplete = "current-password" }) {
  const [visivel, setVisivel] = useState(false);
  const invalido = !!error;

  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-[var(--login-text-primary)]">{label}</label>
        {topRight}
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--login-text-secondary)]">
          <IconLock />
        </span>
        <input
          id={id}
          type={visivel ? "text" : "password"}
          autoComplete={autoComplete}
          name="login_senha_nofill" data-lpignore="true" data-form-type="other"
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder="••••••••"
          aria-invalid={invalido}
          aria-describedby={invalido ? describedById : undefined}
          className={`${FIELD_CLS} ${invalido ? "border-[var(--login-error)] focus:border-[var(--login-error)] focus:shadow-[0_0_0_3px_rgba(180,35,77,0.12)]" : "border-[var(--login-border)] focus:border-[#C9C3B9] focus:shadow-[0_0_0_3px_rgba(45,52,54,0.05)]"}`}
        />
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
          title={visivel ? "Ocultar senha" : "Mostrar senha"}
          className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--login-text-secondary)] transition hover:bg-[var(--login-surface-secondary)] hover:text-[var(--login-text-primary)]"
        >
          {visivel ? <IconEyeClosed /> : <IconEyeOpen />}
        </button>
      </div>
      {invalido && (
        <p id={describedById} className="mt-1.5 text-xs font-semibold text-[var(--login-error)]">{error}</p>
      )}
    </div>
  );
}
