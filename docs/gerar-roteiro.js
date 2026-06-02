const PDFDocument = require("pdfkit");
const fs = require("fs");

const OUT = "C:/Projetos/restaurante-pedidos/docs/Roteiro-Demonstracao-Cliente.pdf";
const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
doc.pipe(fs.createWriteStream(OUT));

// Paleta
const AZUL = "#2563eb", ESCURO = "#0f172a", CINZA = "#475569",
      VERDE = "#059669", ROXO = "#7c3aed", CLARO = "#f1f5f9", AMBAR = "#b45309";

const W = doc.page.width, M = doc.page.margins.left, CW = W - M * 2;

function chip(txt, x, y, cor) {
  const w = doc.widthOfString(txt) + 16;
  doc.roundedRect(x, y, w, 18, 9).fill(cor);
  doc.fillColor("#fff").fontSize(9).font("Helvetica-Bold").text(txt, x + 8, y + 5);
  return w;
}
function h1(txt, cor = ESCURO) {
  doc.moveDown(0.6);
  doc.fillColor(cor).font("Helvetica-Bold").fontSize(16).text(txt);
  const y = doc.y + 2;
  doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(2).strokeColor(AZUL).stroke();
  doc.moveDown(0.5);
}
function h2(txt, cor = AZUL) {
  doc.moveDown(0.3);
  doc.fillColor(cor).font("Helvetica-Bold").fontSize(12).text(txt);
  doc.moveDown(0.2);
}
function p(txt, opts = {}) {
  doc.fillColor(opts.cor || CINZA).font(opts.bold ? "Helvetica-Bold" : "Helvetica")
     .fontSize(opts.size || 10.5).text(txt, { lineGap: 2, ...opts });
}
function passo(n, txt) {
  const y = doc.y;
  doc.circle(M + 8, y + 7, 8).fill(AZUL);
  doc.fillColor("#fff").font("Helvetica-Bold").fontSize(9).text(String(n), M + 4.5, y + 3);
  doc.fillColor(ESCURO).font("Helvetica").fontSize(10.5).text(txt, M + 26, y, { width: CW - 26, lineGap: 2 });
  doc.moveDown(0.35);
}
function caixa(txt, cor = CLARO, corTexto = ESCURO) {
  const altura = doc.heightOfString(txt, { width: CW - 24, lineGap: 2 }) + 18;
  if (doc.y + altura > doc.page.height - 60) doc.addPage();
  const y = doc.y;
  doc.roundedRect(M, y, CW, altura, 8).fill(cor);
  doc.fillColor(corTexto).font("Helvetica").fontSize(10).text(txt, M + 12, y + 9, { width: CW - 24, lineGap: 2 });
  doc.y = y + altura + 8;
}

// ---------- CAPA ----------
doc.rect(0, 0, W, doc.page.height).fill(ESCURO);
doc.roundedRect(W / 2 - 45, 150, 90, 90, 24).fill(AZUL);
doc.fillColor("#fff").fontSize(54).text("\u{1F37D}", W / 2 - 30, 168);
doc.fillColor("#fff").font("Helvetica-Bold").fontSize(30).text("Sistema de Pedidos", 0, 280, { align: "center" });
doc.fillColor("#93c5fd").fontSize(30).text("para Restaurantes", { align: "center" });
doc.fillColor("#cbd5e1").font("Helvetica").fontSize(14).text("Roteiro de Demonstração ao Cliente", 0, 350, { align: "center" });
doc.fillColor("#64748b").fontSize(11).text("Plataforma SaaS multi-empresa • Comanda QR • Cozinha • Caixa", 0, 380, { align: "center" });
doc.roundedRect(W / 2 - 150, 440, 300, 60, 10).fill("#1e293b");
doc.fillColor("#94a3b8").fontSize(10).text("Segmentos demonstrados", W/2-150, 452, {width:300, align:"center"});
doc.fillColor("#e2e8f0").font("Helvetica-Bold").fontSize(12).text("Pizzaria  •  Sushi  •  Restaurante  •  Hamburgueria", W/2-150, 470, {width:300, align:"center"});
doc.fillColor("#475569").fontSize(9).text("Documento gerado para apoio à apresentação", 0, doc.page.height - 70, { align: "center" });

