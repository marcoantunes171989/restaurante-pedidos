import Foundation

/// Implementação sem backend — permite rodar e demonstrar o app sozinho.
/// Varia levemente os números a cada busca para simular atividade real.
final class MockOperationalRepository: OperationalRepository {
    let refreshInterval: TimeInterval

    private var current: OperationalSnapshot

    init(refreshInterval: TimeInterval = 5, seed: OperationalSnapshot = .mock) {
        self.refreshInterval = refreshInterval
        self.current = seed
    }

    func fetchSnapshot() async throws -> OperationalSnapshot {
        try await Task.sleep(nanoseconds: 350_000_000) // simula latência de rede
        current.metrics = current.metrics.mutatedRandomly()
        current.modules = current.modules.map { $0.mutatedRandomly() }
        return current
    }
}

private extension OperationalMetrics {
    /// Passeio aleatório pequeno em torno do valor atual — números plausíveis,
    /// nunca negativos, dando a sensação de dado "vivo" sem backend real.
    func mutatedRandomly() -> OperationalMetrics {
        OperationalMetrics(
            mesasAbertas: max(0, mesasAbertas + Int.random(in: -1...1)),
            emPreparo: max(0, emPreparo + Int.random(in: -1...1)),
            turnoAtual: turnoAtual + Decimal(Double.random(in: 0...45))
        )
    }
}

private extension OperationalModule {
    func mutatedRandomly() -> OperationalModule {
        OperationalModule(id: id, count: max(0, count + Int.random(in: -1...1)))
    }
}

extension OperationalSnapshot {
    static let mock = OperationalSnapshot(
        user: .placeholder,
        metrics: OperationalMetrics(mesasAbertas: 8, emPreparo: 5, turnoAtual: 1847),
        modules: [
            OperationalModule(id: .pedidos, count: 12),
            OperationalModule(id: .cozinha, count: 5),
            OperationalModule(id: .bar, count: 3),
            OperationalModule(id: .caixa, count: 0),
        ]
    )
}
