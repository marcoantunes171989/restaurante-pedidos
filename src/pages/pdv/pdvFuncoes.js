// ════════════════════════════════════════════════════════════
//  Funções do PDV (paleta aberta pela tecla *, F12 ou Ctrl+K).
//  Catálogo ÚNICO: cada função tem um código de 2 dígitos, um grupo, o que faz e a ação real. A tela monta o catálogo com os handlers que
//  já existem; esta lista só decide o que aparece, em que ordem e quando está disponível. Funções puras: testáveis sem tela.
// ════════════════════════════════════════════════════════════

export const GRUPOS_FUNCOES = ["Conta", "Pagamento", "Cliente e nota", "Impressão", "Fiscal", "Caixa", "Ajuda"];

/** Minúsculo e sem acento: a busca não depende de maiúscula nem de acento. */
export const normalizarBusca = (v) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Monta o catálogo. `a` = ações (funções que a tela já tem); `e` = estado (flags para disponibilidade).
 * Uma função sem ação (a === undefined) simplesmente não aparece.
 */
export function catalogoFuncoes({ a = {}, e = {} } = {}) {
  const conta = (extra = {}) => ({ requer: "conta", ...extra });
  const defs = [
    { codigo: "01", grupo: "Conta", nome: "Incluir produto", descricao: "Escolher no cardápio e somar na conta", ...conta({ bloqueio: e.contaMulti ? "Conta com vários pedidos: inclua pelo pedido" : null }), acao: a.incluirProduto },
    { codigo: "02", grupo: "Conta", nome: "Buscar conta", descricao: "Mesa, comanda, cliente ou pedido", atalho: "F2", acao: a.buscar },
    { codigo: "03", grupo: "Conta", nome: "Transferir mesa", descricao: "Passar a conta para outra mesa", ...conta({ bloqueio: e.externo ? "Só para contas de mesa" : null }), acao: a.transferir },
    { codigo: "04", grupo: "Conta", nome: "Separar itens", descricao: "Tirar itens para uma conta nova", ...conta({ bloqueio: e.externo ? "Só para contas de mesa" : !e.temItensParaSeparar ? "Não há itens para separar" : null }), acao: a.separar },
    { codigo: "05", grupo: "Conta", nome: "Observações da conta", descricao: "Anotações internas da mesa", ...conta(), acao: a.observacoes },
    { codigo: "06", grupo: "Conta", nome: "Histórico da conta", descricao: "O que foi lançado e por quem", ...conta(), acao: a.historico },

    { codigo: "10", grupo: "Pagamento", nome: "Dividir pagamento", descricao: "Por pessoa, percentual ou produto", ...conta({ bloqueio: e.semRestante ? "Nada a receber" : null }), acao: a.dividir },
    { codigo: "11", grupo: "Pagamento", nome: "Desconto", descricao: "Aplicar desconto manual na conta", ...conta(), acao: a.desconto },
    { codigo: "12", grupo: "Pagamento", nome: "Acréscimo", descricao: "Somar um valor extra na conta", ...conta(), acao: a.acrescimo },
    { codigo: "13", grupo: "Pagamento", nome: e.taxaRemovida ? "Taxa de serviço (aplicar)" : "Taxa de serviço (remover)", descricao: "Aplicar ou remover a taxa da conta", ...conta({ bloqueio: e.semTaxa ? "A loja não cobra taxa de serviço" : null }), acao: a.alternarTaxa },
    { codigo: "14", grupo: "Pagamento", nome: "Cupom de desconto", descricao: "Validar e aplicar o código do cupom", ...conta(), acao: a.cupom },
    { codigo: "15", grupo: "Pagamento", nome: "Pagar com pontos", descricao: "Usar o saldo de pontos do cliente", ...conta({ bloqueio: e.semPontos ? "Fidelidade desligada ou cliente sem saldo" : null }), acao: a.pontos },
    { codigo: "16", grupo: "Pagamento", nome: "Registrar valor parcial", descricao: "Mesmo que o OK do teclado", atalho: "F6", ...conta({ bloqueio: e.semRestante ? "Nada a receber" : null }), acao: a.registrarParcial },

    { codigo: "20", grupo: "Cliente e nota", nome: "Identificar cliente", descricao: "Cadastrar na hora e acumular pontos", ...conta(), acao: a.identificarCliente },
    { codigo: "21", grupo: "Cliente e nota", nome: "CPF/CNPJ na nota", descricao: "Informar o documento na NFC-e", ...conta({ bloqueio: !e.emiteNota ? "Emissão de nota fiscal desligada" : null }), acao: a.cpfNaNota },
    { codigo: "22", grupo: "Cliente e nota", nome: "NF-e para empresa", descricao: "Emitir nota modelo 55 com destinatário", ...conta({ bloqueio: !e.nfeDisponivel ? "NF-e não habilitada nesta empresa" : null }), acao: a.nfe },

    { codigo: "30", grupo: "Impressão", nome: "Pré-conta", descricao: "Conferência para o cliente, sem valor fiscal", atalho: "F4", ...conta(), acao: a.preConta },
    { codigo: "31", grupo: "Impressão", nome: "Comprovante", descricao: "Comprovante da conta (completo ou simplificado)", ...conta(), acao: a.comprovante },
    { codigo: "32", grupo: "Impressão", nome: "Cupom da cozinha", descricao: "Reenviar a produção por setor", ...conta(), acao: a.cozinha },
    { codigo: "33", grupo: "Impressão", nome: "Reimprimir última NFC-e", descricao: "Segunda via do último cupom fiscal desta sessão", novo: true, bloqueio: !e.temUltimaNota ? "Nenhuma NFC-e emitida nesta sessão" : null, acao: a.reimprimirNfce },

    { codigo: "40", grupo: "Fiscal", nome: "Notas emitidas", descricao: "Situação, reenvio e histórico das notas", acao: a.notasEmitidas },
    { codigo: "41", grupo: "Fiscal", nome: "Cancelar NFC-e (até 30 min)", descricao: "Só aparecem as notas ainda no prazo legal", novo: true, acao: a.cancelarNfce },
    { codigo: "42", grupo: "Fiscal", nome: "XMLs fiscais", descricao: "Pesquisar e baixar XML por período", novo: true, acao: a.xmls },

    { codigo: "50", grupo: "Caixa", nome: "Fechar conta", descricao: "Confirmar, emitir a NFC-e e imprimir", atalho: "F5", ...conta(), acao: a.fecharConta },
    { codigo: "51", grupo: "Caixa", nome: "Resumo do turno", descricao: "Faturamento, formas, aberto × pago", acao: a.resumoTurno },
    { codigo: "52", grupo: "Caixa", nome: "Voltar às mesas", descricao: "Canal Mesa, de qualquer lugar da tela", atalho: "F3", acao: a.mesas },

    { codigo: "90", grupo: "Ajuda", nome: "Central de ajuda", descricao: "Manual do PDV e PDF para imprimir", atalho: "F1", acao: a.ajuda },
    { codigo: "91", grupo: "Ajuda", nome: "Lista de atalhos", descricao: "Todas as teclas e códigos numa folha", acao: a.atalhos },
  ];
  return defs
    .filter((d) => typeof d.acao === "function")
    .map((d) => {
      const semConta = d.requer === "conta" && !e.temConta;
      const bloqueio = semConta ? "Escolha uma conta primeiro" : d.bloqueio || null;
      return { codigo: d.codigo, grupo: d.grupo, nome: d.nome, descricao: d.descricao, atalho: d.atalho || null, novo: !!d.novo, bloqueio, disponivel: !bloqueio, executar: d.acao };
    });
}

