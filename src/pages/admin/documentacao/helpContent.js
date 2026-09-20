// ════════════════════════════════════════════════════════════
//  PDB-I3-DOC1 — CONTEÚDO da ajuda contextual (dados puros, sem JSX).
//
//  Contrato:
//    doc     = { id, title, description, keywords, sections }
//    section = { id, title, summary, content, keywords }
//    content = lista de blocos:
//      { type: "p",     text }
//      { type: "h",     text }                       subtítulo
//      { type: "list",  items: [string] }
//      { type: "steps", items: [string] }            lista numerada
//      { type: "terms", items: [{ term, text }] }    definições
//      { type: "note",  tone: "info"|"destaque", title?, text }
//      { type: "faq",   items: [{ q, a }] }
//
//  Linguagem: PT-BR simples, para o administrador — termos técnicos vêm sempre
//  acompanhados de explicação. Nada aqui fala com backend: é texto estático.
// ════════════════════════════════════════════════════════════

// ── Blocos compartilhados (definidos UMA vez) ────────────────

// "Disponibilidade atual" — o estado da liberação vive só aqui; as duas
// documentações reutilizam esta seção.
const SECAO_DISPONIBILIDADE = {
  id: "disponibilidade",
  title: "Disponibilidade atual",
  summary: "A nova experiência está sendo liberada aos poucos; algumas ações aparecem bloqueadas.",
  keywords: ["prévia", "previa", "bloqueada", "bloqueado", "desabilitada", "liberação", "progressiva", "dados de exemplo"],
  content: [
    { type: "p", text: "Esta experiência está sendo liberada progressivamente. Por isso, algumas telas trazem dados de exemplo (indicados como prévia) e ações críticas podem aparecer desabilitadas." },
    { type: "p", text: "Isso acontece porque o backend e os gates (travas) de segurança ainda estão em integração. Enquanto eles não estiverem ativos, a tela mostra o que será possível fazer, mas não executa a ação." },
    { type: "note", tone: "info", title: "Ação bloqueada não é erro", text: "Uma ação bloqueada é uma proteção intencional: o sistema prefere não permitir a ação a permiti-la sem ter certeza. Quando a integração for concluída, os controles serão liberados sem que você precise mudar nada no dia a dia." },
  ],
};

const GLOSSARIO = [
  { term: "HML (Homologação)", text: "Ambiente de teste do Pedido Prime, onde as atualizações são validadas antes de chegar aos clientes." },
  { term: "PROD (Produção)", text: "Ambiente real, usado pelos restaurantes no dia a dia." },
  { term: "SHA", text: "Código de identificação de um commit do Git: aponta exatamente qual versão do código está publicada. Não é a versão comercial." },
  { term: "Migration", text: "Script versionado que altera a estrutura do banco de dados (tabelas, colunas, regras). Não copia dados." },
  { term: "Baseline", text: "Versão estrutural conhecida do banco de dados em um ambiente. Não é a versão comercial do Pedido Prime." },
  { term: "Release", text: "Publicação específica dentro de uma versão. Uma versão pode ter várias releases (Release 001, 002, 003…)." },
  { term: "Version (Versão)", text: "Número comercial no formato MAJOR.MINOR.PATCH, como v1.4.2." },
  { term: "Readiness (Prontidão)", text: "Verificação que indica se uma condição necessária para atualizar está atendida (VERIFIED, PENDING, BLOCKED, UNKNOWN, STALE ou FAILED)." },
  { term: "Write Fence", text: "Proteção que impede alterações nos dados durante as fases críticas de uma atualização." },
  { term: "Smoke Test", text: "Teste rápido feito após a atualização para confirmar que o sistema continua funcionando." },
  { term: "Rollback / Reversão", text: "Voltar a aplicação para uma release anterior. Não restaura nem apaga dados do banco automaticamente." },
  { term: "Recovery (Recuperação)", text: "Procedimento técnico para reconciliar ou restaurar o banco de dados quando algo não terminou com segurança." },
  { term: "Heartbeat", text: "Sinal de atividade enviado periodicamente pelo executor para mostrar que continua funcionando." },
  { term: "Lease", text: "Direito temporário do executor de coordenar uma execução. Se expira, outro executor não assume às cegas." },
];

const SECAO_GLOSSARIO = {
  id: "glossario",
  title: "Glossário",
  summary: "Definições curtas dos termos usados nestas telas.",
  keywords: ["glossário", "glossario", "termos", "significado", "dicionário", "siglas"],
  content: [{ type: "terms", items: GLOSSARIO }],
};

// ── Versões & Atualizações (/admin/ambientes) ────────────────

