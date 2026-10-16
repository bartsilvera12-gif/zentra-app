import Foundation

// MARK: - Modelos

enum Iva: String {
    case diez = "10%", cinco = "5%", exenta = "Exenta"

    /// El ERP manda `tipo_iva` como texto libre ("IVA 10%", "EXENTA", "5").
    ///
    /// Acá hubo un bug caro del lado web que no hay que repetir: la primera
    /// versión preguntaba si el texto contenía un "0" para decidir Exenta, y
    /// "IVA 10%" lo contiene — **todos los productos al 10% salían exentos y las
    /// facturas sin IVA**. Por eso se extrae el número y recién ahí se decide.
    static func desde(_ crudo: Any?) -> Iva {
        let t = String(describing: crudo ?? "").uppercased()
        if t.contains("EXEN") || t.contains("EXON") { return .exenta }
        let numero = t.compactMap { $0.isNumber ? $0 : nil }
        let n = Int(String(numero)) ?? 0
        if n == 10 { return .diez }
        if n == 5 { return .cinco }
        return .exenta
    }
}

struct InvProducto: Identifiable, Equatable {
    var id: String
    var nombre: String
    var sku: String
    var barras: String
    var unidad: String
    var costo: Int
    var precio: Int
    /// El de quien compra por cantidad. `nil` cuando no está cargado — ahí se
    /// cobra el de mostrador: cobrar cero sería peor que cobrar de más.
    /// El ERP todavía no lo expone; viene sólo de nuestras tablas.
    var precioMayorista: Int?
    var iva: Iva
    /// No se redondea: se vende por kilo y hay medios kilos.
    var stock: Double
    var minimo: Double
}

struct VentaLinea: Equatable {
    var nombre: String
    var qty: Double
    var precio: Int
    /// El de quien compra por cantidad. `nil` cuando no está cargado — ahí se
    /// cobra el de mostrador: cobrar cero sería peor que cobrar de más.
    /// El ERP todavía no lo expone; viene sólo de nuestras tablas.
    var precioMayorista: Int?
    var iva: Iva
}

struct Venta: Identifiable, Equatable {
    var id: String
    /// `yyyy-mm-dd`
    var iso: String
    var numero: String
    var cliente: String
    var doc: String
    var pago: String
    /// Sólo "Cobrada" o "Pendiente": es lo único que la app distingue.
    var cobrada: Bool
    var lineas: [VentaLinea]

    var total: Int {
        lineas.reduce(0) { $0 + Int((Double($1.precio) * $1.qty).rounded()) }
    }
}

struct Cliente: Identifiable, Equatable {
    var id: String
    var nombre: String
    var doc: String
    var contacto: String
    var tel: String
    var email: String
    var zona: String
    var direccion: String
    var lista: String
    var activo: Bool
}

struct Proveedor: Identifiable, Equatable {
    var id: String
    var nombre: String
    var doc: String
    var condicion: String
    var rubro: String
    var ciudad: String
    var contacto: String
    var tel: String
    var email: String
    var activo: Bool
}

struct Compra: Identifiable, Equatable {
    var id: String
    var numero: String
    var producto: String
    var cantidad: Double
    var costo: Int
    var iva: Iva
    var pago: String
    var pagada: Bool
    var fecha: String
    var factura: String
}

struct Mensaje: Identifiable, Equatable {
    var id = UUID()
    var mio: Bool
    var texto: String
    var hora: String
    /// "✓" entregado, "✓✓" leído. Vacío en los que llegan.
    var tick: String

    /// El id del mensaje **en WhatsApp**, no el de la base. Es el que hace falta
    /// para citarlo o reaccionarle.
    var wamid: String = ""

    /// Cuando no está vacío, esto no es un mensaje: es un emoji colgando de otro.
    var reaccion: String = ""
    /// De qué lado se dibuja la reacción: la del mensaje **al que reacciona**,
    /// no la de quien reaccionó. Si un cliente le pone un pulgar a algo que
    /// escribí yo, el emoji va a la derecha, con mi mensaje.
    var reaccionSobreMio: Bool = false

    /// Adjuntos. Sólo uno de los tres por mensaje.
    var imagen: String = ""
    var video: String = ""
    var documento: String = ""
    var audio: String = ""
    /// El texto que acompaña a una foto. Una foto con pie lleva globo; sin pie,
    /// la imagen va sola.
    var epigrafe: String = ""
    var sticker: String = ""

    /// A qué mensaje responde éste, ya resumido para dibujarlo arriba del globo.
    var citaTexto: String = ""
    var citaMia: Bool = false
    var reenviado: Bool = false

    var esMedia: Bool { !imagen.isEmpty || !video.isEmpty || !documento.isEmpty || !audio.isEmpty }
}

struct FichaContacto {
    var nombre: String
    var telefono: String
    var lineas: [(String, String)]
}

struct Destino: Identifiable, Hashable {
    var id: String
    var nombre: String
    var esAgente: Bool
}

/// Lo que el ERP contesta al registrar el teléfono.
struct DispositivoAlta {
    /// Si este usuario está dado de alta como **agente** de conversaciones.
    ///
    /// El ERP elige a quién mandarle el aviso de un chat por su `agent_id`. Un
    /// usuario que no es agente no tiene ninguno, así que no le va a llegar
    /// jamás un aviso de chat — por más que el interruptor esté prendido, el
    /// permiso dado y el token guardado. `nil` cuando el ERP no lo informa:
    /// entonces no se afirma nada.
    var esAgente: Bool?
}

/// Una línea de una compra. Port de `CompraLinea` en `src/lib/types.ts`.
///
/// La compra lleva varias: un remito trae seis productos del mismo proveedor y
/// con la misma factura. Cargarlos como seis compras rompe el libro de compras
/// —seis facturas con el mismo número— y el asiento contable.
struct CompraLinea: Identifiable, Equatable {
    var prodId: String
    var nombre: String
    var unidad: String
    var cantidad: Double
    /// Sin IVA: el proveedor cotiza neto y el impuesto va por encima.
    var costo: Int
    var iva: Iva

