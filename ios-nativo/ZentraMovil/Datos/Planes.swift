import Foundation

/// Los planes de suscripción y qué deja hacer cada uno. Port de `src/lib/planes.ts`.
///
/// Tres reglas de negocio que explican casi todo lo de abajo:
///
///   1. Quien conecta su propio ERP **no tiene plan**: tiene todo. Los planes
///      son para quien usa Zentra sola, con los datos del lado nuestro.
///   2. Al vencer, lo cargado **se sigue viendo**. Lo que se bloquea es
///      escribir. Alguien con 200 productos que cae a Básico sigue viendo los
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
        case .free: "Básico"
        case .emprendedor: "Emprendedor"
        case .max: "Max"
        }
    }

    var precioMensual: Int {
        switch self {
        case .free: 0
        case .emprendedor: 49_000
        case .max: 89_000
        }
    }

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
