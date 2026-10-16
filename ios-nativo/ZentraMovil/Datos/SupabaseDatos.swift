import Foundation

/// Los datos de la **instalación pública**, leídos de nuestras propias tablas.
/// Port de `src/lib/repo/supabase-datos.ts`.
///
/// Hay dos mundos y conviene no mezclarlos:
///
///   - Una empresa **con ERP propio** lee y escribe por la API de ese ERP
///     (`RepoERP`). Registrar una venta ahí no es insertar una fila: es
///     numeración, caja, factura y asiento contable.
///   - Una empresa **sin ERP** —la que baja Zentra de la tienda y paga un
///     plan— usa el schema `zentra` de nuestro Supabase, por PostgREST.
///
/// Cuál se usa lo decide tener o no `apiUrl`, igual que en la web.
enum SupabaseDatos {

    // MARK: - PostgREST

    /// Un pedido a PostgREST contra el schema de la instalación activa.
    ///
    /// El schema va en las cabeceras y no en la ruta: las tablas no viven en
    /// `public`, y una instalación sobre el ERP de un cliente puede exponer
    /// vistas en un schema propio.
    private static func pedir(
        _ metodo: String, _ ruta: String,
        query: [String: String] = [:],
        cuerpo: Any? = nil,
        preferencia: String? = nil
    ) async throws -> Any {
        guard let t = await Auth.shared.tenantActivo(), !t.supabaseUrl.isEmpty else {
            throw ApiError.sinApi
        }
        guard var c = URLComponents(string: "\(t.supabaseUrl)/rest/v1\(ruta)") else {
            throw ApiError.sinApi
        }
        if !query.isEmpty {
            c.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = c.url else { throw ApiError.sinApi }

        var req = URLRequest(url: url, timeoutInterval: Config.timeout)
        req.httpMethod = metodo
        req.setValue(t.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue(t.schema, forHTTPHeaderField: "Accept-Profile")
        if metodo != "GET" {
            req.setValue(t.schema, forHTTPHeaderField: "Content-Profile")
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let preferencia { req.setValue(preferencia, forHTTPHeaderField: "Prefer") }
        // El token de la sesión, no la anon key: el RLS decide por quién sos.
        if let token = await Auth.shared.tokenVigente() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let cuerpo {
            req.httpBody = try JSONSerialization.data(withJSONObject: cuerpo)
        }

        let datos: Data
        let resp: URLResponse
        do { (datos, resp) = try await URLSession.shared.data(for: req) }
        catch { throw ApiError.sinRed }

        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        let json = try? JSONSerialization.jsonObject(with: datos)
        guard (200..<300).contains(code) else {
            let o = json as? [String: Any]
            // PostgREST explica bien lo suyo; su texto sirve más que un genérico.
            let m = (o?["message"] as? String) ?? (o?["hint"] as? String)
                ?? "La base respondió \(code)."
            throw ApiError.http(status: code, mensaje: m, ruta: ruta)
        }
        return json ?? []
    }

    private static func filas(_ crudo: Any) -> [[String: Any]] {
        (crudo as? [[String: Any]]) ?? []
    }

    // MARK: - Perfil

    /// Quién entró. Sale de `zentra.usuarios` y el nombre de la empresa de
    /// `zentra.empresas`, con un solo pedido.
    /// Cuánto sale cada plan. Port de `src/lib/precios-planes.ts`.
    ///
    /// El precio no está escrito en la app, a propósito: vive en
    /// `zentra.planes` y el server de cobros lo lee de ahí para cobrar. Si la
    /// app tuviera su copia, el día que cambie un precio habría dos verdades y
    /// la que se le muestra a la gente sería la vieja. Ya pasó: el código decía
    /// 49.000 y 89.000 mientras la base decía 80.000 y 150.000.
    ///
    /// La tabla se lee sin sesión —su política de lectura es pública, es una
    /// lista de precios—, así que esto anda incluso antes de entrar.
    ///
    /// Si no se puede leer devuelve vacío y la hoja muestra los planes sin
    /// precio. Mejor eso que un número inventado.
    static func preciosDePlanes() async -> [Plan: Int] {
        if let c = cachePrecios { return c }
        guard let crudo = try? await pedir("GET", "/planes",
                                           query: ["select": "codigo,precio_mensual"])
        else { return [:] }

        var out: [Plan: Int] = [:]
        for f in filas(crudo) {
            guard let codigo = f["codigo"] as? String, let plan = Plan(rawValue: codigo)
            else { continue }
            if let n = f["precio_mensual"] as? Double { out[plan] = Int(n) }
            else if let n = f["precio_mensual"] as? Int { out[plan] = n }
            else if let t = f["precio_mensual"] as? String, let n = Double(t) {
                out[plan] = Int(n)
            }
        }
        // Se pide una vez y queda: son tres números que no cambian mientras la
        // app está abierta, y la hoja puede abrirse muchas veces seguidas.
        cachePrecios = out
        return out
    }

    /// Al cerrar sesión: la próxima instalación puede tener otros precios.
    static func olvidarPrecios() { cachePrecios = nil }

    private nonisolated(unsafe) static var cachePrecios: [Plan: Int]?

    static func perfil() async throws -> Perfil {
        let crudo = try await pedir("GET", "/usuarios", query: [
            "select": "id,nombre,email,rol,empresas(nombre)",
            "limit": "1",
        ])
        guard let u = filas(crudo).first else {
            // El disparador de alta crea el perfil al registrarse. Si no está,
            // el alta falló y entrar igual sería entrar a una app sin dueño.
            throw ApiError.http(status: 404,
                                mensaje: "Tu usuario no tiene perfil en esta instalación.",
                                ruta: "/usuarios")
        }
        let email = (u["email"] as? String) ?? ""
        let nombre = (u["nombre"] as? String).flatMap { $0.isEmpty ? nil : $0 }
            ?? String(email.split(separator: "@").first ?? "")
        return Perfil(
            id: (u["id"] as? String) ?? "",
            nombre: nombre,
            rol: (u["rol"] as? String) ?? "",
            empresa: ((u["empresas"] as? [String: Any])?["nombre"] as? String) ?? ""
        )
    }

    // MARK: - Lecturas
    //
    // No se filtra por empresa en ninguna consulta, y es correcto: el RLS lo
    // hace del lado del servidor. Filtrar acá además daría una falsa sensación
    // de seguridad — si el RLS fallara, el filtro del cliente no protege nada.

    static func clientes() async throws -> [Cliente] {
        let crudo = try await pedir("GET", "/clientes", query: [
            "select": "*", "order": "nombre.asc",
        ])
        return filas(crudo).map { c in
            Cliente(
                id: texto(c["id"]),
                nombre: (c["nombre"] as? String) ?? "(sin nombre)",
                doc: (c["doc"] as? String) ?? "",
                contacto: (c["contacto"] as? String) ?? "",
                tel: (c["tel"] as? String) ?? "",
                email: (c["email"] as? String) ?? "",
                zona: (c["zona"] as? String) ?? "",
                direccion: (c["direccion"] as? String) ?? "",
                lista: (c["lista_precios"] as? String) ?? "Mayorista",
                activo: ((c["estado"] as? String) ?? "Activo") != "Inactivo"
            )
        }
    }

    static func inventario() async throws -> [InvProducto] {
        let crudo = try await pedir("GET", "/productos", query: [
            "select": "*", "activo": "is.true", "order": "nombre.asc",
        ])
        return filas(crudo).map { p in
            InvProducto(
                id: texto(p["id"]),
                nombre: (p["nombre"] as? String) ?? "(sin nombre)",
                sku: (p["sku"] as? String) ?? "",
                barras: (p["barras"] as? String) ?? "",
                unidad: (p["unidad"] as? String) ?? "UNIDAD",
                costo: entero(p["costo"]),
                precio: entero(p["precio"]),
                precioMayorista: nil,
                iva: Iva.desde(p["iva"]),
                // El stock no se redondea: hay productos por kilo.
                stock: numero(p["stock"]),
                minimo: numero(p["minimo"])
            )
        }
    }

    static func proveedores() async throws -> [Proveedor] {
        let crudo = try await pedir("GET", "/proveedores", query: [
            "select": "*", "order": "nombre.asc",
        ])
        return filas(crudo).map { p in
            let plazo = p["credito_plazo_dias"]
            let credito = !(plazo is NSNull) && plazo != nil
            return Proveedor(
                id: texto(p["id"]),
                nombre: (p["nombre"] as? String) ?? "Sin nombre",
                doc: (p["doc"] as? String) ?? "",
                condicion: credito ? "Crédito \(texto(plazo)) días" : "Contado",
                rubro: (p["rubro"] as? String) ?? "",
                ciudad: (p["ciudad"] as? String) ?? "",
                contacto: (p["contacto"] as? String) ?? "",
                tel: (p["tel"] as? String) ?? "",
                email: (p["email"] as? String) ?? "",
                activo: ((p["estado"] as? String) ?? "Activo") != "Inactivo"
            )
        }
    }

    static func ventas(desde: String, hasta: String) async throws -> [Venta] {
        let crudo = try await pedir("GET", "/ventas", query: [
            "select": "*,venta_lineas(*)",
            "fecha": "gte.\(desde)",
            "and": "(fecha.lte.\(hasta))",
            "order": "fecha.desc",
        ])
        return filas(crudo).map { v in
            let lineas = (v["venta_lineas"] as? [[String: Any]]) ?? []
            let credito = ((v["condicion"] as? String) ?? "") == "Crédito"
            return Venta(
                id: texto(v["id"]),
                iso: String(((v["fecha"] as? String) ?? "").prefix(10)),
                numero: (v["numero"] as? String) ?? "",
                cliente: (v["cliente_texto"] as? String) ?? "Sin nombre",
                doc: (v["cliente_doc"] as? String) ?? "Sin documento",
                pago: credito
                    ? "Crédito · \(texto(v["plazo_dias"])) días"
                    : "Contado · \((v["metodo"] as? String) ?? "efectivo")",
                cobrada: ((v["estado"] as? String) ?? "") == "Cobrada",
                lineas: lineas.map { l in
                    VentaLinea(
                        nombre: (l["nombre"] as? String) ?? "",
                        qty: numero(l["cantidad"]),
                        precio: entero(l["precio"]),
                        iva: Iva.desde(l["iva"])
                    )
                }
            )
        }
    }

    static func compras() async throws -> [Compra] {
        let crudo = try await pedir("GET", "/compras", query: [
            "select": "*,compra_lineas(*)", "order": "fecha.desc",
        ])
        return filas(crudo).map { c in
            let l = ((c["compra_lineas"] as? [[String: Any]]) ?? []).first
            return Compra(
                id: texto(c["id"]),
                numero: (c["numero"] as? String) ?? "",
                producto: (l?["nombre"] as? String) ?? "(sin detalle)",
                cantidad: numero(l?["cantidad"]),
                costo: entero(l?["costo"]),
                iva: Iva.desde(l?["iva"]),
                pago: ((c["condicion"] as? String) ?? "Contado"),
                pagada: ((c["estado"] as? String) ?? "") == "Pagada",
                fecha: String(((c["fecha"] as? String) ?? "").prefix(10)),
                factura: (c["factura"] as? String) ?? ""
            )
        }
    }

    // MARK: - Escrituras

    static func crearCliente(_ campos: [String: Any]) async throws -> Cliente {
        let crudo = try await pedir("POST", "/clientes", cuerpo: [campos],
                                    preferencia: "return=representation")
        guard let c = filas(crudo).first else {
            throw ApiError.http(status: 200, mensaje: "La base no devolvió el cliente creado.",
                                ruta: "/clientes")
        }
        return Cliente(
            id: texto(c["id"]), nombre: (c["nombre"] as? String) ?? "",
            doc: (c["doc"] as? String) ?? "", contacto: (c["contacto"] as? String) ?? "",
            tel: (c["tel"] as? String) ?? "", email: (c["email"] as? String) ?? "",
            zona: (c["zona"] as? String) ?? "", direccion: (c["direccion"] as? String) ?? "",
            lista: (c["lista_precios"] as? String) ?? "Mayorista", activo: true
        )
    }

    /// Registra la venta: número, cabecera, líneas y los movimientos de stock.
    ///
    /// **Son cuatro viajes sin transacción**, y hay que saberlo: si se corta la
    /// señal en el medio queda una venta con el número consumido y sin líneas,
    /// o sin descontar el stock. PostgREST no tiene forma de abrir una
    /// transacción desde el cliente. Lo correcto es una función del servidor
    /// (`zentra.registrar_venta(...)`) que haga todo de una; hasta que exista,
    /// esto es lo que hay y conviene no fingir lo contrario.
    static func crearVenta(
        clienteId: String?, cliente: Cliente?,
        lineas: [(producto: InvProducto, cantidad: Double)],
        credito: Bool, plazoDias: Int, metodo: String
    ) async throws -> String {
        let empresa = try await empresaActual()

        let numeroCrudo = try await pedir("POST", "/rpc/siguiente_numero",
                                          cuerpo: ["p_empresa": empresa, "p_tipo": "venta"])
        let numero = (numeroCrudo as? String) ?? texto(numeroCrudo)

        var cabecera: [String: Any] = [
            "empresa_id": empresa, "numero": numero,
            "cliente_texto": cliente?.nombre ?? "Sin nombre",
            "cliente_doc": cliente?.doc ?? "Sin documento",
            "condicion": credito ? "Crédito" : "Contado",
            // Contado cobra ahora; crédito queda pendiente de cobro.
            "estado": credito ? "Pendiente" : "Cobrada",
            "moneda": "PYG",
        ]
        if let clienteId { cabecera["cliente_id"] = clienteId }
        if credito { cabecera["plazo_dias"] = plazoDias } else { cabecera["metodo"] = metodo }

        let ventaCruda = try await pedir("POST", "/ventas", cuerpo: [cabecera],
                                         preferencia: "return=representation")
        guard let ventaId = filas(ventaCruda).first.map({ texto($0["id"]) }) else {
            throw ApiError.http(status: 200, mensaje: "La base no devolvió la venta.",
                                ruta: "/ventas")
        }

        let filasLinea = lineas.map { l -> [String: Any] in
            [
                "venta_id": ventaId, "producto_id": l.producto.id,
                "nombre": l.producto.nombre, "cantidad": l.cantidad,
                "precio": Precios.aCobrar(l.producto, cliente),
                "iva": l.producto.iva.rawValue,
            ]
        }
        _ = try await pedir("POST", "/venta_lineas", cuerpo: filasLinea)

        // La venta descuenta stock: un movimiento de SALIDA por línea. El
        // disparador de la base acomoda `productos.stock`.
        let movs = lineas.map { l -> [String: Any] in
            [
                "empresa_id": empresa, "producto_id": l.producto.id,
                "tipo": "SALIDA", "cantidad": -l.cantidad,
                "origen": "Venta", "ref": numero,
            ]
        }
        _ = try await pedir("POST", "/movimientos", cuerpo: movs)

        return numero
    }

    /// El id de la empresa de quien entró. Hace falta para escribir, porque las
    /// tablas lo piden; leerlo lo permite el RLS.
    private static func empresaActual() async throws -> String {
        let crudo = try await pedir("GET", "/usuarios",
                                    query: ["select": "empresa_id", "limit": "1"])
        guard let e = filas(crudo).first.map({ texto($0["empresa_id"]) }), !e.isEmpty else {
            throw ApiError.http(status: 404,
                                mensaje: "Tu cuenta no tiene empresa en esta instalación.",
                                ruta: "/usuarios")
        }
        return e
    }

    // MARK: - lectura tolerante

    private static func texto(_ v: Any?) -> String {
        guard let v, !(v is NSNull) else { return "" }
        if let s = v as? String { return s }
        if let n = v as? NSNumber { return n.stringValue }
        return String(describing: v)
    }

    private static func numero(_ v: Any?) -> Double {
        if let d = v as? Double { return d }
        if let n = v as? NSNumber { return n.doubleValue }
        if let s = v as? String { return Double(s) ?? 0 }
        return 0
    }

    private static func entero(_ v: Any?) -> Int { Int(numero(v).rounded()) }
}