    /// `prodId` no sirve de id: el mismo producto puede ir dos veces en la
    /// misma compra, con costos distintos por lote.
    let id = UUID()

    /// Lo que suma esta línea, con su IVA.
    var subtotal: Int {
        Int((Double(costo) * cantidad * (1 + RepoERP.tasa(iva))).rounded())
    }
}

struct Chat: Identifiable, Equatable {
    var id: String
    var nombre: String
    var hora: String
    var noLeidos: Int
    var vistaPrevia: String

    /// Quién atiende la conversación: el agente asignado o, si no hay, la cola.
    ///
    /// Tres estados, no dos. `nil` es "este ERP no informa de quién es", y
    /// entonces la etiqueta no se dibuja: poner "Sin asignar" en todas sería
    /// afirmar algo que no sabemos. `.some(nil)` —acá, cadena vacía— sí es "no
    /// la tomó nadie", y eso sólo se puede decir si el ERP mandó el campo.
    var responsable: String?
    /// Si el ERP informó el campo del responsable, aunque viniera vacío.
    var informaResponsable: Bool = false

    /// La cola de atención del ERP ("Ventas", "Soporte"). Vacío es "este ERP no
    /// informa la cola", y entonces el listado no se divide en pestañas.
    ///
    /// Va aparte del responsable: el responsable es una etiqueta y la cola
    /// divide el listado, así que no pueden compartir campo.
    var cola: String = ""

    /// Cerrada en el ERP: alguien la finalizó y la tipificó.
    ///
    /// No se mezclan con las abiertas: compiten por los mismos lugares de cada
    /// tanda y taparían lo que hay que atender. Tienen su propio filtro.
    var cerrada: Bool = false
}

// MARK: - Repo

/// Lectura contra la API del ERP. Port de los mapeos de `src/lib/repo/http.ts`.
///
/// Los nombres de campo son los del ERP y no los nuestros: `stock_actual`,
/// `precio_venta`, `numero_control`. Van copiados textualmente de la
/// implementación web, que está verificada contra dos ERPs distintos.
enum RepoERP {
    /// Cuál es la fuente de datos de la empresa activa.
    ///
    /// Tener `apiUrl` es lo que distingue a una empresa con ERP propio: ahí las
    /// ventas las registra el ERP, con su numeración, su caja y su asiento
    /// contable. Sin `apiUrl` la empresa usa nuestras tablas por PostgREST.
    ///
    /// Se resuelve en cada llamada y no al arrancar: cuando se carga este
    /// archivo todavía no hubo login y no se sabe de qué empresa es quien entra.
    private static func conErp() async -> Bool {
        !((await Auth.shared.tenantActivo()?.apiUrl) ?? "").isEmpty
    }

    static func inventario(q: String? = nil) async throws -> [InvProducto] {
        if await !conErp() { return try await SupabaseDatos.inventario() }
        let crudo = try await ApiERP.get("/productos", query: ["q": q]) { $0 }
        return try ApiERP.comoLista(crudo, clave: "productos", ruta: "/productos").map(aProducto)
    }

    static func clientes(q: String? = nil) async throws -> [Cliente] {
        if await !conErp() { return try await SupabaseDatos.clientes() }
        let crudo = try await ApiERP.get("/clientes", query: ["q": q]) { $0 }
        return try ApiERP.comoLista(crudo, clave: "clientes", ruta: "/clientes").map(aCliente)
    }

    static func ventas(desde: String, hasta: String) async throws -> [Venta] {
        if await !conErp() { return try await SupabaseDatos.ventas(desde: desde, hasta: hasta) }
        let crudo = try await ApiERP.get("/ventas", query: ["desde": desde, "hasta": hasta]) { $0 }
        return try ApiERP.comoLista(crudo, clave: "ventas", ruta: "/ventas").map(aVenta)
    }

    static func proveedores(q: String? = nil) async throws -> [Proveedor] {
        if await !conErp() { return try await SupabaseDatos.proveedores() }
        let crudo = try await ApiERP.get("/proveedores", query: ["q": q]) { $0 }
        return try ApiERP.comoLista(crudo, clave: "proveedores", ruta: "/proveedores").map(aProveedor)
    }

    static func compras(q: String? = nil) async throws -> [Compra] {
        if await !conErp() { return try await SupabaseDatos.compras() }
        let crudo = try await ApiERP.get("/compras", query: ["q": q]) { $0 }
        return try ApiERP.comoLista(crudo, clave: "compras", ruta: "/compras").map(aCompra)
    }

    /// Conversaciones. Se prueban dos endpoints, en este orden.
    ///
    /// `/chat/mobile-inbox` respeta el **rol**: un administrador ve todas, igual
    /// que en el escritorio. El otro filtra por **cola de atención**, y un
    /// administrador no está en ninguna — veía "no atendés conversaciones"
    /// aunque en el ERP las tuviera todas delante.
    ///
    /// El respaldo sólo entra si el primero no existe o no está permitido
    /// (401/403/404). Un error de forma no se tapa: si contestó pero con otra
    /// estructura, el problema es ese y hay que verlo.
    static func conversaciones() async throws -> [Chat] {
        // El chat es de WhatsApp y vive en el ERP. Sin ERP no hay nada que leer,
        // y decirlo es mejor que una lista vacía que parece "no tenés mensajes".
        if await !conErp() { throw ApiError.sinChat }
        do {
            let crudo = try await ApiERP.get("/chat/mobile-inbox") { $0 }
            return try ApiERP.comoLista(crudo, clave: "conversations",
                                        ruta: "/chat/mobile-inbox").map(aChat)
        } catch let e as ApiError {
            if case .http(let status, _, _) = e, ![401, 403, 404].contains(status) { throw e }
        }

        let crudo = try await ApiERP.get("/mobile/asesor/conversations") { $0 }
        // `is_agent: false` no es "no tenés conversaciones": es que este usuario
        // no está en ninguna cola. Son cosas distintas y se dicen distinto.
        if let o = crudo as? [String: Any],
           ((o["data"] as? [String: Any])?["is_agent"] as? Bool ?? o["is_agent"] as? Bool) == false {
            throw ApiError.sinCola
        }
        return try ApiERP.comoLista(crudo, clave: "conversations",
                                    ruta: "/mobile/asesor/conversations").map(aChat)
    }

