import Foundation

/// Métricas em tempo real da operação (mesas, preparo, faturamento do turno).
/// Espelha o shape retornado pela API (`GET /operacional/metricas`).
struct OperationalMetrics: Decodable, Equatable {
    var mesasAbertas: Int
    var emPreparo: Int
    var turnoAtual: Decimal

    static let zero = OperationalMetrics(mesasAbertas: 0, emPreparo: 0, turnoAtual: 0)

    enum CodingKeys: String, CodingKey {
        case mesasAbertas = "mesas_abertas"
        case emPreparo = "em_preparo"
        case turnoAtual = "turno_atual"
    }
}
