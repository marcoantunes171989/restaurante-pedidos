import SwiftUI

/// Identificador estável de cada módulo operacional — usado tanto pelos
/// cards da Central quanto pelas abas da bottom navigation, garantindo que
/// os dois lugares nunca fiquem "fora de sincronia".
enum ModuleID: String, Codable, CaseIterable, Identifiable {
    case central
    case pedidos
    case cozinha
    case bar
    case caixa

    var id: String { rawValue }

    var title: String {
        switch self {
        case .central: return String(localized: "module.central.title", defaultValue: "Central")
        case .pedidos: return String(localized: "module.pedidos.title", defaultValue: "Pedidos")
        case .cozinha: return String(localized: "module.cozinha.title", defaultValue: "Cozinha")
        case .bar: return String(localized: "module.bar.title", defaultValue: "Bar")
        case .caixa: return String(localized: "module.caixa.title", defaultValue: "Caixa")
        }
    }

    var description: String {
        switch self {
        case .central:
            return ""
        case .pedidos:
            return String(localized: "module.pedidos.desc", defaultValue: "Acompanhar pedidos em aberto, novos pedidos e status de atendimento.")
        case .cozinha:
            return String(localized: "module.cozinha.desc", defaultValue: "Pedidos enviados para preparo na cozinha.")
        case .bar:
            return String(localized: "module.bar.desc", defaultValue: "Bebidas e itens direcionados ao bar.")
        case .caixa:
            return String(localized: "module.caixa.desc", defaultValue: "Pagamentos, fechamento de conta e baixas.")
        }
    }

    var systemImage: String {
        switch self {
        case .central: return "house.fill"
        case .pedidos: return "list.clipboard.fill"
        case .cozinha: return "flame.fill"
        case .bar: return "wineglass.fill"
        case .caixa: return "creditcard.fill"
        }
    }

    /// Cor de destaque do card/badge — cada módulo tem a sua, igual ao web.
    var tint: Color {
        switch self {
        case .central: return .ppPrimary
        case .pedidos: return .ppPrimary
        case .cozinha: return .ppGold
        case .bar: return .ppInfo
        case .caixa: return .ppSuccess
        }
    }
}

/// Um card de módulo na Central Operacional (Pedidos/Cozinha/Bar/Caixa),
/// com a contagem de itens pendentes vinda da API — nunca fixa no cliente.
struct OperationalModule: Decodable, Equatable, Identifiable {
    var id: ModuleID
    var count: Int

    enum CodingKeys: String, CodingKey {
        case id
        case count
    }
}