    /// Guarda el token de Firebase de este teléfono para el usuario de la sesión.
    /// Se llama en cada entrada: el token cambia al reinstalar la app.
    @discardableResult
    static func registrarDispositivo(_ token: String) async throws -> DispositivoAlta {
        let r = try await ApiERP.post("/cc/agent/device-token", cuerpo: [
            "fcm_token": token, "platform": "ios",
            "app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1.0",
        ])
        let o = (r as? [String: Any])?["data"] as? [String: Any] ?? (r as? [String: Any]) ?? [:]
        return DispositivoAlta(esAgente: (o["is_agent"] as? Bool) ?? (o["es_agente"] as? Bool))
    }

    static func bajaDispositivo(_ token: String) async throws {
        _ = try await ApiERP.post("/cc/agent/device-token/deactivate",
                                  cuerpo: ["fcm_token": token])
    }

    static func cliente(_ id: String) async throws -> Cliente? {
        let crudo = try await ApiERP.get("/clientes/\(esc(id))") { $0 }
        guard let o = desenvolver(crudo) else { return nil }
        return aCliente(o)
    }

    static func producto(_ id: String) async throws -> InvProducto? {
        let crudo = try await ApiERP.get("/productos/\(esc(id))") { $0 }
        guard let o = desenvolver(crudo) else { return nil }
        return aProducto(o)
    }

    static func venta(_ id: String) async throws -> Venta? {
        let crudo = try await ApiERP.get("/ventas/\(esc(id))") { $0 }
        guard let o = desenvolver(crudo) else { return nil }
        return aVenta(o)
    }

    /// Alta de cliente. Lleva clave de intento: si se reintenta sin señal, no
    /// se crea el mismo cliente dos veces.
    static func crearCliente(_ campos: [String: Any]) async throws -> Cliente {
        if await !conErp() { return try await SupabaseDatos.crearCliente(campos) }
        let r = try await ApiERP.post("/clientes", cuerpo: campos,
                                      idempotencia: UUID().uuidString)
        return aCliente(desenvolver(r) ?? [:])
    }

    /// Consulta de RUC/CI en la SET. nil si no se encuentra.
    static func consultarSet(_ doc: String) async throws -> (razonSocial: String, activo: Bool)? {
        let crudo = try await ApiERP.get("/set/\(esc(doc))") { $0 }
        guard let o = desenvolver(crudo),
              let razon = primero(o["razonSocial"], o["razon_social"], o["nombre"])
        else { return nil }
        let activo = (o["activo"] as? Bool) ?? true
        return (razon, activo)
    }

    /// Mensajes de una conversación.
    static func mensajes(_ chatId: String) async throws -> [Mensaje] {
        let crudo = try await ApiERP.get("/mobile/asesor/conversations/\(esc(chatId))") { $0 }
        var nivel = crudo
        if let o = nivel as? [String: Any], let d = o["data"] { nivel = d }
        let msgs = (nivel as? [String: Any])?["messages"] as? [[String: Any]] ?? []
        return msgs.compactMap(aMensaje)
    }

    /// Manda un mensaje. Con `cita` responde a uno puntual, como el "Responder"
    /// de WhatsApp.
    ///
    /// El `wamid` va a WhatsApp y es lo que hace que del otro lado se vea el
    /// mensaje citado arriba de la respuesta. El contexto es el resumen con el
    /// que el ERP la dibuja en su pantalla sin ir a buscar el mensaje.
    static func enviarMensaje(
        _ chatId: String, texto: String,
        cita: (wamid: String, texto: String, mio: Bool)? = nil
    ) async throws {
        var cuerpo: [String: Any] = ["message": texto]
        if let cita, !cita.wamid.isEmpty {
            cuerpo["reply_to_wamid"] = cita.wamid
            cuerpo["reply_context"] = [
                "wa_message_id": cita.wamid,
                "from_me": cita.mio,
                "preview": String(cita.texto.prefix(160)),
            ]
        }
        _ = try await ApiERP.post("/mobile/asesor/conversations/\(esc(chatId))/send",
                                  cuerpo: cuerpo)
    }

    /// Manda una foto, un video o un documento, con su pie opcional.
    static func enviarArchivo(
        _ chatId: String, datos: Data, nombre: String, tipo: String, pie: String = ""
    ) async throws {
        try await ApiERP.subir("/mobile/asesor/conversations/\(esc(chatId))/send-media",
                               datos: datos, nombre: nombre, tipo: tipo,
                               campos: pie.isEmpty ? [:] : ["caption": pie])
    }

    /// Reacciona con un emoji. Con `emoji` vacío la saca, que es como lo
    /// entiende WhatsApp. El `wamid` es el id del mensaje en WhatsApp, no el
    /// de la base.
    static func reaccionar(_ chatId: String, wamid: String, emoji: String) async throws {
        _ = try await ApiERP.post("/mobile/asesor/conversations/\(esc(chatId))/react",
                                  cuerpo: ["target_wa_message_id": wamid, "emoji": emoji])
    }

