# Central Operacional — Apps Nativos (iOS + Android)

Dois apps nativos, um por plataforma, replicando a tela "Central
Operacional" do sistema web Pedido Prime: header com status ao vivo, 3
indicadores (Mesas Abertas, Em Preparo, Turno Atual), seção "Módulos da
Operação" com 4 cards navegáveis (Pedidos, Cozinha, Bar, Caixa) e bottom tab
bar com 5 abas (Central | Pedidos | Cozinha | Bar | Caixa). Ambos rodam
100% com dados mockados — não precisam de backend para demonstrar.

- [`ios/`](ios/README.md) — SwiftUI + Combine, MVVM, min iOS 16
- [`android/`](android/README.md) — Jetpack Compose + Kotlin, MVVM, min API 26

## Arquitetura (comum às duas plataformas)

- **Models**: `OperationalMetrics`, `ModuleId`/`ModuleID` (fonte única para
  cards de módulo e abas da tab bar), `OperationalModule`, `OperationalUser`,
  `OperationalSnapshot`.
- **Repository**: protocolo/interface único (`fetchSnapshot` + polling
  "tempo real" via Combine/Flow) com duas implementações — `Mock` (dados
  simulados, usada por padrão) e `Remote` (stub REST, pronta para plugar
  numa API real).
- **ViewModel**: `ObservableObject`/`StateFlow` com loading, erro,
  pull-to-refresh e a aba selecionada.
- **Views/Composables reutilizáveis**: `StatusBadge`, `MetricCard`,
  `ModuleCard`, `BottomTabBar`.
- **Tema**: paleta `--pp-*` idêntica ao app web (laranja como accent, fundo
  off-white/grafite, cards claros com sombra suave), com suporte a dark
  mode automático.
- **i18n**: pt-BR (strings + formatação de moeda BRL via `Locale`/`NumberFormat`).

## Limitação conhecida (as duas plataformas)

Este ambiente (Windows, sem Xcode/Android Studio/toolchains instalados) não
permite compilar nem rodar nenhum dos dois apps. Todo o código foi escrito
e revisado manualmente, mas **nenhum dos dois foi validado por um build
real** — espere ter que corrigir pequenos erros de compilação na primeira
tentativa em cada plataforma. Os READMEs de cada pasta detalham como abrir
e buildar.
