---
name: padrao-pedido-prime
description: Padrão GERAL obrigatório para criar ou alterar qualquer tela, janela, funcionalidade, consulta, tabela, função SQL ou migration do Pedido Prime. Reúne interface (cores, tipografia, botões, campos, janelas, filtros, menu, celular), desempenho em escala (milhares de estabelecimentos), isolamento entre empresas com regras no back-end e o roteiro de validação e publicação. Use SEMPRE antes de começar uma tela ou funcionalidade nova e antes de dar uma tarefa por concluída. Gatilhos: "nova tela", "nova funcionalidade", "criar módulo", "modal", "relatório", "tabela nova", "migration", "RPC", "desempenho", "isolamento", "multiempresa", "padronizar". Reúne e referencia as skills de detalhe do projeto.
---

# Padrão Pedido Prime

Ordem de prioridade quando houver conflito: **isolamento entre empresas → informação correta → desempenho → padrão visual**.

## 1. Isolamento entre empresas (nunca negociável)

Nenhum estabelecimento vê, altera ou deduz dado de outro. Quem garante é o **banco**, não a tela.

- Tabela de negócio nova: `loja_id bigint not null` + FK para `tab_lojas` + índice começando por `loja_id` + `enable row level security`.
- Padrão de acesso: **RLS sem política** (ninguém acessa direto) e acesso só por funções. Se precisar de leitura direta (tempo real), política `app_is_super() or loja_id = app_loja_id()`. Nunca `using (true)` em tabela que não seja catálogo público.
- Função: `security definer`, `set search_path = public`, `revoke all ... from public` e `grant execute` só ao papel que usa.
- A loja é **resolvida no servidor** (`app_loja_id()`); `p_loja_id` vindo do navegador só vale para o administrador geral. Conferir a permissão da ação (perfil/módulo) dentro da função.
- Referência entre registros (produto → categoria, setor, impressora…) é conferida na própria função: o alvo precisa ser **da mesma loja** (de preferência FK composta `(loja_id, id)`).
- Regra de negócio é recusada no back-end: registro com vínculo não é excluído (inativar); status só avança pelo fluxo; valor, preço e total são recalculados no servidor; registro financeiro e fiscal não é editado nem apagado.
- Funções públicas (`pub_*`): conferem loja ativa, devolvem só as colunas que a tela usa, sem dados pessoais de terceiros.
- Antes de concluir: rodar `supabase/diagnostics/isolamento-e-desempenho.sql` e conferir que `mistura_entre_lojas` está zerada e que não surgiu função sem conferência nem política aberta.

## 2. Escala e desempenho

Pensar sempre em milhares de lojas ao mesmo tempo.

- Consulta sempre limitada à loja e, quando cresce com o tempo, a um período. Índice composto para o filtro e a ordem usados (ex.: `(loja_id, criado_em desc)`).
- A API entrega no máximo 1.000 linhas por pedido: lista que pode passar disso usa `src/lib/leituraPaginada.js`.
- Tempo real: `emLote(reload)` nos eventos e `aoAssinar(reload)` na conexão (`src/lib/tempoReal.js`). Releitura imediata só para operação ao vivo (pedidos, chamados, impressões). Canal novo só se a tela precisar; filtrar por loja quando possível e encerrar ao sair.
- Carga inicial: apenas o essencial para abrir; o resto em paralelo e tolerante a falha. Nada de buscas em fila.
- Tela, janela pesada ou biblioteca grande: `preguicoso(() => import(...))` (`src/components/preguicoso.jsx`) ou `import()` no uso.
- Cálculo pesado em `useMemo`; lista longa com paginação.
- Não adicionar dependência sem necessidade; usar versões atuais e estáveis do que o projeto já usa.

## 3. Interface

Referência de acabamento: Dashboard e Relatórios de venda.

- **Cores:** petróleo `#012E46`, laranja `#F38525`, texto `#1F2933`, texto secundário `#667085`, borda `#E5E7EB`, fundo branco. No painel, ação principal em petróleo com texto branco (skill `admin-acao-petroleo`); nas telas do cliente, ação principal laranja com texto petróleo (`--client-*`). Laranja claro destaca o melhor valor (skill `destaque-laranja-claro`). Contraste mínimo AA.
- **Tipografia:** Inter; teto de peso 600; escala da skill `escala-de-fontes`; número de indicador 20px (skill `numeros-admin`).
- **Botões e campos (painel):** 44px; compacto dentro de linha/lista 36px; raio 12px; texto 13px semibold. As regras globais estão em `src/index.css` ("Medidas únicas de controle"). Nas telas de toque do cliente e do PDV, mínimo 44px, ação principal 48px.
- **Componentes oficiais:** `PageHeader`, `PrimeButton`, `FilterChip`, `EmptyState` (`components/Prime.jsx`); gráficos, `Indicador`, `Dado`, `BotaoAcao`, `Paginador` (`components/graficos/Graficos.jsx`).
- **Janelas:** todo detalhe ou subtela usa `components/ModalCentral.jsx` (central, ampla, tela cheia no celular; subtela abre **dentro** da anterior, com "Voltar"). **Não criar painel lateral.** `colunas={2}` quando houver várias seções.
- **Período:** só `components/FiltroPeriodo.jsx` com os períodos de `lib/periodos.js`.
- **Menu:** campos "empresa em foco" e "buscar telas" com a mesma medida; um grupo aberto por vez; tela nova entra no grupo certo e na busca.
- **Sem rodapé** de sistema (banco, data, hora, versão — a versão fica no menu do usuário).
- **Estados:** carregando, vazio, erro e sem permissão sempre tratados. Número sem base de cálculo aparece como "—", nunca como zero.
- Uma informação em um só lugar por tela.
- Texto em português claro, no vocabulário de quem usa.

## 4. Antes de concluir

1. Navegador em 320, 360, 768 e 1280 px: sem rolagem lateral, nada cortado, janelas abrem e fecham.
2. Conferir com dados reais da loja e comparar o número com a origem.
3. Lint dos arquivos alterados; testes novos para regra de cálculo, de dados e de migration.
4. Testes e build completos.
5. Banco: migration numerada, idempotente, com teste e script pronto (skill `migrations-supabase`).
6. Publicação: **somente com a aprovação do dono**, primeiro na homologação; produção só depois de validada, com as migrations rodadas.

## Skills de detalhe

`identidade-visual`, `padronizar-cores-pedido-prime`, `tipografia-clean`, `escala-de-fontes`, `numeros-admin`, `admin-acao-petroleo`, `superficies-brancas-admin`, `compatibilidade-dispositivos`, `analise-processo-tela`, `valor-ao-produto`, `responsabilidade-qualidade`, `testes-apos-execucao`, `migrations-supabase`. Onde elas divergirem deste documento quanto a janelas, medidas de controle, período, dados ou isolamento, **vale este documento**.
