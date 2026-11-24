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
    /// Cuántos avisos se tocaron en esta corrida de la app.
    ///
    /// Es un contador y no un booleano porque lo que importa es que **cambie**:
    /// `RaizView` lo mira para traer la pestaña de Inicio antes de que se
    /// empuje el chat. Con `entrarA` no alcanzaba —`InicioView` lo pone en
    /// `nil` en cuanto lo usa, y según el orden en que SwiftUI mire cada vista
    /// la pestaña podía quedarse donde estaba.
    private(set) var avisosTocados = 0

    func refrescar() async {
        guard let chats = try? await RepoERP.conversaciones() else { return }
        sinLeer = chats.filter { !$0.cerrada && $0.noLeidos > 0 }.count
        try? await UNUserNotificationCenter.current().setBadgeCount(sinLeer)
    }

    /// Lo que manda el ERP en el aviso: `conversationId` en los datos, y el
    /// nombre del contacto como título.
    func desdeAviso(_ datos: [AnyHashable: Any], titulo: String) {
        let id = Self.idDeConversacion(datos)
        avisosTocados += 1
        print("[push] tocaron el aviso; claves=\(datos.keys.map { "\($0)" }.sorted()) id=\(id.isEmpty ? "(ninguno)" : id)")
        guard !id.isEmpty else { return }
        entrarA = ChatDestino(id: id, nombre: titulo.isEmpty ? "Conversación" : titulo)
    }

    /// De dónde sale el id de la conversación en el aviso.
    ///
    /// El camino bueno es `conversationId`, que es lo que manda el despachador
    /// del chat. Pero no es el único que manda avisos: los de supervisión y los
    /// de proyectos salen por otro camino, con `ruta`/`route` y sin el id
    /// suelto. Antes esos avisos se tocaban y no pasaba nada, porque faltaba la
    /// clave exacta. Sacarlo de la ruta —`/m/asesor/chat/<id>`— es leer lo
    /// mismo que ya venía escrito.
    static func idDeConversacion(_ datos: [AnyHashable: Any]) -> String {
        func texto(_ k: String) -> String {
            ((datos[k] as? String) ?? "").trimmingCharacters(in: .whitespaces)
        }
        let suelto = texto("conversationId")
        if !suelto.isEmpty { return suelto }
        for clave in ["route", "ruta"] {
            let r = texto(clave)
            guard let corte = r.range(of: "/chat/") else { continue }
            let resto = r[corte.upperBound...]
            let id = resto.split(separator: "/").first.map(String.init) ?? ""
            if !id.isEmpty { return id }
        }
        return ""
    }
}

/// A qué conversación entrar. Es un destino de navegación, no un chat: el
/// nombre sale del título del aviso y lo demás lo trae la propia pantalla.
struct ChatDestino: Hashable, Identifiable {
    var id: String
    var nombre: String
}
