import SwiftUI

/// Estilos de texto reaproveitados pelos componentes — evita repetir
/// `.font(.system(size:weight:))` espalhado pelas Views.
enum PPFont {
    static let title = Font.system(size: 24, weight: .bold, design: .rounded)
    static let sectionTitle = Font.system(size: 13, weight: .semibold)
    static let cardTitle = Font.system(size: 16, weight: .bold)
    static let cardBody = Font.system(size: 14, weight: .regular)
    static let metricValue = Font.system(size: 22, weight: .bold, design: .rounded)
    static let metricLabel = Font.system(size: 11, weight: .semibold)
    static let badge = Font.system(size: 12, weight: .medium)
    static let tabLabel = Font.system(size: 11, weight: .medium)
}
