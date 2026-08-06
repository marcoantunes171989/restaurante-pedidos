// ════════════════════════════════════════════════════════════════
//  Documentação de uso do PDV — fonte única do conteúdo da Central
//  de Ajuda (modal) e do PDF gerado para impressão.
//
//  Regra de manutenção: SEMPRE que a tela do PDV mudar (novo campo,
//  nova regra, novo botão), atualize a seção correspondente aqui e
//  suba PDV_DOC_VERSAO. O rodapé da ajuda mostra essa versão, então
//  o operador sabe se está lendo a documentação da tela que está
//  usando. Nada de texto solto espalhado pelos componentes.
// ════════════════════════════════════════════════════════════════

import { formatCurrency } from "./pdvHelpers";

/** Versão da documentação — acompanha a versão da tela do PDV. */
export const PDV_DOC_VERSAO = "2026.08.9";
export const PDV_DOC_ATUALIZADO_EM = "06/08/2026";

const IMG = "/ajuda/pdv";

/**
 * Monta as seções da documentação já contextualizadas com a loja:
 * o texto cita as formas de pagamento realmente cadastradas, se a
 * fidelidade está ligada e quantas mesas existem no salão.
 */
export function secoesDocumentacao(ctx = {}) {
  const {
    formasPagamento = [],
    fidelidadeAtiva = false,
    pontosPorReal = 100,
    valorPorPonto = 0,
    totalMesas = 0,
    taxaServico = 0,
  } = ctx;

  const nomesFormas = formasPagamento.map((f) => f.nome).filter(Boolean);
  const listaFormas = nomesFormas.length
    ? nomesFormas.join(", ")
    : "nenhuma forma cadastrada ainda (cadastre em Administrativo → Formas de Pagamento)";

  return [
    {
      id: "visao-geral",
      titulo: "Visão geral da tela",
      resumo: "Como o PDV está organizado e para que serve cada área.",
      blocos: [
        {
          tipo: "p",
          texto: "O PDV do Pedido Prime trabalha com três colunas fixas. Elas nunca mudam de lugar durante o atendimento, então a mão do operador aprende o caminho e o olho não precisa procurar. Esta Central de Ajuda (ícone ? no topo ou F1) descreve exatamente a tela que você está usando.",
        },
        { tipo: "ilustracao", nome: "mapaTela" },
        {
          tipo: "tabela",
          cabecalho: ["Área", "O que faz"],
          linhas: [
            ["Barra superior", "Canais (Mesa, Delivery, Comanda, Cliente, Pedido), busca global, ajuda (?), tema e operador."],
            ["Resumo do turno", "Mesas, cozinha, faturamento e análise financeira do dia (formas, ocupação, aberto × pago)."],
            ["Coluna esquerda", "A conta: produtos e totais (subtotal, taxa, acréscimo, desconto, cupom). Rola quando a lista cresce."],
            ["Centro", "O canal ativo — mesas, delivery, comandas, clientes ou pedidos."],
            ["Coluna direita", "Pagamento com topo fixo; recebimentos, ajustes e cupom rolam sem deslocar o teclado."],
            ["Rodapé", "Ações (pré-conta, comprovante, cozinha, transferir, separar, observações, histórico) e Fechar conta."],
          ],
        },
        { tipo: "imagem", src: `${IMG}/visao-geral.png`, legenda: "Tela do PDV: conta à esquerda, canal ao centro e pagamento à direita." },
        {
          tipo: "dica",
          titulo: "Em tablet e celular",
          texto: "Abaixo de 1024px as três colunas viram as abas Conta, Mesa e Pagar, logo abaixo do resumo do turno. O conteúdo é o mesmo, só muda a navegação.",
        },
      ],
    },

    {
      id: "canais",
      titulo: "Canais de atendimento",
      resumo: "Quando usar Mesa, Delivery, Comanda, Cliente ou Pedido.",
      blocos: [
        { tipo: "p", texto: "Os cinco botões do topo mudam o que aparece no centro da tela. A conta selecionada continua a mesma ao trocar de canal — você só muda a forma de encontrar o atendimento." },
        {
          tipo: "tabela",
          cabecalho: ["Canal", "Use quando"],
          linhas: [
            ["Mesa", "Atendimento presencial. Mostra todas as mesas cadastradas com a cor do status."],
            ["Delivery", "Pedidos externos de entrega e retirada, com o estágio de cada um. Dá para pagar vários de uma vez."],
            ["Comanda", "Você tem o número da comanda em mãos e quer chegar direto na conta."],
            ["Cliente", "Procurar pelo nome ou telefone de quem está consumindo."],
            ["Pedido", "Localizar por número do pedido — útil para conferência e conflitos."],
          ],
        },
        {
          tipo: "dica",
          titulo: "Atalho",
          texto: "A tecla F3 volta para o canal Mesa de qualquer lugar da tela.",
        },
        {
          tipo: "passos",
          titulo: "Delivery: pagar vários pedidos no mesmo fechamento",
          itens: [
            "Abra o canal Delivery e toque em Pagar vários (fica ativo em destaque).",
            "Toque em cada card que deve entrar no pagamento — a faixa mostra quantos e o total somado.",
            "À esquerda, os produtos aparecem separados por comanda, pedido, tipo (entrega/retirada) e cliente.",
            "Na coluna de pagamento, lance as formas normalmente sobre o total combinado e feche a conta — todas as comandas selecionadas são baixadas juntas.",
            "Para voltar ao modo um a um, toque de novo em Pagar vários.",
          ],
        },
      ],
    },

    {
      id: "salao",
      titulo: "Mesas: as cores do status",
      resumo: "Verde, laranja e amarelo — leitura do atendimento em um olhar.",
      blocos: [
        { tipo: "p", texto: "No canal Mesa a cor é informação, não enfeite. Cada card mostra o status, o cliente, há quanto tempo a mesa está ocupada, em que estágio está o pedido na cozinha e o valor acumulado." },
        { tipo: "ilustracao", nome: "coresMesa" },
        {
          tipo: "tabela",
          cabecalho: ["Cor", "Status", "O que significa"],
          linhas: [
            ["Verde", "Disponível", "Mesa livre, pronta para receber um novo cliente."],
            ["Laranja", "Ocupada", "Há consumo lançado e a conta segue aberta."],
            ["Amarelo", "Conta pedida", "O cliente pediu a conta pelo tablet ou QR Code — prioridade de atendimento."],
          ],
        },
        {
          tipo: "p",
          texto: totalMesas > 0
            ? `Hoje esta loja tem ${totalMesas} ${totalMesas === 1 ? "mesa cadastrada" : "mesas cadastradas"}. Para incluir ou remover mesas, vá em Administrativo → Mesas.`
            : "Nenhuma mesa cadastrada ainda. Cadastre em Administrativo → Mesas para que os cards apareçam aqui.",
        },
        { tipo: "imagem", src: `${IMG}/salao.png`, legenda: "Mesas disponíveis (verde), ocupadas (laranja) e com conta pedida (amarelo)." },
        {
          tipo: "aviso",
          titulo: "Mesa paga volta a ficar verde",
          texto: "Assim que o pagamento é confirmado, a mesa é liberada automaticamente e volta para Disponível. Não existe passo manual de liberação.",
        },
      ],
    },

    {
      id: "conta",
      titulo: "A conta e os produtos",
      resumo: "Selecionar mesa, conferir itens e incluir produtos no pagamento.",
      blocos: [
        {
          tipo: "passos",
          titulo: "Abrir uma conta",
          itens: [
            "Toque na mesa desejada no canal Mesa.",
            "Se a mesa estiver ocupada, a conta aparece na coluna da esquerda com todos os produtos.",
            "Se estiver livre, a coluna mostra a ficha da mesa com capacidade e localização — é a confirmação de que ela está pronta para o próximo cliente.",
          ],
        },
        { tipo: "ilustracao", nome: "incluirProduto" },
        {
          tipo: "lista",
          titulo: "O que dá para fazer na coluna da conta",
          itens: [
            "Incluir produto: botão largo laranja acima da lista de itens — sempre habilitado, fácil de tocar.",
            "Alterar quantidade: os botões − e + em cada produto (enquanto o comprovante não tiver sido emitido).",
            "Remover item: o ícone de lixeira do produto.",
            "Trocar o cliente da conta: botão Trocar / Incluir, ao lado do nome.",
          ],
        },
        { tipo: "imagem", src: `${IMG}/conta.png`, legenda: "Coluna da conta com o botão Incluir produto em destaque acima dos itens." },
        {
          tipo: "aviso",
          titulo: "Depois do comprovante: nova venda com comanda",
          texto: "Ao emitir o comprovante da mesa, a alteração dos itens já impressos fica bloqueada. Para incluir mais produtos, toque em Incluir produto: o sistema avisa que o comprovante foi emitido e pede a comanda do cliente para vincular essa nova venda. O produto entra na conta ligado à comanda informada.",
        },
        {
          tipo: "p",
          texto: taxaServico > 0
            ? `A taxa de serviço configurada nesta loja é de ${taxaServico}% e entra na linha "Taxas e descontos". No pagamento você pode removê-la se o cliente pedir.`
            : "Não há taxa de serviço configurada nesta loja, então o total geral é a soma dos produtos (mais acréscimos e menos descontos, se houver).",
        },
        {
          tipo: "dica",
          titulo: "Pontuar ao incluir produto",
          texto: fidelidadeAtiva
            ? "Com o programa de fidelidade ativo, ao incluir um produto o sistema pergunta se o cliente deseja pontuar. Se sim, abre a identificação pelo telefone antes de seguir."
            : "Quando a fidelidade estiver ativa na loja, ao incluir produto o sistema pergunta se o cliente deseja se identificar para pontuar.",
        },
        { tipo: "imagem", src: `${IMG}/incluir-produto.png`, legenda: "Modal de incluir produto após comprovante: aviso e campo da comanda do cliente." },
      ],
    },

    {
      id: "busca",
      titulo: "Busca global",
      resumo: "Um campo que procura em tudo que está na tela.",
      blocos: [
        { tipo: "p", texto: "O campo do topo filtra a tela inteira enquanto você digita, sem precisar apertar Enter. Ele ignora acentos e maiúsculas." },
        {
          tipo: "lista",
          titulo: "A busca encontra por",
          itens: [
            "Número ou nome da mesa (ex.: 5, mesa 05)",
            "Nome do cliente e telefone",
            "Número da comanda e do pedido",
            "Nome do produto lançado na conta (ex.: onion)",
            "Valor — tanto do produto quanto do total da conta",
          ],
        },
        {
          tipo: "dica",
          titulo: "Atalho",
          texto: "F2 leva o cursor direto para a busca. Com o termo digitado, Enter seleciona a primeira conta que combina.",
        },
      ],
    },

    {
      id: "turno",
      titulo: "Resumo do turno e análise financeira",
      resumo: "Mesas, cozinha e leitura financeira do dia para o caixa.",
      blocos: [
        {
          tipo: "tabela",
          cabecalho: ["Indicador", "Leitura"],
          linhas: [
            ["Disponíveis / Ocupadas", "Mesas livres e com conta aberta (grupo Mesa na faixa)."],
            ["Status cozinha", "Recebido, em preparo, pronto e retirado — ritmo da produção."],
            ["Aguardando pagamento", "Contas em que o cliente já pediu para fechar."],
            ["Faturamento e ticket médio", "Total recebido no dia e média por pedido pago."],
            ["Em aberto", "Soma das contas ainda não pagas — potencial a receber."],
            ["Ocupação", "Percentual de mesas ocupadas sobre o total cadastrado."],
            ["Mesas × Delivery", "Quanto do faturamento veio de cada canal."],
            ["Por forma de pagamento", "Barras com PIX, cartão, dinheiro etc. no turno."],
          ],
        },
        { tipo: "p", texto: "Toque em Turno para abrir o painel branco e limpo com KPIs, análise financeira, listas de contas em aberto e pagamentos do dia." },
        {
          tipo: "dica",
          titulo: "Layout estável no pagamento",
          texto: "Acréscimo, desconto e cupom não deslocam o teclado: a coluna da direita rola a parte de baixo. Subtotal, taxa, acréscimo, desconto, cupom e recebido ficam na coluna da esquerda (conta); à direita você acompanha só Falta, Troco e pontos.",
        },
      ],
    },

    {
      id: "pagamento",
      titulo: "Receber um pagamento",
      resumo: "O caminho padrão: forma, valor e OK.",
      blocos: [
        { tipo: "ilustracao", nome: "anatomiaPagamento" },
        {
          tipo: "passos",
          titulo: "Passo a passo",
          itens: [
            "Selecione a conta (mesa, comanda, cliente, pedido — ou vários deliveries com Pagar vários).",
            "Escolha a forma de pagamento na coluna da direita.",
            "Digite o valor recebido no teclado — ou toque em Valor total para lançar de uma vez tudo o que falta.",
            "Toque em OK (verde). O valor entra na lista de Recebimentos e o painel passa a cobrar só o restante.",
            "Com a conta quitada, o botão Fechar conta acende no rodapé.",
          ],
        },
        {
          tipo: "aviso",
          titulo: "O valor sempre começa zerado",
          texto: "Ao trocar de forma, aplicar cupom, alterar acréscimo/desconto ou registrar uma parcela, o campo volta para R$ 0,00. É uma trava contra o erro mais caro do caixa: confirmar um valor que sobrou da operação anterior.",
        },
        {
          tipo: "p",
          texto: "Os totais detalhados (subtotal, taxa, acréscimo, desconto, cupom e valor já recebido) ficam na coluna da conta, à esquerda. Na direita permanecem Falta/Restante, Troco e avisos de fidelidade — para o caixa focar no que ainda falta receber.",
        },
        { tipo: "p", texto: `Formas cadastradas nesta loja: ${listaFormas}.` },
        { tipo: "imagem", src: `${IMG}/pagamento.png`, legenda: "Coluna de pagamento com teclado, recebimentos e ajustes financeiros." },
      ],
    },

    {
      id: "ajuste-financeiro",
      titulo: "Acréscimo, desconto e taxa de serviço",
      resumo: "Ajustes no momento do pagamento, sem sair da tela.",
      blocos: [
        { tipo: "p", texto: "Na coluna de pagamento, abaixo dos recebimentos, ficam os campos de Desconto e Acréscimo (entrada do valor). O reflexo desses ajustes no resumo financeiro aparece na coluna da esquerda, junto com subtotal, taxa e cupom — úteis para cortesia, taxa extra de delivery combinada ou acordo com o cliente." },
        { tipo: "ilustracao", nome: "ajusteFinanceiro" },
        {
          tipo: "lista",
          titulo: "Como usar",
          itens: [
            "Desconto: digite o valor em reais (como no teclado). O total e a linha Falta diminuem na hora.",
            "Acréscimo: digite o valor a somar na conta.",
            "Cupom: continua em campo separado — pode combinar com o desconto manual.",
          ],
        },
        ...(taxaServico > 0
          ? [{
              tipo: "passos",
              titulo: `Remover a taxa de serviço (${taxaServico}%)`,
              itens: [
                "O botão mostra a taxa aplicada e o valor em reais.",
                "Se o cliente pedir para retirar a taxa, toque em Remover.",
                "O total é recalculado sem a taxa. Toque em Restaurar se precisar voltar.",
              ],
            }]
          : [{
              tipo: "p",
              texto: "Esta loja não tem taxa de serviço ativa. Quando estiver configurada em Administrativo, o botão Remover / Restaurar aparece no pagamento.",
            }]),
        { tipo: "imagem", src: `${IMG}/ajuste-financeiro.png`, legenda: "Desconto, acréscimo e opção de remover a taxa de serviço no painel financeiro." },
        {
          tipo: "aviso",
          titulo: "Ordem do cálculo",
          texto: "Subtotal dos produtos → taxa de serviço (se mantida) → + acréscimo → − desconto manual → − cupom. O valor a receber é o resultado final.",
        },
      ],
    },

    {
      id: "varias-formas",
      titulo: "Pagar em várias formas",
      resumo: "Dividir o valor entre formas diferentes ou repetir a mesma.",
      blocos: [
        { tipo: "p", texto: "Cada OK registra uma parcela independente. Você pode combinar formas diferentes ou usar a mesma forma quantas vezes precisar — dois cartões distintos, por exemplo." },
        {
          tipo: "passos",
          titulo: "Exemplo: conta de R$ 143,00",
          itens: [
            "PIX, digita 50,00, OK → falta R$ 93,00.",
            "Dinheiro, digita 50,00, OK → falta R$ 43,00.",
            "Dinheiro de novo, Valor total, OK → conta quitada.",
          ],
        },
        { tipo: "p", texto: "Cada parcela aparece na lista de Recebimentos com o botão × para remover, caso o cliente mude de ideia antes do fechamento. Todas vão separadas para o histórico de pagamento e para o movimento de caixa." },
      ],
    },

    {
      id: "dividir",
      titulo: "Dividir a conta",
      resumo: "Por pessoa, por percentual ou produto a produto.",
      blocos: [
        { tipo: "p", texto: "O botão Dividir, ao lado das formas de pagamento, abre uma calculadora com três modos. O resultado cai no teclado e depois é recebido normalmente na forma que o cliente escolher." },
        { tipo: "ilustracao", nome: "dividirConta" },
        {
          tipo: "tabela",
          cabecalho: ["Modo", "Como funciona", "Exemplo"],
          linhas: [
            ["Por pessoa", "Informe quantas pessoas dividem e quantas cotas receber agora.", "Conta de R$ 120,00 entre 4 → R$ 30,00 por pessoa."],
            ["Percentual", "Atalhos de 10% a 100% ou ajuste fino.", "50% de R$ 159,50 → R$ 79,75."],
            ["Por produto", "Cada item pode ser dividido por 2, 3, 4, 5 ou cobrado inteiro; os marcados somam.", "Coca-Cola 1L de R$ 16,50 ÷ 3 → R$ 5,50."],
          ],
        },
        {
          tipo: "dica",
          titulo: "Somando produtos",
          texto: "No modo Por produto dá para marcar vários itens ao mesmo tempo, cada um com o seu divisor. É assim que se cobra 'a bebida dividida entre três mais o prato inteiro de um deles'.",
        },
      ],
    },

    {
      id: "troco",
      titulo: "Troco e limites de valor",
      resumo: "Por que o sistema não deixa digitar mais que o restante.",
      blocos: [
        {
          tipo: "lista",
          itens: [
            "Formas eletrônicas (cartões, PIX, vales) travam no valor que falta receber — não existe troco nelas.",
            "Dinheiro é a única forma que aceita valor acima do restante; a diferença aparece como Troco.",
            "Pontos travam no saldo do cliente, mesmo que a conta seja maior.",
          ],
        },
        {
          tipo: "aviso",
          titulo: "Digitou a mais?",
          texto: "O campo simplesmente para no teto da forma. Se precisar recomeçar, use o botão de borracha (limpar) ou o de apagar dígito, ao lado do teclado.",
        },
      ],
    },

    {
      id: "cliente-pontos",
      titulo: "Cliente identificado e pontos",
      resumo: "Cadastrar na hora, acumular e pagar com pontos.",
      blocos: [
        {
          tipo: "p",
          texto: fidelidadeAtiva
            ? `O programa de fidelidade está ativo nesta loja: ${pontosPorReal} pontos equivalem a R$ 1,00 no resgate${valorPorPonto > 0 ? `, e o cliente ganha 1 ponto a cada ${formatCurrency(valorPorPonto)} pagos` : ""}.`
            : "O programa de fidelidade está desligado nesta loja. Ative em Administrativo → Fidelidade para que os clientes acumulem pontos nas compras.",
        },
        { tipo: "ilustracao", nome: "clientePontos" },
        {
          tipo: "passos",
          titulo: "Identificar o cliente no pagamento",
          itens: [
            "A faixa no topo da coluna de pagamento mostra 'Cliente não identificado'. Toque em Identificar.",
            "Digite o telefone. O sistema consulta a base na hora.",
            "Se já existir cadastro, aparece 'Cliente já cadastrado' com o nome e o saldo de pontos — é só confirmar.",
            "Se não existir, complete o nome e confirme: aparece 'Cliente cadastrado com sucesso' na mensagem abaixo do painel.",
            "Se o cliente não quiser se identificar, use Cancelar — o pagamento segue normalmente, apenas sem pontos.",
          ],
        },
        {
          tipo: "passos",
          titulo: "Pagar com pontos",
          itens: [
            "Com o cliente identificado e saldo disponível, a forma Pontos aparece junto das demais.",
            "Ao selecionar Pontos, o valor já vem preenchido com o saldo em reais (limitado ao que falta receber).",
            "Confirme com OK — a parcela mostra quantos pontos serão usados.",
            "No fechamento da conta os pontos são baixados do saldo do cliente no financeiro.",
            "Se sobrar valor, complete com outra forma normalmente.",
          ],
        },
        {
          tipo: "dica",
          titulo: "Pontuação com pagamento dividido",
          texto: "Os pontos são calculados sobre o valor efetivamente pago em dinheiro, cartão, PIX ou vale — a parcela quitada com pontos não gera novos pontos. O total aparece na confirmação do fechamento.",
        },
      ],
    },

    {
      id: "cupom",
      titulo: "Cupom de desconto",
      resumo: "Cadastro no admin, validação no banco e legendas no PDV.",
      blocos: [
        {
          tipo: "p",
          texto: "Os cupons são cadastrados em Administrativo → Gestão → Cupons e gravados no banco (Supabase). No PDV, o campo fica abaixo dos ajustes de acréscimo/desconto: a digitação é sempre em maiúsculas e, enquanto você digita, aparece uma legenda sob o campo.",
        },
        { tipo: "ilustracao", nome: "cupom" },
        {
          tipo: "tabela",
          cabecalho: ["Legenda no PDV", "Significado"],
          linhas: [
            ["Cupom válido · −R$ … · N restante(s)", "Canal, data, horário, saldo e mínimo ok."],
            ["Cupom inválido — código não encontrado", "Não há cupom com esse código nesta loja."],
            ["Cupom inválido — desativado", "O cupom existe, mas foi desligado no administrativo."],
            ["Fora do prazo — ainda não vigora", "A data inicial ainda não chegou."],
            ["Fora do prazo — cupom expirado", "Passou da data final."],
            ["Cupom fora do horário…", "Fora da janela de horário (início/fim) cadastrada."],
            ["Válido apenas interno / externo", "Canal da conta (mesa × delivery) não combina com o cupom."],
            ["Quantidade esgotada", "Todas as unidades já foram usadas."],
            ["Consumo mínimo…", "O total da conta ainda não atinge o mínimo do cupom."],
          ],
        },
        {
          tipo: "lista",
          titulo: "O que é conferido na hora de aplicar",
          itens: [
            "Se o código existe e pertence a esta loja",
            "Se o canal permite (interno/mesa, externo/delivery ou ambos)",
            "Se está ativo, na data e no horário de vigência",
            "Se a conta atinge o consumo mínimo exigido",
            "Se ainda há quantidade disponível do cupom",
          ],
        },
        {
          tipo: "passos",
          titulo: "Como cadastrar (Administrativo)",
          itens: [
            "Abra Gestão → Cupons.",
            "Preencha código, tipo, valor, mínimo, quantidade, utilização (interno/externo/ambos), datas e horários.",
            "Toque em Criar cupom — a mensagem de sucesso ou erro aparece na própria tela e o registro vai para o banco.",
            "No PDV, digite o código e Aplicar. Após finalizar o pagamento, os dados do cupom são limpos da tela.",
          ],
        },
        {
          tipo: "aviso",
          titulo: "A quantidade é conferida duas vezes",
          texto: "Além da validação ao aplicar (e da pré-validação ao digitar), o sistema reconfere canal, horário e saldo no fechamento. Se algo falhar, o pagamento é bloqueado — remova o cupom ou ajuste e conclua.",
        },
      ],
    },

    {
      id: "fechamento",
      titulo: "Fechar a conta",
      resumo: "Confirmação, comprovante e liberação da mesa.",
      blocos: [
        {
          tipo: "passos",
          titulo: "Fechamento",
          itens: [
            "Com o total coberto, toque em Fechar conta (ou F5).",
            "A confirmação mostra subtotal, taxa (ou taxa removida), acréscimo, desconto, cupom, cada forma recebida, o troco e os pontos que o cliente vai ganhar.",
            "Confirme. O pagamento é gravado, o estoque é baixado e a mesa é liberada.",
            "Na tela de sucesso: comprovante completo de pagamento (ou retirada/entrega no delivery) e, no salão, também o cupom simplificado do cliente.",
          ],
        },
        {
          tipo: "aviso",
          titulo: "Não consigo fechar a conta",
          texto: "O botão só habilita quando os recebimentos cobrem o total. Confira a linha Falta na base da coluna: se houver valor, registre o restante com OK.",
        },
      ],
    },

    {
      id: "rodape",
      titulo: "Ações do rodapé",
      resumo: "Transferir, separar, pré-conta, comprovante, cozinha, observações e histórico.",
      blocos: [
        {
          tipo: "tabela",
          cabecalho: ["Ação", "Para que serve"],
          linhas: [
            ["Transferir", "Move toda a conta para outra mesa. Mostra mesas disponíveis (verde) e ocupadas (laranja) e pede confirmação."],
            ["Separar", "Leva itens escolhidos para outra mesa. Não permite separar todos (use Transferir). Confirma antes de mover."],
            ["Pré-conta", "Imprime o modelo de pré-conta 80mm (sem valor fiscal), com divisão sugerida quando a mesa tem capacidade cadastrada."],
            ["Comprovante", "Mesa: conferência em aberto (bloqueia alteração dos itens). Delivery/retirada: comprovante logístico com assinatura."],
            ["Cozinha", "Imprime o pedido de produção 80mm — um cupom por setor (Cozinha, Bar, Sobremesa…), conforme o vínculo do produto."],
            ["Observações", "Anotação interna da mesa, visível apenas para a equipe (também pode sair no cupom de produção)."],
            ["Histórico", "Todos os pedidos daquela mesa no dia, inclusive os já pagos."],
          ],
        },
        { tipo: "p", texto: "A exclusão de um produto na conta pede confirmação e fica registrada na auditoria do sistema." },
        { tipo: "p", texto: "Em telas menores, Pré-conta, Comprovante e Cozinha ficam à vista; Transferir, Separar, Observações e Histórico ficam em Mais." },
        { tipo: "dica", titulo: "Impressora de cupom", texto: "Os layouts são feitos para impressora térmica de automação comercial (80mm, fonte monoespaçada). Libere pop-ups no navegador — a cozinha pode abrir várias janelas (uma por setor)." },
      ],
    },

    {
      id: "cupons-termicos",
      titulo: "Cupons térmicos (80mm)",
      resumo: "Os seis modelos de impressão do Pedido Prime e quando usar cada um.",
      blocos: [
        {
          tipo: "p",
          texto: "Todo cupom do PDV é documento não fiscal, com a marca Pedido Prime no topo, o nome da sua loja e, quando cadastrados, documento (CNPJ/CPF), telefone e endereço. A impressão usa 80mm — o padrão das impressoras de automação comercial.",
        },
        { tipo: "ilustracao", nome: "cuponsTermicos" },
        {
          tipo: "tabela",
          cabecalho: ["Modelo", "Quando sai", "O que destaca"],
          linhas: [
            ["1. Cupom simplificado do cliente", "Após fechar a conta → Cupom simplificado", "Itens, subtotal, desconto, total e forma de pagamento — versão curta para o cliente."],
            ["2. Comprovante completo de pagamento", "Após fechar a conta → Comprovante completo", "Mesa, comanda, horários, operador, unitário, taxas, split de pagamentos, troco e bloco de controle interno (PDV, caixa, ID)."],
            ["3. Pedido para produção (cozinha)", "Rodapé → Cozinha (e também na Central Operacional)", "Um cupom por setor. Nome do item em destaque, modificadores (+/−), observação e prioridade."],
            ["4. Conferência de mesa / comanda", "Rodapé → Comprovante (mesa em aberto)", "Linha do tempo com hora de cada item, total estimado e aviso de conta em aberto."],
            ["5. Pré-conta", "Rodapé → Pré-conta (ou F4)", "Totais, divisão sugerida por pessoa (capacidade da mesa) e formas aceitas."],
            ["6. Entrega / retirada", "Comprovante em pedido externo; ou após pagamento delivery", "Código, horários, volumes, conferido/entregue por, status e campos de assinatura."],
          ],
        },
        {
          tipo: "aviso",
          titulo: "Setores de cozinha",
          texto: "O cupom de produção só separa por setor se o produto estiver vinculado a um setor em Administrativo → Setores / Cardápio QR. Sem vínculo, o sistema usa a categoria (bebida → Bar, sobremesa → Sobremesa, demais → Cozinha).",
        },
        {
          tipo: "passos",
          titulo: "Fluxo recomendado no salão",
          itens: [
            "Lance os produtos na conta.",
            "Toque em Cozinha para disparar a produção (um cupom por setor).",
            "Quando o cliente pedir a conta, imprima a Pré-conta (F4).",
            "Se precisar travar a conta, use Comprovante (conferência).",
            "Ao receber, feche a conta e imprima o comprovante completo ou o cupom simplificado.",
          ],
        },
        {
          tipo: "dica",
          titulo: "Delivery e retirada",
          texto: "No canal Delivery, o botão Comprovante já usa o modelo logístico (com assinatura). Depois do pagamento, o botão principal da tela de sucesso imprime esse mesmo modelo.",
        },
      ],
    },

    {
      id: "atalhos",
      titulo: "Atalhos de teclado",
      resumo: "Para quem opera no balcão com teclado.",
      blocos: [
        {
          tipo: "tabela",
          cabecalho: ["Tecla", "Ação"],
          linhas: [
            ["F1", "Abrir / fechar a Central de Ajuda"],
            ["F2", "Ir para a busca"],
            ["F3", "Voltar para o canal Mesa"],
            ["F4", "Imprimir a pré-conta"],
            ["F5", "Fechar a conta"],
            ["F6", "Registrar o valor digitado (mesmo que OK)"],
            ["Esc", "Fechar o modal ou a ajuda aberta"],
          ],
        },
      ],
    },

    {
      id: "situacoes",
      titulo: "Situações do dia a dia",
      resumo: "Casos reais e o caminho mais curto para resolver.",
      blocos: [
        {
          tipo: "tabela",
          cabecalho: ["Situação", "O que fazer"],
          linhas: [
            ["Mesa de 4 amigos que vão rachar igual", "Dividir → Por pessoa → 4 pessoas, 1 cota por vez. Receba cada cota na forma que a pessoa escolher."],
            ["Um paga a bebida, o outro paga o resto", "Dividir → Por produto → marque a bebida (Todo) e receba; depois marque os demais itens."],
            ["Refrigerante de 1L compartilhado por 3", "Dividir → Por produto → divida o item por 3 e some os pratos individuais de cada um."],
            ["Cliente paga metade agora e metade depois", "Dividir → Percentual → 50%, receba, e o painel segue cobrando o restante."],
            ["Cliente pagou com dois cartões", "Selecione a forma, digite o primeiro valor, OK; selecione a mesma forma de novo e receba o segundo."],
            ["Cliente quer usar pontos", "Identifique pelo telefone, selecione Pontos e toque em Valor total — o sistema limita ao saldo."],
            ["Cliente novo quer começar a pontuar", "Identificar → telefone e nome → Cadastrar cliente. A compra já pontua."],
            ["Cliente pediu para tirar a taxa de serviço", "No pagamento, toque em Remover na linha da taxa. O total recalcula na hora."],
            ["Cortesia ou desconto combinado no caixa", "Use o campo Desconto no pagamento (valor em reais). Pode combinar com cupom."],
            ["Cliente pediu mais um item depois do comprovante", "Incluir produto → informe a comanda do cliente → escolha o produto. A nova venda fica vinculada à comanda."],
            ["Cliente quer pontuar ao incluir produto", "Ao escolher o produto, confirme Sim, identificar e complete o telefone."],
            ["Cupom recusado", "Leia a legenda sob o campo (inválido, fora do prazo, esgotado, mínimo) e o toast de erro."],
            ["Criei o cupom e nada aconteceu", "A mensagem agora aparece na própria tela de Cupons. Se o banco ainda não tiver a migration 075, o erro orienta a rodá-la."],
            ["Conta paga mas a mesa continua ocupada", "Não acontece: a liberação é automática. Se a mesa continua laranja, existe outro pedido em aberto nela — confira pelo Histórico."],
            ["Errou o valor de uma parcela", "Remova a parcela pelo × na lista de Recebimentos e registre de novo."],
            ["Não lembra como usar uma função", "Toque no ? do topo ou pressione F1. Busque o tópico ou gere o PDF."],
            ["Precisa mandar o pedido para a cozinha e o bar", "Rodapé → Cozinha: sai um cupom 80mm por setor (produto vinculado ao setor)."],
            ["Cliente pediu a conta para conferir", "Pré-conta (F4). Depois, se for travar a conta, use Comprovante."],
            ["Impressora não abriu a janela", "Libere pop-ups do navegador para pedidoprime.com.br — a cozinha pode abrir mais de uma janela."],
          ],
        },
      ],
    },

    {
      id: "boas-praticas",
      titulo: "Checklist do turno",
      resumo: "Rotina que evita retrabalho no fechamento do caixa.",
      blocos: [
        {
          tipo: "lista",
          titulo: "Abertura",
          itens: [
            "Confira o resumo do turno: mesas disponíveis e contas que ficaram abertas do turno anterior.",
            "Verifique se as formas de pagamento estão todas ativas.",
            "Abra a ajuda (F1) se houver operador novo no turno — o PDF pode ser impresso para consulta.",
          ],
        },
        {
          tipo: "lista",
          titulo: "Durante o serviço",
          itens: [
            "Priorize as mesas amarelas — o cliente já pediu a conta.",
            "Ofereça a identificação do cliente antes de receber: é o que garante os pontos dele.",
            "Confira a linha Falta antes de confirmar o fechamento.",
            "Se emitir comprovante e o cliente pedir mais itens, peça a comanda e use Incluir produto.",
          ],
        },
        {
          tipo: "lista",
          titulo: "Encerramento",
          itens: [
            "Nenhuma mesa deve ficar laranja sem consumo real.",
            "Confira faturamento e ticket médio no resumo do turno.",
            "Imprima os comprovantes de pagamento pendentes (completo ou simplificado) antes de fechar o caixa.",
          ],
        },
      ],
    },
  ];
}