const SECOES_VERSOES = [
  {
    id: "objetivo",
    title: "Objetivo da página",
    summary: "Esta página centraliza ambientes, versões, releases, atualizações, histórico e preparação de publicação.",
    keywords: ["objetivo", "para que serve", "visão geral", "central", "publicação"],
    content: [
      { type: "p", text: "Versões & Atualizações centraliza tudo o que envolve levar uma novidade do Pedido Prime para os clientes: ambientes, versões, releases, atualizações, histórico e a preparação de cada publicação." },
      { type: "list", items: [
        "Visão geral: compara Homologação e Produção e mostra o que falta para atualizar.",
        "Versões & Releases: mostra a versão do produto e as releases de cada versão.",
        "Deploys: acompanhamento técnico das publicações da aplicação.",
        "Histórico: registro imutável de tudo o que aconteceu.",
      ] },
      { type: "note", tone: "info", title: "Preparação × execução", text: "Esta página é onde a atualização é preparada e revisada. O acompanhamento da execução em si — fases, proteções, backup e progresso — fica na página Manutenção." },
    ],
  },
  SECAO_DISPONIBILIDADE,
  {
    id: "ambientes",
    title: "Ambientes: Homologação e Produção",
    summary: "Diferença entre HML e PROD e o que cada informação do cartão de ambiente significa.",
    keywords: ["ambiente", "ambientes", "homologação", "homologacao", "hml", "produção", "producao", "prod", "branch", "sha", "status", "última validação", "ultima validacao"],
    content: [
      { type: "terms", items: [
        { term: "Homologação (HML)", text: "Ambiente de teste. As novidades e as migrations são aplicadas e validadas aqui primeiro. Nenhum cliente usa este ambiente." },
        { term: "Produção (PROD)", text: "Ambiente real, usado pelos restaurantes. Só recebe uma atualização depois que ela foi validada em Homologação." },
      ] },
      { type: "h", text: "O que aparece em cada ambiente" },
      { type: "terms", items: [
        { term: "Branch", text: "Ramo do Git de onde o código daquele ambiente é publicado." },
        { term: "SHA", text: "Identificação exata do commit publicado no ambiente. Serve para saber, sem dúvida, qual código está no ar." },
        { term: "Database baseline", text: "Versão estrutural conhecida do banco daquele ambiente (veja o tópico Database baseline)." },
        { term: "Status", text: "Situação atual do ambiente, como Online, Degradado, Offline ou Não verificado. Quando não é possível confirmar, o sistema mostra Não verificado em vez de supor que está tudo bem." },
        { term: "Última validação", text: "Data e hora da última conferência feita naquele ambiente. Quanto mais antiga, menos confiável é a informação." },
      ] },
      { type: "note", tone: "destaque", title: "HML × PROD", text: "São dois ambientes independentes, cada um com o seu banco de dados. O que acontece em Homologação (testes, cadastros de exemplo) não aparece em Produção." },
    ],
  },
  {
    id: "baseline",
    title: "Database baseline",
    summary: "Baseline é a versão estrutural conhecida do banco — não é a versão comercial do Pedido Prime.",
    keywords: ["baseline", "banco", "estrutura", "schema", "auditado", "não verificado"],
    content: [
      { type: "p", text: "O baseline é a versão estrutural conhecida do banco de dados: o conjunto de tabelas, colunas e regras que aquele ambiente possui." },
      { type: "p", text: "Ele responde à pergunta \"em que ponto está a estrutura do banco?\". É diferente da versão comercial (como v1.4.2), que é o número que identifica o produto." },
      { type: "list", items: [
        "Baseline auditado: a estrutura foi conferida e é conhecida.",
        "Baseline não verificado: ainda não foi possível confirmar. O sistema trata isso como atenção, nunca como aprovado.",
      ] },
    ],
  },
  {
    id: "migrations",
    title: "Migrations",
    summary: "Scripts versionados que alteram a estrutura do banco: ordem, identidade, Git blob, SHA256, classificação e status.",
    keywords: ["migration", "migrations", "ordem", "identidade", "git blob", "sha256", "classificação", "classificacao", "status", "estrutural"],
    content: [
      { type: "p", text: "Uma migration é um script versionado que altera a estrutura do banco de dados: cria uma tabela, adiciona uma coluna, ajusta uma regra. Ela muda a estrutura, não os dados das lojas." },
      { type: "terms", items: [
        { term: "Ordem", text: "As migrations são numeradas e precisam ser aplicadas na sequência, sem pular nenhuma." },
        { term: "Identidade", text: "Cada migration é identificada pelo seu número e nome. Isso garante que Homologação e Produção falem da mesma migration." },
        { term: "Git blob", text: "Identificador do conteúdo exato do arquivo no Git. Se o conteúdo muda, o Git blob muda." },
        { term: "SHA256", text: "Assinatura (hash) do conteúdo do arquivo. Confirma que o que será aplicado é exatamente o que foi revisado." },
        { term: "Classificação", text: "Resultado da análise de segurança: Aplicação automática permitida, Revisão obrigatória ou Execução automática bloqueada. Quando a classificação é desconhecida, o sistema assume Revisão obrigatória." },
        { term: "Status", text: "Situação da migration, como Aplicada em HML, Não aplicada em HML, Não verificada ou Falhou." },
      ] },
      { type: "note", tone: "destaque", title: "Estrutural não é cópia de dados", text: "Uma migration estrutural NÃO significa copiar dados de Homologação para Produção. Veja o tópico Nenhum dado é copiado." },
    ],
  },
  {
    id: "sem-copia-de-dados",
    title: "Nenhum dado é copiado",
    summary: "A atualização HML → PROD promove estrutura e migrations versionadas; não copia pedidos, clientes, produtos ou vendas.",
    keywords: ["copiar dados", "cópia de dados", "dados", "pedidos", "clientes", "produtos", "vendas", "lojas", "hml para prod", "promover", "não copia"],
    content: [
      { type: "p", text: "A atualização de Homologação para Produção promove estrutura e migrations versionadas — ou seja, as mudanças no funcionamento do sistema." },
      { type: "p", text: "Ela NÃO copia automaticamente:" },
      { type: "list", items: [
        "pedidos;",
        "clientes;",
        "produtos;",
        "vendas;",
        "nenhum outro dado operacional das lojas.",
      ] },
      { type: "note", tone: "destaque", title: "Os dados das lojas ficam onde estão", text: "Os dados de Produção continuam sendo os dados reais de cada restaurante. Os dados de teste de Homologação nunca são levados para Produção." },
    ],
  },
  {
    id: "readiness",
    title: "Readiness (prontidão)",
    summary: "Estados VERIFIED, PENDING, BLOCKED, UNKNOWN, STALE e FAILED e por que o visual \"pronto\" não basta.",
    keywords: ["readiness", "prontidão", "prontidao", "verified", "pending", "blocked", "unknown", "stale", "failed", "verificado", "pendente", "bloqueado", "desatualizado", "falhou", "ready"],
    content: [
      { type: "p", text: "Readiness indica se uma condição necessária para atualizar está atendida. Cada verificação tem um destes estados:" },
      { type: "terms", items: [
        { term: "VERIFIED · Verificado", text: "A condição foi conferida e está atendida." },
        { term: "PENDING · Pendente", text: "Ainda não foi conferida, mas está prevista." },
        { term: "BLOCKED · Bloqueado", text: "Algo impede a atualização. A tela mostra o motivo do bloqueio." },
        { term: "UNKNOWN · Não verificado", text: "Não há informação suficiente para afirmar. Nunca é tratado como aprovado." },
        { term: "STALE · Desatualizado", text: "Foi verificado antes, mas a verificação ficou antiga e precisa ser refeita." },
        { term: "FAILED · Falhou", text: "A verificação foi feita e o resultado foi negativo." },
      ] },
      { type: "note", tone: "destaque", title: "Pronto na tela não é autorização", text: "Um indicador visual de pronto (READY) não é autorização suficiente para atualizar. Quando a funcionalidade estiver ativa, o backend é a autoridade final e pode negar a execução mesmo que a tela pareça pronta." },
    ],
  },
  {
    id: "versionamento",
    title: "Versionamento (MAJOR.MINOR.PATCH)",
    summary: "Como o número da versão é formado e a diferença entre versão e release.",
    keywords: ["versão", "versao", "versões", "versionamento", "major", "minor", "patch", "release", "releases", "reinicia", "v1.4.2", "número"],
    content: [
      { type: "h", text: "Modelo de versão" },
      { type: "p", text: "A versão comercial segue o formato MAJOR.MINOR.PATCH, por exemplo v1.4.2:" },
      { type: "terms", items: [
        { term: "MAJOR", text: "Mudança estrutural relevante ou incompatível com o que existia." },
        { term: "MINOR", text: "Nova funcionalidade compatível com o que existia." },
        { term: "PATCH", text: "Correção ou ajuste compatível." },
      ] },
      { type: "h", text: "Versão não é release" },
      { type: "p", text: "A versão identifica o produto. A release identifica cada publicação dentro dessa versão. Uma versão pode ter várias releases:" },
      { type: "list", items: [
        "v1.4.2 · Release 001",
        "v1.4.2 · Release 002",
        "v1.4.2 · Release 003",
      ] },
      { type: "p", text: "A numeração de releases reinicia (volta para 001) quando uma nova versão é criada." },
    ],
  },
  {
    id: "releases",
    title: "Versões & Releases: campos de uma release",
    summary: "Status, release notes, migrations relacionadas, origem, destino, publicado por e release anterior.",
    keywords: ["release", "releases", "status", "release notes", "notas", "migrations relacionadas", "origem", "destino", "publicado por", "release anterior", "detalhes"],
    content: [
      { type: "p", text: "Ao abrir os detalhes de uma release, você encontra:" },
      { type: "terms", items: [
        { term: "Status", text: "Em que ponto a release está: Rascunho, Validada, Aprovada, Agendada, Em execução, Publicada, Falhou, Substituída ou Revertida. Quando não é possível confirmar, aparece Não verificada." },
        { term: "Release notes", text: "Resumo, em linguagem simples, do que mudou nela." },
        { term: "Migrations relacionadas", text: "As alterações de banco que fazem parte desta release." },
        { term: "Origem", text: "Ambiente de onde a release sai (normalmente Homologação)." },
        { term: "Destino", text: "Ambiente para onde ela vai (normalmente Produção)." },
        { term: "Publicado por", text: "Quem realizou a publicação." },
        { term: "Release anterior", text: "A release que estava valendo antes desta, útil para comparar e para avaliar uma reversão." },
      ] },
      { type: "h", text: "Build e SHA" },
      { type: "terms", items: [
        { term: "Build", text: "Identificação técnica opcional da geração do pacote da aplicação." },
        { term: "SHA", text: "O commit exato do Git usado pela aplicação." },
      ] },
      { type: "note", tone: "info", text: "O SHA não é a versão comercial. Ele identifica o código com precisão; a versão (como v1.4.2) é o nome comercial daquele conjunto de mudanças." },
    ],
  },
  {
    id: "deploys",
    title: "Deploys",
    summary: "Aba mais técnica, que acompanha as publicações da aplicação.",
    keywords: ["deploy", "deploys", "publicação", "publicacoes", "github", "vercel", "técnico", "tecnico", "aplicação"],
    content: [
      { type: "p", text: "A aba Deploys acompanha as informações técnicas da publicação da aplicação: qual código foi publicado, quando e com que resultado." },
      { type: "note", tone: "info", title: "Área mais técnica", text: "Esta é uma área voltada a quem precisa de detalhes técnicos. Para o dia a dia, use a Visão geral e o Histórico. A aba é somente de consulta e só busca informações quando é aberta." },
    ],
  },
  {
    id: "historico",
    title: "Histórico",
    summary: "Registro imutável de versões, releases, publicações, falhas, reversões, datas e responsáveis.",
    keywords: ["histórico", "historico", "imutável", "imutavel", "registro", "auditoria", "falhas", "reversões", "datas", "atores", "responsáveis"],
    content: [
      { type: "p", text: "O histórico é imutável: o que foi registrado não é alterado nem apagado. Ele guarda:" },
      { type: "list", items: [
        "versões e releases;",
        "publicações;",
        "falhas;",
        "reversões;",
        "datas e horários;",
        "quem realizou cada ação (atores).",
      ] },
      { type: "note", tone: "info", text: "Publicar uma nova release não apaga os registros anteriores: o histórico só cresce. Assim é sempre possível saber o que foi feito, quando e por quem." },
    ],
  },
  {
    id: "revisar-execucao",
    title: "Revisar execução",
    summary: "Conferência de origem, destino, SHA, migrations, readiness, backup, sessões, write fence e aprovação antes de executar.",
    keywords: ["revisar execução", "revisar execucao", "revisão", "conferir", "origem", "destino", "sha", "migrations", "readiness", "backup", "sessões", "sessao", "sessões ativas", "write fence", "aprovação", "aprovacao", "plano"],
    content: [
      { type: "p", text: "\"Revisar execução\" permite conferir, antes de executar, tudo o que a atualização envolve:" },
      { type: "list", items: [
        "origem e destino;",
        "SHA (o código que será publicado);",
        "migrations que serão aplicadas;",
        "readiness (prontidão das verificações);",
        "backup;",
        "sessões ativas;",
        "write fence (proteção contra alterações nos dados);",
        "aprovação.",
      ] },
      { type: "note", tone: "info", text: "A revisão é somente de leitura: abrir e conferir não executa nada." },
    ],
  },
  {
    id: "agendamento",
    title: "Agendamento",
    summary: "Define data e hora de uma futura atualização, que continua sujeita a todos os gates de segurança.",
    keywords: ["agendar", "agendamento", "data", "hora", "futura", "gates", "validações", "validacoes", "janela"],
    content: [
      { type: "p", text: "O agendamento define a data e a hora de uma futura atualização, para que ela aconteça em um momento combinado." },
      { type: "note", tone: "destaque", title: "Agendar não pula validações", text: "A execução futura continua sujeita aos gates de segurança. Agendar não ignora nenhuma validação: se, na hora marcada, uma condição não estiver atendida, a atualização não avança." },
    ],
  },
  {
    id: "reversao",
    title: "Avaliar reversão",
    summary: "Voltar a aplicação é diferente de recuperar o banco; voltar o código não restaura nem apaga dados.",
    keywords: ["reversão", "reversao", "rollback", "reverter", "voltar", "release anterior", "recuperação", "recovery", "schema", "compatibilidade", "banco"],
    content: [
      { type: "p", text: "\"Avaliar reversão\" faz uma análise de compatibilidade para saber se é seguro voltar a uma release anterior. A análise é somente de leitura: nenhuma alteração é feita." },
      { type: "h", text: "Duas coisas diferentes" },
      { type: "terms", items: [
        { term: "Reversão da aplicação", text: "Voltar o código do sistema para uma release anterior." },
        { term: "Recuperação do banco", text: "Restaurar ou reconciliar o banco de dados a partir de um backup ou de uma análise técnica." },
      ] },
      { type: "note", tone: "destaque", title: "Voltar o código não mexe nos dados", text: "Voltar o código NÃO deve restaurar nem apagar automaticamente os dados do banco. Os dois passos são separados de propósito, para não haver perda de dados por engano." },
      { type: "p", text: "Uma mudança incompatível de schema (por exemplo, uma coluna que foi removida ou trocada) exige análise específica: o código antigo pode não funcionar com a estrutura nova do banco. Por isso a reversão só é considerada segura depois dessa análise." },
    ],
  },
  {
    id: "fluxo-diario",
    title: "Fluxo recomendado no dia a dia",
    summary: "Da conferência dos ambientes ao acompanhamento e à checagem do histórico.",
    keywords: ["fluxo", "passo a passo", "dia a dia", "procedimento", "recomendado", "rotina", "como usar"],
    content: [
      { type: "steps", items: [
        "Verifique Homologação e Produção (status e última validação).",
        "Confira as diferenças entre os dois ambientes.",
        "Analise as migrations envolvidas.",
        "Revise o readiness: nenhum item bloqueado, falho ou desatualizado.",
        "Revise o plano de execução (Revisar execução).",
        "Agende ou execute quando estiver autorizado.",
        "Acompanhe o andamento na página Manutenção.",
        "Confira o Histórico ao final.",
      ] },
    ],
  },
  {
    id: "faq",
    title: "Perguntas frequentes",
    summary: "Respostas curtas sobre versão, release, baseline, migration, dados, reversão e ações bloqueadas.",
    keywords: ["faq", "dúvidas", "duvidas", "perguntas", "pergunta", "perguntas frequentes"],
    content: [
      { type: "faq", items: [
        { q: "Qual a diferença entre versão e release?", a: "A versão é o número comercial do produto (como v1.4.2). A release é cada publicação dentro dessa versão (Release 001, 002…). Uma versão pode ter várias releases." },
        { q: "O que é baseline?", a: "É a versão estrutural conhecida do banco de dados de um ambiente. Não é a versão comercial do Pedido Prime." },
        { q: "O que é uma migration?", a: "É um script versionado que altera a estrutura do banco (tabelas, colunas, regras). Ela muda a estrutura, não copia dados." },
        { q: "Os dados da Homologação são copiados para Produção?", a: "Não. A atualização promove apenas estrutura e migrations versionadas. Pedidos, clientes, produtos, vendas e demais dados das lojas não são copiados." },
        { q: "Posso voltar para uma release anterior?", a: "Depende. Use \"Avaliar reversão\" para analisar. Voltar o código não restaura nem apaga dados do banco, e mudanças incompatíveis de schema exigem análise específica antes." },
        { q: "O que significa uma ação estar bloqueada?", a: "Significa que o sistema não permite aquela ação agora, por proteção: alguma condição não foi atendida ou a funcionalidade ainda está em liberação. Não é um erro; veja o motivo exibido na tela." },
      ] },
    ],
  },
  SECAO_GLOSSARIO,
];

