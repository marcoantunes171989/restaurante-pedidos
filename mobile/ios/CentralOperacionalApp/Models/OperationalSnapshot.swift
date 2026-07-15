import Foundation

/// Payload completo de uma "foto" da operação — o que a API devolve de uma
/// vez (usuário + métricas + módulos), consumido pelo ViewModel a cada
/// atualização em tempo real.
struct OperationalSnapshot: Decodable, Equatable {
    var user: OperationalUser
    var metrics: OperationalMetrics
    var modules: [OperationalModule]

    enum CodingKeys: String, CodingKey {
        case user
        case metrics
        case modules
    }
}
