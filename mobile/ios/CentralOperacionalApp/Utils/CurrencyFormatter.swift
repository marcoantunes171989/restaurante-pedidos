import Foundation

/// Formatação de moeda BRL (pt-BR) — único ponto de verdade, para nunca
/// divergir o formato entre telas (ex.: "R$ 1.847,00").
enum CurrencyFormatter {
    private static let formatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.locale = Locale(identifier: "pt_BR")
        f.currencyCode = "BRL"
        return f
    }()

    static func format(_ value: Decimal) -> String {
        formatter.string(from: value as NSDecimalNumber) ?? "R$ 0,00"
    }
}
