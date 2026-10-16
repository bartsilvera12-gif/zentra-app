import SwiftUI

/// Tokens de diseño, portados **literalmente** desde `src/lib/theme.ts` del repo web.
///
/// La regla acá es que esto no se "interpreta": si en la web un color es `#04617A`,
/// acá es `#04617A`. Cuando el diseño cambie, cambia en `theme.ts` y se replica.
/// Cualquier valor que inventemos de este lado es una forma de que las dos apps
/// empiecen a separarse, que es justo lo que no queremos.

extension Color {
    /// `#RRGGBB` como lo escribe la web, para que el diff contra `theme.ts` sea legible.
    init(hex: String) {
        let s = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        let v = UInt64(s, radix: 16) ?? 0
        self.init(
            .sRGB,
            red: Double((v >> 16) & 0xFF) / 255,
            green: Double((v >> 8) & 0xFF) / 255,
            blue: Double(v & 0xFF) / 255,
            opacity: 1
        )
    }
}

// MARK: - Tema claro / oscuro

/// Los siete tokens que la web resuelve en `useApp().t`.
struct TemaTokens {
    let bg: Color
    let card: Color
    let ink: Color
    let ink2: Color
    let ink3: Color
    let dim: Color
    let border: Color

    static let claro = TemaTokens(
        bg: Color(hex: "#f3f5f8"),
        card: Color(hex: "#ffffff"),
        ink: Color(hex: "#141a2e"),
        ink2: Color(hex: "#65707f"),
        ink3: Color(hex: "#5b6676"),
        dim: Color(hex: "#c3cbd6"),
        border: Color(hex: "#e3e7ee")
    )

    /// El oscuro sale de la marca y no de un gris neutro: con grises la app se
    /// veía de cualquiera, y al lado del encabezado azul cantaba la diferencia.
    static let oscuro = TemaTokens(
        bg: Color(hex: "#0A1F2A"),
        card: Color(hex: "#143A49"),
        ink: Color(hex: "#EAF2F5"),
        ink2: Color(hex: "#A8C2CC"),
        ink3: Color(hex: "#89A6B2"),
        dim: Color(hex: "#3C5A68"),
        border: Color(hex: "#1D4252")
    )
}

/// Se inyecta por el entorno, como `useApp().t` en la web.
private struct TemaKey: EnvironmentKey {
    static let defaultValue = TemaTokens.claro
}

extension EnvironmentValues {
    var tema: TemaTokens {
        get { self[TemaKey.self] }
        set { self[TemaKey.self] = newValue }
    }
}

// MARK: - Paleta de marca

enum C {
    static let azul = Color(hex: "#023047")
    static let azulMedio = Color(hex: "#04617A")
    static let cian = Color(hex: "#209EBB")
    static let cianClaro = Color(hex: "#8ECAE6")
    static let teal = Color(hex: "#119F9F")   // el del ícono nuevo
    static let ambar = Color(hex: "#FFB701")
    static let naranja = Color(hex: "#FC8500")
    static let oro = Color(hex: "#96731A")
    static let violeta = Color(hex: "#525890")
    /// El violeta del panel. Más oscuro y más saturado que `violeta`, que contra
    /// un fondo oscuro quedaba lavado. Es el mismo `#4B3C86` que `theme.ts` ya
    /// tiene como tinta de CRM, así que no entra un color nuevo a la paleta.
    static let violetaOscuro = Color(hex: "#4B3C86")
    static let blanco = Color(hex: "#ffffff")
}

// MARK: - Tintes de estado

/// Cada par es (fondo, tinta), como los usa el prototipo.
enum Tint {
    static let okBg = Color(hex: "#EAF3EF")
    static let okInk = Color(hex: "#1F5C46")
    static let avisoBg = Color(hex: "#FFF3DC")
    static let avisoInk = Color(hex: "#6B4A00")
    static let errorBg = Color(hex: "#FBE9E7")
    static let errorInk = Color(hex: "#8C2F2B")
    static let infoBg = Color(hex: "#E2F0F4")
    static let infoInk = Color(hex: "#04617A")
    static let tealBg = Color(hex: "#E3F1EF")
    static let tealInk = Color(hex: "#0C5F58")
    static let crmBg = Color(hex: "#EDE8F7")
    static let crmInk = Color(hex: "#4B3C86")
}

