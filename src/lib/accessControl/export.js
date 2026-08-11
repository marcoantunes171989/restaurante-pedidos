import {
  formatarDataHora,
  formatarDuracao,
  duracaoSessaoMs,
  classificarPresenca,
} from "./sessionDuration.js";
import { formatarLocalizacao, mascararIp, rotuloDispositivo } from "./deviceInfo.js";
import { rotuloEventoAcesso } from "./constants.js";

function escCsv(v) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

function baixarTexto(conteudo, nomeArquivo, mime) {
  const blob = new Blob([conteudo], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

function stampArquivo() {
  return new Date().toISOString().slice(0, 10);
}

/** Exporta sessões como CSV (separador `;`, BOM) — abre no Excel. */
export function exportarSessoesExcel(sessoes = [], { aba = "historico" } = {}) {
  const cab = [
    "Status",
    "Usuário",
    "E-mail",
    "Perfil",
    "Estabelecimento",
    "Login",
    "Saída",
    "Tempo",
    "Dispositivo",
    "SO",
    "Navegador",
    "IP (mascarado)",
    "Localização",
  ];
  const linhas = sessoes.map((s) => {
    const presence = classificarPresenca(s);
    return [
      presence,
      s.usuarioNome || "",
      s.usuarioEmail || "",
      s.usuarioPerfil || "",
      s.lojaNome || "",
      formatarDataHora(s.loginAt),
      s.logoutAt ? formatarDataHora(s.logoutAt) : "",
      formatarDuracao(duracaoSessaoMs(s)),
      s.deviceType || "",
      s.os || "",
      [s.browser, s.browserVersion].filter(Boolean).join(" "),
      mascararIp(s.ipAddress),
      formatarLocalizacao(s),
    ].map(escCsv).join(";");
  });
  const csv = "\uFEFF" + [cab.map(escCsv).join(";"), ...linhas].join("\r\n");
  baixarTexto(csv, `controle-acessos-${aba}-${stampArquivo()}.csv`, "text/csv;charset=utf-8;");
}

/** Exporta eventos de segurança como CSV (Excel). */
export function exportarEventosExcel(eventos = []) {
  const cab = ["Quando", "Evento", "Usuário", "Descrição"];
  const linhas = eventos.map((ev) => [
    formatarDataHora(ev.createdAt),
    rotuloEventoAcesso(ev.eventType),
    ev.usuarioNome || ev.metadata?.email || "",
    ev.description || "",
  ].map(escCsv).join(";"));
  const csv = "\uFEFF" + [cab.map(escCsv).join(";"), ...linhas].join("\r\n");
  baixarTexto(csv, `controle-acessos-seguranca-${stampArquivo()}.csv`, "text/csv;charset=utf-8;");
}

function abrirPdfHtml(titulo, subtitulo, thead, tbodyRows) {
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${titulo}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; } * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color:#012E46; margin:0; }
    h1 { font-size: 18px; margin: 0 0 4px; color:#012E46; }
    p.sub { color:#6B7280; font-size: 11px; margin: 0 0 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { text-align: left; text-transform: uppercase; letter-spacing: .4px; font-size: 9px;
         color: #6B7280; border-bottom: 2px solid #D1D5DB; padding: 6px 8px; }
    td { padding: 7px 8px; border-bottom: 1px solid #F3F4F6; color:#111111; }
  </style></head><body>
    <h1>${titulo}</h1>
    <p class="sub">${subtitulo}</p>
    <table><thead><tr>${thead}</tr></thead><tbody>${tbodyRows}</tbody></table>
    <script>window.onload=function(){window.print();}<\/script>
  </body></html>`;
  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

function escHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** PDF via janela de impressão (estrutura fase 2). */
export function exportarSessoesPdf(sessoes = [], { aba = "historico", empresa = "Pedido Prime" } = {}) {
  const thead = ["Status", "Usuário", "Perfil", "Loja", "Login", "Saída", "Tempo", "Dispositivo", "Local"]
    .map((h) => `<th>${h}</th>`).join("");
  const rows = sessoes.map((s) => {
    const presence = classificarPresenca(s);
    const cells = [
      presence,
      s.usuarioNome || "—",
      s.usuarioPerfil || "—",
      s.lojaNome || "—",
      formatarDataHora(s.loginAt),
      s.logoutAt ? formatarDataHora(s.logoutAt) : "—",
      formatarDuracao(duracaoSessaoMs(s)),
      rotuloDispositivo(s),
      formatarLocalizacao(s),
    ].map((c) => `<td>${escHtml(c)}</td>`).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return abrirPdfHtml(
    `Controle de Acessos — ${empresa}`,
    `${sessoes.length} sessão(ões) · aba ${aba} · gerado em ${formatarDataHora(new Date().toISOString())}`,
    thead,
    rows || `<tr><td colspan="9">Nenhum registro</td></tr>`,
  );
}

export function exportarEventosPdf(eventos = [], { empresa = "Pedido Prime" } = {}) {
  const thead = ["Quando", "Evento", "Usuário", "Descrição"].map((h) => `<th>${h}</th>`).join("");
  const rows = eventos.map((ev) => {
    const cells = [
      formatarDataHora(ev.createdAt),
      rotuloEventoAcesso(ev.eventType),
      ev.usuarioNome || ev.metadata?.email || "—",
      ev.description || "—",
    ].map((c) => `<td>${escHtml(c)}</td>`).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return abrirPdfHtml(
    `Alertas de segurança — ${empresa}`,
    `${eventos.length} evento(s) · gerado em ${formatarDataHora(new Date().toISOString())}`,
    thead,
    rows || `<tr><td colspan="4">Nenhum registro</td></tr>`,
  );
}
