import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Fingerprint, CheckCircle2, X } from "lucide-react";
import { useBodyScrollLock } from "../lib/useBodyScrollLock";
import { useFocusTrap } from "../lib/useFocusTrap";
import { detectarPlataforma } from "../lib/pwaDetection";
import { lerLoginLembrado } from "../lib/lembrarLogin";
import {
  biometriaDisponivel,
  lerCredencialBiometrica,
  biometriaFoiRecusada,
  marcarBiometriaRecusada,
  registrarBiometria,
} from "../lib/biometriaLogin";

const CHAVE_LOGIN_RECENTE = "pp_login_recente";

/**
 * Convite para cadastrar login por biometria — aparece uma vez, logo após
 * um login DIGITADO (nunca num F5/restauração silenciosa, ver App.jsx:
 * CHAVE_LOGIN_RECENTE), só em smartphone/tablet com autenticador de
 * plataforma disponível e só quando já há e-mail/senha lembrados neste
 * aparelho (sem isso a biometria não teria o que liberar — ver
 * biometriaLogin.js). Mesmo padrão de diálogo global montado uma única
 * vez na raiz (main.jsx), independente da árvore de telas do App.
 */
export default function BiometriaEnrollDialog() {
  const [visivel, setVisivel] = useState(false);
  const [email, setEmail] = useState("");
  const [cadastrando, setCadastrando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [erro, setErro] = useState("");
  const painelRef = useRef(null);

  useBodyScrollLock(visivel);
  useFocusTrap(painelRef, visivel);

  useEffect(() => {
    let recenteMarcado = false;
    try { recenteMarcado = sessionStorage.getItem(CHAVE_LOGIN_RECENTE) === "1"; } catch { /* ignore */ }
    if (!recenteMarcado) return;
    try { sessionStorage.removeItem(CHAVE_LOGIN_RECENTE); } catch { /* ignore */ }

    (async () => {
      const { so } = detectarPlataforma();
      if (so !== "ios" && so !== "android") return; // só smartphone/tablet, como pedido
      if (biometriaFoiRecusada()) return;
      if (lerCredencialBiometrica()) return; // já cadastrado neste aparelho
      const lembrado = lerLoginLembrado();
      if (!lembrado?.email || !lembrado?.password) return; // nada pra liberar com a biometria
      if (!(await biometriaDisponivel())) return;
      setEmail(lembrado.email);
      setVisivel(true);
    })();
  }, []);

  useEffect(() => {
    if (!visivel) return undefined;
    const onKey = (e) => { if (e.key === "Escape") recusar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel]);

  function recusar() {
    marcarBiometriaRecusada();
    setVisivel(false);
  }

  async function confirmar() {
    setCadastrando(true);
    setErro("");
    try {
      await registrarBiometria(email);
      setConcluido(true);
    } catch {
      setErro("Não foi possível cadastrar a biometria agora. Você pode tentar de novo depois.");
    } finally {
      setCadastrando(false);
    }
  }

  if (!visivel) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[150] bg-black/50" onClick={concluido ? () => setVisivel(false) : recusar} aria-hidden="true" />
      <div className="pointer-events-none fixed inset-0 z-[151] flex items-end justify-center sm:items-center sm:p-6">
        <div
          ref={painelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="biometria-dialog-titulo"
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto flex w-full flex-col overflow-hidden rounded-t-[22px] border border-[var(--pp-border)] bg-[var(--pp-surface)] shadow-[0_20px_60px_rgba(43,35,32,0.25)] sm:w-[440px] sm:max-w-[calc(100vw-48px)] sm:rounded-[22px]"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--pp-border)] p-4">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--pp-primary-soft)] text-[var(--pp-primary-text)]">
              <Fingerprint size={19} />
            </span>
            <button type="button" onClick={concluido ? () => setVisivel(false) : recusar} aria-label="Fechar"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--pp-text-muted)] transition-colors duration-150 hover:bg-[var(--pp-bg)]">
              <X aria-hidden="true" size={18} />
            </button>
          </div>

          <div className="p-5">
            {concluido ? (
              <div role="status" aria-live="polite" className="flex flex-col items-center gap-2 py-2 text-center">
                <CheckCircle2 aria-hidden="true" size={40} className="text-[var(--pp-success-text)]" />
                <p id="biometria-dialog-titulo" className="text-base font-bold text-[var(--pp-text)]">Biometria cadastrada com sucesso.</p>
                <p className="text-sm text-[var(--pp-text-body)]">Da próxima vez, use a digital ou o rosto para entrar mais rápido.</p>
              </div>
            ) : (
              <>
                <h3 id="biometria-dialog-titulo" className="text-lg font-black leading-snug text-[var(--pp-text)]">Entrar com biometria</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--pp-text-body)]">
                  Use a digital ou o reconhecimento facial deste aparelho para entrar mais rápido da próxima vez, sem digitar e-mail e senha.
                </p>
                {erro && <p role="alert" className="mt-3 rounded-xl border border-[var(--pp-danger)]/25 bg-[var(--pp-danger-soft)] p-3 text-xs font-semibold text-[var(--pp-danger)]">{erro}</p>}
              </>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-[var(--pp-border)] p-4 sm:flex-row">
            {concluido ? (
              <button type="button" onClick={() => setVisivel(false)}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl btn-laranja bg-[var(--pp-primary)] px-5 text-sm font-bold text-[#012E46]">
                Entendi
              </button>
            ) : (
              <>
                <button type="button" onClick={recusar}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-surface)] px-5 text-sm font-bold text-[var(--pp-text-body)] transition-colors duration-150 hover:bg-[var(--pp-bg)] sm:flex-1">
                  Não, agora não
                </button>
                <button type="button" onClick={confirmar} disabled={cadastrando}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl btn-laranja bg-[var(--pp-primary)] px-5 text-sm font-bold text-[#012E46] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-70 sm:flex-[1.4]">
                  {cadastrando ? "Cadastrando…" : "Sim, cadastrar biometria"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