    /// Marcar como leído: alcanza con abrir la conversación. Si falla no se
    /// avisa — el contador baja en el próximo intento y no es para molestar.
    static func marcarLeido(_ chatId: String) async {
        _ = try? await ApiERP.crudo("/mobile/asesor/conversations/\(esc(chatId))")
    }

    /// A dónde se puede transferir: las colas y los agentes que esta persona
    /// alcanza.
    static func destinos(_ chatId: String) async -> (colas: [Destino], agentes: [Destino]) {
        guard let r = try? await ApiERP.crudo(
            "/mobile/asesor/conversations/\(esc(chatId))/transfer") as? [String: Any]
        else { return ([], []) }
        let nivel = (r["data"] as? [String: Any]) ?? r

        func leer(_ clave: String, agente: Bool) -> [Destino] {
            let filas = (nivel[clave] as? [[String: Any]]) ?? []
            return filas.compactMap { f in
                // Una cola apagada no es un destino válido.
                if !agente, (f["is_active"] as? Bool) == false { return nil }
                let id = texto(f["id"])
                guard !id.isEmpty else { return nil }
                return Destino(id: id,
                               nombre: primero(f["nombre"], f["name"]) ?? "Sin nombre",
                               esAgente: agente)
            }
        }
        return (leer("queues", agente: false), leer("agents", agente: true))
    }

    /// Transferir: a una cola, o a un agente concreto. Uno de los dos.
    static func transferir(_ chatId: String, a destino: Destino) async throws {
        let cuerpo: [String: Any] = destino.esAgente
            ? ["agent_id": destino.id] : ["queue_id": destino.id]
        _ = try await ApiERP.post("/mobile/asesor/conversations/\(esc(chatId))/transfer",
                                  cuerpo: cuerpo)
    }

    /// Quién es el contacto. `nil` cuando el ERP no tiene ficha para esa
    /// conversación; un error de red o permisos se lanza, para que la pantalla
    /// lo diga en vez de esconderlo detrás de una ficha vacía.
    static func fichaContacto(_ chatId: String) async throws -> FichaContacto? {
        let crudo = try await ApiERP.crudo("/chat/contactos/ficha",
                                           query: ["conversation_id": chatId])
        guard let o = desenvolver(crudo) else { return nil }
        let c = (o["contacto"] as? [String: Any]) ?? o
        let nombre = primero(c["nombre"], c["nombre_contacto"], c["razon_social"]) ?? ""
        let tel = primero(c["telefono"], c["phone"]) ?? ""
        guard !nombre.isEmpty || !tel.isEmpty else { return nil }

        var lineas: [(String, String)] = []
        for (k, etiqueta) in [("ruc", "RUC"), ("email", "Correo"), ("ciudad", "Ciudad"),
                              ("tipo_cliente", "Lista"), ("estado", "Estado")] {
            if let v = noVacio(c[k]) { lineas.append((etiqueta, v)) }
        }
        return FichaContacto(nombre: nombre.isEmpty ? tel : nombre, telefono: tel, lineas: lineas)
    }

    private static func esc(_ s: String) -> String {
        s.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? s
    }

    /// Saca el objeto venga pelado, en `data`, o anidado bajo su nombre.
    private static func desenvolver(_ crudo: Any) -> [String: Any]? {
        guard var o = crudo as? [String: Any] else { return nil }
        if let d = o["data"] as? [String: Any] { o = d }
        for k in ["cliente", "producto", "venta", "conversation", "usuario"] {
            if let dentro = o[k] as? [String: Any] { return dentro }
        }
        return o.isEmpty ? nil : o
    }

    // MARK: - Escrituras que el ERP ya acepta
    //
    // Hasta hace unos dias estas tres figuraban como `pendiente()` y los
    // formularios guardaban en memoria. Ya no: ahora se registran de verdad.

    /// Un campo opcional del cuerpo JSON.
    ///
    /// El ERP distingue "no mandado" de "vacío": un `""` puede pisar un dato que
    /// ya tenía, y `null` es lo que entiende como "sin valor". Va en un helper
    /// porque escrito como ternario, Swift no sabe inferir el tipo entre
    /// `NSNull` y `String` y el diccionario entero deja de compilar.
    private static func onull(_ v: String) -> Any {
        v.trimmingCharacters(in: .whitespaces).isEmpty ? NSNull() : v
    }

    private static func onull(_ v: Int?) -> Any { v.map { $0 as Any } ?? NSNull() }

    struct Opcion: Identifiable, Hashable {
        var id: String
        var nombre: String
    }

    /// Catálogos auxiliares del ERP. Si fallan se devuelve vacío en vez de
    /// tirar la pantalla: un producto sin categoría se muestra igual.
    static func catalogo(_ ruta: String, _ clave: String) async -> [Opcion] {
        guard let crudo = try? await ApiERP.crudo(ruta),
              let filas = try? ApiERP.comoLista(crudo, clave: clave, ruta: ruta)
        else { return [] }
        return filas.compactMap { f in
            let id = texto(f["id"])
            guard !id.isEmpty else { return nil }
            return Opcion(id: id, nombre: noVacio(f["nombre"]) ?? id)
        }
    }

    static func categorias() async -> [Opcion] {
        await catalogo("/inventario/categorias", "categorias")
    }
    static func ubicaciones() async -> [Opcion] {
        await catalogo("/inventario/ubicaciones", "ubicaciones")
    }
    static func categoriasProveedor() async -> [Opcion] {
        await catalogo("/proveedores/categorias", "categorias")
    }