// ---------- 1. VISÃO GERAL ----------
doc.addPage();
h1("1. Visão geral do sistema");
p("Plataforma completa de pedidos para restaurantes, no modelo SaaS (cada empresa tem seus próprios dados, totalmente isolados). O cliente faz o pedido pela comanda com QR Code; a cozinha acompanha em tempo real; o caixa fecha a conta com múltiplas formas de pagamento, divisão e cupom; e o gestor acompanha tudo por relatórios e dashboard.");
doc.moveDown(0.4);
h2("Perfis de acesso");
[["Administrador geral","Cadastra empresas e usuários; vê todas as empresas (super admin)."],
 ["Gestor","Administra a própria empresa: produtos, categorias, preços, relatórios."],
 ["Garçom / Tablet","Monta o pedido e vincula à comanda do cliente."],
 ["Cozinha","Recebe e avança o preparo dos pedidos em tempo real."],
 ["Painel","Exibe o painel público de acompanhamento dos pedidos."],
 ["Caixa","Lê as comandas e finaliza o pagamento."]].forEach(([t,d])=>{
  const y=doc.y; doc.fillColor(AZUL).font("Helvetica-Bold").fontSize(10.5).text("• "+t+":  ", M, y, {continued:true});
  doc.fillColor(CINZA).font("Helvetica").text(d); doc.moveDown(0.15);
});
doc.moveDown(0.3);
caixa("Dica: cada empresa gera comandas com suas próprias iniciais (ex.: PIZ-000001). O sistema valida a comanda — uma comanda de outra empresa é recusada automaticamente.", "#eff6ff", "#1e40af");

// ---------- 2. ACESSOS ----------
h1("2. Acessos para a demonstração");
p("Senha padrão de todos os usuários: ", {bold:true, continued:true}); p("123456", {cor:VERDE, bold:true});
doc.moveDown(0.5);

// Tabela de logins
const seg = [
  ["Administrador geral", "admin@restaurante.com", "Todas as empresas"],
  ["Pizzaria — Forno & Lenha (PIZ)", "gestor.pizzaria@demo.com", "Gestor"],
  ["Sushi — Sushi House (SUS)", "gestor.sushi@demo.com", "Gestor"],
  ["Restaurante — Sabor Caseiro (RES)", "gestor.restaurante@demo.com", "Gestor"],
  ["Hamburgueria — Burger Station (HAM)", "gestor.hamburgueria@demo.com", "Gestor"],
];
function tabela(linhas, cols, larguras) {
  const yTop = doc.y; let y = yTop;
  doc.roundedRect(M, y, CW, 22, 4).fill(ESCURO);
  let x = M + 8;
  cols.forEach((c,i)=>{ doc.fillColor("#fff").font("Helvetica-Bold").fontSize(9.5).text(c, x, y+6, {width:larguras[i]-10}); x+=larguras[i]; });
  y += 22;
  linhas.forEach((row, idx)=>{
    const alt = 20;
    if (idx%2===0) doc.rect(M, y, CW, alt).fill(CLARO);
    x = M + 8;
    row.forEach((cell,i)=>{ doc.fillColor(i===0?ESCURO:CINZA).font(i===0?"Helvetica-Bold":"Helvetica").fontSize(9).text(cell, x, y+6, {width:larguras[i]-10}); x+=larguras[i]; });
    y += alt;
  });
  doc.rect(M, yTop, CW, y-yTop).lineWidth(0.5).strokeColor("#cbd5e1").stroke();
  doc.y = y + 6;
}
tabela(seg, ["Empresa", "E-mail de acesso (Gestor)", "Perfil"], [200, 220, CW-420]);
doc.moveDown(0.2);
p("Cada empresa também possui os usuários operacionais, no padrão:", {bold:true});
p("caixa.<segmento>@demo.com  •  cozinha.<segmento>@demo.com  •  garcom.<segmento>@demo.com  •  painel.<segmento>@demo.com", {cor:ROXO, size:9.5});
p("Ex.: caixa.pizzaria@demo.com, cozinha.sushi@demo.com, garcom.hamburgueria@demo.com", {size:9.5});

