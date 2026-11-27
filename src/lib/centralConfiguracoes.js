// ════════════════════════════════════════════════════════════
//  Central de Configurações: um só lugar no menu, uma aba para cada tela de parâmetro.
//  Os ids são os MESMOS de antes (endereços, permissões e atalhos não mudam): só a forma de chegar muda.
// ════════════════════════════════════════════════════════════

export const ABAS_CONFIGURACOES = Object.freeze([
  { id: "config", rotulo: "Geral", ajuda: "Taxa de serviço e limites de desconto e acréscimo do caixa." },
  { id: "minhaempresa", rotulo: "Minha empresa", ajuda: "Dados e funcionamento da sua loja." },
  { id: "dados-fiscais-empresa", rotulo: "Dados da Empresa", ajuda: "O que sai na nota: CNPJ, inscrição, endereço e regime." },
  { id: "emissao-fiscal", rotulo: "Emissão", ajuda: "Certificado, numeração, pagamentos, entrega e ligar a emissão." },
  { id: "config-fiscal", rotulo: "Tributação", ajuda: "Parâmetros de imposto e quais produtos usam cada um." },
  { id: "tributos-ibpt", rotulo: "Tributos (IBPT)", ajuda: "Tabela dos tributos aproximados mostrados na nota." },
  { id: "pagamento", rotulo: "Pagamentos", ajuda: "Formas de pagamento aceitas no caixa." },
  { id: "testes-fiscais", rotulo: "Testar nota", ajuda: "Simule uma nota antes de emitir de verdade." },
  { id: "fiscal", rotulo: "Cadastros fiscais", ajuda: "NCM, CFOP, ICMS e outros (uso do contador)." },
]);

const IDS = new Set(ABAS_CONFIGURACOES.map((a) => a.id));

/** A tela faz parte da Central de Configurações? */
export const ehTelaDeConfiguracao = (id) => IDS.has(id);

/** Abas que este usuário tem no menu, na ordem da Central. */
export function abasDisponiveis(idsDoMenu = []) {
  const tem = new Set(idsDoMenu);
  return ABAS_CONFIGURACOES.filter((a) => tem.has(a.id));
}

/**
 * Menu lateral: as telas de configuração saem da lista (continuam na busca Ctrl+K) e ficam sob "Configurações",
 * que acende quando qualquer uma delas está aberta.
 */
export function menuComConfiguracoesAgrupadas(menu = []) {
  const temConfig = menu.some((g) => (g.itens || []).some((i) => i.id === "config"));
  if (!temConfig) return menu;
  return menu
    .map((g) => ({
      ...g,
      itens: (g.itens || [])
        .filter((i) => i.id === "config" || !IDS.has(i.id))
        .map((i) => (i.id === "config" ? { ...i, tambem: ABAS_CONFIGURACOES.map((a) => a.id) } : i)),
    }))
    .filter((g) => g.itens.length > 0);
}
