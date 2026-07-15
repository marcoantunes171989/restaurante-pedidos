# Central Operacional — iOS (SwiftUI)

App nativo iOS que replica a tela "Central Operacional" do sistema web
(Pedido Prime): header com status ao vivo, 3 indicadores, seção de módulos
navegáveis (Pedidos/Cozinha/Bar/Caixa) e uma bottom tab bar com as mesmas 5
abas. Roda 100% com dados mockados — não precisa de backend.

## Requisitos

- Xcode 15+ (iOS 16 SDK)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) para gerar o `.xcodeproj`
  (`brew install xcodegen`) — o projeto não versiona um `.xcodeproj` hand-made
  porque o formato binário/plist do pbxproj é frágil para editar fora do
  Xcode; `project.yml` é a fonte da verdade e é 100% legível em diff.

## Como abrir

```bash
cd mobile/ios
xcodegen generate
open CentralOperacionalApp.xcodeproj
```

Rode o target `CentralOperacionalApp` em qualquer simulador iOS 16+.

**Sem XcodeGen à mão?** Crie um projeto App SwiftUI novo no Xcode
("iOS App", interface SwiftUI, linguagem Swift, min deployment iOS 16),
delete o `ContentView.swift`/`App.swift` gerados e arraste a pasta
`CentralOperacionalApp/` (mantendo a estrutura de grupos abaixo) para dentro
do projeto, marcando "Copy items if needed".

## Estrutura

```
CentralOperacionalApp/
├── CentralOperacionalApp.swift      # @main App
├── Models/
│   ├── OperationalMetrics.swift     # mesas abertas, em preparo, turno atual
│   ├── OperationalModule.swift      # ModuleID (fonte única p/ cards + tabs)
│   ├── OperationalUser.swift
│   └── OperationalSnapshot.swift    # payload completo de um "snapshot"
├── Theme/
│   ├── Color+Theme.swift            # paleta --pp-* (mesma do web), dynamic light/dark
│   └── Typography.swift
├── Utils/
│   └── CurrencyFormatter.swift      # BRL / pt_BR
├── Services/
│   ├── OperationalRepository.swift  # protocolo + polling Combine compartilhado
│   ├── MockOperationalRepository.swift
│   ├── RemoteOperationalRepository.swift  # stub REST (não usado por padrão)
│   └── AuthService.swift
├── ViewModels/
│   └── CentralOperacionalViewModel.swift
├── Views/
│   ├── RootView.swift               # bottom tab bar + NavigationStack por aba
│   ├── CentralOperacionalView.swift
│   ├── Modules/ModulePlaceholderView.swift
│   └── Components/
│       ├── StatusBadge.swift
│       ├── MetricCard.swift
│       ├── ModuleCard.swift
│       └── BottomTabBar.swift
└── Resources/pt-BR.lproj/Localizable.strings
```

## Dados / "tempo real"

`MockOperationalRepository` simula o backend: a cada `refreshInterval`
(5s por padrão) devolve os mesmos dados com uma pequena variação aleatória
nos números, com ~350ms de latência simulada — o suficiente para ver os
cards atualizando sozinhos e o pull-to-refresh funcionando. Trocar para uma
API real é só passar um `RemoteOperationalRepository(baseURL:...)` no lugar
do mock em `RootView.swift`.

## Limitação conhecida

Este código foi escrito à mão neste ambiente (Windows, sem Xcode/swiftc
instalado) e **não foi compilado**. A estrutura, tipos e imports foram
revisados manualmente com cuidado, mas rode `xcodegen generate` + build no
Xcode antes de confiar em produção — é esperado ter que corrigir pequenos
erros de compilação (typos, imports) na primeira tentativa.
