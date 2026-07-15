import SwiftUI

/// Composição de nível raiz: bottom tab bar fixa + uma `NavigationStack` por
/// aba. A aba Central tem push navigation própria (tocar um `ModuleCard`
/// empurra a tela do módulo); as demais abas abrem o mesmo placeholder
/// diretamente, como a bottom tab bar do app web.
struct RootView: View {
    @StateObject private var viewModel = CentralOperacionalViewModel(
        repository: MockOperationalRepository(),
        authService: MockAuthService()
    )
    @State private var centralPath = NavigationPath()
    @State private var isLoggedOut = false

    var body: some View {
        Group {
            if isLoggedOut {
                LoggedOutView { isLoggedOut = false }
            } else {
                VStack(spacing: 0) {
                    content
                    BottomTabBar(selection: $viewModel.selectedTab) { tab in
                        if tab == .central { centralPath = NavigationPath() }
                    }
                }
            }
        }
        .animation(.default, value: isLoggedOut)
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.selectedTab {
        case .central:
            NavigationStack(path: $centralPath) {
                CentralOperacionalView(
                    viewModel: viewModel,
                    onOpenModule: { centralPath.append($0) },
                    onLoggedOut: { isLoggedOut = true }
                )
                .navigationDestination(for: ModuleID.self) { id in
                    ModulePlaceholderView(id: id, count: viewModel.module(id)?.count ?? 0)
                }
            }

        case .pedidos, .cozinha, .bar, .caixa:
            NavigationStack {
                ModulePlaceholderView(
                    id: viewModel.selectedTab,
                    count: viewModel.module(viewModel.selectedTab)?.count ?? 0
                )
            }
        }
    }
}

/// Tela mínima pós-logout — só o app real substituiria por um fluxo de login.
private struct LoggedOutView: View {
    let onBackToLogin: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 44))
                .foregroundStyle(Color.ppSuccess)
            Text("Sessão encerrada")
                .font(PPFont.sectionTitle)
                .foregroundStyle(Color.ppText)
            Button("Entrar novamente", action: onBackToLogin)
                .buttonStyle(.borderedProminent)
                .tint(Color.ppPrimary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.ppBackground.ignoresSafeArea())
    }
}

#Preview {
    RootView()
}
