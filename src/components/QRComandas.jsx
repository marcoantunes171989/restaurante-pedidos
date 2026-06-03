import { useState, useEffect } from "react";
import QRCode from "qrcode";

// ── Padrão: prefixo + hífen + 6 números (ex: CMD-000001) ──
function gerarCodigo(prefixo = "CMD", numero) {
  return `${prefixo}-${String(numero).padStart(6, "0")}`;
}

// Gera QR Code como data URL PNG (alta correção de erro p/ impressão)
async function gerarQR(texto) {
  return QRCode.toDataURL(texto, {
    width: 360,
    margin: 1,
    color: { dark: "#0f172a", light: "#ffffff" },
    errorCorrectionLevel: "H",
  });
}

// ══════════════════════════════════════════════════════════════
//  Gerador de comandas com QR Code — layout profissional
// ══════════════════════════════════════════════════════════════
export function GeradorComandas({ prefixoLoja = "CMD", empresa = "Restaurante" }) {
  const [nomeEmpresa, setNomeEmpresa] = useState(empresa);
  const [logoUrl, setLogoUrl]         = useState("");
  const [chamada, setChamada]         = useState("Escaneie e faça seu pedido");
  const [prefixo, setPrefixo]         = useState(prefixoLoja);
  const [inicio, setInicio]           = useState(1);
  const [quantidade, setQuantidade]   = useState(10);
  const [colunas, setColunas]         = useState(3);
  const [comandas, setComandas]       = useState([]);
  const [gerando, setGerando]         = useState(false);

  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400 placeholder:text-slate-600 transition";
  const lbl = "mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500";

  // QR de amostra para a prévia (atualiza ao alterar prefixo/início)
  const [qrAmostra, setQrAmostra] = useState("");
  useEffect(() => {
    let ativo = true;
    gerarQR(gerarCodigo(prefixo || "CMD", inicio)).then((u) => { if (ativo) setQrAmostra(u); });
    return () => { ativo = false; };
  }, [prefixo, inicio]);

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
    if (lista[0]) setQrAmostra(lista[0].qrUrl);
  }

  function imprimir() {
    if (comandas.length === 0) return;
    const logoTag = logoUrl ? `<img class="logo" src="${logoUrl}" alt="logo" />` : "";
    const cards = comandas.map(({ codigo, qrUrl }) => `
      <div class="card">
        <div class="top">
          ${logoTag}
          <div class="emp">${nomeEmpresa || "Restaurante"}</div>
          <div class="tag">Comanda do cliente</div>
        </div>
        <img class="qr" src="${qrUrl}" alt="${codigo}" />
        <div class="num">${codigo}</div>
        <div class="cta">${chamada || ""}</div>
      </div>`).join("");

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8" />
    <title>Comandas — ${nomeEmpresa}</title>
    <style>
      @page { size: A4; margin: 8mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background:#fff; font-family: 'Segoe UI', Arial, sans-serif; color:#0f172a; }
      .grade { display:grid; grid-template-columns: repeat(${colunas}, 1fr); gap: 8px; }
      .card {
        position: relative; border: 1.5px dashed #cbd5e1; border-radius: 16px;
        padding: 14px 10px 12px; display:flex; flex-direction:column; align-items:center; text-align:center;
        break-inside: avoid; page-break-inside: avoid; overflow:hidden;
      }
      .card::before { content:""; position:absolute; top:0; left:0; right:0; height:6px; background:#2563eb; }
      .top { display:flex; flex-direction:column; align-items:center; margin-top:4px; }
      .logo { width:44px; height:44px; object-fit:contain; border-radius:10px; margin-bottom:4px; }
      .emp { font-size:15px; font-weight:800; letter-spacing:.3px; line-height:1.1; }
      .tag { font-size:8px; color:#64748b; text-transform:uppercase; letter-spacing:2.5px; margin-top:2px; }
      .qr { width:150px; height:150px; margin:8px 0 6px; }
      .num { font-family:'Courier New', monospace; font-size:18px; font-weight:800; letter-spacing:3px; }
      .cta { font-size:9.5px; color:#475569; margin-top:5px; }
    </style></head><body>
      <div class="grade">${cards}</div>
      <script>window.onload=function(){ setTimeout(function(){ window.print(); }, 250); }<\/script>
    </body></html>`;
    const j = window.open("", "_blank");
    if (!j) return;
    j.document.write(html);
    j.document.close();
  }

  const codigoExemplo = gerarCodigo(prefixo || "CMD", inicio);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-black text-white">Comandas QR Code</h3>
          <p className="mt-0.5 text-sm text-slate-400">Gere comandas profissionais com a identidade da sua empresa.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={gerar} disabled={gerando || prefixo.length < 1}
            className="rounded-2xl bg-blue-500 px-6 py-3 text-sm font-black text-white hover:bg-blue-400 disabled:opacity-50 transition active:scale-95">
            {gerando ? "⏳ Gerando..." : "⚡ Gerar comandas"}
          </button>
          {comandas.length > 0 && (
            <button onClick={imprimir}
              className="rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-6 py-3 text-sm font-black text-emerald-200 hover:bg-emerald-500/25 transition active:scale-95">
              🖨️ Imprimir
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Configuração */}
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
          <h4 className="text-base font-black text-white">Identidade da comanda</h4>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className={lbl}>Nome da empresa</span>
              <input value={nomeEmpresa} onChange={(e) => setNomeEmpresa(e.target.value)} placeholder="Ex.: Pizzaria do Bairro" className={inp} />
            </div>
            <div className="sm:col-span-2">
              <span className={lbl}>Logo (URL — opcional)</span>
              <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://.../logo.png" className={inp} />
            </div>
            <div className="sm:col-span-2">
              <span className={lbl}>Chamada (rodapé da comanda)</span>
              <input value={chamada} onChange={(e) => setChamada(e.target.value)} placeholder="Ex.: Escaneie e faça seu pedido" className={inp} />
            </div>
          </div>

          <h4 className="mt-6 text-base font-black text-white">Numeração</h4>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <span className={lbl}>Prefixo</span>
              <input value={prefixo}
                onChange={(e) => { setPrefixo(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5)); }}
                maxLength={5}
                className={`${inp} font-mono text-lg font-black tracking-widest`} />
            </div>
            <div>
              <span className={lbl}>Número inicial</span>
              <input type="number" min={1} max={999999} value={inicio}
                onChange={(e) => setInicio(Math.max(1, Number(e.target.value)))} className={inp} />
            </div>
            <div>
              <span className={lbl}>Quantidade</span>
              <input type="number" min={1} max={120} value={quantidade}
                onChange={(e) => setQuantidade(Math.min(120, Math.max(1, Number(e.target.value))))} className={inp} />
            </div>
            <div>
              <span className={lbl}>Colunas na impressão</span>
              <select value={colunas} onChange={(e) => setColunas(Number(e.target.value))} className={inp}>
                <option value={2}>2 por linha (maior)</option>
                <option value={3}>3 por linha (padrão)</option>
                <option value={4}>4 por linha (menor)</option>
              </select>
            </div>
          </div>
          {comandas.length > 0 && (
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-400">
              {comandas.length} comanda(s) geradas •{" "}
              <span className="font-mono font-bold text-slate-200">{comandas[0].codigo}</span> até{" "}
              <span className="font-mono font-bold text-slate-200">{comandas[comandas.length - 1].codigo}</span>
            </p>
          )}
        </div>

        {/* Prévia profissional (modelo) */}
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
          <h4 className="mb-3 text-base font-black text-white">Modelo da comanda</h4>
          <div className="mx-auto w-full max-w-[240px] overflow-hidden rounded-2xl bg-white text-slate-900 shadow-xl">
            <div className="h-1.5 w-full bg-blue-600" />
            <div className="flex flex-col items-center px-4 pb-4 pt-3 text-center">
              {logoUrl ? <img src={logoUrl} alt="logo" className="mb-1 h-11 w-11 rounded-lg object-contain" /> : null}
              <p className="text-[15px] font-black leading-tight">{nomeEmpresa || "Restaurante"}</p>
              <p className="text-[8px] font-bold uppercase tracking-[2px] text-slate-500">Comanda do cliente</p>
              <div className="my-2 h-[150px] w-[150px] overflow-hidden rounded-lg bg-slate-100">
                {qrAmostra ? <img src={qrAmostra} alt="qr" className="h-full w-full" /> : <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">QR</div>}
              </div>
              <p className="font-mono text-lg font-black tracking-widest">{codigoExemplo}</p>
              {chamada && <p className="mt-1 text-[10px] text-slate-500">{chamada}</p>}
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">É assim que cada comanda será impressa.</p>
        </div>
      </div>

      {/* Grade de prévia das geradas */}
      {comandas.length > 0 && (
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
          <h4 className="mb-4 text-base font-black text-white">Comandas geradas ({comandas.length})</h4>
          <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {comandas.map(({ codigo, qrUrl }) => (
              <div key={codigo} className="flex flex-col items-center rounded-2xl border border-white/10 bg-slate-950/50 p-2.5 text-center">
                <img src={qrUrl} alt={codigo} className="h-20 w-20 rounded-lg bg-white p-1" />
                <p className="mt-1.5 font-mono text-[11px] font-black text-white">{codigo}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