// ── Manutenção (/admin/manutencao) ───────────────────────────

const SECOES_MANUTENCAO = [
  {
    id: "objetivo",
    title: "Objetivo da página",
    summary: "Acompanhar e controlar operacionalmente uma atualização. Versões & Atualizações é a preparação; Manutenção é a execução.",
    keywords: ["objetivo", "para que serve", "acompanhar", "controlar", "operacional", "execução", "preparação"],
    content: [
      { type: "p", text: "A página Manutenção serve para acompanhar e controlar operacionalmente uma atualização do sistema: em que etapa ela está, quais proteções estão ativas, como estão o backup e as migrations e se algo exige atenção." },
      { type: "terms", items: [
        { term: "Versões & Atualizações", text: "É a preparação: versões, releases, migrations, revisão e agendamento." },
        { term: "Manutenção", text: "É o acompanhamento da execução: o que está acontecendo agora, com proteções, progresso e linha do tempo." },
      ] },
    ],
  },
  SECAO_DISPONIBILIDADE,
  {
    id: "fluxo-manutencao",
    title: "Fluxo de manutenção (fases)",
    summary: "As fases NORMAL, NOTICE, FENCING, DRAINING, QUIESCENT, BACKING_UP, MIGRATING, SMOKE e NORMAL, com o nome exibido na tela.",
    keywords: ["fases", "fase", "etapas", "fluxo", "normal", "notice", "fencing", "draining", "quiescent", "backing_up", "migrating", "smoke", "aviso", "proteção", "drenagem", "quiescência", "backup", "atualização", "verificação", "normalizado"],
    content: [
      { type: "p", text: "Uma atualização segue nove etapas, sempre nesta ordem. Cada uma tem um nome técnico e um nome exibido na tela:" },
      { type: "terms", items: [
        { term: "NORMAL · Normal", text: "Ponto de partida. Clientes usam o sistema e nenhuma atualização está em andamento." },
        { term: "NOTICE · Aviso", text: "Os usuários são avisados de que o sistema entrará em atualização em breve. O acesso segue liberado." },
        { term: "FENCING · Proteção", text: "Novos acessos são bloqueados e as alterações nos dados passam a ser barradas nas etapas críticas." },
        { term: "DRAINING · Drenagem", text: "Sessões e operações que já estavam em andamento são concluídas ou encerradas com segurança." },
        { term: "QUIESCENT · Quiescência", text: "O sistema chega ao repouso: nenhuma sessão ativa e nenhuma operação em andamento." },
        { term: "BACKING_UP · Backup", text: "É gerado um backup e sua integridade é verificada antes de qualquer alteração no banco." },
        { term: "MIGRATING · Atualização", text: "As migrations (alterações de estrutura do banco) são aplicadas uma a uma, na ordem." },
        { term: "SMOKE · Verificação", text: "Testes rápidos confirmam que o sistema continua funcionando." },
        { term: "NORMAL · Normalizado", text: "Concluída a verificação, o sistema volta ao normal e o acesso é liberado." },
      ] },
      { type: "note", tone: "info", text: "NORMAL aparece duas vezes: no início (ponto de partida) e no fim (Normalizado, quando a atualização terminou com segurança)." },
    ],
  },
  {
    id: "releasing",
    title: "RELEASING (Liberação)",
    summary: "Fase do fluxo APP_RELEASE (liberação da aplicação); não equivale a MIGRATING.",
    keywords: ["releasing", "liberação", "liberacao", "app_release", "aplicação", "migrating", "fluxo legado"],
    content: [
      { type: "p", text: "RELEASING (exibida como Liberação) é uma fase do fluxo APP_RELEASE, que trata da liberação da aplicação." },
      { type: "note", tone: "destaque", title: "Não é a mesma coisa que MIGRATING", text: "RELEASING não faz parte da sequência de atualização do banco de dados e não é equivalente a MIGRATING (Atualização). Por isso ela aparece com nome próprio e não dentro das nove etapas." },
    ],
  },
  {
    id: "login-gate",
    title: "Login gate",
    summary: "Quando fechado, impede novos acessos durante as etapas críticas.",
    keywords: ["login", "login gate", "acesso", "entrar", "bloqueio de login", "novos acessos", "mensagem", "aguarde"],
    content: [
      { type: "p", text: "O login gate é a \"porta de entrada\" do sistema. Quando está fechado, impede novos acessos durante as etapas críticas da atualização." },
      { type: "p", text: "Quem tenta entrar vê a mensagem prevista:" },
      { type: "note", tone: "info", text: "\"Sistema em processo de atualização. Aguarde até a finalização.\"" },
      { type: "p", text: "Ele é reaberto quando o sistema volta ao estado Normalizado, depois da verificação." },
    ],
  },
  {
    id: "write-fence",
    title: "Write fence",
    summary: "Proteção que impede alterações nos dados durante as fases críticas.",
    keywords: ["write fence", "write-fence", "proteção", "protecao", "escrita", "alterações", "alteracoes", "dados", "cerca"],
    content: [
      { type: "p", text: "O write fence (\"cerca de escrita\") é uma proteção que impede alterações nos dados durante as fases críticas. Enquanto ele está ativo, o sistema não aceita gravações novas." },
      { type: "p", text: "Isso evita que um pedido, um cadastro ou qualquer outra alteração seja feito no meio da atualização e acabe perdido ou inconsistente." },
    ],
  },
  {
    id: "sessoes",
    title: "Sessões ativas",
    summary: "Usuários conectados e reconhecidos pela camada canônica de sessão; a atualização crítica exige evidência segura.",
    keywords: ["sessão", "sessões", "sessao", "sessoes", "sessões ativas", "usuários conectados", "conectados", "canônica", "evidência", "evidencia", "zerar"],
    content: [
      { type: "p", text: "Sessões ativas representam os usuários conectados ao sistema, conforme reconhecido pela camada canônica de sessão (a fonte oficial que registra quem está conectado)." },
      { type: "p", text: "Uma atualização crítica exige evidência segura de que não há sessões ativas, conforme o contrato de segurança. Se não for possível comprovar, o sistema não assume que \"zero\" é verdade: fica em estado de atenção e não avança." },
    ],
  },
  {
    id: "em-andamento",
    title: "Operações em andamento",
    summary: "Operações iniciadas antes do bloqueio; o sistema aguarda sua drenagem quando aplicável.",
    keywords: ["operações", "operacoes", "em andamento", "in-flight", "inflight", "drenagem", "draining", "pedidos em andamento", "aguardar"],
    content: [
      { type: "p", text: "São as operações que já estavam em andamento antes do bloqueio — por exemplo, algo que um usuário já tinha começado a gravar." },
      { type: "p", text: "Quando aplicável, o sistema aguarda que elas terminem (drenagem) antes de avançar. Só depois que sessões e operações estiverem comprovadamente zeradas o sistema chega à Quiescência." },
    ],
  },
  {
    id: "lock",
    title: "Lock de execução",
    summary: "Impede duas atualizações concorrentes no mesmo ambiente.",
    keywords: ["lock", "execution lock", "trava", "concorrente", "simultânea", "simultanea", "duas atualizações", "em uso", "livre", "expirado"],
    content: [
      { type: "p", text: "O lock de execução impede que duas atualizações aconteçam ao mesmo tempo no mesmo ambiente. Sem ele, duas execuções poderiam aplicar migrations em conflito." },
      { type: "list", items: [
        "Livre: nenhuma atualização em uso.",
        "Em uso: há uma atualização em andamento.",
        "Lock expirado: o lock ficou sem sinal e precisa de análise.",
        "Não verificado: não foi possível confirmar o estado.",
      ] },
    ],
  },
  {
    id: "backup",
    title: "Backup",
    summary: "Backup criado não significa backup validado; entenda os níveis L1, L2 e L3.",
    keywords: ["backup", "l1", "l2", "l3", "evidência do provedor", "integridade", "rehearsal", "restauração", "teste de recuperação", "validado", "criado"],
    content: [
      { type: "note", tone: "destaque", title: "Criado não é validado", text: "Um backup criado não significa um backup validado. Só um backup cuja integridade foi conferida (nível L2 ou superior) é considerado verificado." },
      { type: "terms", items: [
        { term: "L1 · Evidência do provedor", text: "O provedor confirma que o backup existe." },
        { term: "L2 · Integridade do backup", text: "O conteúdo do backup foi conferido e está íntegro." },
        { term: "L3 · Rehearsal", text: "Uma restauração de teste, em ambiente isolado, foi executada com sucesso — a prova mais forte de que o backup realmente pode ser usado." },
      ] },
      { type: "p", text: "Os níveis são cumulativos: alcançar o L3 implica que o L2 e o L1 também foram atendidos." },
    ],
  },
  {
    id: "executor",
    title: "Executor",
    summary: "Worker, heartbeat, lease e status de quem executa a atualização.",
    keywords: ["executor", "worker", "heartbeat", "lease", "status", "processo", "sinal", "sem sinal", "lease expirado"],
    content: [
      { type: "terms", items: [
        { term: "Worker", text: "O processo responsável por executar a atualização." },
        { term: "Heartbeat", text: "Sinal de atividade enviado periodicamente pelo worker. Se ele para, a tela indica Sem sinal recente." },
        { term: "Lease", text: "Direito temporário de coordenar aquela execução. Quando o lease expira, o worker não deve continuar sem renová-lo." },
        { term: "Status", text: "Situação do executor: Aguardando, Ativo, Sem sinal recente, Lease expirado ou Não verificado." },
      ] },
    ],
  },
  {
    id: "progresso",
    title: "Progresso",
    summary: "Progresso geral, fase atual, migration atual e quantidade de migrations — sem garantia de término.",
    keywords: ["progresso", "percentual", "porcentagem", "andamento", "fase atual", "migration atual", "quantidade", "conclusão", "término", "termino"],
    content: [
      { type: "terms", items: [
        { term: "Progresso geral", text: "Visão de quanto do processo já foi percorrido." },
        { term: "Fase atual", text: "A etapa em que a atualização está agora." },
        { term: "Migration atual", text: "A migration que está sendo aplicada no momento." },
        { term: "Quantidade de migrations", text: "Quantas já foram aplicadas do total previsto." },
      ] },
      { type: "note", tone: "destaque", title: "Percentual não é promessa", text: "O percentual é uma referência de andamento. Ele não é garantia de que a atualização terminará, nem de quanto tempo falta." },
    ],
  },
  {
    id: "linha-do-tempo",
    title: "Linha do tempo",
    summary: "Sequência cronológica dos eventos: mudanças de fase, backup, migrations, verificação, falhas e normalização.",
    keywords: ["linha do tempo", "timeline", "eventos", "cronológica", "cronologica", "histórico", "log", "mudança de fase"],
    content: [
      { type: "p", text: "A linha do tempo mostra, em ordem cronológica, os eventos da atualização. Ela pode conter:" },
      { type: "list", items: [
        "mudanças de fase;",
        "backup;",
        "migrations;",
        "verificação (smoke);",
        "falhas;",
        "normalização.",
      ] },
    ],
  },
  {
    id: "failed",
    title: "FAILED (falha)",
    summary: "Falha conhecida e identificada.",
    keywords: ["failed", "falha", "falhou", "erro", "conhecida", "identificada"],
    content: [
      { type: "p", text: "FAILED indica uma falha conhecida e identificada: o sistema sabe o que aconteceu e em qual etapa." },
      { type: "p", text: "É diferente de RECOVERY_REQUIRED e de AMBIGUOUS, em que ainda há dúvida sobre o que foi efetivamente aplicado." },
    ],
  },
  {
    id: "recovery-required",
    title: "RECOVERY_REQUIRED",
    summary: "Estado em que o sistema precisa de reconciliação técnica antes da liberação; não significa que houve perda de dados.",
    keywords: ["recovery_required", "recovery required", "recovery", "recuperação", "recuperacao", "reconciliação", "reconciliacao", "ambiguidade", "liberação", "perda de dados"],
    content: [
      { type: "p", text: "RECOVERY_REQUIRED é o estado em que o sistema precisa de reconciliação técnica antes da liberação. Ele pode ocorrer quando existe ambiguidade sobre efeitos já aplicados — por exemplo, quando não se sabe se uma migration chegou a ser aplicada." },
      { type: "note", tone: "destaque", title: "Não quer dizer que dados foram perdidos", text: "Este estado não significa, automaticamente, que dados foram perdidos. Significa que o sistema não tem certeza do que foi aplicado e, por segurança, não libera o acesso até que a equipe técnica confirme a situação." },
    ],
  },
  {
    id: "ambiguous",
    title: "AMBIGUOUS (resultado incerto)",
    summary: "Não há prova suficiente para afirmar se a ação foi concluída: fail-closed e reconciliação.",
    keywords: ["ambiguous", "ambíguo", "ambiguo", "incerto", "resultado incerto", "fail-closed", "fail closed", "reconciliação", "reconciliacao", "não reexecutar"],
    content: [
      { type: "p", text: "AMBIGUOUS significa que não há prova suficiente para afirmar, com segurança, se determinada ação foi concluída." },
      { type: "p", text: "O resultado é fail-closed (na dúvida, fica fechado) somado à reconciliação: o sistema não avança e a equipe técnica confere o que de fato foi aplicado." },
      { type: "note", tone: "destaque", title: "Não reexecute", text: "Uma migration com resultado incerto não deve ser reexecutada por conta própria: reaplicar algo que já tinha sido aplicado pode causar dano. A situação exige reconciliação técnica." },
    ],
  },
  {
    id: "controle-atual",
    title: "Controle atual",
    summary: "Aba com a visualização legada; na prévia atual, operações que alteram algo ficam bloqueadas.",
    keywords: ["controle atual", "legado", "legacy", "antiga", "visualização legada", "bloqueadas", "prévia", "previa", "homologação", "hml"],
    content: [
      { type: "p", text: "A aba Controle atual é a visualização legada, que já existia antes da nova experiência." },
      { type: "list", items: [
        "Na prévia atual, as operações que alteram algo (como iniciar uma manutenção ou publicar um aviso) permanecem bloqueadas.",
        "Ao ser aberta, ela pode consultar informações reais do ambiente de Homologação.",
        "Ela só busca informações quando é aberta; enquanto você está na Visão operacional, nada é consultado por ela.",
      ] },
    ],
  },
  {
    id: "faq",
    title: "Perguntas frequentes",
    summary: "Login bloqueado, write fence, sessões e operações zeradas, backup, RECOVERY_REQUIRED e migration AMBIGUOUS.",
    keywords: ["faq", "dúvidas", "duvidas", "perguntas", "pergunta", "perguntas frequentes"],
    content: [
      { type: "faq", items: [
        { q: "Por que o login é bloqueado?", a: "Durante as etapas críticas, o login gate impede novos acessos para que ninguém comece algo no meio da atualização. Quem tenta entrar vê: \"Sistema em processo de atualização. Aguarde até a finalização.\" O acesso volta quando o sistema é normalizado." },
        { q: "O que é Write Fence?", a: "É a proteção que impede alterações nos dados durante as fases críticas, para que nada seja gravado ou perdido no meio da atualização." },
        { q: "Por que precisamos zerar sessões e operações?", a: "Para garantir que ninguém esteja usando ou alterando dados enquanto o banco é atualizado. Sem essa comprovação, a atualização não avança." },
        { q: "Backup criado significa que já podemos atualizar?", a: "Não. Criado não é validado. O backup precisa ter a integridade conferida (L2 ou superior) — e, idealmente, um teste de restauração (L3) — antes de a atualização avançar." },
        { q: "O que é RECOVERY_REQUIRED?", a: "É o estado em que o sistema precisa de reconciliação técnica antes da liberação, geralmente por haver dúvida sobre efeitos já aplicados. Não significa automaticamente que dados foram perdidos." },
        { q: "O que fazer quando uma migration aparece como AMBIGUOUS?", a: "Não reexecute. AMBIGUOUS quer dizer que não há prova suficiente de que a migration foi concluída. O sistema fica fail-closed e a equipe técnica faz a reconciliação, confirmando o que foi aplicado, antes de qualquer nova tentativa." },
      ] },
    ],
  },
  SECAO_GLOSSARIO,
];

