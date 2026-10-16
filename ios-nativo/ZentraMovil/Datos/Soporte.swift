import Foundation

/// El soporte de la app: a quién se le escribe y con qué.
/// Port de `src/lib/soporte.ts`.
///
/// Lo que manda la app es el **primer** mensaje, el que escribe quien tiene el
/// problema. Está armado para que del otro lado no haya que preguntar tres
/// veces lo mismo: quién es, de qué empresa, qué versión tiene instalada. Esa
/// vuelta —"¿qué versión usás?", "¿en qué pantalla?"— es la que convierte diez
/// minutos de soporte en dos días de ida y vuelta.
enum Soporte {
    /// La marca con la que entra todo lo que sale de acá.
    ///
    /// Es lo que permite, del otro lado, mandarlo a la cola de atención de la
    /// app en vez de mezclarlo con los clientes del ERP.
    static let marca = "[Zentra App]"

    /// Qué quiere quien escribe. Cambia el texto y la cola del otro lado.
    enum Motivo {
        case ayuda, mejora

        var titulo: String {
            switch self {
            case .ayuda: "Escribir a soporte"
            case .mejora: "Sugerir una mejora"
            }
        }

        var detalle: String {
            switch self {
            case .ayuda: "Por WhatsApp · lunes a sábado, 8 a 18 h"
            case .mejora: "Contanos qué te gustaría que haga la app"
            }
        }

        /// El símbolo del sistema para la fila, en vez de un emoji o una
        /// estrella de texto: se dibuja con el peso de la tipografía y toma el
        /// color que le dé la pantalla.
        var simbolo: String {
            switch self {
            case .ayuda: "message.fill"
            case .mejora: "lightbulb.fill"
            }
        }
    }

    struct Contacto {
        var nombre: String?
        var empresa: String?
        var version: String
        /// El commit del build. Sin esto, "ya lo arreglamos" no se puede verificar.
        var build: String?
    }

    /// El mensaje con el que arranca la conversación.
    ///
    /// Termina en dos puntos y un renglón en blanco **a propósito**: el teclado
    /// se abre con el cursor ahí, y lo único que queda por hacer es contar el
    /// problema. Un mensaje que ya viene "completo" se manda tal cual y no dice
    /// nada.
    static func mensaje(_ motivo: Motivo, _ d: Contacto) -> String {
        let quien = [d.nombre, d.empresa]
            .compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
        let version = "v\(d.version)" + (d.build.map { " (\($0))" } ?? "")
        let encabezado = "\(marca) \(quien.isEmpty ? "" : "\(quien) · ")\(version)"

        return motivo == .mejora
            ? "\(encabezado)\n\nQuiero sugerir una mejora:\n"
            : "\(encabezado)\n\nNecesito ayuda con:\n"
    }

    /// El enlace de WhatsApp listo, o `nil` si no hay número configurado.
    static func link(_ numero: String, _ motivo: Motivo, _ d: Contacto) -> URL? {
        let limpio = numero.filter(\.isNumber)
        guard !limpio.isEmpty else { return nil }
        let t = mensaje(motivo, d)
            .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return URL(string: "https://wa.me/\(limpio)?text=\(t)")
    }

    /// Los datos de esta instalación, para armar el encabezado del mensaje.
    static func contacto(nombre: String?, empresa: String?) -> Contacto {
        let info = Bundle.main.infoDictionary
        return Contacto(
            nombre: nombre,
            empresa: empresa,
            version: info?["CFBundleShortVersionString"] as? String ?? "0.1.0",
            build: info?["CFBundleVersion"] as? String
        )
    }
}
