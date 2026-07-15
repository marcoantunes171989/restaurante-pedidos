import Combine
import Foundation

enum OperationalRepositoryError: LocalizedError {
    case network
    case server(statusCode: Int)
    case decoding

    var errorDescription: String? {
        switch self {
        case .network:
            return String(localized: "error.network", defaultValue: "Sem conexão com a internet.")
        case .server:
            return String(localized: "error.server", defaultValue: "Não foi possível carregar os dados agora.")
        case .decoding:
            return String(localized: "error.decoding", defaultValue: "Resposta inesperada do servidor.")
        }
    }
}

/// Contrato único da camada de dados — o ViewModel só conhece isto, nunca
/// URLSession/JSON diretamente. Permite trocar Mock ↔ Remote sem tocar na UI.
protocol OperationalRepository {
    /// Segundos entre cada atualização automática ("tempo real" via polling).
    var refreshInterval: TimeInterval { get }

    /// Busca uma foto única dos dados (usada pelo refresh manual/pull-to-refresh).
    func fetchSnapshot() async throws -> OperationalSnapshot
}

extension OperationalRepository {
    /// Publisher que emite imediatamente e depois a cada `refreshInterval`,
    /// reaproveitando `fetchSnapshot()` — nenhuma implementação concreta
    /// precisa lidar com Timer/Combine, só descrever COMO buscar os dados.
    func snapshotPublisher() -> AnyPublisher<OperationalSnapshot, Error> {
        SnapshotPolling.publisher(interval: refreshInterval, fetch: fetchSnapshot)
    }
}

/// Agrupa a lógica de polling (Timer + fetch assíncrono) num só lugar,
/// compartilhada por qualquer repositório via a extensão acima.
enum SnapshotPolling {
    static func publisher(
        interval: TimeInterval,
        fetch: @escaping () async throws -> OperationalSnapshot
    ) -> AnyPublisher<OperationalSnapshot, Error> {
        Timer.publish(every: interval, on: .main, in: .common)
            .autoconnect()
            .map { _ in () }
            .prepend(())
            .flatMap { _ -> AnyPublisher<OperationalSnapshot, Error> in
                Future<OperationalSnapshot, Error> { promise in
                    Task {
                        do {
                            promise(.success(try await fetch()))
                        } catch {
                            promise(.failure(error))
                        }
                    }
                }
                .eraseToAnyPublisher()
            }
            .eraseToAnyPublisher()
    }
}