// ── Documentações ────────────────────────────────────────────

export const HELP_DOCS = Object.freeze({
  versoes: Object.freeze({
    id: "versoes-atualizacoes",
    title: "Ajuda — Versões & Atualizações",
    description: "Como funcionam ambientes, versões, releases, migrations e o fluxo de atualização.",
    keywords: ["versões", "atualizações", "ambientes", "releases", "migrations", "baseline", "histórico", "deploys"],
    sections: SECOES_VERSOES,
  }),
  manutencao: Object.freeze({
    id: "manutencao",
    title: "Ajuda — Manutenção",
    description: "Como acompanhar fases, proteções, backup, executor e recuperação de uma atualização.",
    keywords: ["manutenção", "fases", "proteções", "backup", "executor", "recuperação", "login gate", "write fence"],
    sections: SECOES_MANUTENCAO,
  }),
});

// Aba ativa da página → seção priorizada ao abrir a ajuda.
export const HELP_CONTEXT_SECTIONS = Object.freeze({
  versoes: Object.freeze({
    "visao-geral": "ambientes",
    "versoes-releases": "versionamento",
    deploys: "deploys",
    historico: "historico",
  }),
  manutencao: Object.freeze({
    "visao-operacional": "fluxo-manutencao",
    "controle-atual": "controle-atual",
  }),
});

export const HELP_EMPTY_MESSAGE = "Nenhum tópico encontrado para esta busca.";
