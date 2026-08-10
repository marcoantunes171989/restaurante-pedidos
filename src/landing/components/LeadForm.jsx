import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useBodyScrollLock } from "../../lib/useBodyScrollLock";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { criarLead } from "../../lib/leads";
import { LEAD_FORM } from "../content";

// 11987654321 → (11) 98765-4321 (progressiva, até 11 dígitos) — mesmo
// padrão já usado em CardapioPublico.jsx, reescrito aqui localmente para
// não acoplar a landing a um arquivo de página do sistema logado.
function mascararWhatsapp(valor) {
  const n = String(valor || "").replace(/\D/g, "").slice(0, 11);
  if (n.length <= 2) return n;
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validar(campos) {
  const erros = {};
  if (!campos.nome.trim()) erros.nome = LEAD_FORM.erros.nome;
  if (!campos.estabelecimento.trim()) erros.estabelecimento = LEAD_FORM.erros.estabelecimento;
  if (campos.whatsapp.replace(/\D/g, "").length < 10) erros.whatsapp = LEAD_FORM.erros.whatsapp;
  if (campos.email.trim() && !EMAIL_OK.test(campos.email.trim())) erros.email = LEAD_FORM.erros.email;
  return erros;
}

function Campo({ id, label, erro, tocado, children }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold text-[var(--pp-graphite)]">{label}</label>
      <div className="mt-1.5">{children}</div>
      {tocado && erro && (
        <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--pp-danger)]">
          <AlertCircle aria-hidden="true" size={13} />{erro}
        </p>
      )}
    </div>
  );
}

// Ring com opacidade (ring-[var(...)]/20) não funciona em cor arbitrária via
// CSS var — Tailwind não consegue extrair canais RGB de uma custom property
// hex pra aplicar a opacidade (o ring saía sem cor nenhuma). Outline direto,
// mesmo padrão já usado em PwaExperienceDialog.jsx, evita o problema.
const INPUT_CLS = "min-h-[44px] w-full rounded-xl border border-[var(--pp-border)] bg-white px-3.5 text-sm text-[var(--pp-graphite)] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary-hover)] focus-visible:border-[var(--pp-primary-hover)]";
const INPUT_ERR_CLS = "border-[var(--pp-danger)] focus-visible:border-[var(--pp-danger)] focus-visible:outline-[var(--pp-danger)]";

