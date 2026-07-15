import SwiftUI

/// Paleta oficial Pedido Prime — mesma usada no web (src/index.css, tokens
/// --pp-*). Cada cor é dinâmica (claro/escuro) via `UIColor { trait in }`,
/// então basta usar `.ppPrimary` etc. em qualquer View — dark mode "de
/// graça", sem duplicar a paleta em dois lugares.
extension Color {
    private static func dynamic(light: UIColor, dark: UIColor) -> Color {
        Color(UIColor { trait in trait.userInterfaceStyle == .dark ? dark : light })
    }

    /// Coral/terracota — cor de ação (CTAs, seleção, aba ativa).
    static let ppPrimary = dynamic(
        light: UIColor(red: 0xE8 / 255, green: 0x62 / 255, blue: 0x2C / 255, alpha: 1),
        dark: UIColor(red: 0xF1 / 255, green: 0x7B / 255, blue: 0x45 / 255, alpha: 1)
    )
    static let ppPrimaryHover = dynamic(
        light: UIColor(red: 0xC9 / 255, green: 0x50 / 255, blue: 0x1F / 255, alpha: 1),
        dark: UIColor(red: 0xE8 / 255, green: 0x62 / 255, blue: 0x2C / 255, alpha: 1)
    )
    /// Dourado — marca/premium (usado com moderação: ícones, badges).
    static let ppGold = dynamic(
        light: UIColor(red: 0xD4 / 255, green: 0xA0 / 255, blue: 0x17 / 255, alpha: 1),
        dark: UIColor(red: 0xE8 / 255, green: 0xB9 / 255, blue: 0x4A / 255, alpha: 1)
    )
    static let ppGraphite = dynamic(
        light: UIColor(red: 0x1A / 255, green: 0x1A / 255, blue: 0x1A / 255, alpha: 1),
        dark: UIColor(red: 0x0F / 255, green: 0x0F / 255, blue: 0x10 / 255, alpha: 1)
    )
    /// Fundo geral off-white (claro) / grafite profundo (escuro).
    static let ppBackground = dynamic(
        light: UIColor(red: 0xFA / 255, green: 0xF9 / 255, blue: 0xF5 / 255, alpha: 1),
        dark: UIColor(red: 0x17 / 255, green: 0x14 / 255, blue: 0x0F / 255, alpha: 1)
    )
    /// Superfície de card — branco (claro) / grafite elevado (escuro).
    static let ppSurface = dynamic(
        light: .white,
        dark: UIColor(red: 0x21 / 255, green: 0x1D / 255, blue: 0x17 / 255, alpha: 1)
    )
    static let ppBorder = dynamic(
        light: UIColor(red: 0xE7 / 255, green: 0xE5 / 255, blue: 0xE4 / 255, alpha: 1),
        dark: UIColor(red: 0x35 / 255, green: 0x30 / 255, blue: 0x2A / 255, alpha: 1)
    )
    static let ppText = dynamic(
        light: UIColor(red: 0x1A / 255, green: 0x1A / 255, blue: 0x1A / 255, alpha: 1),
        dark: UIColor(red: 0xF5 / 255, green: 0xF3 / 255, blue: 0xEE / 255, alpha: 1)
    )
    static let ppTextMuted = dynamic(
        light: UIColor(red: 0x71 / 255, green: 0x71 / 255, blue: 0x7A / 255, alpha: 1),
        dark: UIColor(red: 0x9C / 255, green: 0x96 / 255, blue: 0x8C / 255, alpha: 1)
    )

    // Semânticas do fluxo de pedidos — exclusivas de status, mesmo
    // significado nas telas web/iOS/Android.
    static let ppInfo = Color(red: 0x25 / 255, green: 0x63 / 255, blue: 0xEB / 255)
    static let ppWarning = Color(red: 0xF5 / 255, green: 0x9E / 255, blue: 0x0B / 255)
    static let ppSuccess = Color(red: 0x16 / 255, green: 0xA3 / 255, blue: 0x4A / 255)
    static let ppDanger = Color(red: 0xDC / 255, green: 0x26 / 255, blue: 0x26 / 255)
}
