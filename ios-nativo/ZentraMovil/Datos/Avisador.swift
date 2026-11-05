import Observation
import UserNotifications

/// Los mensajes sin leer y a qué chat hay que entrar.
///
/// Vive aparte de las pantallas porque lo escriben dos lugares que no se ven
/// entre sí: la pantalla de Inicio, que cuenta los sin leer para pintar el
/// número sobre la baldosa, y el aviso que llega de Firebase, que se toca
/// cuando la app está cerrada y no hay ninguna vista todavía.
@MainActor
@Observable
final class Avisador {
    static let shared = Avisador()

    private init() {}

    /// Cuántas conversaciones tienen mensajes sin leer.
    ///
    /// Conversaciones y no mensajes: el número sobre el ícono dice cuántas
    /// esperan respuesta, que es lo que se decide al mirarlo. "173" porque un
    /// cliente mandó muchos no cambia nada de lo que uno hace.
    private(set) var sinLeer = 0

    /// El chat al que hay que entrar, puesto al tocar un aviso.
    ///
    /// Queda guardado hasta que alguien lo consume. Es lo que hace que ande con
    /// la app cerrada: el aviso se toca, iOS arranca la app, esto se llena, y
    /// la pantalla de Inicio lo encuentra ya puesto cuando por fin aparece.
    var entrarA: ChatDestino?

    /// Vuelve a contar y actualiza el globito del ícono de la app.
    ///
    /// No tira nunca: si el ERP no contesta se deja el número que había. Un
    /// cero por un error de red se lee como "no tenés nada pendiente", que es
    /// peor que un número viejo.
    func refrescar() async {
        guard let chats = try? await RepoERP.conversaciones() else { return }
        sinLeer = chats.filter { !$0.cerrada && $0.noLeidos > 0 }.count
        try? await UNUserNotificationCenter.current().setBadgeCount(sinLeer)
    }

    /// Lo que manda el ERP en el aviso: `conversationId` en los datos, y el
    /// nombre del contacto como título.
    func desdeAviso(_ datos: [AnyHashable: Any], titulo: String) {
        let id = (datos["conversationId"] as? String ?? "")
            .trimmingCharacters(in: .whitespaces)
        guard !id.isEmpty else { return }
        entrarA = ChatDestino(id: id, nombre: titulo.isEmpty ? "Conversación" : titulo)
    }
}

/// A qué conversación entrar. Es un destino de navegación, no un chat: el
/// nombre sale del título del aviso y lo demás lo trae la propia pantalla.
struct ChatDestino: Hashable, Identifiable {
    var id: String
    var nombre: String
}