// ---------- 3. ROTEIRO PRINCIPAL ----------
doc.addPage();
h1("3. Roteiro principal (fluxo completo)");
p("Sugestão: demonstre o ciclo completo com a Pizzaria. Tempo estimado: 5 minutos.");
doc.moveDown(0.3);
h2("A) Gerar a comanda (Gestor)");
passo(1,"Acesse com admin@restaurante.com (admin geral) e, no menu lateral, escolha a empresa em \"Empresa em foco\" (ex.: Forno & Lenha). Ou entre direto como gestor.pizzaria@demo.com.");
passo(2,"Vá em Comandas QR, gere e \"imprima\" as comandas (ex.: PIZ-000001). Mostre o QR Code gerado.");
h2("B) Fazer o pedido (Garçom / Tablet)");
passo(3,"Entre como garcom.pizzaria@demo.com. O cardápio abre já com as fotos dos produtos.");
passo(4,"Toque em Adicionar ao pedido, personalize (extra/observação) e confirme.");
passo(5,"Toque em Confirmar e enviar; informe Mesa e Cliente, leia a comanda pelo QR (ou digite PIZ-000001) e envie. O sistema valida o prefixo da comanda.");
h2("C) Cozinha (tempo real)");
passo(6,"Entre como cozinha.pizzaria@demo.com. O pedido aparece na hora. Avance: Preparar → Finalizar → Entregar.");
h2("D) Painel público (opcional)");
passo(7,"Entre como painel.pizzaria@demo.com e mostre o acompanhamento em tela cheia (F11).");
h2("E) Caixa / Pagamento");
passo(8,"Entre como caixa.pizzaria@demo.com. Leia a comanda (QR ou digitação) — o pedido aparece para fechamento.");
passo(9,"Clique em Finalizar pagamento e dar baixa, escolha a forma (PIX, Cartão, Dinheiro com troco) e confirme. Gera o cupom e baixa o estoque.");
doc.moveDown(0.2);
caixa("Resultado: o pedido percorre recebido → preparando → pronto → entregue → pago, tudo sincronizado em tempo real e salvo no banco de dados.", "#ecfdf5", "#065f46");

// ---------- 4. RECURSOS POR SEGMENTO ----------
doc.addPage();
h1("4. Recursos para destacar por segmento");
p("Use cada segmento para mostrar uma funcionalidade diferente — todos já foram validados.");
doc.moveDown(0.3);

function bloco(emoji, titulo, cor, itens) {
  if (doc.y > doc.page.height - 140) doc.addPage();
  const y0 = doc.y;
  doc.roundedRect(M, y0, CW, 4, 2).fill(cor);
  doc.y = y0 + 10;
  doc.fillColor(cor).font("Helvetica-Bold").fontSize(13).text(emoji + "  " + titulo);
  doc.moveDown(0.2);
  itens.forEach(it=>{ doc.fillColor(CINZA).font("Helvetica").fontSize(10.5).text("•  " + it, {indent:8, lineGap:2}); });
  doc.moveDown(0.5);
}
bloco("\u{1F355}","Pizzaria — Fluxo completo + Dashboard", AZUL, [
  "Ciclo ponta a ponta: comanda QR, pedido, cozinha, entrega e pagamento.",
  "Dashboard do gestor: faturamento, ticket médio, total de pedidos e faturamento por horário.",
  "Relatórios de vendas com clique no produto para ver os cupons."]);
