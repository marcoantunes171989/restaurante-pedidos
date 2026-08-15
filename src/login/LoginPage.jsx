import { useState } from "react";
import { QRScannerModal } from "../components/QRScanner";
import { lerLoginQRTexto } from "../lib/loginQr";
import { logoutSupabaseAuth } from "../lib/supabase";
import { usandoSupabaseAuth } from "../lib/authMode";
import LoginBrandPanel from "./LoginBrandPanel";
import LoginForm from "./LoginForm";
import LoginFooter from "./LoginFooter";

// ════════════════════════════════════════════════════════════
//  Tela de login — composição nova (marca + autenticação), lógica de
//  autenticação/sessão preservada integralmente (login/setLoginForm/
//  message vêm de RestaurantePedidoApp, sem alteração de contrato).
//  Desktop/tablet: duas colunas (institucional + formulário). Mobile:
//  coluna única, formulário em primeiro lugar.
// ════════════════════════════════════════════════════════════
export default function LoginPage({ loginForm, setLoginForm, login, message, dbReady = true }) {
  const [scanLogin, setScanLogin] = useState(false);

  async function voltarAoSite() {
    // Limpa sessão local + JWT para "/" não auto-restaurar a tela anterior.
    try {
      sessionStorage.removeItem("pp_sessao_ativa");
      sessionStorage.removeItem("pp_sessao_email");
      sessionStorage.removeItem("pp_restore_once");
      sessionStorage.removeItem("pp_pos_login_redirect");
    } catch { /* ignore */ }
    if (usandoSupabaseAuth()) {
      try { await logoutSupabaseAuth(); } catch { /* ignore */ }
    }
    window.location.href = "/";
  }

  return (
    // data-theme como ANCESTRO de .tema-claro-area (não no mesmo nó) — ver
    // nota em src/index.css: o combinador descendente `[data-theme="light"]
    // .tema-claro-area` só casa quando estão em elementos diferentes.
    <div data-theme="light">
      <div
        className="pp-login-shell tema-claro-area pp-brand-manrope relative flex min-h-dvh w-full items-stretch overflow-x-hidden text-[var(--login-text-primary)]"
        style={{ fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif", backgroundColor: "var(--login-background)", boxSizing: "border-box", margin: 0 }}
      >
        <LoginBrandPanel />

        <main
          className="relative z-10 flex min-h-dvh w-full flex-1 flex-col items-center justify-center overflow-y-auto bg-[#FBFCFC] px-[clamp(1.25rem,5vw,4rem)]"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + clamp(0.75rem, 2vh, 1.5rem))", paddingBottom: "calc(env(safe-area-inset-bottom) + clamp(1rem, 2.5vh, 2rem))" }}
        >
          <LoginForm
            loginForm={loginForm}
            setLoginForm={setLoginForm}
            login={login}
            message={message}
            dbReady={dbReady}
            onQrClick={() => setScanLogin(true)}
          />
          <div className="w-full max-w-[390px]">
            <LoginFooter onVoltar={voltarAoSite} />
          </div>
        </main>
      </div>

      {scanLogin && (
        <QRScannerModal
          modo="login"
          onSucesso={(texto) => {
            setScanLogin(false);
            const creds = lerLoginQRTexto(texto);
            if (!creds) return;
            setLoginForm(creds);
            login(creds);
          }}
          onCancelar={() => setScanLogin(false)}
        />
      )}
    </div>
  );
}
