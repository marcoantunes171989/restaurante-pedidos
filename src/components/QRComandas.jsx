import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

// ── Padrão: 3 letras + hífen + 6 números (ex: CMD-000001) ──
function gerarCodigo(prefixo = "CMD", numero) {
  return `${prefixo}-${String(numero).padStart(6, "0")}`;
}

// Gera QR Code como data URL PNG
async function gerarQR(texto) {
  return QRCode.toDataURL(texto, {
    width: 300,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
    errorCorrectionLevel: "H",
  });
}

// ══════════════════════════════════════════════════════════════
//  Gerador de comandas com QR Code
// ══════════════════════════════════════════════════════════════
export function GeradorComandas({ prefixoLoja = "CMD" }) {
  const [prefixo, setPrefixo]       = useState(prefixoLoja);
  const [inicio, setInicio]         = useState(1);
  const [quantidade, setQuantidade] = useState(10);
  const [comandas, setComandas]     = useState([]);
  const [gerando, setGerando]       = useState(false);

  async function gerar() {
    setGerando(true);
    const lista = [];
    for (let i = 0; i < quantidade; i++) {
      const codigo = gerarCodigo(prefixo, inicio + i);
      const qrUrl  = await gerarQR(codigo);
      lista.push({ codigo, qrUrl });
    }
    setComandas(lista);
    setGerando(false);
  }

  function imprimir() {
    const janela = window.open("", "_blank");
    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>Comandas — QR Code</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #fff; font-family: Arial, sans-serif; }
          .grade {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 0;
          }
          .comanda {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 12px 8px;
            border: 1px dashed #ccc;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .comanda img { width: 130px; height: 130px; display: block; }
          .comanda p {
            margin-top: 6px;
            font-size: 13px;
            font-weight: bold;
            letter-spacing: 2px;
            color: #111;
            text-align: center;
          }
          .comanda small {
            font-size: 9px;
            color: #888;
            margin-top: 2px;
          }
          @media print {
            body { margin: 0; }
            .grade { grid-template-columns: repeat(4, 1fr); }
          }
        </style>
      </head>
      <body>
        <div class="grade">
          ${comandas.map(({ codigo, qrUrl }) => `
            <div class="comanda">
              <img src="${qrUrl}" alt="${codigo}" />
              <p>${codigo}</p>
              <small>Comanda do cliente</small>
            </div>
          `).join("")}
        </div>
        <script>window.onload = () => { window.print(); window.close(); }<\/script>
      </body>
      </html>
    `;
    janela.document.write(html);
    janela.document.close();
  }

  return (
    <div className="space-y-6">
      {/* Configuração */}
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-xl">
        <h3 className="text-xl font-black text-white">🎫 Gerador de Comandas com QR Code</h3>
        <p className="mt-1 text-sm text-slate-400">
          Padrão: <span className="font-mono font-bold text-blue-300">XXX-000000</span> (3 letras + 6 números)
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label>
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Prefixo (3 letras)</span>
            <input
              value={prefixo}
              onChange={(e) => setPrefixo(e.target.value.toUpperCase().replace(/[^A-Z]/g,"").slice(0,3))}
              maxLength={3}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 font-mono text-lg font-black text-white outline-none focus:border-blue-400"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Número inicial</span>
            <input
              type="number" min={1} max={999999}
              value={inicio}
              onChange={(e) => setInicio(Math.max(1, Number(e.target.value)))}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Quantidade</span>
            <input
              type="number" min={1} max={100}
              value={quantidade}
              onChange={(e) => setQuantidade(Math.min(100, Math.max(1, Number(e.target.value))))}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400"
            />
          </label>
        </div>
        <div className="mt-5 flex gap-3">
          <button
            onClick={gerar}
            disabled={gerando || prefixo.length < 1}
            className="rounded-2xl bg-blue-500 px-6 py-3 text-sm font-black text-white hover:bg-blue-400 disabled:opacity-50 transition">
            {gerando ? "⏳ Gerando..." : "⚡ Gerar QR Codes"}
          </button>
          {comandas.length > 0 && (
            <button
              onClick={imprimir}
              className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-6 py-3 text-sm font-black text-emerald-200 hover:bg-emerald-500/20 transition">
              🖨️ Imprimir comandas
            </button>
          )}
        </div>
        {comandas.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            {comandas.length} comanda(s) gerada(s) •{" "}
            <span className="font-mono font-bold text-slate-300">{comandas[0].codigo}</span>
            {" "}até{" "}
            <span className="font-mono font-bold text-slate-300">{comandas[comandas.length - 1].codigo}</span>
          </p>
        )}
      </div>

      {/* Grade de QR Codes */}
      {comandas.length > 0 && (
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-xl">
          <h4 className="mb-4 text-base font-black text-white">Prévia das comandas</h4>
          <div className="grid gap-4 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {comandas.map(({ codigo, qrUrl }) => (
              <div key={codigo} className="flex flex-col items-center rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-center">
                <img src={qrUrl} alt={codigo} className="h-24 w-24 rounded-xl" />
                <p className="mt-2 font-mono text-xs font-black text-white">{codigo}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