bloco("\u{1F363}","Sushi — Cancelamento com justificativa", ROXO, [
  "Na cozinha, use Cancelar pedido e escolha o motivo (DESISTÊNCIA, Erro no pedido, etc.).",
  "O pedido cancelado não entra no faturamento nem nos relatórios."]);
bloco("\u{1F35D}","Restaurante — Pagamento parcial / dividir conta", VERDE, [
  "No caixa, ative Selecionar itens / parcial e pague apenas alguns itens.",
  "O sistema mostra o valor já pago e o restante; só quita quando o total é pago.",
  "Divisão por número de pessoas (ex.: conta dividida igualmente)."]);
bloco("\u{1F354}","Hamburgueria — Múltiplas comandas na mesma mesa", AMBAR, [
  "Várias comandas (clientes diferentes) na mesma mesa, lidas juntas no caixa.",
  "Fechamento consolidado das comandas em um único pagamento.",
  "Baixa automática de estoque a cada venda."]);

// ---------- 5. ADMINISTRAÇÃO ----------
doc.addPage();
h1("5. Administração e cadastros (Gestor)");
[["Produtos","Cadastro com foto, preço, custo, margem, categoria, tempo de preparo e ingredientes (tags). Editar e excluir com confirmação."],
 ["Categorias","Cadastro próprio por empresa, vinculado ao cardápio."],
 ["Formas de pagamento","Dinheiro (com troco), Cartão de Crédito/Débito, PIX e personalizadas."],
 ["Cargos / Perfis","Cadastro de cargos reutilizados no cadastro de usuários."],
 ["Usuários","Vinculados à empresa, com cargo e permissões de tela."],
 ["Comandas QR","Geração e impressão de comandas com as iniciais da empresa."]].forEach(([t,d])=>{
  const y=doc.y; doc.fillColor(AZUL).font("Helvetica-Bold").fontSize(11).text(t, M, y);
  doc.fillColor(CINZA).font("Helvetica").fontSize(10.5).text(d, {lineGap:2}); doc.moveDown(0.3);
});
doc.moveDown(0.3);
h2("Administrador geral (SaaS)");
p("Cria novas empresas (empresa + gestor), faz manutenção e inativa empresas preservando o histórico. Ao inativar uma empresa, todos os usuários dela são inativados automaticamente.");

// ---------- 6. CHECKLIST ----------
h1("6. Checklist pré-apresentação");
["Acessar o sistema e confirmar que as 4 empresas demo aparecem (admin geral).",
 "Ter algumas comandas geradas/impressas de cada segmento.",
 "Conferir que os cardápios mostram as fotos dos produtos.",
 "Deixar o navegador em tela cheia (F11) para o Painel e a Cozinha.",
 "Ter os e-mails de acesso à mão (página 2 deste documento)."].forEach(it=>{
  const y=doc.y; doc.roundedRect(M, y+1, 12, 12, 3).lineWidth(1).strokeColor(AZUL).stroke();
  doc.fillColor(ESCURO).font("Helvetica").fontSize(10.5).text(it, M+22, y, {width:CW-22, lineGap:2}); doc.moveDown(0.35);
});
doc.moveDown(0.5);
caixa("Status do projeto: validado ponta a ponta nos 4 segmentos, com dados persistidos no banco e isolamento multi-empresa confirmado. Pronto para apresentação e entrada em produção.", "#ecfdf5", "#065f46");

// Rodapé com numeração
const range = doc.bufferedPageRange();
for (let i = 1; i < range.count; i++) {
  doc.switchToPage(i);
  doc.fillColor("#94a3b8").font("Helvetica").fontSize(8)
     .text("Sistema de Pedidos para Restaurantes — Roteiro de Demonstração", M, doc.page.height - 35, {width:CW, align:"left"});
  doc.text("Página " + (i+1), M, doc.page.height - 35, {width:CW, align:"right"});
}

doc.end();
console.log("PDF gerado em " + OUT);
