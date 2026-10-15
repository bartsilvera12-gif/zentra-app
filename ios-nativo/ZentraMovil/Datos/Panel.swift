import Foundation

/// Los números del panel de inicio, sacados del ERP. Port de `usePanel.ts`.
///
/// Antes estaban escritos en el código: 1.248 ítems, 82% óptimo, 37 bajo mínimo.
/// Se veían bien y eran mentira. Mientras cargan no se muestra un número
/// provisorio sino que está cargando, y si el ERP falla se dice que no se pudo:
/// un cero inventado es indistinguible de un cero real.
@Observable
final class Panel {
    struct Inventario: Equatable {
        var total: Int
        var bajoMinimo: Int
        var agotados: Int
        var pctOptimo: Int
    }

    struct Ventas: Equatable {
        var hoy: Int
        var facturas: Int
        /// Un punto por día, de más viejo a hoy.
        var serie: [Int]
        /// nil cuando ayer fue cero: "subió 100%" desde cero no quiere decir nada.
        var deltaPct: Int?
    }

    var inventario: Inventario?
    var ventas: Ventas?
    var cargando = true
    var error: String?

    private var pedido = false

    func cargar(forzar: Bool = false) async {
        if pedido && !forzar { return }
        pedido = true
        cargando = true

        let dias = Self.ultimos7()

        // Por separado: que no haya ventas cargadas no es razón para esconder el
        // inventario, ni al revés.
        async let inv = try? RepoERP.inventario()
        async let ven = try? RepoERP.ventas(desde: dias[0], hasta: dias[6])
        let (prods, vtas) = await (inv, ven)

        if let prods {
            let agotados = prods.filter { $0.stock <= 0 }.count
            // Bajo mínimo es "le queda poco", no "no le queda": un agotado ya se
            // cuenta aparte y sumarlo en los dos lados abulta el problema.
            let bajo = prods.filter { $0.stock > 0 && $0.minimo > 0 && $0.stock <= $0.minimo }.count
            let total = prods.count
            inventario = Inventario(
                total: total,
                bajoMinimo: bajo,
                agotados: agotados,
                pctOptimo: total > 0
                    ? Int((Double(total - agotados - bajo) / Double(total) * 100).rounded())
                    : 0
            )
        }

        if let vtas {
            var porDia = [String: Int]()
            for d in dias { porDia[d] = 0 }
            var facturas = 0
            for v in vtas {
                let d = String(v.iso.prefix(10))
                guard porDia[d] != nil else { continue }
                porDia[d, default: 0] += v.total
                if d == dias[6] { facturas += 1 }
            }
            let serie = dias.map { porDia[$0] ?? 0 }
            let hoy = serie[6]
            let ayer = serie[5]
            ventas = Ventas(
                hoy: hoy,
                facturas: facturas,
                serie: serie,
                deltaPct: ayer > 0 ? Int(((Double(hoy - ayer) / Double(ayer)) * 100).rounded()) : nil
            )
        }

        cargando = false
        error = (prods == nil && vtas == nil)
            ? "No pudimos cargar los datos. Revisá tu conexión."
            : nil
    }

    /// Los últimos 7 días en la hora del teléfono, que es la que el vendedor
    /// tiene en la cabeza.
    static func ultimos7(_ hoy: Date = Date()) -> [String] {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        let cal = Calendar.current
        return (0..<7).map { i in
            f.string(from: cal.date(byAdding: .day, value: -(6 - i), to: hoy) ?? hoy)
        }
    }

    /// "Gs. 1.250.000"
    static func gs(_ n: Int) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "es_PY")
        return "Gs. " + (f.string(from: NSNumber(value: n)) ?? "\(n)")
    }
}
