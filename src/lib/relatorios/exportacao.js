/** Exportações dos relatórios: CSV e texto seguro para a janela de impressão. */

/** Escapa um campo CSV e neutraliza texto que o Excel leria como fórmula. */
export function campoCsv(valor) {
  if (typeof valor === "number") return String(valor).replace(".", ",");
  let texto = String(valor ?? "").replace(/[\r\n]+/g, " ");
  if (/^[=+@\t]|^-(?!\d)/.test(texto)) texto = `'${texto}`;
  return /[";]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function gerarCsv(cabecalho, linhas) {
  return [cabecalho, ...linhas].map((linha) => linha.map(campoCsv).join(";")).join("\r\n");
}

export function baixarCsv(nome, cabecalho, linhas) {
  // BOM para o Excel reconhecer os acentos.
  const blob = new Blob([`\uFEFF${gerarCsv(cabecalho, linhas)}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
}

export function escHtml(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
