import { useId } from "react";

// Campos de formulário das prévias (Agendar / Reverter). Cada campo tem <label>
// associado e, quando há erro LOCAL, o id da mensagem entra no aria-describedby
// (role="alert"). Nenhuma validação de backend acontece aqui.
const CONTROLE = "min-h-11 w-full rounded-xl border bg-white px-3 text-sm text-[#111111] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#012E46]";

function Erro({ id, children }) {
  if (!children) return null;
  return <p id={id} role="alert" className="mt-1 text-[12px] font-semibold leading-4 text-[#9F1239]">{children}</p>;
}

function Campo({ label, obrigatorio = false, ajuda = null, erro = null, children, idErro, idAjuda, htmlFor }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-[#111111]">
        {label}
        {obrigatorio && <span className="ml-1 text-[#6B7280]" aria-hidden="true">*</span>}
        {obrigatorio && <span className="sr-only"> (obrigatório)</span>}
      </label>
      <div className="mt-1">{children}</div>
      {ajuda && <p id={idAjuda} className="mt-1 text-[12px] leading-4 text-[#6B7280]">{ajuda}</p>}
      <Erro id={idErro}>{erro}</Erro>
    </div>
  );
}

function useIds() {
  const base = useId();
  return { id: `${base}-campo`, idErro: `${base}-erro`, idAjuda: `${base}-ajuda` };
}

const describedBy = (erro, ajuda, ids) => [erro ? ids.idErro : null, ajuda ? ids.idAjuda : null].filter(Boolean).join(" ") || undefined;
const bordaDoControle = (erro) => (erro ? "border-[#9F1239]" : "border-[#D1D5DB]");

export function InputField({ label, type = "text", value, onChange, onBlur, obrigatorio, ajuda, erro, name }) {
  const ids = useIds();
  return (
    <Campo label={label} obrigatorio={obrigatorio} ajuda={ajuda} erro={erro} htmlFor={ids.id} idErro={ids.idErro} idAjuda={ids.idAjuda}>
      <input
        id={ids.id} name={name} type={type} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
        required={obrigatorio} aria-required={obrigatorio || undefined} aria-invalid={erro ? "true" : undefined}
        aria-describedby={describedBy(erro, ajuda, ids)} className={`${CONTROLE} ${bordaDoControle(erro)}`}
      />
    </Campo>
  );
}

export function SelectField({ label, value, onChange, onBlur, options, placeholder = null, obrigatorio, ajuda, erro, name }) {
  const ids = useIds();
  return (
    <Campo label={label} obrigatorio={obrigatorio} ajuda={ajuda} erro={erro} htmlFor={ids.id} idErro={ids.idErro} idAjuda={ids.idAjuda}>
      <select
        id={ids.id} name={name} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
        required={obrigatorio} aria-required={obrigatorio || undefined} aria-invalid={erro ? "true" : undefined}
        aria-describedby={describedBy(erro, ajuda, ids)} className={`${CONTROLE} ${bordaDoControle(erro)}`}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Campo>
  );
}

export function TextAreaField({ label, value, onChange, onBlur, obrigatorio, ajuda, erro, maxLength, name, rows = 3 }) {
  const ids = useIds();
  return (
    <Campo label={label} obrigatorio={obrigatorio} ajuda={ajuda} erro={erro} htmlFor={ids.id} idErro={ids.idErro} idAjuda={ids.idAjuda}>
      <textarea
        id={ids.id} name={name} rows={rows} value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
        required={obrigatorio} aria-required={obrigatorio || undefined} aria-invalid={erro ? "true" : undefined}
        aria-describedby={describedBy(erro, ajuda, ids)} className={`${CONTROLE} min-h-[5.5rem] py-2 ${bordaDoControle(erro)}`}
      />
    </Campo>
  );
}

export function CheckboxField({ label, checked, onChange, onBlur, obrigatorio, erro, name }) {
  const ids = useIds();
  return (
    <div className="min-w-0">
      <div className="flex items-start gap-3">
        <input
          id={ids.id} name={name} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} onBlur={onBlur}
          required={obrigatorio} aria-required={obrigatorio || undefined} aria-invalid={erro ? "true" : undefined}
          aria-describedby={erro ? ids.idErro : undefined}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-[#D1D5DB] accent-[#012E46] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#012E46]"
        />
        <label htmlFor={ids.id} className="text-[13px] leading-5 text-[#111111]">
          {label}
          {obrigatorio && <span className="sr-only"> (obrigatório)</span>}
        </label>
      </div>
      <Erro id={ids.idErro}>{erro}</Erro>
    </div>
  );
}
