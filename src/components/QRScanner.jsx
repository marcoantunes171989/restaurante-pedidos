import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

function validarComanda(codigo) {
  return /^[A-Z]{3}-\d{6}$/.test(String(codigo || "").trim().toUpperCase());
}

export function QRScannerModal({ onSucesso, onCancelar }) {
  const videoRef  = useRef(null);
  const readerRef = useRef(null);
  const ativoRef  = useRef(true);
  const [status, setStatus]     = useState("iniciando");
  const [codigo, setCodigo]     = useState("");
  const [mensagem, setMensagem] = useState("Aponte a câmera para o QR Code da comanda");

  // Para câmera completamente e libera recursos
  const pararCamera = useCallback(() => {
    ativoRef.current = false;
    try { readerRef.current?.reset(); } catch {}
    // Para todas as tracks de vídeo ativas
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  const fechar = useCallback(() => {
    pararCamera();
    onCancelar();
  }, [pararCamera, onCancelar]);

  useEffect(() => {
    ativoRef.current = true;
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    async function iniciar() {
      try {
        const dispositivos = await BrowserMultiFormatReader.listVideoInputDevices();
        if (!dispositivos?.length) {
          setStatus("erro");
          setMensagem("Nenhuma câmera encontrada neste dispositivo.");
          return;
        }
        // Prefere câmera traseira
        const camera = dispositivos.find((d) =>
          /back|traseira|rear|environment/i.test(d.label)
        ) || dispositivos[dispositivos.length - 1];

        setStatus("lendo");
        setMensagem("Aponte a câmera para o QR Code da comanda");

        await reader.decodeFromVideoDevice(camera.deviceId, videoRef.current, (result) => {
          if (!ativoRef.current || !result) return;
          const texto = result.getText().trim().toUpperCase();
          if (validarComanda(texto)) {
            setCodigo(texto);
            setStatus("sucesso");
            setMensagem(`Comanda lida com sucesso!`);
            pararCamera();
            setTimeout(() => { if (ativoRef.current !== false) onSucesso(texto); }, 900);
          } else {
            setMensagem("QR Code inválido — padrão esperado: CMD-000001");
          }
        });
      } catch (err) {
        if (!ativoRef.current) return;
        setStatus("erro");
        setMensagem(
          err.name === "NotAllowedError"
            ? "Permissão de câmera negada. Permita o acesso nas configurações do navegador e tente novamente."
            : `Erro ao acessar a câmera: ${err.message}`
        );
      }
    }

    iniciar();
    return () => pararCamera();
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-base font-black text-white">📷 Escanear Comanda</h2>
            <p className="text-xs text-slate-400">Aponte para o QR Code impresso na comanda</p>
          </div>
          <button
            onClick={fechar}
            className="rounded-2xl bg-red-500/20 border border-red-400/30 px-4 py-2.5 text-sm font-black text-red-300 hover:bg-red-500/30 transition active:scale-95">
            ✕ Cancelar
          </button>
        </div>

        {/* Visor */}
        <div className="relative bg-black overflow-hidden" style={{ height: 300 }}>
          <video ref={videoRef} className="h-full w-full object-cover"
            style={{ display: status === "lendo" ? "block" : "none" }} />

          {/* Mira */}
          {status === "lendo" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-52 w-52">
                <div className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-blue-400 rounded-tl-xl" />
                <div className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-blue-400 rounded-tr-xl" />
                <div className="absolute left-0 bottom-0 h-8 w-8 border-l-4 border-b-4 border-blue-400 rounded-bl-xl" />
                <div className="absolute right-0 bottom-0 h-8 w-8 border-r-4 border-b-4 border-blue-400 rounded-br-xl" />
                <div className="absolute left-4 right-4 h-0.5 bg-blue-400/80 shadow shadow-blue-400"
                  style={{ animation: "scan 2s ease-in-out infinite", top: "50%" }} />
              </div>
              <style>{`@keyframes scan { 0%,100%{top:20%} 50%{top:80%} }`}</style>
            </div>
          )}

          {/* Estados */}
          {status !== "lendo" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
              {status === "iniciando" && (
                <>
                  <span className="text-5xl animate-pulse">📷</span>
                  <p className="text-sm font-semibold text-slate-300">Iniciando câmera...</p>
                </>
              )}
              {status === "sucesso" && (
                <>
                  <span className="text-6xl">✅</span>
                  <p className="text-base font-black text-emerald-400">Comanda lida!</p>
                  <p className="font-mono text-2xl font-black text-white tracking-widest">{codigo}</p>
                  <p className="text-xs text-slate-400">Enviando pedido para a cozinha...</p>
                </>
              )}
              {status === "erro" && (
                <>
                  <span className="text-5xl">⚠️</span>
                  <p className="text-sm text-red-300 leading-5">{mensagem}</p>
                  <button onClick={fechar}
                    className="mt-2 rounded-2xl bg-red-500/20 border border-red-400/30 px-5 py-2.5 text-sm font-black text-red-200 hover:bg-red-500/30 transition">
                    ✕ Fechar e voltar
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Status */}
        <div className={`px-5 py-3 text-center text-sm font-semibold transition-all
          ${status === "sucesso" ? "text-emerald-300 bg-emerald-500/10"
          : status === "erro"   ? "text-red-300 bg-red-500/10"
          : "text-slate-400"}`}>
          {mensagem}
        </div>

        {/* Rodapé */}
        <div className="border-t border-white/10 px-5 py-3 text-center">
          <p className="text-xs text-slate-500">
            Padrão aceito: <span className="font-mono font-black text-slate-300">CMD-000001</span>
          </p>
        </div>
      </div>
    </div>
  );
}
