import Foundation
import UserNotifications

/// Avisar que el plan vence, antes de que venza. Port de `src/lib/vencimiento.ts`.
enum Vencimiento {
    /// Cuatro hitos, no uno.
    ///
    /// Un solo aviso se ignora justo el día que importa. Una semana antes para
    /// que dé tiempo a pagar, tres días porque la primera ya se olvidó, el día
    /// anterior, y el día que venció.
    static let hitos = [7, 3, 1, 0]

    static func dias(_ vence: Date?, _ ahora: Date = Date()) -> Int? {
        guard let vence else { return nil }
        let cal = Calendar.current
        return cal.dateComponents([.day], from: cal.startOfDay(for: ahora),
                                  to: cal.startOfDay(for: vence)).day
    }

    /// Qué aviso corresponde hoy, o `nil` si hoy no hay que avisar.
    ///
    /// Después del vencimiento avisa una sola vez más, no todos los días: ya
    /// cayó a Gratis y la app se lo dice sola en cada pantalla. Insistir sería
    /// castigar.
    static func hitoDeHoy(_ vence: Date?, _ ahora: Date = Date()) -> Int? {
        guard let d = dias(vence, ahora) else { return nil }
        if d < 0 { return -1 }
        return hitos.contains(d) ? d : nil
    }

    static func texto(_ hito: Int) -> (titulo: String, cuerpo: String) {
        if hito < 0 {
            return ("Tu plan venció",
                    "Seguís viendo todo lo cargado, pero para editar o cargar hay que renovar.")
        }
        if hito == 0 {
            return ("Tu plan vence hoy", "Renovalo para seguir cargando y editando.")
        }
        if hito == 1 {
            return ("Tu plan vence mañana", "Renovalo para no quedarte sin cargar ni editar.")
        }
        return ("Tu plan vence en \(hito) días", "Renovalo cuando puedas y seguís como estás.")
    }

    /// Qué hito ya se avisó, **junto con la fecha**.
    ///
    /// Guardarlo suelto sería el bug: al renovar, el vencimiento cambia y los
    /// avisos de la fecha anterior ya no cuentan. Sin esto, quien renueva no
    /// volvería a recibir aviso nunca.
    private static let clave = "zentra.avisadoVencimiento"

    static func avisar(_ vence: Date?) async {
        guard let vence, let hito = hitoDeHoy(vence) else { return }

        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        let marca = "\(f.string(from: vence))#\(hito)"
        guard UserDefaults.standard.string(forKey: clave) != marca else { return }

        guard await Avisos.pedirPermiso() else { return }
        let t = texto(hito)
        let n = UNMutableNotificationContent()
        n.title = t.titulo
        n.body = t.cuerpo
        n.sound = .default
        try? await UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: "zentra.vencimiento", content: n, trigger: nil))
        UserDefaults.standard.set(marca, forKey: clave)
    }
}
