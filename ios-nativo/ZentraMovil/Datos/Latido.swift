import SwiftUI

/// Volver a pedir algo cada tanto, mientras la pantalla se esté mirando.
/// Port de `src/mobile/screens/useLatido.ts`.
///
/// El chat no se actualizaba solo: para ver un mensaje nuevo había que salir de
/// la conversación y volver a entrar. En una app de mensajes eso no es un
/// detalle, es la función.
///
/// Lo importante es cuándo **no** late:
///
///   - Con la app en segundo plano. Un teléfono en el bolsillo pidiendo al ERP
///     cada ocho segundos gasta batería y datos de alguien, y multiplicado por
///     todos los vendedores de todas las empresas le pega al ERP sin que nadie
///     esté mirando.
///   - Mientras el pedido anterior sigue en camino. Con señal mala los pedidos
///     se encimarían y cada uno pisaría al anterior.
///
/// Al volver del segundo plano pide una vez enseguida, sin esperar el intervalo:
/// el momento en que alguien vuelve a la app es justo cuando quiere ver lo que
/// se perdió.
struct Latido: ViewModifier {
    let segundos: TimeInterval
    let activo: Bool
    let hacer: () async -> Void

    @Environment(\.scenePhase) private var fase
    @State private var corriendo = false

    func body(content: Content) -> some View {
        content
            .task(id: activo) {
                guard activo, segundos > 0 else { return }
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(segundos))
                    if Task.isCancelled { return }
                    await latir()
                }
            }
            .onChange(of: fase) { _, nueva in
                // Al volver a la app, una pedida inmediata.
                if nueva == .active, activo { Task { await latir() } }
            }
    }

    private func latir() async {
        guard !corriendo, fase == .active else { return }
        corriendo = true
        await hacer()
        corriendo = false
    }
}

extension View {
    func latido(cada segundos: TimeInterval, activo: Bool,
                _ hacer: @escaping () async -> Void) -> some View {
        modifier(Latido(segundos: segundos, activo: activo, hacer: hacer))
    }
}