    /// Las cuentas del plan contable, para asentar una compra.
    static func cuentasContables() async -> [Opcion] {
        guard let crudo = try? await ApiERP.crudo("/plan-cuentas/opciones"),
              let filas = try? ApiERP.comoLista(crudo, clave: "cuentas",
                                                ruta: "/plan-cuentas/opciones")
        else { return [] }
        return filas.compactMap { c in
            let id = texto(c["id"])
            guard !id.isEmpty else { return nil }
            let codigo = noVacio(c["cuenta"]) ?? ""
            let nombre = noVacio(c["denominacion"]) ?? "(sin denominación)"
            return Opcion(id: id, nombre: codigo.isEmpty ? nombre : "\(codigo) · \(nombre)")
        }
    }

    static func crearProducto(
        nombre: String, sku: String, barras: String, unidad: String,
        costo: Int, precio: Int, stockInicial: Double, minimo: Double,
        categoriaId: String?, ubicacionId: String?
    ) async throws -> InvProducto {
        var cuerpo: [String: Any] = [
            "nombre": nombre, "sku": sku,
            "codigo_barras": onull(barras),
            "unidad_medida": unidad.isEmpty ? "UNIDAD" : unidad,
            "costo_promedio": costo, "precio_venta": precio,
            "stock_actual": stockInicial, "stock_minimo": minimo,
            "metodo_valuacion": "CPP",
        ]
        if let categoriaId, !categoriaId.isEmpty { cuerpo["categoria_principal_id"] = categoriaId }
        if let ubicacionId, !ubicacionId.isEmpty { cuerpo["ubicacion_principal_id"] = ubicacionId }

        let r = try await ApiERP.post("/productos", cuerpo: cuerpo)
        guard let o = desenvolver(r) else {
            throw ApiError.http(status: 200, mensaje: "El ERP no devolvió el producto creado.",
                                ruta: "/productos")
        }
        return aProducto(o)
    }

    static func crearProveedor(
        nombre: String, ruc: String, tel: String, email: String,
        direccion: String, contacto: String, credito: Bool, plazoDias: Int,
        categoriaIds: [String]
    ) async throws -> Proveedor {
        let cuerpo: [String: Any] = [
            "nombre": nombre,
            "ruc": onull(ruc),
            "telefono": onull(tel),
            "email": onull(email),
            "direccion": onull(direccion),
            "contacto": onull(contacto),
            "condicion_pago": credito ? "credito" : "contado",
            "plazo_pago_dias": onull(credito ? plazoDias : nil),
            "categoria_ids": categoriaIds,
        ]
        let r = try await ApiERP.post("/proveedores", cuerpo: cuerpo)
        guard let o = desenvolver(r) else {
            throw ApiError.http(status: 200, mensaje: "El ERP no devolvió el proveedor creado.",
                                ruta: "/proveedores")
        }
        return aProveedor(o)
    }

    /// Registra la compra. Las dos cuentas son del ERP y no decorativas: sin
    /// ellas no puede asentar el movimiento contable, y lo rechaza.
    static func crearCompra(
        provId: String, provNombre: String,
        lineas: [CompraLinea],
        credito: Bool, plazoDias: Int, cuotas: Int,
        timbrado: String, comprobante: String,
        cuentaContableId: String, cuentaPagoId: String,
        moneda: String = "PYG", tipoCambio: Double = 1
    ) async throws -> Compra {
        guard !lineas.isEmpty else {
            throw ApiError.http(
                status: 400,
                mensaje: "Agregá al menos un producto a la compra.",
                ruta: "/compras")
        }
        guard !cuentaContableId.isEmpty else {
            throw ApiError.http(
                status: 400,
                mensaje: "Elegí la cuenta contable de la compra: tu ERP la necesita para asentarla.",
                ruta: "/compras")
        }
        guard credito || !cuentaPagoId.isEmpty else {
            throw ApiError.http(
                status: 400,
                mensaje: "Elegí la cuenta de pago: una compra al contado tiene que decir de dónde salió la plata.",
                ruta: "/compras")
        }

        let cuerpo: [String: Any] = [
            "proveedor_id": provId, "proveedor_nombre": provNombre,
            "origen_compra": "directa",
            // En dólares el ERP necesita las dos cosas: la moneda en la que se
            // pactó y a cuánto, porque los libros se llevan en guaraníes.
            "moneda": moneda, "tipo_cambio": moneda == "PYG" ? 1 : tipoCambio,
            "tipo_pago": credito ? "credito" : "contado",
            "plazo_dias": onull(credito ? plazoDias : nil),
            "cuotas": onull(credito ? cuotas : nil),
            "nro_timbrado": timbrado,
            "numero_comprobante": onull(comprobante),
            "tipo_comprobante": "Factura",
            "cuenta_contrapartida_id": credito ? NSNull() : onull(cuentaPagoId),
            "items": lineas.map { l in
                [
                    "producto_id": l.prodId, "producto_nombre": l.nombre,
                    "descripcion": l.nombre, "cantidad": l.cantidad,
                    "costo_unitario": l.costo, "iva_tipo": ivaDeCompra(l.iva),
                    "cuenta_contable_id": cuentaContableId,
                ]
            },
            "idempotency_key": UUID().uuidString,
        ]
        let r = try await ApiERP.post("/compras", cuerpo: cuerpo)
        guard let o = desenvolver(r) else {
            throw ApiError.http(status: 200, mensaje: "El ERP no devolvió la compra registrada.",
                                ruta: "/compras")
        }
        return aCompra(o)
    }

    /// En compras el ERP quiere el IVA como "10" / "5" / "exenta".
    private static func ivaDeCompra(_ i: Iva) -> String {
        switch i { case .diez: "10"; case .cinco: "5"; case .exenta: "exenta" }
    }

    /// Movimientos de stock reales, que antes eran sólo los de la sesión.
    static func movimientos(prodId: String? = nil) async throws -> [[String: Any]] {
        let crudo = try await ApiERP.crudo("/inventario/movimientos",
                                           query: ["producto_id": prodId])
        return try ApiERP.comoLista(crudo, clave: "movimientos", ruta: "/inventario/movimientos")
    }

