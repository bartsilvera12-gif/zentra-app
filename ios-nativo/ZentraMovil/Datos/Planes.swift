import Foundation

/// Los planes de suscripción y qué deja hacer cada uno. Port de `src/lib/planes.ts`.
///
/// Tres reglas de negocio que explican casi todo lo de abajo:
///
///   1. Quien conecta su propio ERP **no tiene plan**: tiene todo. Los planes
///      son para quien usa Zentra sola, con los datos del lado nuestro.
///   2. Al vencer, lo cargado **se sigue viendo**. Lo que se bloquea es
///      escribir. Alguien con 200 productos que cae a Gratis sigue viendo los
///      200: no puede editarlos ni cargar el 201. Son datos suyos.
///   3. Por eso "¿puede?" no es una sola pregunta. Leer siempre se puede; lo
///      que se consulta acá es si puede **escribir**.
///
/// Nada de esto viaja a ningún ERP: el plan vive en el directorio de empresas,
/// que es nuestro, así que agregar planes no obliga a tocar el sistema de
/// ningún cliente.
enum Plan: String, CaseIterable, Codable, Equatable {
    case free, emprendedor, max

    var nombre: String {
        switch self {
        case .free: "Gratis"
        case .emprendedor: "Emprendedor"
        case .max: "Max"
        }
    }

    // El precio NO está acá, igual que en `planes.ts`.
    //
    // Estaba —49.000 y 89.000, escritos a mano— y no lo usaba nadie. El que
    // importa es el de `zentra.planes`, que es de donde lo lee el server que
    // cobra. Un precio en dos lugares es un precio que algún día dice dos
    // cosas distintas, y el que se cobra no es el que la app muestra.

    /// Máximo de productos cargados. `nil` es sin tope.
    var topeProductos: Int? {
        switch self {
        case .free: 20
        case .emprendedor: 50
        case .max: nil
        }
    }

    /// Días entre dos ajustes de stock del mismo producto. `nil` es sin espera.
    ///
    /// El plan dice "1 vez al mes". Se guarda en días y no como "una vez por mes
    /// calendario" porque un ajuste el 31 y otro el 1 serían dos meses distintos
    /// con horas de diferencia, y eso no es lo que se vendió.
    var esperaAjusteDias: Int? {
        switch self {
        case .free, .emprendedor: 30
        case .max: nil
        }
    }

    var permite: Set<Accion> {
        switch self {
        case .free: Set(Accion.free)
        case .emprendedor: Set(Accion.free + Accion.emprendedor)
        case .max: Set(Accion.allCases)
        }
    }
}

/// Lo que una pantalla puede querer hacer y el plan puede negar.
enum Accion: String, CaseIterable {
    case inventarioAlta = "inventario.alta"
    case inventarioEditar = "inventario.editar"
    case inventarioAjuste = "inventario.ajuste"
    case inventarioCategoria = "inventario.categoria"
    case inventarioBarras = "inventario.barras"
    case inventarioMinimo = "inventario.minimo"
    case inventarioMayorista = "inventario.mayorista"
    case inventarioVencimiento = "inventario.vencimiento"
    case ventasCredito = "ventas.credito"
    case comprasModulo = "compras.modulo"
    case comprasDolares = "compras.dolares"
    case comprasNuevoProveedor = "compras.nuevoProveedor"
    case proveedoresModulo = "proveedores.modulo"
    case proveedoresAlta = "proveedores.alta"
    case proveedoresEditar = "proveedores.editar"
    case chatModulo = "chat.modulo"
    case dashboardInventario = "dashboard.inventario"
    case dashboardCompras = "dashboard.compras"
    case facturacionAutoImpresor = "facturacion.autoImpresor"
    case facturacionElectronica = "facturacion.electronica"

    static let free: [Accion] = [.inventarioAlta, .inventarioAjuste]

    static let emprendedor: [Accion] = [
        .comprasModulo, .proveedoresModulo, .proveedoresAlta,
        .dashboardCompras, .facturacionAutoImpresor, .inventarioCategoria,
    ]
}

/// Lo que hay que saber para decidir. Lo arma la pantalla con lo que tiene.
struct ContextoPlan {
    /// La empresa tiene ERP propio. Es la primera pregunta y la que corta.
    var conErp: Bool
    var plan: Plan
    /// Productos ya cargados, para el tope. Sólo hace falta en `inventarioAlta`.
    var productos: Int?
    /// Cuándo se ajustó por última vez ese producto. Para la espera.
    var ultimoAjuste: Date?
    /// Para poder probar la espera sin esperar un mes.
    var ahora: Date = Date()
}

