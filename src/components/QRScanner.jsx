import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

// Valida o padrão: 3 letras + hífen + 6 números
function validarComanda(codigo) {
  return /^[A-Z]{3}-\d{6}$/.test(String(codigo || "").trim().toUpperCase());
}

// ══════════════════════════════════════════════════════════════
//  Modal de scanner de câmera para ler QR Code da comanda
// ══════════════════════════════════════════════════════════════
export function QRScannerModal({ onSucesso, onCancelar }) {
  const videoRef    = useRef(null);
  const readerRef   = useRef(null);
  const [status, setStatus]   = useState("iniciando"); // iniciando | lendo | sucesso | erro
  const [codigo, setCodigo]   = useState("");
  const [mensagem, setMensagem] = useState("Aponte a câmera para o QR Code da comanda");

  useEffect(() => {
    let ativo = true;
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    async function iniciar() {
      try {
        // Lista câmeras disponíveis
        const dispositivos = await BrowserMultiFormatReader.listVideoInputDevices();
        if (!dispositivos || dispositivos.length === 0) {
          setStatus("erro");
          setMensagem("Nenhuma câmera encontrada neste dispositivo.");
          return;
        }

        // Prefere câmera traseira em tablets/celulares
        const camera = dispositivos.find((d) =>
          d.label.toLowerCase().includes("back") ||
          d.label.toLowerCase().includes("traseira") ||
          d.label.toLowerCase().includes("rear")
        ) || dispositivos[dispositivos.length - 1];

        setStatus("lendo");

        await reader.decodeFromVideoDevice(
          camera.deviceId,
          videoRef.current,
          (result, err) => {
            if (!ativo) return;
            if (result) {
              const texto = result.getText().trim().toUpperCase();
              if (validarComanda(texto)) {
                setCodigo(texto);
                setStatus("sucesso");
                setMensagem(`✅ Comanda lida: ${texto}`);
                // Para a câmera
                readerRef.current?.reset();
                // Notifica em 800ms para o usuário ver o feedback
                setTimeout(() => { if (ativo) onSucesso(texto); }, 800);
              } else {
                setMensagem(`QR Code inválido. Padrão esperado: CMD-000001`);
              }
            }
          }
        );
      } catch (err) {
        if (!ativo) return;
        setStatus("erro");
        if (err.name === "NotAllowedError") {
          setMensagem("Permissão de câmera negada. Permita o acesso nas configurações do navegador.");
        } else {
          setMensagem(`Erro ao acessar câmera: ${err.message}`);
        }
      }
    }

    iniciar();
    return () => {
      ativo = false;
      readerRef.current?.reset();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-white">📷 Escanear Comanda</h2>
            <p className="text-xs text-slate-400">Aponte para o QR Code impresso</p>
          </div>
          <button
            onClick={() => { readerRef.current?.reset(); onCancelar(); }}
            className="rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2 text-xs font-black text-slate-300 hover:bg-white/20 transition">
            Cancelar
          </button>
        </div>

        {/* Visor da câmera */}
        <div className="relative bg-black" style={{ height: 300 }}>
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            style={{ display: status === "lendo" ? "block" : "none" }}
          />

          {/* Mira central */}
          {status === "lendo" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-52 w-52">
                {/* Cantos da mira */}
                <div className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-blue-400 rounded-tl-lg" />
                <div className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-blue-400 rounded-tr-lg" />
                <div className="absolute left-0 bottom-0 h-8 w-8 border-l-4 border-b-4 border-blue-400 rounded-bl-lg" />
                <div className="absolute right-0 bottom-0 h-8 w-8 border-r-4 border-b-4 border-blue-400 rounded-br-lg" />
                {/* Linha de scan animada */}
                <div className="absolute left-2 right-2 h-0.5 bg-blue-400/70 animate-bounce" style={{ top: "50%" }} />
              </div>
            </div>
          )}

          {/* Estados de carregamento/erro */}
          {status !== "lendo" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              {status === "iniciando" && (
                <>
                  <span className="text-4xl animate-pulse">📷</span>
                  <p className="text-sm text-slate-300">Iniciando câmera...</p>
                </>
              )}
              {status === "sucesso" && (
                <>
                  <span className="text-5xl">✅</span>
                  <p className="text-base font-black text-emerald-400">Comanda lida!</p>
                  <p className="font-mono text-xl font-black text-white">{codigo}</p>
                </>
              )}
              {status === "erro" && (
                <>
                  <span className="text-4xl">⚠️</span>
                  <p className="text-sm text-red-300">{mensagem}</p>
                  <button
                    onClick={() => { readerRef.current?.reset(); onCancelar(); }}
                    className="mt-2 rounded-2xl bg-red-500/20 border border-red-400/30 px-4 py-2 text-xs font-black text-red-200">
                    Fechar
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Mensagem de status */}
        <div className={`px-6 py-4 text-center text-sm font-semibold transition-all
          ${status === "sucesso" ? "text-emerald-300 bg-emerald-500/10"
          : status === "erro"   ? "text-red-300 bg-red-500/10"
          : "text-slate-300 bg-transparent"}`}>
          {mensagem}
        </div>

        {/* Dica */}
        <div className="border-t border-white/10 px-6 py-3">
          <p className="text-center text-xs text-slate-500">
            Padrão aceito: <span className="font-mono font-bold text-slate-300">CMD-000001</span>
          </p>
        </div>
      </div>
    </div>
  );
}
