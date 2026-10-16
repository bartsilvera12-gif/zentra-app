import SwiftUI

/// Los colores de los reportes. Port de `src/lib/colores-reporte.ts`.
///
/// Viven acá y no en la pantalla por dos razones. La primera es que son
/// decisiones con reglas, no gustos: hay que poder probarlas. La segunda es que
/// un gráfico elige color por lo que el dato **hace** —magnitud, identidad,
/// estado—, y eso es una regla distinta de la del resto de la app, donde el
/// color sólo dice "mirá esto".
///
/// Siguen las familias de la marca pero con tonos propios, más profundos: los
/// de la interfaz están pensados para una píldora con texto encima, y en una
/// barra o una porción de dona quedan dos cosas distintas que se leen igual.
///
/// El caso que lo motivó: "Bajo mínimo" (`#FFB701`) y "Agotados" (`#FC8500`)
/// eran dos ámbares separados por 11,6 de diferencia percibida, cuando el piso
/// para visión normal es 15. En la dona de inventario eran casi el mismo color
/// —y son justamente los dos estados que hay que distinguir de un vistazo—.
enum ColorReporte: String, CaseIterable {
    case azul, ambar, verde, rojo

    /// El modo oscuro no usa los mismos aclarados: tiene su propia banda de
    /// luminosidad, más angosta, y un color que funciona sobre blanco se apaga
    /// o se quema sobre negro. Están elegidos y verificados aparte.
    func color(oscuro: Bool) -> Color {
        switch (self, oscuro) {
        case (.azul, false):  Color(hex: "#0C73A6")
        case (.ambar, false): Color(hex: "#D99400")
        case (.verde, false): Color(hex: "#068C7F")
        case (.rojo, false):  Color(hex: "#B23A10")
        case (.azul, true):   Color(hex: "#2E90C4")
        case (.ambar, true):  Color(hex: "#B8871F")
        case (.verde, true):  Color(hex: "#189488")
        case (.rojo, true):   Color(hex: "#B83A2E")
        }
    }

    /// La rampa de una barra, de lo más chico a lo más grande.
    ///
    /// Un solo tono, de claro a oscuro. Es la regla de las escalas de magnitud:
    /// el color dice cuánto, y como dice lo mismo que la altura, se lee sin
    /// pensar — la barra más alta es también la más intensa.
    ///
    /// Lo que **no** se hace: un color distinto por barra. Eso sería tratar los
    /// días como categorías y el color dejaría de significar nada.
    func rampa(oscuro: Bool) -> [Color] {
        let hex: [String]
        switch (self, oscuro) {
        case (.azul, false):  hex = ["#BFDCEA", "#8FC3DC", "#4E9CC4", "#1E7FAE", "#0C73A6"]
        case (.azul, true):   hex = ["#2A5F7E", "#33769B", "#3D8DB8", "#4A9FCC", "#5CB2DD"]
        case (.ambar, false): hex = ["#F3E0B4", "#E8C878", "#DFB13F", "#D99400", "#B8781A"]
        case (.ambar, true):  hex = ["#6E5519", "#8A6B1F", "#A68226", "#C09A33", "#D2B150"]
        case (.verde, false): hex = ["#BCE2DC", "#8CCFC5", "#4FB4A7", "#1C9A8C", "#068C7F"]
        case (.verde, true):  hex = ["#1C5E57", "#22756C", "#288C81", "#2FA396", "#44B8AA"]
        case (.rojo, false):  hex = ["#F0C9BC", "#E0A08A", "#CE7154", "#BE4C28", "#B23A10"]
        case (.rojo, true):   hex = ["#6E352B", "#8A4234", "#A5503E", "#BD5F4C", "#CE735F"]
        }
        return hex.map { Color(hex: $0) }
    }

    /// Qué escalón de la rampa le toca a un valor.
    static func paso(_ valor: Double, max: Double, pasos: Int) -> Int {
        guard max > 0, valor > 0 else { return 0 }
        let i = Int((valor / max * Double(pasos)).rounded(.up)) - 1
        return Swift.max(0, Swift.min(pasos - 1, i))
    }

    /// El color de una barra según cuánto vale contra la más alta.
    func barra(_ valor: Double, max: Double, oscuro: Bool) -> Color {
        let r = rampa(oscuro: oscuro)
        return r[Self.paso(valor, max: max, pasos: r.count)]
    }
}

/// El color que identifica cada reporte.
extension ReportesView.Solapa {
    var colorReporte: ColorReporte {
        switch self {
        case .ventas: .azul
        case .compras: .ambar
        case .inventario: .verde
        }
    }
}