enum Planes {
    /// Si se puede escribir, y si no, por qué.
    ///
    /// Devuelve el motivo en vez de un booleano a propósito: la pantalla tiene
    /// que poder decir *por qué* el botón está apagado. Un botón gris sin
    /// explicación hace que la persona crea que la app se rompió.
    static func motivoBloqueo(_ accion: Accion, _ ctx: ContextoPlan) -> String? {
        // Regla 1: con ERP, todo.
        if ctx.conErp { return nil }

        let plan = ctx.plan
        if !plan.permite.contains(accion) {
            return "Tu plan \(plan.nombre) no incluye esto."
        }

        if accion == .inventarioAlta, let tope = plan.topeProductos {
            let cargados = ctx.productos ?? 0
            if cargados >= tope {
                return "Llegaste a \(tope) productos, el tope del plan \(plan.nombre)."
            }
        }

        if accion == .inventarioAjuste, let espera = plan.esperaAjusteDias,
           let ultimo = ctx.ultimoAjuste {
            let faltan = diasQueFaltan(ultimo, espera, ctx.ahora)
            if faltan > 0 {
                return faltan == 1
                    ? "Ya ajustaste este producto este mes. Podés volver mañana."
                    : "Ya ajustaste este producto este mes. Faltan \(faltan) días."
            }
        }

        return nil
    }

    static func puedeEscribir(_ accion: Accion, _ ctx: ContextoPlan) -> Bool {
        motivoBloqueo(accion, ctx) == nil
    }

    /// Qué decir de la suscripción, ya escrito para mostrar.
    ///
    /// `nil` cuando no corresponde mostrarla: con ERP propio no hay plan que
    /// vencer. Devuelve el texto armado y no los datos crudos a propósito —
    /// si cada pantalla tuviera que decidir qué decir según los días que
    /// faltan, terminarían diciendo cosas distintas.
    static func suscripcion(
        conErp: Bool, plan: Plan, vence: Date?, ahora: Date = Date()
    ) -> (plan: String, estado: String, detalle: String, urgente: Bool)? {
        if conErp { return nil }

        guard let vence else {
            // Sin fecha: nunca pagó. No es un error ni una deuda, es el gratis.
            return plan == .free
                ? (plan.nombre, "Gratis, sin vencimiento",
                   "Pagando un plan se habilitan compras, reportes y el resto de los módulos.",
                   false)
                : (plan.nombre, "Sin fecha de vencimiento",
                   "Tu plan está activo. Si creés que esto no es correcto, escribinos.",
                   false)
        }

        let cal = Calendar.current
        let dias = cal.dateComponents([.day],
                                      from: cal.startOfDay(for: ahora),
                                      to: cal.startOfDay(for: vence)).day ?? 0

        if dias < 0 {
            let d = abs(dias)
            return (plan.nombre,
                    d == 1 ? "Venció ayer" : "Venció hace \(d) días",
                    // Lo que importa no es que venció: es qué se puede seguir
                    // haciendo. Nadie pierde lo cargado, y decirlo evita la
                    // llamada asustada.
                    "Podés seguir viendo todo lo que cargaste, pero no cargar más hasta renovar.",
                    true)
        }
        if dias == 0 {
            return (plan.nombre, "Vence hoy",
                    "Renová para no quedarte sin cargar mañana.", true)
        }

        let f = DateFormatter()
        f.dateFormat = "dd/MM/yyyy"
        return (plan.nombre,
                dias == 1 ? "Vence mañana" : "Vence en \(dias) días",
                "Pagado hasta el \(f.string(from: vence)).",
                // El rojo se guarda para lo que ya venció. Un "vence en 5 días"
                // en rojo es la alarma gritando todos los días.
                dias <= 7)
    }

    /// Cuántos productos más entran: para mostrar "12 de 20" y que el tope
    /// avise antes de llegar, no de golpe cuando ya no se puede.
    static func cupoProductos(_ ctx: ContextoPlan) -> (usados: Int, tope: Int?) {
        (ctx.productos ?? 0, ctx.conErp ? nil : ctx.plan.topeProductos)
    }

    /// Una fecha ilegible se trata como "nunca se ajustó": ante la duda, dejar
    /// trabajar. El plan es un límite comercial, no una medida de seguridad, y
    /// trabar a alguien por un dato mal guardado es peor que dejarlo pasar.
    private static func diasQueFaltan(_ ultimo: Date, _ espera: Int, _ ahora: Date) -> Int {
        let transcurridos = Int(ahora.timeIntervalSince(ultimo) / 86400)
        return max(espera - transcurridos, 0)
    }
}
