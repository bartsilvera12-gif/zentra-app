import Foundation

/// Un presupuesto: a quién, qué, a cuánto, y hasta cuándo vale ese precio.
///
/// No mueve stock ni plata. Cuando el cliente acepta se convierte en una venta
/// de verdad, que se carga por el camino de siempre, y el presupuesto queda
/// apuntando a ella.
///
/// Port de `src/lib/presupuestos.ts` y `src/lib/types.ts` del repo web.
struct Presupuesto: Identifiable, Equatable {
    var id: String
    var numero: String
    var clienteId: String?
    var clienteTexto: String
    var clienteDoc: String
    var fecha: Date?
    var validoHasta: Date?
    /// Lo guardado: pendiente, aceptado, rechazado, convertido. "Vencido" no
    /// está acá porque no se guarda — ver `estadoVisible`.
    var estado: String
    var notas: String
    /// La venta en que se convirtió, si se convirtió.
    var ventaId: String?
    var lineas: [PresupuestoLinea]

    /// Lo que suma, con IVA incluido: los precios ya lo traen.
    var total: Int {
        lineas.reduce(0) { $0 + Int((Double($1.precio) * $1.cantidad).rounded()) }
    }

    /// El estado que se muestra, que es el guardado más "vencido".
    ///
    /// "Vencido" es un pendiente cuya validez ya pasó, y se calcula al
    /// mostrarlo con la misma regla que el vencimiento de los planes: el
    /// último día todavía vale. Guardarlo pediría algo que lo actualice todos
    /// los días; una fecha que se compara no se desincroniza de nada.
    ///
    /// Un aceptado no vence: el cliente ya dijo que sí a ese precio.
    func estadoVisible(_ ahora: Date = Date()) -> String {
        guard estado == "pendiente", let d = Vencimiento.dias(validoHasta, ahora), d < 0
        else { return estado }
        return "vencido"
    }

    static let rotulos = [
        "pendiente": "Pendiente",
        "aceptado": "Aceptado",
        "rechazado": "Rechazado",
        "convertido": "Vendido",
        "vencido": "Vencido",
    ]

    /// Las opciones de validez que se ofrecen al armarlo, en días.
    static let valideces = [7, 15, 30]
}

struct PresupuestoLinea: Identifiable, Equatable {
    var id = UUID()
    var productoId: String?
    var nombre: String
    var cantidad: Double
    /// Unitario, con IVA incluido, igual que en las ventas.
    var precio: Int
    var iva: Iva
}

enum TextoPresupuesto {
    /// El presupuesto como texto, para mandarlo por WhatsApp.
    ///
    /// WhatsApp es por donde se mandan los presupuestos acá, y un texto llega
    /// a cualquier teléfono sin pedirle a nadie que abra un PDF. Va con el
    /// formato de WhatsApp (`*negrita*`) y una línea por producto, que es lo
    /// que el cliente revisa.
    ///
    /// El nombre del negocio va arriba: sin él, el mensaje llega como un
    /// número desconocido mandando precios.
    static func armar(_ p: Presupuesto, negocio: String) -> String {
        var l: [String] = []
        if !negocio.isEmpty { l.append("*\(negocio)*") }
        l.append("Presupuesto \(p.numero)")
        if p.clienteTexto != "Sin nombre" { l.append("Para: \(p.clienteTexto)") }
        l.append("")
        for linea in p.lineas {
            let cant = Formato.miles(linea.cantidad)
            let sub = Int((Double(linea.precio) * linea.cantidad).rounded())
            l.append("• \(linea.nombre) · \(cant) × \(Panel.gs(linea.precio)) = \(Panel.gs(sub))")
        }
        l.append("")
        l.append("*Total: \(Panel.gs(p.total))*")
        if let v = p.validoHasta { l.append("Válido hasta el \(dia(v))") }
        if !p.notas.isEmpty {
            l.append("")
            l.append(p.notas)
        }
        return l.joined(separator: "\n")
    }

    /// El enlace que abre el chat de ese cliente en WhatsApp.
    ///
    /// Sin teléfono se devuelve `nil` y la app comparte por el camino del
    /// sistema, que deja elegir a quién. Mandar a un número inventado es peor
    /// que preguntar.
    static func enlace(telefono: String, texto: String) -> URL? {
        let n = numeroInternacional(telefono)
        let msg = texto.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
        guard !n.isEmpty else { return nil }
        return URL(string: "https://wa.me/\(n)?text=\(msg)")
    }

    /// `0981 123 456` → `595981123456`. Lo que se guarda acá es el número
    /// local, y WhatsApp quiere el internacional sin el cero.
    static func numeroInternacional(_ t: String) -> String {
        let d = t.filter(\.isNumber)
        guard !d.isEmpty else { return "" }
        if d.hasPrefix("595") { return d }
        if d.hasPrefix("0") { return "595" + d.dropFirst() }
        return "595" + d
    }

    static func dia(_ f: Date) -> String {
        let df = DateFormatter()
        df.dateFormat = "dd/MM/yyyy"
        return df.string(from: f)
    }
}


/// Los ajustes del catálogo público de un negocio.
///
/// La dirección se reserva al crear la cuenta, así que siempre hay una: lo que
/// falta para prenderlo es el WhatsApp a donde llegan los pedidos. Sin ese
/// número el catálogo sería una vidriera sin puerta, y la base directamente no
/// lo publica.
struct Catalogo: Equatable {
    var negocio: String
    var activo: Bool
    var direccion: String
    var color: String
    var whatsapp: String
    var mensaje: String
    /// El camino del logo dentro del bucket. Vacío = sin logo, y entonces en
    /// la página va un punto del color del negocio.
    var logoPath: String = ""

    /// Dónde vive el catálogo. Un solo sitio para todos los negocios: quién es
    /// cada uno lo dice la dirección.
    static let sitio = "https://catalogo.neura.com.py"

    var enlace: String { "\(Self.sitio)/\(direccion)" }

    /// Prender sin WhatsApp no se puede: la vista pública exige el número, así
    /// que el catálogo saldría apagado igual y el negocio no entendería por
    /// qué. Mejor decirlo antes.
    var faltaWhatsapp: Bool { whatsapp.trimmingCharacters(in: .whitespaces).isEmpty }
}
