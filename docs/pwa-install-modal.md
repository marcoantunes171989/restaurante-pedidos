# Modal "Tenha o Pedido Prime como aplicativo" — lógica e matriz de testes

Documenta a correção do bug em que o convite de instalação continuava
aparecendo em dispositivos onde o Pedido Prime já estava instalado como
PWA. Cobre a lógica implementada e a matriz de testes manuais para os
cenários que não têm como ser reproduzidos por teste automatizado (Chrome
real no Windows, Android físico, iOS/Safari real).

## Arquivos envolvidos

| Arquivo | Papel |
|---|---|
| `src/lib/pwaDetection.js` | Funções puras de detecção do ambiente (`ehStandalone`, `detectarPlataforma`, `avaliarStatus`) + persistência do sinal "já rodou como app" (`lerInstalacaoPersistida`/`registrarInstalacaoPersistida`, localStorage). |
| `src/lib/usePwaEnvironment.js` | Hook único que escuta os eventos reais do navegador (`beforeinstallprompt`, `appinstalled`, mudança de `display-mode`) e chama `getInstalledRelatedApps()`; delega toda decisão a `avaliarStatus`. |
| `src/lib/usePwaPromptTimer.js` | Controla **quando** o convite pode aparecer: atraso de 30s, allowlist de status elegíveis, momento crítico (outro `[role="dialog"]` em tela) e recusa persistida na sessão (`sessionStorage`). |
| `src/components/PwaExperienceDialog.jsx` | O modal em si — conteúdo por status, fluxo de instalação nativa (`beforeinstallprompt`) e guia manual (iOS/demais navegadores). |
| `src/components/PwaExperienceProvider.jsx` | Monta os três acima uma única vez, na raiz (`src/main.jsx`). |

Nenhum arquivo foi duplicado — a correção foi feita nos mesmos módulos que
já existiam.

## Causa raiz

