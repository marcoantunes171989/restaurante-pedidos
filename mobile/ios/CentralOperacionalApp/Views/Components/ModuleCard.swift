import SwiftUI

/// Card navegável de módulo ("Pedidos", "Cozinha", "Bar", "Caixa") na seção
/// "Módulos da Operação" — ícone tintado, título+badge, descrição, chevron.
struct ModuleCard: View {
    let id: ModuleID
    let count: Int
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(id.tint.opacity(0.12))
                        .frame(width: 52, height: 52)
                    Image(systemName: id.systemImage)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(id.tint)
                }

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(id.title)
                            .font(PPFont.cardTitle)
                            .foregroundStyle(Color.ppText)
                        if count > 0 {
                            Text("\(count)")
                                .font(PPFont.badge.bold())
                                .foregroundStyle(.white)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 2)
                                .background(Capsule().fill(id.tint))
                        }
                    }
                    Text(id.description)
                        .font(PPFont.cardBody)
                        .foregroundStyle(Color.ppTextMuted)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }

                Spacer(minLength: 8)

                Image(systemName: "chevron.right")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(id.tint)
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(Color.ppSurface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .strokeBorder(Color.ppBorder)
            )
            .shadow(color: .black.opacity(0.04), radius: 8, y: 3)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel("\(id.title), \(count) pendentes. \(id.description)")
    }
}

#Preview {
    VStack(spacing: 12) {
        ModuleCard(id: .pedidos, count: 12) {}
        ModuleCard(id: .caixa, count: 0) {}
    }
    .padding()
    .background(Color.ppBackground)
}
