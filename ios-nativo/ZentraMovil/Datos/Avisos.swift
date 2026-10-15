import Foundation
import UserNotifications

/// El aviso de stock bajo el mínimo. Port de `src/lib/avisos.ts`.
///
/// Es una notificación **local**: la arma el teléfono, no el servidor. Esa es la
/// diferencia que importa:
///
///   - No hace falta que ningún ERP mande nada. Funciona igual con ERP propio y
///     sin él, y no hay que pedirle a ningún cliente que agregue un webhook.
///   - Sólo puede dispararse cuando la app está corriendo y acaba de leer el
///     inventario. **No va a avisar a las 3 de la mañana.**
///
/// O sea: sirve para enterarse al abrir la app o después de una venta, no para
/// reemplazar un aviso del servidor. Donde el ERP ya manda los suyos, llegan
/// igual por push y éste no estorba, porque se agrupa en una sola notificación
/// que se reemplaza a sí misma.
enum Avisos {
    /// Los que están en el mínimo o por debajo.
    static func bajoMinimo(_ productos: [InvProducto]) -> [InvProducto] {
        productos.filter { $0.minimo > 0 && $0.stock <= $0.minimo }
    }

    /// El texto del aviso.
    ///
    /// Con un solo producto se lo nombra: "Cerveza lata 350 ml" dice mucho más
    /// que "1 producto". Con varios no entran todos, así que va el número y el
    /// primero como ejemplo.
    static func texto(_ bajos: [InvProducto]) -> (titulo: String, cuerpo: String)? {
        guard let primero = bajos.first else { return nil }
        if bajos.count == 1 {
            return ("Stock bajo",
                    "\(primero.nombre) quedó en \(cantidad(primero.stock)) \(primero.unidad).")
        }
        return ("Stock bajo",
                "\(bajos.count) productos bajo el mínimo, como \(primero.nombre).")
    }

    /// Identificador fijo a propósito: así cada aviso nuevo **reemplaza** al
    /// anterior en vez de apilar uno por cada vez que se lee el inventario.
    private static let id = "zentra.stock-bajo"

    /// Pide permiso una sola vez. Si lo niegan, no se vuelve a insistir: el
    /// sistema ya no muestra el diálogo y seguir pidiendo no cambia nada.
    static func pedirPermiso() async -> Bool {
        let c = UNUserNotificationCenter.current()
        let estado = await c.notificationSettings().authorizationStatus
        if estado == .authorized { return true }
        if estado == .denied { return false }
        return (try? await c.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    /// Avisa si hay algo que avisar. Silencioso si el permiso no está dado.
    static func revisar(_ productos: [InvProducto], activado: Bool) async {
        guard activado else { return }
        let bajos = bajoMinimo(productos)
        let c = UNUserNotificationCenter.current()

        guard let t = texto(bajos) else {
            // Ya no hay nada bajo el mínimo: se retira el aviso viejo en vez de
            // dejarlo en el centro de notificaciones diciendo algo que no es.
            c.removeDeliveredNotifications(withIdentifiers: [id])
            return
        }

        guard await pedirPermiso() else { return }

        let n = UNMutableNotificationContent()
        n.title = t.titulo
        n.body = t.cuerpo
        n.sound = .default
        // Sin disparador: se muestra ya, porque el dato se acaba de leer.
        try? await c.add(UNNotificationRequest(identifier: id, content: n, trigger: nil))
    }

    private static func cantidad(_ v: Double) -> String {
        v == v.rounded() ? String(Int(v)) : String(format: "%.3f", v)
    }
}

/// Qué precio le corresponde a cada cliente. Port de `src/lib/precios.ts`.
///
/// El producto puede tener dos: el de mostrador y el de quien compra por
/// cantidad. Cuál se usa lo decide **la lista del cliente**, no quien está
/// cargando la venta: si fuera una elección manual, el precio de un mismo
/// cliente dependería de quién lo atendió ese día.
enum Precios {
    static func esMayorista(_ cliente: Cliente?) -> Bool {
        (cliente?.lista ?? "").range(of: "mayor", options: .caseInsensitive) != nil
    }

    /// El precio a cobrar.
    ///
    /// Sin cliente identificado se cobra el de mostrador: una venta sin nombre
    /// no puede ser mayorista, porque no hay a quién corresponderle esa lista.
    ///
    /// Un producto sin precio mayorista cargado también cae al de mostrador,
    /// aunque el cliente sea mayorista: cobrar cero sería peor que cobrar de más.
    static func aCobrar(_ p: InvProducto, _ cliente: Cliente?) -> Int {
        guard esMayorista(cliente), let mayorista = p.precioMayorista, mayorista > 0 else {
            return p.precio
        }
        return mayorista
    }
}