1. **`usePwaPromptTimer` usava uma lista de exclusão incompleta.** Só
   excluía `"checking"` e `"running-as-app"`. O status `"unknown"` (não dá
   pra confirmar nada com segurança — API indisponível, sem
   `beforeinstallprompt`, não é iOS) **não** estava excluído, então o
   modal genérico ("Tenha o Pedido Prime como aplicativo" / "Sim, ver como
   instalar") aparecia mesmo sem qualquer confirmação real de que o app
   não estava instalado. Esse é o texto exato relatado no bug.
2. **Não havia nenhum sinal persistido de instalação.** A única fonte de
   "já instalado" era `navigator.getInstalledRelatedApps()`, que é
   indisponível no Firefox/Safari e inconsistente em várias combinações de
   Android — quando ela não confirmava, o app caía direto em `"unknown"` (bug
   1) mesmo para quem já tinha instalado antes.
3. O status `"installed-detected"` (instalação confirmada pela API) ainda
   abria um modal bloqueante oferecendo "abrir o aplicativo" via um
   `intent://` construído manualmente no Android — mecanismo não
   confiável/suportado de forma consistente, na contramão do pedido
   explícito de nunca usar deep link fictício nem bloquear a navegação web.

## Correção aplicada

- `avaliarStatus()` agora recebe um sinal adicional, `persistedInstalled`
  (nunca o único sinal): `apiInstalado === true || persistedInstalled` →
  `"installed-detected"`.
- `usePwaEnvironment` grava `pedido-prime:pwa-installed` no `localStorage`
  sempre que a aplicação roda de fato em `standalone`, e também no evento
  `appinstalled`. Lê esse valor na montagem para alimentar a detecção.
- `usePwaPromptTimer` passou de **denylist** (`!== checking && !== running-as-app`)
  para **allowlist** explícita: só mostra o modal para
  `"installable-native"`, `"manual-install"` ou `"ios-manual-install"`.
  Qualquer status novo que vier a existir no futuro fica de fora por
  padrão, sem precisar lembrar de excluí-lo.
- A recusa ("Não, agora não") passou a ser gravada em `sessionStorage`
  (`pedido-prime:pwa-install-dismissed-session`), sobrevivendo a um F5 —
  antes ficava só em memória e uma atualização de página reabria a
  contagem de 30s do zero.
- Removido o fluxo de "abrir aplicativo" via `intent://`
  (`handleAbrirApp`/etapa `fallbackAbrir`) — não há hoje mecanismo
  confiável e multiplataforma para abrir um PWA já instalado a partir de
  uma aba do navegador; por instrução explícita, uma ação que não
  funciona de forma confiável não deve ser oferecida. Quando a instalação
  já está confirmada, o cliente simplesmente continua no navegador, sem
  qualquer modal.
- `manifest.webmanifest` já estava correto (`id`, `start_url`, `scope`,
  `display`/`display_override`, `related_applications` apontando para o
  próprio manifest) — não foi alterado.
- Service Worker (`src/main.jsx`) já tinha registro único, sem duplicação
  — não foi alterado.

## Matriz de status → comportamento

| `status` | Quando ocorre | Modal? |
|---|---|---|
| `checking` | Detecção ainda em andamento | Nunca |
| `running-as-app` | `display-mode` standalone/fullscreen/minimal-ui/window-controls-overlay, `navigator.standalone`, ou referrer `android-app://` | Nunca |
| `installed-detected` | `getInstalledRelatedApps()` confirma **ou** sinal persistido (já rodou standalone antes) | Nunca (cliente segue no navegador normalmente) |
| `unknown` | Nenhum sinal permite conclusão segura | Nunca |
| `installable-native` | `beforeinstallprompt` disparou | Sim, após 30s — usa o prompt nativo (`prompt()` + `userChoice`) |
| `manual-install` | API confirma "não instalado" mas sem `beforeinstallprompt` | Sim, após 30s — guia manual pelo menu do navegador |
| `ios-manual-install` | iOS, sem melhor sinal disponível | Sim, após 30s — guia real (Compartilhar → Adicionar à Tela de Início) |

## Matriz de testes manuais

| # | Cenário | Passos | Resultado esperado |
|---|---|---|---|
| 1 | Chrome Windows, sem instalar | Abrir o site pela primeira vez, aguardar 30s | Modal aparece com "Sim, instalar aplicativo" |
| 2 | Chrome Windows, com PWA instalado, acessando pelo navegador | Instalar o PWA, depois abrir `www.pedidoprime.com.br` numa aba normal | Modal **não** aparece; site funciona normalmente |
| 3 | PWA aberto pelo atalho do Windows | Abrir pelo atalho instalado (janela `app`) | Modal nunca aparece, em nenhum momento da sessão |
| 4 | Chrome Android, sem instalar | Abrir o site, aguardar 30s | Modal aparece com instalação nativa |
| 5 | Chrome Android, com PWA instalado, no navegador | Instalar, reabrir pelo Chrome normal | Modal **não** aparece |
| 6 | PWA aberto pela tela inicial do Android | Abrir pelo ícone instalado | Modal nunca aparece |
| 7 | Safari iPhone, sem instalar | Abrir o site no Safari, aguardar 30s | Modal aparece com o guia "Compartilhar → Adicionar à Tela de Início" |
| 8 | App aberto pela Tela de Início do iPhone | Abrir pelo ícone instalado | Modal nunca aparece (`navigator.standalone === true`) |
| 9 | Página atualizada após recusar o modal | Recusar ("Não, agora não"), dar F5 | Modal não reaparece nesta sessão (mesma aba) |
| 10 | Navegação entre rotas internas | Recusar o modal, navegar entre telas da SPA | Modal não reaparece (Provider montado uma única vez) |
| 11 | Aba anônima | Repetir cenários 1 e 4 em aba anônima | Mesmo comportamento; nada vaza de uma aba anônima anterior (storage isolado) |
| 12 | Evento `appinstalled` | Instalar pelo modal | Modal fecha, mostra "Pedido Prime instalado com sucesso.", não reabre depois |
| 13 | Navegador sem `beforeinstallprompt` (Firefox/Safari desktop) | Abrir o site, aguardar 30s | Sem erro no console; no Firefox pode aparecer o guia manual (`manual-install`) se a API existir e confirmar "não instalado", ou nada aparecer se o estado for `unknown` |
| 14 | Service Worker sendo atualizado | Publicar nova versão, reabrir o app instalado | Atualização aplicada normalmente; modal de instalação não interfere (é um componente independente do `PwaUpdateBanner`) |

Os cenários 1–8 exigem hardware/navegador reais e não têm como ser
automatizados neste projeto; os cenários 9–13 foram validados tanto por
teste automatizado (`usePwaPromptTimer.test.js`, `pwaDetection.test.js`)
quanto por verificação end-to-end com Playwright, simulando os sinais de
cada plataforma (User-Agent, `navigator.standalone`,
`display-mode`, `localStorage` pré-preenchido, disparo sintético de
`beforeinstallprompt`) contra a aplicação real rodando localmente —
incluindo o cenário exato do bug relatado (instalação confirmada via
sinal persistido, sem `getInstalledRelatedApps`) e o vazamento do status
`unknown`, ambos hoje bloqueados corretamente.