/**
 * Filtra pelo que o operador digitou: código (começa com), nome ou descrição. Vazio devolve tudo.
 * A ordem do catálogo (grupos) é mantida.
 */
export function filtrarFuncoes(funcoes = [], termo = "") {
  const q = normalizarBusca(termo);
  if (!q) return funcoes;
  if (/^\d+$/.test(q)) return funcoes.filter((f) => f.codigo.startsWith(q));
  return funcoes.filter((f) => normalizarBusca(f.nome).includes(q) || normalizarBusca(f.descricao).includes(q));
}

/** Função cujo código é exatamente o digitado (2 dígitos), para abrir sozinha. */
export const funcaoPorCodigo = (funcoes = [], termo = "") => {
  const q = String(termo ?? "").trim();
  return /^\d{2}$/.test(q) ? funcoes.find((f) => f.codigo === q) || null : null;
};

/** Agrupa mantendo a ordem de GRUPOS_FUNCOES. */
export function agruparFuncoes(funcoes = []) {
  return GRUPOS_FUNCOES.map((g) => ({ grupo: g, itens: funcoes.filter((f) => f.grupo === g) })).filter((g) => g.itens.length > 0);
}

/**
 * A tecla abre a paleta? `*` (teclado numérico), F12 e Ctrl+K. O `*` só vale fora de campo de texto,
 * para não atrapalhar quem digita (busca, observações, valores).
 */
export function teclaAbrePaleta(e) {
  if (!e) return false;
  if (e.key === "F12") return true;
  if (e.ctrlKey && String(e.key).toLowerCase() === "k") return true;
  if (e.key === "*" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const t = String(e.target?.tagName || "").toUpperCase();
    return !(t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || e.target?.isContentEditable);
  }
  return false;
}