    /// Registra la venta en el ERP. Devuelve el número que asignó el servidor.
    ///
    /// **El IVA va contenido en el precio**, que es como se factura en Paraguay:
    /// de ₲33.500 al 10% el impuesto son ₲3.045, no ₲3.350. Calcularlo por encima
    /// inflaría cada factura.
    ///
    /// Los totales van aparte de las líneas y son obligatorios: el ERP hace
    /// `Number(subtotal)` y si sale NaN corta con "Totales inválidos.". No son
    /// decorativos — son los que guarda, así que tienen que ser la suma exacta de
    /// las líneas o la venta queda con un total que no cierra.
    static func crearVenta(
        clienteId: String?,
        lineas: [(producto: InvProducto, cantidad: Double)],
        credito: Bool,
        plazoDias: Int,
        metodo: String,
        cliente: Cliente? = nil
    ) async throws -> String {
        if await !conErp() {
            return try await SupabaseDatos.crearVenta(
                clienteId: clienteId, cliente: cliente, lineas: lineas,
                credito: credito, plazoDias: plazoDias, metodo: metodo)
        }
        var items: [[String: Any]] = []
        var subtotal = 0, montoIva = 0, total = 0

        for l in lineas {
            let bruto = Int((Double(l.producto.precio) * l.cantidad).rounded())
            let r = tasa(l.producto.iva)
            let iva = Int((Double(bruto) * r / (1 + r)).rounded())
            items.append([
                "producto_id": l.producto.id,
                "producto_nombre": l.producto.nombre,
                "sku": l.producto.sku,
                "cantidad": l.cantidad,
                "precio_venta_original": l.producto.precio,
                "precio_venta": l.producto.precio,
                "tipo_iva": paraErp(l.producto.iva),
                "subtotal": bruto - iva,
                "monto_iva": iva,
                "total_linea": bruto,
            ])
            subtotal += bruto - iva; montoIva += iva; total += bruto
        }

        var cuerpo: [String: Any] = [
            "items": items,
            "subtotal": subtotal, "monto_iva": montoIva, "total": total,
            // El ERP llama GS a los guaraníes, la app PYG.
            "moneda": "GS",
            "tipo_venta": credito ? "CREDITO" : "CONTADO",
        ]
        if let clienteId { cuerpo["cliente_id"] = clienteId }
        if credito { cuerpo["plazo_dias"] = plazoDias } else { cuerpo["metodo_pago"] = metodo }

        let r = try await ApiERP.post("/ventas/create", cuerpo: cuerpo,
                                      idempotencia: UUID().uuidString)
        let o = (r as? [String: Any])?["data"] as? [String: Any] ?? (r as? [String: Any]) ?? [:]
        let v = (o["venta"] as? [String: Any]) ?? o
        return noVacio(v["numero_control"]) ?? noVacio(v["id"]) ?? "registrada"
    }

    static func tasa(_ i: Iva) -> Double {
        switch i { case .diez: 0.10; case .cinco: 0.05; case .exenta: 0 }
    }

    private static func paraErp(_ i: Iva) -> String {
        switch i { case .diez: "10%"; case .cinco: "5%"; case .exenta: "EXENTA" }
    }

    // MARK: mapeos

    private static func aProveedor(_ p: [String: Any]) -> Proveedor {
        let credito = (noVacio(p["condicion_pago"]) ?? "").lowercased().contains("credito")
        let cats = (p["categorias"] as? [[String: Any]])?.compactMap { noVacio($0["nombre"]) } ?? []
        return Proveedor(
            id: texto(p["id"]),
            nombre: primero(p["nombre"], p["nombre_comercial"], p["razon_social"]) ?? "Sin nombre",
            doc: noVacio(p["ruc"]) ?? "Sin documento",
            condicion: credito ? "Crédito \(texto(p["plazo_pago_dias"])) días" : "Contado",
            // Las categorías del ERP hacen de rubro. Si no tiene, no se inventa.
            rubro: cats.joined(separator: ", "),
            ciudad: noVacio(p["direccion"]) ?? "",
            contacto: noVacio(p["contacto"]) ?? "",
            tel: noVacio(p["telefono"]) ?? "",
            email: noVacio(p["email"]) ?? "",
            activo: (noVacio(p["estado"]) ?? "").lowercased() != "inactivo"
        )
    }

    private static func aCompra(_ c: [String: Any]) -> Compra {
        let credito = (noVacio(c["tipo_pago"]) ?? "").lowercased().contains("cred")
        let estado = (noVacio(c["estado"]) ?? "").lowercased()
        return Compra(
            id: texto(c["id"]),
            numero: noVacio(c["numero_control"]) ?? String(texto(c["id"]).prefix(8)),
            producto: noVacio(c["producto_nombre"]) ?? "(sin nombre)",
            cantidad: numero(c["cantidad"]),
            costo: entero(c["costo_unitario"]),
            iva: Iva.desde(c["iva_tipo"]),
            pago: credito ? "Crédito" : "Contado",
            // Lo que el ERP no da por pagado queda pendiente: al revés se deja
            // de pagarle a un proveedor.
            pagada: ["pagad", "cerrad", "complet"].contains { estado.contains($0) },
            fecha: String((noVacio(c["fecha"]) ?? "").prefix(10)),
            factura: noVacio(c["numero_comprobante"]) ?? ""
        )
    }

    private static func hora(_ v: Any?) -> String {
        String((noVacio(v) ?? "").suffix(14).prefix(5))
    }

