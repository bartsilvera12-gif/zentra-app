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
/// Barlow todavía no está embebida acá: hasta que se agreguen los `.ttf` al bundle,
/// esto cae en la fuente del sistema con el mismo peso y tamaño. La métrica no es
/// idéntica, así que los anchos de texto van a diferir un poco de Android.
enum Tipo {
    static func barlow(_ peso: Font.Weight, _ tam: CGFloat) -> Font {
        .system(size: tam, weight: peso)
    }
}
