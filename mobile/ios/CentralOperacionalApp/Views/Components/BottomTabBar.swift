import SwiftUI

/// Navegação inferior fixa (Central | Pedidos | Cozinha | Bar | Caixa) —
/// custom (não `TabView`) para reproduzir o indicador de aba ativa do web.
struct BottomTabBar: View {
    @Binding var selection: ModuleID
    let onSelect: (ModuleID) -> Void

    private let tabs: [ModuleID] = [.central, .pedidos, .cozinha, .bar, .caixa]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(tabs) { tab in
                let isActive = tab == selection
                Button {
                    selection = tab
                    onSelect(tab)
                } label: {
                    VStack(spacing: 4) {
                        Capsule()
                            .fill(isActive ? Color.ppPrimary : .clear)
                            .frame(width: 28, height: 3)

                        Image(systemName: tab.systemImage)
                            .font(.system(size: 20, weight: isActive ? .semibold : .regular))
                        Text(tab.title)
                            .font(PPFont.tabLabel)
                    }
                    .foregroundStyle(isActive ? Color.ppPrimary : Color.ppTextMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 6)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isActive ? [.isButton, .isSelected] : .isButton)
            }
        }
        .padding(.bottom, 2)
        .background(
            Color.ppSurface
                .overlay(Divider(), alignment: .top)
                .ignoresSafeArea(edges: .bottom)
        )
    }
}

#Preview {
    BottomTabBar(selection: .constant(.central)) { _ in }
}
