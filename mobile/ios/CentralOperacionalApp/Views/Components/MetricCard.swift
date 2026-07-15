import SwiftUI

/// Card de indicador no cabeçalho escuro ("Mesas abertas", "Em preparo",
/// "Turno atual"). Fundo translúcido claro sobre o gradiente do header —
/// cores explícitas, não depende de herança.
struct MetricCard: View {
    let systemImage: String
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: systemImage)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color.ppGold)

            Text(value)
                .font(PPFont.metricValue)
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.7)

            Text(label.uppercased())
                .font(PPFont.metricLabel)
                .foregroundStyle(.white.opacity(0.55))
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.06))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Color.white.opacity(0.1))
        )
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    HStack(spacing: 12) {
        MetricCard(systemImage: "fork.knife", value: "8", label: "Mesas abertas")
        MetricCard(systemImage: "clock", value: "5", label: "Em preparo")
        MetricCard(systemImage: "chart.line.uptrend.xyaxis", value: "R$ 1.847,00", label: "Turno atual")
    }
    .padding()
    .background(Color.ppGraphite)
}
