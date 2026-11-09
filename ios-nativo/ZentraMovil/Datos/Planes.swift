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

    /// En qué orden se muestran: del más chico al más grande.
    static let orden: [Plan] = [.free, .emprendedor, .max]

    /// Lo que suma cada plan, en una línea por cosa.
    ///
    /// No es la grilla completa —esa está en `docs/PLANES.md`—: son las tres o
    /// cuatro cosas por las que alguien cambiaría de plan. Una lista de
    /// veinticuatro filas en una hoja del teléfono no la lee nadie.
    var resumen: [String] {
        switch self {
        case .free:
            ["Inventario hasta 20 productos", "Ventas al contado", "Dashboard de ventas"]
        case .emprendedor:
            ["Inventario hasta 50 productos", "Compras y proveedores",
             "Presupuestos por WhatsApp",
             "Dashboard de compras", "Facturación con auto-impresor"]
        case .max:
            // Sin "Chat de WhatsApp": sólo existe con ERP propio, y con ERP no
            // hay plan. Venderlo en un plan era vender algo que quien lo paga
            // no va a poder usar.
            ["Inventario sin tope y sin espera",
             "Ventas a crédito y compras en dólares",
             "Stock mínimo, código de barras y vencimiento", "Factura electrónica"]
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
    /// El chat de WhatsApp. Sólo existe con ERP propio —los mensajes llegan
    /// por el ERP—, y con ERP no hay plan que mirar. Por eso no figura en lo
    /// que vende ningún plan: sin ERP, Inicio ni siquiera muestra el botón.
    case chatModulo = "chat.modulo"
    /// Armar presupuestos y mandarlos por WhatsApp.
    case presupuestosModulo = "presupuestos.modulo"
    case dashboardInventario = "dashboard.inventario"
    case dashboardCompras = "dashboard.compras"
    case facturacionAutoImpresor = "facturacion.autoImpresor"
    case facturacionElectronica = "facturacion.electronica"

    static let free: [Accion] = [.inventarioAlta, .inventarioAjuste]

    static let emprendedor: [Accion] = [
        .comprasModulo, .presupuestosModulo, .proveedoresModulo, .proveedoresAlta,
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

    /// Si la prueba gratis sigue corriendo.
    ///
    /// El último día cuenta entero, igual que el vencimiento de un plan pago:
    /// quien se registra un lunes la tiene hasta el domingo inclusive. Sin
    /// fecha no hay prueba.
    static func pruebaVigente(_ pruebaHasta: Date?, _ ahora: Date = Date()) -> Bool {
        guard let d = Vencimiento.dias(pruebaHasta, ahora) else { return false }
        return d >= 0
    }

    /// El plan con el que se trabaja, contando la prueba.
    ///
    /// Mientras dura es Max, pague lo que pague: comprar Emprendedor en el
    /// medio de la prueba no puede quitarle lo que estaba usando. Y el
    /// vencimiento se tapa, porque un plan pago vencido de antes bloquearía a
    /// alguien que está probando.
    ///
    /// Terminada la prueba todo vuelve solo a lo de siempre: el plan pago si
    /// lo hay, y si no, el gratis.
    static func conPrueba(plan: Plan, vence: Date?,
                          pruebaHasta: Date?, ahora: Date = Date()) -> (plan: Plan, vence: Date?) {
        pruebaVigente(pruebaHasta, ahora) ? (.max, nil) : (plan, vence)
    }

    /// Qué decir de la suscripción, ya escrito para mostrar.
    ///
    /// `nil` cuando no corresponde mostrarla: con ERP propio no hay plan que
    /// vencer. Devuelve el texto armado y no los datos crudos a propósito —
    /// si cada pantalla tuviera que decidir qué decir según los días que
    /// faltan, terminarían diciendo cosas distintas.
    static func suscripcion(
        conErp: Bool, plan: Plan, vence: Date?, pruebaHasta: Date? = nil,
        ahora: Date = Date()
    ) -> (plan: String, estado: String, detalle: String, urgente: Bool)? {
        if conErp { return nil }

        // En prueba no se habla de vencer ni de renovar. No pagó nada, y
        // "vence en 3 días" a alguien que nunca pagó se lee como una deuda.
        // Se le dice qué tiene, hasta cuándo —con la fecha escrita, no "en 3
        // días"— y qué pasa después, que es lo que quiere saber.
        if pruebaVigente(pruebaHasta, ahora) {
            let d = Vencimiento.dias(pruebaHasta, ahora) ?? 0
            let f = DateFormatter()
            f.dateFormat = "dd/MM/yyyy"
            let hasta = pruebaHasta.map { f.string(from: $0) } ?? ""
            return (Plan.max.nombre,
                    d == 0 ? "Prueba gratis · termina hoy"
                        : d == 1 ? "Prueba gratis · termina mañana"
                        : "Prueba gratis · \(d) días",
                    "Tenés todo lo de Max hasta el \(hasta). Después seguís en tu plan, sin perder nada de lo cargado.",
                    // Nunca en rojo: no debe nada. El rojo es para una deuda.
                    false)
        }

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

    /// Cuáles productos se ven cuando el plan no alcanza para todos.
    ///
    /// Lo que sobra **no se borra**: se esconde, y vuelve solo el día que el
    /// plan lo permita. Alguien que cargó 500 en la prueba de Max y vuelve a
    /// Gratis sigue teniendo sus 500 en la base.
    ///
    /// La regla de cuáles quedan: los fijados primero —son los que el cliente
    /// eligió— y el resto por antigüedad, los que cargó primero. Es la única
    /// que no depende de nada y que se explica en una línea. Cualquier otra
    /// —los más vendidos, los de más stock— cambia sola de un día para el
    /// otro, y un inventario que se reordena mientras uno trabaja no sirve.
    ///
    /// Sin tope están todos: con ERP propio y con el plan que no topea.
    static func visibles(_ productos: [InvProducto], tope: Int?) -> [InvProducto] {
        guard let tope, productos.count > tope else { return productos }

        let orden = productos.sorted { a, b in
            if a.fijado != b.fijado { return a.fijado }
            // Sin fecha va al final: un producto sin `creado_en` es raro, y
            // ante la duda es mejor esconderlo que esconder uno con historia.
            switch (a.creado, b.creado) {
            case let (x?, y?): return x < y
            case (nil, _?): return false
            case (_?, nil): return true
            case (nil, nil): return a.id < b.id
            }
        }
        let aLaVista = Set(orden.prefix(tope).map(\.id))
        // Se devuelven en el orden en que venían, no en el del corte: el
        // listado ya viene ordenado por nombre y reordenarlo acá sería mover
        // el inventario de lugar cada vez que se mira.
        return productos.filter { aLaVista.contains($0.id) }
    }

    /// Cuántos quedaron escondidos. Para decirlo en pantalla: un inventario
    /// que de golpe tiene 20 de los 500 que se cargaron, sin explicación, se
    /// lee como que la app perdió los datos.
    static func escondidos(_ productos: [InvProducto], tope: Int?) -> Int {
        guard let tope else { return 0 }
        return max(productos.count - tope, 0)
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
