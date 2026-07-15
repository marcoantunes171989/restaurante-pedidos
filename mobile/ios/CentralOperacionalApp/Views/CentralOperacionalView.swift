import SwiftUI

/// Tela "Central Operacional" — header escuro com badge/título/Sair + 3
/// MetricCards, seguido da seção "Módulos da Operação" com 4 ModuleCards.
/// Bottom tab bar é renderizada pelo `RootView` (ela é global, não local
/// a esta tela).
struct CentralOperacionalView: View {
    @ObservedObject var viewModel: CentralOperacionalViewModel
    let onOpenModule: (ModuleID) -> Void
    let onLoggedOut: () -> Void

    @State private var isLoggingOut = false

    private var metricColumns: [GridItem] {
        [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                header
                modulesSection
            }
        }
        .background(Color.ppBackground.ignoresSafeArea())
        .refreshable { await viewModel.refresh() }
        .task { viewModel.start() }
        .alert(
            "Não foi possível atualizar",
            isPresented: Binding(
                get: { viewModel.errorMessage != nil },
                set: { if !$0 { viewModel.errorMessage = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                StatusBadge(text: String(localized: "status.live", defaultValue: "Operação em tempo real"))
                Spacer()
                logoutButton
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Central Operacional")
                    .font(PPFont.title)
                    .foregroundStyle(.white)
                Text("\(viewModel.user.name) · \(viewModel.user.roleLabel)")
                    .font(PPFont.cardBody)
                    .foregroundStyle(.white.opacity(0.65))
            }

            if viewModel.isLoading && viewModel.modules.isEmpty {
                ProgressView()
                    .tint(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
            } else {
                LazyVGrid(columns: metricColumns, spacing: 12) {
                    MetricCard(
                        systemImage: "fork.knife",
                        value: "\(viewModel.metrics.mesasAbertas)",
                        label: String(localized: "metric.mesasAbertas", defaultValue: "Mesas abertas")
                    )
                    MetricCard(
                        systemImage: "clock",
                        value: "\(viewModel.metrics.emPreparo)",
                        label: String(localized: "metric.emPreparo", defaultValue: "Em preparo")
                    )
                    MetricCard(
                        systemImage: "chart.line.uptrend.xyaxis",
                        value: CurrencyFormatter.format(viewModel.metrics.turnoAtual),
                        label: String(localized: "metric.turnoAtual", defaultValue: "Turno atual")
                    )
                }
            }
        }
        .padding(20)
        .padding(.top, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [Color.ppGraphite, Color.ppGraphite.opacity(0.92)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
    }

    private var logoutButton: some View {
        Button {
            Task {
                isLoggingOut = true
                await viewModel.logout()
                isLoggingOut = false
                onLoggedOut()
            }
        } label: {
            HStack(spacing: 6) {
                if isLoggingOut {
                    ProgressView().tint(.white).scaleEffect(0.7)
                } else {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                }
                Text("Sair")
            }
            .font(PPFont.badge)
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(Capsule().fill(Color.white.opacity(0.1)))
            .overlay(Capsule().strokeBorder(Color.white.opacity(0.15)))
        }
        .buttonStyle(.plain)
        .disabled(isLoggingOut)
        .accessibilityLabel("Sair")
    }

    private var modulesSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Módulos da Operação")
                .font(PPFont.sectionTitle)
                .foregroundStyle(Color.ppText)
                .padding(.top, 24)

            VStack(spacing: 12) {
                ForEach([ModuleID.pedidos, .cozinha, .bar, .caixa]) { id in
                    ModuleCard(id: id, count: viewModel.module(id)?.count ?? 0) {
                        onOpenModule(id)
                    }
                }
            }
        }
        .padding(20)
    }
}

#Preview {
    CentralOperacionalView(
        viewModel: CentralOperacionalViewModel(
            repository: MockOperationalRepository(),
            authService: MockAuthService()
        ),
        onOpenModule: { _ in },
        onLoggedOut: {}
    )
}