    private static func aMensaje(_ m: [String: Any]) -> Mensaje? {
        let tipo = (noVacio(m["message_type"]) ?? "text").lowercased()
        let mio = (m["from_me"] as? Bool) ?? false
        let crudo = m["raw_payload"] as? [String: Any] ?? [:]

        var base = Mensaje(mio: mio, texto: "", hora: hora(m["created_at"]), tick: "")
        base.wamid = noVacio(m["wa_message_id"]) ?? ""
        if let c = cita(crudo) {
            base.citaTexto = c.texto
            base.citaMia = c.mio
        }
        base.reenviado = (crudo["forwarded"] as? Bool)
            ?? ((crudo["context"] as? [String: Any])?["forwarded"] as? Bool) ?? false

        // Una reacción es un emoji sobre otro mensaje, no un mensaje.
        if tipo.contains("reaction") {
            let datos = (crudo["reaction"] as? [String: Any]) ?? (m["reaction"] as? [String: Any])
            let emoji = (noVacio(datos?["emoji"]) ?? noVacio(datos?["text"])
                         ?? noVacio(m["content"]) ?? "")
            // Un emoji vacío NO es un error: WhatsApp manda una reacción vacía
            // cuando alguien la quita. Lo que corresponde es no dibujar nada.
            if emoji.isEmpty { return nil }
            base.reaccion = emoji
            base.reaccionSobreMio = (datos?["sobreMio"] as? Bool) ?? mio
            return base
        }

        let contenido = noVacio(m["content"]) ?? ""
        let url = urlDeMedia(crudo) ?? urlEnTexto(contenido)
        let epigrafe = noVacio((crudo["caption"])) ?? (url == nil ? contenido : "")

        if tipo.contains("sticker") {
            if let url { base.imagen = url; base.sticker = " " }
            else { base.sticker = contenido.count <= 4 && !contenido.isEmpty ? contenido : "" }
        } else if tipo.contains("image") {
            if let url { base.imagen = url; base.epigrafe = epigrafe }
            else { base.texto = epigrafe.isEmpty ? "Foto" : epigrafe }
        } else if tipo.contains("video") {
            if let url { base.video = url; base.epigrafe = epigrafe }
            else { base.texto = epigrafe.isEmpty ? "Video" : epigrafe }
        } else if tipo.contains("audio") || tipo.contains("voice") {
            if let url { base.audio = url } else { base.texto = "Audio" }
        } else if tipo.contains("document") {
            if let url { base.documento = url; base.epigrafe = epigrafe }
            else { base.texto = epigrafe.isEmpty ? "Documento" : epigrafe }
        } else {
            base.texto = contenido
        }

        if mio {
            let estado = (noVacio(m["whatsapp_delivery_status"]) ?? "").lowercased()
            base.tick = estado.contains("read") ? "✓✓" : "✓"
        }
        return base
    }

    /// A qué mensaje responde éste. WhatsApp lo manda en el contexto del sobre.
    private static func cita(_ crudo: [String: Any]) -> (texto: String, mio: Bool)? {
        let ctx = (crudo["context"] as? [String: Any]) ?? (crudo["quoted"] as? [String: Any])
        guard let ctx else { return nil }
        let texto = noVacio(ctx["preview"]) ?? noVacio(ctx["body"]) ?? noVacio(ctx["text"]) ?? ""
        guard !texto.isEmpty else { return nil }
        return (texto, (ctx["from_me"] as? Bool) ?? false)
    }

    private static func urlDeMedia(_ crudo: [String: Any]) -> String? {
        for k in ["media_url", "url", "link", "file_url"] {
            if let u = noVacio(crudo[k]) { return u }
        }
        if let a = crudo["media"] as? [String: Any] {
            for k in ["url", "link"] { if let u = noVacio(a[k]) { return u } }
        }
        return nil
    }

