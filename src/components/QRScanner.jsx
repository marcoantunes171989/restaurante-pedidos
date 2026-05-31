import { useEffect, useRef, useState, useCallback } from "react";
import jsQR from "jsqr";

// Valida o padrão: 3 letras + hífen + 6 números (ex: CMD-000001)
function validarComanda(codigo) {
  return /^[A-Z]{1,5}-\d{4,8}$/.test(String(codigo || "").trim().toUpperCase());
}

export function QRScannerModal({ onSucesso, onCancelar }) {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);
  const rafRef      = useRef(null);
  const [status, setStatus]       = useState("iniciando");
  const [mensagem, setMensagem]   = useState("Iniciando câmera...");
  const [codigo, setCodigo]       = useState("");
  const [tentativa, setTentativa] = useState(0);

  // Para tudo e libera câmera
  const pararTudo = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const fechar = useCallback(() => {
    pararTudo();
    onCancelar();
  }, [pararTudo, onCancelar]);

  // Lê frames do vídeo e processa com jsQR
  function iniciarLeitura(video, canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    function tick() {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result    = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });
        if (result?.data) {
          const texto = result.data.trim().toUpperCase();
          if (validarComanda(texto)) {
            setCodigo(texto);
            setStatus("sucesso");
            setMensagem("Comanda lida com sucesso!");
            pararTudo();
            setTimeout(() => onSucesso(texto), 900);
            return; // para o loop
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    let cancelado = false;

    async function iniciar() {
      setStatus("iniciando");
      setMensagem("Solicitando acesso à câmera...");

      // Sempre prefere câmera frontal no tablet para escanear o QR Code
      const constraintsList = [
        { video: { facingMode: { exact: "user" } } },
        { video: { facingMode: "user" } },
        { video: true },
      ];

      let stream = null;
      let ultimoErro = null;

      for (const constraints of constraintsList) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (err) {
          ultimoErro = err;
          continue;
        }
      }

      if (cancelado) { stream?.getTracks().forEach((t) => t.stop()); return; }

      if (!stream) {
        setStatus("erro");
        if (ultimoErro?.name === "NotAllowedError" || ultimoErro?.name === "PermissionDeniedError") {
          setMensagem("Permissão de câmera negada.\n\nClique no ícone de câmera na barra de endereços e permita o acesso.");
        } else if (ultimoErro?.name === "NotFoundError") {
          setMensagem("Nenhuma câmera encontrada neste dispositivo.");
        } else if (ultimoErro?.name === "NotReadableError" || ultimoErro?.message?.includes("Could not start")) {
          setMensagem("A câmera está sendo usada por outro aplicativo.\n\nFeche outros programas que usem a câmera e tente novamente.");
        } else {
          setMensagem(`Não foi possível acessar a câmera.\n\n${ultimoErro?.message || "Erro desconhecido"}`);
        }
        return;
      }

      streamRef.current = stream;

      if (!videoRef.current || !canvasRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }

      videoRef.current.srcObject = stream;

      videoRef.current.onloadedmetadata = () => {
        if (cancelado) return;
        videoRef.current.play().then(() => {
          if (cancelado) return;
          setStatus("lendo");
          setMensagem("Aponte a câmera para o QR Code da comanda");
          iniciarLeitura(videoRef.current, canvasRef.current);
        }).catch((err) => {
          setStatus("erro");
          setMensagem("Erro ao iniciar o vídeo: " + err.message);
        });
      };
    }

    iniciar();
    return () => { cancelado = true; pararTudo(); };
  }, [tentativa]);

  const bg = status === "sucesso" ? "border-emerald-500/40 bg-emerald-500/5"
           : status === "erro"    ? "border-red-500/40 bg-red-500/5"
           : "border-white/10 bg-slate-900";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className={`w-full max-w-sm rounded-[2rem] border shadow-2xl overflow-hidden transition-colors ${bg}`}>

        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-base font-black text-white">📷 Escanear Comanda</h2>
            <p className="text-xs text-slate-400">Aponte para o QR Code impresso na comanda</p>
          </div>
          <button onClick={fechar}
            className="rounded-2xl bg-red-500/20 border border-red-400/30 px-4 py-2.5 text-sm font-black text-red-300 hover:bg-red-500/40 transition active:scale-95">
            ✕ Cancelar
          </button>
        </div>

        {/* Visor de vídeo (sempre no DOM para ref funcionar) */}
        <div className="relative bg-black overflow-hidden" style={{ height: 280 }}>
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="h-full w-full object-cover"
            style={{ display: status === "lendo" ? "block" : "none" }}
          />
          {/* Canvas oculto para processamento de frames */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Mira de leitura */}
          {status === "lendo" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-48 w-48">
                <div className="absolute left-0 top-0 h-7 w-7 border-l-4 border-t-4 border-blue-400 rounded-tl-xl" />
                <div className="absolute right-0 top-0 h-7 w-7 border-r-4 border-t-4 border-blue-400 rounded-tr-xl" />
                <div className="absolute left-0 bottom-0 h-7 w-7 border-l-4 border-b-4 border-blue-400 rounded-bl-xl" />
                <div className="absolute right-0 bottom-0 h-7 w-7 border-r-4 border-b-4 border-blue-400 rounded-br-xl" />
                <div className="absolute left-3 right-3 h-0.5 bg-blue-400/80 shadow shadow-blue-400 rounded-full"
                  style={{ animation: "scanLine 2s ease-in-out infinite" }} />
              </div>
              <style>{`
                @keyframes scanLine {
                  0%, 100% { top: 15%; }
                  50% { top: 85%; }
                }
              `}</style>
            </div>
          )}

          {/* Estados não-lendo */}
          {status !== "lendo" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center bg-slate-950/90">
              {status === "iniciando" && (
                <>
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500/30 border-t-blue-500" />
                  <p className="text-sm text-slate-300">{mensagem}</p>
                </>
              )}
              {status === "sucesso" && (
                <>
                  <span className="text-6xl">✅</span>
                  <p className="text-lg font-black text-emerald-400">Comanda lida!</p>
                  <p className="font-mono text-2xl font-black text-white tracking-widest">{codigo}</p>
                  <p className="text-xs text-slate-400">Enviando pedido para a cozinha...</p>
                </>
              )}
              {status === "erro" && (
                <>
                  <span className="text-5xl">⚠️</span>
                  <p className="text-sm text-red-300 leading-6 whitespace-pre-line">{mensagem}</p>
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => setTentativa((n) => n + 1)}
                      className="rounded-2xl bg-blue-500/20 border border-blue-400/30 px-4 py-2 text-xs font-black text-blue-200 hover:bg-blue-500/30 transition">
                      🔄 Tentar novamente
                    </button>
                    <button onClick={fechar}
                      className="rounded-2xl bg-red-500/20 border border-red-400/30 px-4 py-2 text-xs font-black text-red-200 hover:bg-red-500/30 transition">
                      ✕ Fechar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Barra de status */}
        <div className={`px-5 py-3 text-center text-sm font-semibold transition-all
          ${status === "sucesso" ? "text-emerald-300 bg-emerald-500/10"
          : status === "erro"   ? "text-red-300 bg-red-500/10"
          : status === "lendo"  ? "text-blue-300 bg-blue-500/5"
          : "text-slate-400"}`}>
          {status === "lendo" ? "🔍 " + mensagem : mensagem.split("\n")[0]}
        </div>

        {/* Rodapé */}
        <div className="border-t border-white/10 px-5 py-3 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Padrão aceito: <span className="font-mono font-black text-slate-300">CMD-000001</span>
          </p>
          {status === "lendo" && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Câmera ativa
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
