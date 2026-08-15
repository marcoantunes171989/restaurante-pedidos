import { useEffect, useRef, useState } from "react";
import { LogoPP } from "../components/BrandLogo";
import { IconSpinner, IconAlerta } from "../components/PrimeIcons";
import { IconMail, IconQr } from "./icons";
import PasswordField from "./PasswordField";
import LoginAlert from "./LoginAlert";
import { FORM, VALIDACAO, emailValido } from "./content";

// Campos mais enxutos (elegantes) e com FOCO NEUTRO (sem borda/anel colorido) —
// visual gourmet: no foco só um leve escurecer da borda + sombra neutra suave.
const EMAIL_CLS = "box-border min-h-[44px] w-full rounded-[11px] border bg-[var(--login-surface)] py-2.5 pl-10 pr-4 text-[15px] text-[var(--login-text-primary)] caret-[var(--login-primary)] outline-none transition placeholder:text-[var(--login-text-secondary)]/60";
const FOCO_NEUTRO = "focus:border-[#C9C3B9] focus:shadow-[0_0_0_3px_rgba(45,52,54,0.05)]";

// ════════════════════════════════════════════════════════════
//  Formulário de autenticação — único ponto de cor forte é o botão
//  "Entrar na plataforma" (terracota). Campos neutros, validação local
//  (e-mail/senha vazios ou formato inválido) além da mensagem de erro
//  vinda do servidor. Não altera a lógica de login em si: só decide
//  QUANDO chamá-la e o que mostrar antes disso.
// ════════════════════════════════════════════════════════════
export default function LoginForm({ loginForm, setLoginForm, login, message, dbReady = true, onQrClick }) {
  const [entrando, setEntrando] = useState(false);
  const [avisoSenha, setAvisoSenha] = useState(false);
  const [tocado, setTocado] = useState({ email: false, senha: false });
  const [tentativa, setTentativa] = useState(false);
  // Guarda em ref (síncrona) — o guard só em useState(entrando) tem uma
  // janela de corrida real: dois cliques rápidos podem rodar handleSubmit
  // duas vezes antes do primeiro re-render aplicar o novo estado, chamando
  // login() (e a API de auth) duas vezes. Ref não sofre esse atraso.
  const enviandoRef = useRef(false);

  // Mensagem vinda do servidor (credenciais inválidas, licença etc.) encerra
  // o estado "Entrando..." local — preserva o comportamento original.
  useEffect(() => { if (message && message.text) { setEntrando(false); enviandoRef.current = false; } }, [message]);

  const emailVazio = !loginForm.email.trim();
  const emailFormatoInvalido = !emailVazio && !emailValido(loginForm.email);
  const senhaVazia = !loginForm.password;

  const mostrarErroEmail = (tocado.email || tentativa) && (emailVazio || emailFormatoInvalido);
  const mostrarErroSenha = (tocado.senha || tentativa) && senhaVazia;
  const erroEmailTexto = emailVazio ? VALIDACAO.emailVazio : VALIDACAO.emailInvalido;

  function handleSubmit(e) {
    e.preventDefault();
    if (enviandoRef.current) return; // impede envio duplicado
    setTentativa(true);
    if (emailVazio || emailFormatoInvalido || senhaVazia) return; // validação local — não chama login()
    enviandoRef.current = true;
    setEntrando(true);
    login();
  }

  return (
    <div className="pp-anim-up relative w-full max-w-[390px] shrink-0">
      <form
        onSubmit={handleSubmit}
        autoComplete="off"
        noValidate
        className="relative flex flex-col gap-3.5 bg-transparent p-1 sm:p-2"
      >
        <div className="mb-2 text-left">
          <div className="mb-8 flex h-11 items-center md:hidden"><LogoPP size={42} /></div>
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#F38525]">Área administrativa</span>
          <h1 className="font-display mt-2 text-[1.65rem] font-extrabold tracking-[-0.025em] text-[#012E46]">
            {(() => {
              // "Prime" em laranja (só nesta tela) — mantém o resto no grafite.
              const t = FORM.titulo;
              const i = t.toLowerCase().lastIndexOf("prime");
              return i === -1 ? t : <>{t.slice(0, i)}<span className="text-[#F38525]">{t.slice(i)}</span></>;
            })()}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--login-text-secondary)]">{FORM.subtitulo}</p>
        </div>

        {/* Aviso persistente de indisponibilidade do servidor — só aparece quando
            o app não conseguiu alcançar o Supabase (dbReady=false). Fica sempre
            visível, independente da mensagem de erro do formulário, para o
            usuário entender o estado antes mesmo de tentar entrar. */}
        {!dbReady && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-[var(--login-error)]/25 bg-[var(--login-error-soft)] p-3 text-sm">
            <span className="mt-0.5 shrink-0 text-[var(--login-error)]"><IconAlerta /></span>
            <span className="font-semibold text-[var(--login-error)]">{FORM.offline}</span>
          </div>
        )}

        {/* Campos-isca ocultos — absorvem o autofill do navegador antes dos reais */}
        <input type="text" name="username" autoComplete="username" tabIndex={-1} aria-hidden="true" className="pointer-events-none absolute h-0 w-0 opacity-0" />
        <input type="password" name="password" autoComplete="current-password" tabIndex={-1} aria-hidden="true" className="pointer-events-none absolute h-0 w-0 opacity-0" />

        {/* E-mail */}
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-[13px] font-semibold text-[var(--login-text-primary)]">{FORM.labelEmail}</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--login-text-secondary)]"><IconMail /></span>
            <input
              id="login-email" autoFocus type="email" inputMode="email"
              autoComplete="email" name="login_email_nofill" data-lpignore="true" data-form-type="other"
              value={loginForm.email}
              onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
              onBlur={() => setTocado((t) => ({ ...t, email: true }))}
              placeholder={FORM.placeholderEmail}
              aria-invalid={mostrarErroEmail}
              aria-describedby={mostrarErroEmail ? "login-email-erro" : "login-mensagem"}
              className={`${EMAIL_CLS} ${mostrarErroEmail ? "border-[var(--login-error)] focus:border-[var(--login-error)] focus:shadow-[0_0_0_3px_rgba(180,35,77,0.12)]" : `border-[var(--login-border)] ${FOCO_NEUTRO}`}`}
            />
          </div>
          {mostrarErroEmail && <p id="login-email-erro" className="mt-1.5 text-xs font-semibold text-[var(--login-error)]">{erroEmailTexto}</p>}
        </div>

        {/* Senha */}
        <PasswordField
          id="login-senha"
          label={FORM.labelSenha}
          value={loginForm.password}
          onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
          onBlur={() => setTocado((t) => ({ ...t, senha: true }))}
          error={mostrarErroSenha ? VALIDACAO.senhaVazia : ""}
          describedById="login-senha-erro"
          topRight={
            <button type="button" onClick={() => setAvisoSenha((v) => !v)} aria-expanded={avisoSenha} aria-controls="login-aviso-senha"
              className="mb-1.5 text-[12px] font-bold text-[var(--login-primary-hover)] transition hover:text-[var(--login-primary)]">
              {FORM.esqueciSenha}
            </button>
          }
        />
        <p id="login-aviso-senha" aria-hidden={!avisoSenha}
          className={`-mt-2.5 min-h-[36px] rounded-xl border p-2.5 text-xs transition-opacity duration-150 ${avisoSenha ? "border-[var(--login-border)] bg-[var(--login-surface-secondary)] text-[var(--login-text-secondary)] opacity-100" : "border-transparent bg-transparent opacity-0"}`}>
          {FORM.avisoSenha}
        </p>

        <LoginAlert id="login-mensagem" message={message} />

        <button type="submit" disabled={entrando}
          className="mt-1 flex h-[46px] w-full items-center justify-center gap-2 rounded-[11px] btn-petroleo px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(1,46,70,0.16)] transition duration-200 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--login-primary)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0">
          {entrando ? <><IconSpinner /> {FORM.botaoEntrando}</> : FORM.botaoEntrar}
        </button>
      </form>

      {onQrClick && (
        <>
          <div className="my-3.5 flex items-center gap-3">
            <span className="h-px flex-1 bg-[var(--login-border)]" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--login-text-secondary)]">ou</span>
            <span className="h-px flex-1 bg-[var(--login-border)]" />
          </div>
          <button type="button" onClick={onQrClick}
            className="flex h-[44px] w-full items-center justify-center gap-2 rounded-[11px] border border-[#012E46]/15 bg-white text-sm font-semibold text-[#012E46] transition hover:border-[#012E46]/30 hover:bg-[#F7F9FA]">
            <IconQr /> {FORM.botaoQr}
          </button>
        </>
      )}
    </div>
  );
}