    /// Algunos sobres mandan la media como una URL suelta adentro del texto.
    private static func urlEnTexto(_ t: String) -> String? {
        guard let r = t.range(of: #"https?://\S+"#, options: .regularExpression) else { return nil }
        return String(t[r])
    }

    private static func aChat(_ c: [String: Any]) -> Chat {
        let informaResp = c["agente_nombre"] != nil || c["cola_nombre"] != nil
        return Chat(
            id: texto(c["id"]),
            nombre: primero(c["contact_nombre"], c["contact_telefono"]) ?? "Sin nombre",
            hora: String((noVacio(c["last_message_at"]) ?? "").suffix(14).prefix(5)),
            noLeidos: cuantosSinLeer(c),
            vistaPrevia: vistaPrevia(noVacio(c["last_message_preview"]) ?? ""),
            responsable: primero(c["agente_nombre"], c["cola_nombre"]),
            informaResponsable: informaResp,
            cola: primero(c["cola_nombre"], c["queue_nombre"], c["cola"]) ?? "",
            // El ERP usa "closed"; se mira por prefijo para no atarse a esa
            // palabra exacta si otro ERP dice "cerrada".
            cerrada: ["clos", "cerr"].contains {
                texto(c["status"]).lowercased().hasPrefix($0)
            }
        )
    }

    /// Cuántos sin leer, mire donde mire el ERP.
    ///
    /// Cinco nombres distintos para el mismo número, y puede venir como texto:
    /// declararlo entero no impide que llegue `"3"`.
    private static func cuantosSinLeer(_ c: [String: Any]) -> Int {
        for k in ["unread_count", "unread", "unreadCount", "no_leidos", "mensajes_sin_leer"] {
            guard let v = c[k], !(v is NSNull) else { continue }
            if let n = v as? Int, n >= 0 { return n }
            if let d = v as? Double, d >= 0 { return Int(d) }
            if let t = v as? String, let n = Int(t.trimmingCharacters(in: .whitespaces)), n >= 0 {
                return n
            }
        }
        return 0
    }

    /// La vista previa de la lista, legible.
    ///
    /// Lo que el ERP guarda para un adjunto es un marcador: `[audio]`,
    /// `[documento] lista.pdf`. Sin traducirlo, el listado se lee como una
    /// columna de corchetes.
    ///
    /// Android le pone un emoji delante a cada uno. Acá no, por la regla de la
    /// app: los emojis son del contenido, no de la interfaz.
    static func vistaPrevia(_ crudo: String) -> String {
        guard let m = crudo.wholeMatch(of: /\s*\[(\w+)\]\s*(.*)/.dotMatchesNewlines())
        else { return crudo }
        let resto = String(m.2).trimmingCharacters(in: .whitespacesAndNewlines)
        if !resto.isEmpty { return resto }
        let nombres = [
            "imagen": "Foto", "image": "Foto",
            "video": "Video",
            "audio": "Audio", "voice": "Audio",
            "documento": "Documento", "document": "Documento",
            "sticker": "Sticker",
            "reaction": "Reaccionó",
            "revoke": "Mensaje eliminado",
        ]
        return nombres[String(m.1).lowercased()] ?? crudo
    }

    private static func aCliente(_ c: [String: Any]) -> Cliente {
        Cliente(
            id: texto(c["id"]),
            nombre: primero(c["nombre"], c["razon_social"], c["empresa"], c["nombre_contacto"])
                ?? "(sin nombre)",
            // `ruc_factura` es el que se usa para facturar; los otros son respaldo.
            doc: primero(c["ruc_factura"], c["ruc"], c["documento"]) ?? "",
            contacto: noVacio(c["nombre_contacto"]) ?? "",
            tel: primero(c["telefono"], c["telefono_secundario"]) ?? "",
            email: primero(c["email"], c["email_secundario"]) ?? "",
            zona: noVacio(c["ciudad"]) ?? "",
            direccion: noVacio(c["direccion"]) ?? "",
            lista: noVacio(c["tipo_cliente"]) ?? "Mayorista",
            // La baja operativa no borra la fila, pero el cliente deja de operar.
            activo: noVacio(c["baja_operativa_at"]) == nil
        )
    }

    private static func primero(_ vs: Any?...) -> String? {
        for v in vs { if let s = noVacio(v) { return s } }
        return nil
    }

    private static func aProducto(_ p: [String: Any]) -> InvProducto {
        InvProducto(
            id: texto(p["id"]),
            nombre: noVacio(p["nombre"]) ?? "(sin nombre)",
            sku: noVacio(p["sku"]) ?? "",
            barras: noVacio(p["codigo_barras"]) ?? "",
            unidad: noVacio(p["unidad_medida"]) ?? "UN",
            // Enteros: el guaraní no tiene centavos.
            costo: entero(p["costo_promedio"]),
            precio: entero(p["precio_venta"]),
            precioMayorista: p["precio_mayorista"].map { numero($0) }.flatMap {
                $0 > 0 ? Int($0.rounded()) : nil
            },
            iva: Iva.desde(p["tipo_iva"]),
            stock: numero(p["stock_actual"]),
            minimo: numero(p["stock_minimo"])
        )
    }

    private static func aVenta(_ v: [String: Any]) -> Venta {
        let fecha = String((noVacio(v["fecha"]) ?? noVacio(v["created_at"]) ?? "").prefix(10))
        let tipo = (noVacio(v["tipo_venta"]) ?? "").lowercased()
        let credito = tipo.contains("cred") || tipo.contains("cuota")

        // Los dos ERPs no devuelven lo mismo: uno manda `estado` en el listado y
        // el otro no lo selecciona. Sin este respaldo, con el segundo TODAS las
        // ventas se veían pendientes y el reporte mostraba cobranza cero.
        let estado = (noVacio(v["estado"]) ?? (credito ? "pendiente" : "completada")).lowercased()
        // Lo que el ERP no da por cerrado queda pendiente: una pendiente mostrada
        // como cobrada esconde plata sin cobrar.
        let cobrada = ["cobrad", "pagad", "cerrad", "complet"].contains { estado.contains($0) }

        let items = (v["items"] as? [[String: Any]]) ?? []
        return Venta(
            id: texto(v["id"]),
            iso: fecha,
            numero: noVacio(v["numero_control"]) ?? String(texto(v["id"]).prefix(8)),
            cliente: noVacio(v["cliente_nombre"]) ?? "Sin nombre",
            doc: noVacio(v["cliente_doc"]) ?? "Sin documento",
            pago: credito
                ? "Crédito · \(v["plazo_dias"].map { "\($0)" } ?? "?") días"
                : "Contado · \(noVacio(v["metodo_pago"]) ?? "efectivo")",
            cobrada: cobrada,
            lineas: items.map { l in
                VentaLinea(
                    // El nombre va copiado en la línea: una factura vieja sigue
                    // diciendo lo que decía aunque le cambien el nombre al producto.
                    nombre: noVacio(l["producto_nombre"]) ?? noVacio(l["sku"]) ?? "(sin nombre)",
                    qty: numero(l["cantidad_total_base"] ?? l["cantidad"]),
                    precio: entero(l["precio_venta"]),
                    iva: Iva.desde(l["tipo_iva"])
                )
            }
        )
    }

    // MARK: lectura tolerante
    // El ERP manda números como number o como string según el endpoint.

    private static func texto(_ v: Any?) -> String {
        guard let v, !(v is NSNull) else { return "" }
        if let s = v as? String { return s }
        if let n = v as? NSNumber { return n.stringValue }
        return String(describing: v)
    }

    private static func noVacio(_ v: Any?) -> String? {
        let s = texto(v).trimmingCharacters(in: .whitespacesAndNewlines)
        return s.isEmpty ? nil : s
    }

    private static func numero(_ v: Any?) -> Double {
        if let d = v as? Double { return d }
        if let n = v as? NSNumber { return n.doubleValue }
        if let s = v as? String { return Double(s) ?? 0 }
        return 0
    }

    private static func entero(_ v: Any?) -> Int {
        Int(numero(v).rounded())
    }
}
