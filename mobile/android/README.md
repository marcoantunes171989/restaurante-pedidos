# Central Operacional — Android (Jetpack Compose)

App nativo Android que replica a tela "Central Operacional" do sistema web
(Pedido Prime): header com status ao vivo, 3 indicadores, seção de módulos
navegáveis (Pedidos/Cozinha/Bar/Caixa) e uma bottom tab bar com as mesmas 5
abas. Roda 100% com dados mockados — não precisa de backend.

## Requisitos

- Android Studio Koala+ (AGP 8.5) ou `gradlew` com JDK 17
- minSdk 26, compileSdk/targetSdk 34

## Como abrir

Abra a pasta `mobile/android` no Android Studio ("Open" → aponte para este
diretório, que já contém `settings.gradle.kts`) e deixe o Gradle sincronizar,
ou via linha de comando:

```bash
cd mobile/android
./gradlew assembleDebug
```

Rode o módulo `app` em qualquer emulador/dispositivo API 26+.

**Ícone do launcher:** o projeto não inclui PNGs de `ic_launcher` (não é
possível gerar imagens neste ambiente); o Android usa o ícone padrão do
sistema até você adicionar os seus em `res/mipmap-*`.

## Estrutura

```
app/src/main/
├── AndroidManifest.xml
├── java/com/pedidoprime/centraloperacional/
│   ├── MainActivity.kt
│   ├── model/                     # OperationalMetrics, ModuleId, OperationalModule,
│   │                               # OperationalUser, OperationalSnapshot
│   ├── ui/theme/                  # Color.kt (paleta --pp-*), Type.kt, Theme.kt, ModuleUi.kt
│   ├── util/CurrencyFormatter.kt  # BRL / pt-BR
│   ├── data/
│   │   ├── OperationalRepository.kt        # interface + Flow de polling compartilhado
│   │   ├── MockOperationalRepository.kt    # dados simulados, "tempo real" sem backend
│   │   ├── RemoteOperationalRepository.kt  # stub Retrofit (não usado por padrão)
│   │   ├── OperationalDto.kt               # DTOs @Serializable (snake_case) + mappers
│   │   └── AuthService.kt
│   ├── viewmodel/CentralOperacionalViewModel.kt  # StateFlow<UiState>
│   ├── navigation/RootScreen.kt   # bottom tab bar + NavHost próprio da aba Central
│   └── ui/
│       ├── screens/               # CentralOperacionalScreen, ModulePlaceholderScreen, LoggedOutScreen
│       └── components/            # StatusBadge, MetricCard, ModuleCard, BottomTabBar
└── res/values/{strings.xml,themes.xml}
```

## Dados / "tempo real"

`MockOperationalRepository` simula o backend: `OperationalRepository.snapshotFlow()`
(implementação default na própria interface) emite imediatamente e depois a
cada `refreshIntervalMs` (5s por padrão), reaproveitando `fetchSnapshot()` —
que devolve os mesmos dados com uma pequena variação aleatória e ~350ms de
latência simulada. Pull-to-refresh chama `fetchSnapshot()` direto, sem
esperar o próximo tick. Trocar para uma API real é só passar um
`RemoteOperationalRepository(api, ...)` no lugar do mock em `RootScreen.kt`.

## Limitação conhecida

Este código foi escrito à mão neste ambiente (Windows, sem Android
Studio/Gradle/JDK instalados) e **não foi compilado**. Os tipos, imports e
nomes de API (Compose Material3, Navigation Compose, Retrofit) foram
revisados manualmente com cuidado, mas rode `./gradlew assembleDebug` antes
de confiar em produção — é esperado ter que corrigir pequenos erros de
compilação (versões de dependência, imports) na primeira tentativa.