// Modal de captura de lead — nome, restaurante, WhatsApp (com máscara),
// e-mail e nº de mesas (os 2 últimos opcionais). Portal em document.body,
// focus-trap + ESC + clique no overlay fecha + foco restaurado ao fechar
// (mesmo padrão de PwaExperienceDialog.jsx). Grava via RPC pub_criar_lead
// (ver src/lib/leads.js e supabase/migrations/072_leads.sql).
export function LeadForm({ aberto, onFechar }) {
  const [campos, setCampos] = useState({ nome: "", estabelecimento: "", whatsapp: "", email: "", mesas: "" });
  const [tocados, setTocados] = useState({});
  const [estado, setEstado] = useState("idle"); // idle | enviando | sucesso | erro
  const [erroEnvio, setErroEnvio] = useState("");
  const painelRef = useRef(null);
  const gatilhoAnteriorRef = useRef(null);

  useBodyScrollLock(aberto);
  useFocusTrap(painelRef, aberto);

  useEffect(() => {
    if (!aberto) return;
    queueMicrotask(() => {
      setCampos({ nome: "", estabelecimento: "", whatsapp: "", email: "", mesas: "" });
      setTocados({});
      setEstado("idle");
      setErroEnvio("");
    });
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    gatilhoAnteriorRef.current = document.activeElement;
    const t = setTimeout(() => painelRef.current?.querySelector("input, button")?.focus(), 0);
    const onKey = (e) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
      if (gatilhoAnteriorRef.current instanceof HTMLElement) gatilhoAnteriorRef.current.focus();
    };
  }, [aberto, onFechar]);

  if (!aberto) return null;

  const erros = validar(campos);

  function set(campo, valor) { setCampos((c) => ({ ...c, [campo]: valor })); }
  function marcarTocado(campo) { setTocados((t) => ({ ...t, [campo]: true })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setTocados({ nome: true, estabelecimento: true, whatsapp: true, email: true });
    if (Object.keys(erros).length > 0) return;
    setEstado("enviando");
    setErroEnvio("");
    try {
      await criarLead(campos);
      setEstado("sucesso");
    } catch {
      setEstado("erro");
      setErroEnvio(LEAD_FORM.erroGenerico);
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[150] bg-black/50" onClick={onFechar} aria-hidden="true" />
      <div className="pointer-events-none fixed inset-0 z-[151] flex items-end justify-center sm:items-center sm:p-6">
        <div
          ref={painelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="lead-form-titulo"
          aria-describedby="lead-form-desc"
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-[22px] border border-[var(--pp-border)] bg-white shadow-[0_20px_60px_rgba(28,20,15,0.3)] sm:max-h-[85vh] sm:w-[480px] sm:max-w-[calc(100vw-48px)] sm:rounded-[22px]"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--pp-border)] p-4">
            <p id="lead-form-titulo" className="font-display text-base font-bold text-[var(--pp-graphite)]">{LEAD_FORM.titulo}</p>
            <button type="button" onClick={onFechar} aria-label="Fechar" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--pp-text-muted)] transition hover:bg-[var(--pp-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary-hover)]">
              <X aria-hidden="true" size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {estado === "sucesso" ? (
              <div role="status" aria-live="polite" className="flex flex-col items-center gap-2 py-6 text-center">
                <CheckCircle2 aria-hidden="true" size={44} className="text-[var(--pp-success-text)]" />
                <p className="mt-1 text-base font-bold text-[var(--pp-graphite)]">{LEAD_FORM.sucessoTitulo}</p>
                <p id="lead-form-desc" className="text-sm text-[var(--pp-text-muted)]">{LEAD_FORM.sucessoDesc}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <p id="lead-form-desc" className="text-sm leading-6 text-[var(--pp-text-muted)]">{LEAD_FORM.desc}</p>

                <Campo id="lead-nome" label={LEAD_FORM.campos.nome.label} erro={erros.nome} tocado={tocados.nome}>
                  <input id="lead-nome" type="text" autoComplete="name" value={campos.nome}
                    onChange={(e) => set("nome", e.target.value)} onBlur={() => marcarTocado("nome")}
                    placeholder={LEAD_FORM.campos.nome.placeholder}
                    className={`${INPUT_CLS} ${tocados.nome && erros.nome ? INPUT_ERR_CLS : ""}`} />
                </Campo>

                <Campo id="lead-estabelecimento" label={LEAD_FORM.campos.estabelecimento.label} erro={erros.estabelecimento} tocado={tocados.estabelecimento}>
                  <input id="lead-estabelecimento" type="text" autoComplete="organization" value={campos.estabelecimento}
                    onChange={(e) => set("estabelecimento", e.target.value)} onBlur={() => marcarTocado("estabelecimento")}
                    placeholder={LEAD_FORM.campos.estabelecimento.placeholder}
                    className={`${INPUT_CLS} ${tocados.estabelecimento && erros.estabelecimento ? INPUT_ERR_CLS : ""}`} />
                </Campo>

                <Campo id="lead-whatsapp" label={LEAD_FORM.campos.whatsapp.label} erro={erros.whatsapp} tocado={tocados.whatsapp}>
                  <input id="lead-whatsapp" type="tel" inputMode="numeric" autoComplete="tel" value={mascararWhatsapp(campos.whatsapp)}
                    onChange={(e) => set("whatsapp", e.target.value)} onBlur={() => marcarTocado("whatsapp")}
                    placeholder={LEAD_FORM.campos.whatsapp.placeholder}
                    className={`${INPUT_CLS} ${tocados.whatsapp && erros.whatsapp ? INPUT_ERR_CLS : ""}`} />
                </Campo>

                <Campo id="lead-email" label={LEAD_FORM.campos.email.label} erro={erros.email} tocado={tocados.email}>
                  <input id="lead-email" type="email" autoComplete="email" value={campos.email}
                    onChange={(e) => set("email", e.target.value)} onBlur={() => marcarTocado("email")}
                    placeholder={LEAD_FORM.campos.email.placeholder}
                    className={`${INPUT_CLS} ${tocados.email && erros.email ? INPUT_ERR_CLS : ""}`} />
                </Campo>

                <Campo id="lead-mesas" label={LEAD_FORM.campos.mesas.label}>
                  <input id="lead-mesas" type="number" inputMode="numeric" min="0" value={campos.mesas}
                    onChange={(e) => set("mesas", e.target.value)}
                    placeholder={LEAD_FORM.campos.mesas.placeholder}
                    className={INPUT_CLS} />
                </Campo>

                {estado === "erro" && (
                  <p role="alert" className="flex items-center gap-2 rounded-xl border border-[var(--pp-danger)]/25 bg-[var(--pp-danger-soft)] p-3 text-xs font-semibold text-[var(--pp-danger)]">
                    <AlertCircle aria-hidden="true" size={15} />{erroEnvio}
                  </p>
                )}

                <button type="submit" disabled={estado === "enviando"}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--pp-primary-hover)] px-5 text-sm font-bold text-[#012E46] transition hover:bg-[var(--pp-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70">
                  {estado === "enviando" && <Loader2 aria-hidden="true" size={16} className="animate-spin" />}
                  {estado === "enviando" ? LEAD_FORM.enviando : LEAD_FORM.cta}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
