import Foundation
import SwiftUI

/// Convierte las URLs sueltas del texto en enlaces tocables.
///
/// SwiftUI no detecta enlaces solo: `Text("https://…")` es texto plano, y el asesor tenía
/// que seleccionar la dirección a mano para abrirla. Se usa el mismo detector del sistema
/// que usan Mail y Mensajes, así que reconoce lo mismo que reconocería iOS en cualquier
/// otra app, y no una expresión regular propia que se equivoque distinto.
enum TextoConEnlaces {
    private static let detector = try? NSDataDetector(
        types: NSTextCheckingResult.CheckingType.link.rawValue
    )

    static func armar(_ texto: String, claro: Bool) -> AttributedString {
        let ns = NSMutableAttributedString(string: texto)
        let rango = NSRange(location: 0, length: (texto as NSString).length)

        detector?.enumerateMatches(in: texto, range: rango) { m, _, _ in
            guard let m, let url = m.url else { return }
            ns.addAttribute(.link, value: url, range: m.range)
            // Sobre la burbuja propia el azul del sistema casi no se lee: blanco subrayado,
            // que es lo que hace WhatsApp.
            if claro {
                ns.addAttribute(.foregroundColor, value: UIColor.white, range: m.range)
            }
            ns.addAttribute(.underlineStyle, value: NSUnderlineStyle.single.rawValue, range: m.range)
        }
        return AttributedString(ns)
    }
}
