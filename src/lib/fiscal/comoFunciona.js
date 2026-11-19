// ════════════════════════════════════════════════════════════
//  Tela "Como funciona" do grupo Fiscal — conteúdo em dados, para manter em dia.
//  Cada passo aponta para uma TELA do menu (`tela` = id). O teste confere que todo `tela`
//  existe no menu (ADMIN_FISCAL_ITENS ou nas telas gerais citadas); se uma tela mudar de
//  nome ou sumir, o teste quebra em vez de a ajuda ficar errada. Os rótulos mostrados vêm
//  do próprio menu (rotuloDaTela), nunca digitados aqui.
// ════════════════════════════════════════════════════════════

import { ADMIN_FISCAL_ITENS } from "../adminCozinhaNav.js";

// Telas fora do grupo Fiscal que a ajuda cita.
const TELAS_GERAIS = { products: "Produtos" };

/** Rótulo de uma tela, tirado do menu (fonte única). null se a tela não existir. */
export function rotuloDaTela(id) {
  const f = ADMIN_FISCAL_ITENS.find((i) => i.id === id);
  if (f) return f.label;
  return TELAS_GERAIS[id] || null;
}

/** Ids de tela que a ajuda pode citar (para o teste). */
export const TELAS_CITAVEIS = [...ADMIN_FISCAL_ITENS.map((i) => i.id), ...Object.keys(TELAS_GERAIS)];

export const BLOCOS = [
  {
    id: "preparar", numero: 1, titulo: "Preparar a loja", quem: "Administrador da empresa",
    resumo: "Faça uma vez, na ordem. O Painel Fiscal mostra o que ainda falta.",
    passos: [
      { id: "dados", titulo: "Dados da Empresa", texto: "Digite o CNPJ e o sistema busca na Receita a razão social, o endereço e o contato. Complete o que ficou em branco (a Inscrição Estadual vem da SEFAZ do seu estado), confira o regime (CRT) e marque NFC-e e/ou NF-e como habilitadas. Os selos NFC-e e NF-e indicam o que é obrigatório para emitir.", tela: "dados-fiscais-empresa" },
      { id: "tributacao", titulo: "Regras fiscais", texto: "Importe as regras da Biblioteca Fiscal Prime e vincule cada produto a uma regra (NCM, CFOP, CSOSN ou CST, PIS e COFINS).", tela: "config-fiscal" },
      { id: "produtos", titulo: "Cadastro do produto", texto: "No produto, aba Fiscal: origem da mercadoria, unidade e, se o CSOSN for 101, o Crédito do Simples (%).", tela: "products" },
      { id: "emissao", titulo: "Certificado, CSC e séries", texto: "Envie o certificado digital A1, cadastre o CSC e as séries e informe o código fiscal de cada forma de pagamento.", tela: "emissao-fiscal" },
      { id: "ibpt", titulo: "Tributos (IBPT)", texto: "Importe a tabela vigente do seu estado para o cupom mostrar os tributos aproximados (Lei 12.741).", tela: "tributos-ibpt" },
      { id: "testes", titulo: "Testar sem enviar", texto: "Monte uma nota com uma venda real e veja o que falta, sem enviar nada à SEFAZ.", tela: "testes-fiscais" },
      { id: "ligar", titulo: "Ligar em homologação", texto: "Em Emissão, teste a conexão com a SEFAZ e ligue a emissão em homologação (notas de teste, sem valor fiscal).", tela: "emissao-fiscal" },
    ],
  },
  {
    id: "diario", numero: 2, titulo: "No dia a dia", quem: "Caixa e gerente",
    resumo: "Com a emissão ligada, a venda finalizada no caixa gera a nota sozinha.",
    passos: [
      { id: "painel", titulo: "Acompanhe pelo Painel", texto: "Status geral, notas de hoje, notas com problema e alertas (certificado, contingência, IBPT).", tela: "painel-fiscal" },
      { id: "notas", titulo: "Notas Emitidas", texto: "Imprima, consulte na SEFAZ, corrija e reenvie notas rejeitadas, cancele, envie a carta de correção (NF-e) e transmita as de contingência.", tela: "notas-fiscais" },
      { id: "contingencia", titulo: "Se a SEFAZ cair", texto: "A NFC-e entra em contingência e o caixa reenvia sozinho; confira o prazo em Notas Emitidas.", tela: "notas-fiscais" },
    ],
  },
  {
    id: "producao", numero: 3, titulo: "Produção (valor fiscal)", quem: "Administrador, com o contador",
    resumo: "Só depois de a homologação funcionar. O banco confere as condições; nenhum caminho burla.",
    passos: [
      { id: "requisitos", titulo: "O que é exigido", texto: "Certificado válido no cofre, pelo menos uma nota autorizada em homologação para cada documento habilitado, série de produção e, na NFC-e, o CSC de produção.", tela: "emissao-fiscal" },
      { id: "ligar-prod", titulo: "Ligar em produção", texto: "Em Emissão, confirme digitando PRODUÇÃO. A partir daí as notas têm valor fiscal: combine antes com o contador.", tela: "emissao-fiscal" },
    ],
  },
  {
    id: "plataforma", numero: 4, titulo: "Central Fiscal (plataforma)", quem: "Super administrador",
    resumo: "Quem administra a plataforma publica as regras e versões que as lojas importam.",
    passos: [
      { id: "central", titulo: "Regras globais", texto: "A Central Fiscal (menu Plataforma) mantém catálogos, regras, versões e modelos por segmento. As lojas só importam: nada que a loja ajusta altera a Central." },
      { id: "cadastros", titulo: "Cadastros de consulta", texto: "NCM, CFOP, ICMS, PIS, COFINS, IPI e CEST usados nas regras.", tela: "fiscal" },
    ],
  },
];

export const GLOSSARIO = [
  { termo: "Homologação", texto: "Ambiente de testes da SEFAZ. As notas não têm valor fiscal." },
  { termo: "CRT", texto: "Regime tributário da empresa: 1 Simples Nacional, 2 Simples com excesso de sublimite, 3 Regime Normal, 4 MEI." },
  { termo: "CSOSN / CST", texto: "Código da tributação do ICMS do produto. CSOSN é do Simples Nacional; CST é do Regime Normal." },
  { termo: "NCM / CFOP", texto: "NCM classifica a mercadoria (8 dígitos). CFOP identifica a operação (ex.: 5102 venda de mercadoria)." },
  { termo: "CSC", texto: "Código de segurança do contribuinte, fornecido pela SEFAZ, usado no QR Code da NFC-e." },
  { termo: "Certificado A1", texto: "Arquivo digital (.pfx) do CNPJ que assina as notas. Tem validade e senha." },
  { termo: "Contingência", texto: "Modo usado quando a SEFAZ está fora do ar: a nota é emitida e enviada depois, dentro do prazo." },
  { termo: "DANFE", texto: "Versão impressa da NF-e (A4). A NFC-e usa o cupom de 80 mm." },
];