// MARK: - Módulos

/// Los siete módulos de la grilla de inicio, con sus tres colores.
/// `fill` es el círculo que crece al tocar; `over` es la tinta encima de `color`.
enum Modulo: String, CaseIterable, Identifiable {
    case venta, clientes, compras, inventario, conversaciones, proveedores, reportes

    var id: String { rawValue }

    var titulo: String {
        switch self {
        case .venta: "Nueva venta"
        case .clientes: "Clientes"
        case .compras: "Compras"
        case .inventario: "Inventario"
        case .conversaciones: "Conversaciones"
        case .proveedores: "Proveedores"
        case .reportes: "Reportes"
        }
    }

    var color: Color {
        switch self {
        case .venta: Color(hex: "#025159")
        case .clientes: Color(hex: "#08A696")
        case .compras: Color(hex: "#3DBFB0")
        case .inventario: Color(hex: "#F27405")
        case .conversaciones: Color(hex: "#F28705")
        case .proveedores: Color(hex: "#F3AA20")
        case .reportes: Color(hex: "#025159")
        }
    }

    var fill: Color {
        switch self {
        case .venta: Color(hex: "#013B40")
        case .clientes: Color(hex: "#3DBFB0")
        case .compras: Color(hex: "#08A696")
        case .inventario: Color(hex: "#F28705")
        case .conversaciones: Color(hex: "#F27405")
        case .proveedores: Color(hex: "#F28705")
        case .reportes: Color(hex: "#013B40")
        }
    }

    var over: Color {
        switch self {
        case .venta, .reportes: Color(hex: "#ffffff")
        case .clientes, .compras, .inventario, .conversaciones, .proveedores:
            Color(hex: "#04212A")
        }
    }

    /// Qué acción del plan habilita este módulo. `nil` es "siempre entra":
    /// vender, cobrar y ver clientes no dependen del plan — si no se pudiera
    /// vender, la app no sería nada.
    var accion: Accion? {
        switch self {
        case .compras: .comprasModulo
        case .proveedores: .proveedoresModulo
        case .conversaciones: .chatModulo
        case .venta, .clientes, .inventario, .reportes: nil
        }
    }

    /// SF Symbol que reemplaza al SVG de `ui/Icons.tsx`.
    var simbolo: String {
        switch self {
        case .venta: "doc.text"
        case .clientes: "person.2"
        case .compras: "cart"
        case .inventario: "shippingbox"
        case .conversaciones: "bubble.left.and.bubble.right"
        case .proveedores: "truck.box"
        case .reportes: "chart.bar"
        }
    }
}

// MARK: - Tipografía

/// La web usa Barlow en todos lados con el shorthand `600 14px/1`.
///
/// Acá va la misma Barlow, embebida en el bundle. Se registra en caliente con
/// CoreText en vez de declararla en el Info.plist: el proyecto genera su plist
/// desde los ajustes de compilación, y `UIAppFonts` es un arreglo que ese
/// mecanismo no sabe escribir.
///
/// Un detalle que vale saber: **Barlow no trae el símbolo ₲** (U+20B2). iOS lo
/// sustituye por otra tipografía sólo para ese glifo. Pasa igual en Android,
/// donde el navegador hace lo mismo, así que las dos se ven parejas.
enum Tipo {
    private static let registrada: Bool = {
        guard let urls = Bundle.main.urls(forResourcesWithExtension: "ttf",
                                          subdirectory: nil) else { return false }
        for u in urls {
            CTFontManagerRegisterFontsForURL(u as CFURL, .process, nil)
        }
        return true
    }()

    /// El nombre PostScript de cada corte, que es como CoreText los encuentra.
    private static func corte(_ peso: Font.Weight) -> String {
        switch peso {
        case .bold, .heavy, .black: "Barlow-Bold"
        case .semibold: "Barlow-SemiBold"
        case .medium: "Barlow-Medium"
        default: "Barlow-Regular"
        }
    }

    static func barlow(_ peso: Font.Weight, _ tam: CGFloat) -> Font {
        _ = registrada
        // Si por lo que sea la fuente no está, `.custom` cae sola en la del
        // sistema: la app se ve distinta, no rota.
        return .custom(corte(peso), size: tam)
    }
}
