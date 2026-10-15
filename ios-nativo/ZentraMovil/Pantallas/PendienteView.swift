import SwiftUI

/// Lo que todavía no se portó. Dice qué falta en vez de mostrar datos de ejemplo
/// que parezcan reales: un número inventado es peor que un hueco declarado.
struct PendienteView: View {
    let modulo: Modulo
    @Environment(\.tema) private var t

    var body: some View {
        ZStack {
            t.bg.ignoresSafeArea()
            VStack(spacing: 10) {
                Image(systemName: modulo.simbolo)
                    .font(.system(size: 34, weight: .light)).foregroundStyle(t.ink3)
                Text("\(modulo.titulo) todavía no está en iOS")
                    .font(Tipo.barlow(.semibold, 16)).foregroundStyle(t.ink)
                Text("Ya funciona en Android. Se porta en la próxima tanda.")
                    .font(Tipo.barlow(.regular, 13)).foregroundStyle(t.ink2)
                    .multilineTextAlignment(.center)
            }
            .padding(28)
        }
        .navigationTitle(modulo.titulo)
        .navigationBarTitleDisplayMode(.inline)
    }
}
