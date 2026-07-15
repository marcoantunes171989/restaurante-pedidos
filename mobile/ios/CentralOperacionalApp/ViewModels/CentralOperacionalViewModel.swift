import Combine
import Foundation

@MainActor
final class CentralOperacionalViewModel: ObservableObject {
    @Published private(set) var user: OperationalUser = .placeholder
    @Published private(set) var metrics: OperationalMetrics = .zero
    @Published private(set) var modules: [OperationalModule] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isRefreshing = false
    @Published var errorMessage: String?

    /// Aba ativa da bottom navigation — só a Central é renderizada por este
    /// ViewModel; as outras 4 abas navegam para telas próprias (ver
    /// `RootView`), que têm seus próprios ViewModels/mocks.
    @Published var selectedTab: ModuleID = .central

    private let repository: OperationalRepository
    private let authService: AuthService
    private var cancellables = Set<AnyCancellable>()

    init(repository: OperationalRepository, authService: AuthService) {
        self.repository = repository
        self.authService = authService
    }

    /// Assina o publisher de "tempo real" — chame uma vez em `.task` na View.
    func start() {
        guard cancellables.isEmpty else { return }
        isLoading = true
        repository.snapshotPublisher()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] completion in
                guard let self else { return }
                self.isLoading = false
                self.isRefreshing = false
                if case let .failure(error) = completion {
                    self.errorMessage = error.localizedDescription
                }
            } receiveValue: { [weak self] snapshot in
                guard let self else { return }
                self.isLoading = false
                self.isRefreshing = false
                self.errorMessage = nil
                self.apply(snapshot)
            }
            .store(in: &cancellables)
    }

    /// Pull-to-refresh — busca uma foto avulsa sem esperar o próximo tick
    /// do polling automático.
    func refresh() async {
        isRefreshing = true
        do {
            let snapshot = try await repository.fetchSnapshot()
            errorMessage = nil
            apply(snapshot)
        } catch {
            errorMessage = error.localizedDescription
        }
        isRefreshing = false
    }

    func logout() async {
        do {
            try await authService.logout()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func module(_ id: ModuleID) -> OperationalModule? {
        modules.first { $0.id == id }
    }

    private func apply(_ snapshot: OperationalSnapshot) {
        user = snapshot.user
        metrics = snapshot.metrics
        modules = snapshot.modules
    }
}
