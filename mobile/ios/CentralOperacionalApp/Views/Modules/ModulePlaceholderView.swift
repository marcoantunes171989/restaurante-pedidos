import SwiftUI

/// Tela de destino ao abrir um módulo (Pedidos/Cozinha/Bar/Caixa) a partir da
/// Central ou da bottom tab bar. Cada módulo real teria sua própria tela;
/// aqui ficam placeholders navegáveis que já mostram a contagem ao vivo
/// vinda do mesmo snapshot da Central, para provar que os dados fluem.
struct ModulePlaceholderView: View {
    let id: ModuleID
    let count: Int

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                ZStack {
                    Circle()
                        .fill(id.tint.opacity(0.12))
                        .frame(width: 88, height: 88)
                    Image(systemName: id.systemImage)
                        .font(.system(size: 34, weight: .semibold))
                        .foregroundStyle(id.tint)
                }
                .padding(.top, 32)

                VStack(spacing: 6) {
                    Text(id.title)
                        .font(PPFont.title)
                        .foregroundStyle(Color.ppText)
                    Text(id.description)
                        .font(PPFont.cardBody)
                        .foregroundStyle(Color.ppTextMuted)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }

                if count > 0 {
                    Text("\(count) " + String(localized: "module.pending", defaultValue: "pendentes"))
                        .font(PPFont.badge.bold())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(id.tint))
                }

                Text(String(localized: "module.placeholderNote", defaultValue: "Tela de módulo em construção — os dados acima já vêm da mesma fonte em tempo real da Central."))
                    .font(.footnote)
                    .foregroundStyle(Color.ppTextMuted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                    .padding(.top, 12)
            }
            .frame(maxWidth: .infinity)
            .padding(.bottom, 40)
        }
        .background(Color.ppBackground.ignoresSafeArea())
        .navigationTitle(id.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        ModulePlaceholderView(id: .cozinha, count: 5)
    }
}
