import SwiftUI

/// Pílula "● Operação em tempo real" — ponto verde pulsante + texto.
struct StatusBadge: View {
    let text: String
    var dotColor: Color = .ppSuccess

    @State private var isPulsing = false

    var body: some View {
        HStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(dotColor.opacity(0.6))
                    .frame(width: 8, height: 8)
                    .scaleEffect(isPulsing ? 2.2 : 1)
                    .opacity(isPulsing ? 0 : 0.75)
                Circle()
                    .fill(dotColor)
                    .frame(width: 8, height: 8)
            }
            .accessibilityHidden(true)

            Text(text)
                .font(PPFont.badge)
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Capsule().fill(Color.white.opacity(0.1)))
        .onAppear {
            withAnimation(.easeOut(duration: 1.6).repeatForever(autoreverses: false)) {
                isPulsing = true
            }
        }
    }
}

#Preview {
    StatusBadge(text: "Operação em tempo real")
        .padding()
        .background(Color.ppGraphite)
}
