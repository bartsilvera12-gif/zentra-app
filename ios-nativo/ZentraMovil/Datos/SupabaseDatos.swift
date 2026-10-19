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
    /// Hace el pedido y, si el servidor rechaza el token, lo renueva y
    /// reintenta **una** vez.
    ///
    /// `tokenVigente()` sólo mira la fecha de vencimiento que guardamos acá, y
    /// hay varias formas de que el servidor rechace un token que para nosotros
    /// está vigente: el reloj del teléfono corrido, una sesión cerrada desde
    /// otro lado, el refresh rotado. En todos esos casos el token local parece
    /// bueno y el servidor dice 401.
    ///
    /// Sin esto, el 401 salía como un error cualquiera —y en un formulario
    /// largo, donde el aviso queda abajo de todo, salía como nada: tocabas
    /// Guardar y no pasaba absolutamente nada.
    private static func pedir(
        _ metodo: String, _ ruta: String,
        query: [String: String] = [:],
        cuerpo: Any? = nil,
        preferencia: String? = nil
    ) async throws -> Any {
        do {
            return try await pedirUnaVez(metodo, ruta, query: query, cuerpo: cuerpo,
                                         preferencia: preferencia)
        } catch let e as ApiError {
            guard case .http(401, _, _) = e else { throw e }
            // Renovar a la fuerza, aunque para nosotros no estuviera vencida.
            guard (try? await Auth.shared.renovar()) != nil else {
                throw ApiError.sesionVencida
            }
            do {
                return try await pedirUnaVez(metodo, ruta, query: query, cuerpo: cuerpo,
                                             preferencia: preferencia)
            } catch let e2 as ApiError {
                if case .http(401, _, _) = e2 { throw ApiError.sesionVencida }
                throw e2
            }
        }
    }

    private static func pedirUnaVez(
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
        catch { throw ApiError.deRed(error) }

        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        // `.fragmentsAllowed` porque una función que devuelve texto contesta un
        // valor suelto —`"VTA-0001"`—, no un objeto ni un arreglo, y sin esto
        // `JSONSerialization` lo rechaza.
        //
        // Costaba caro: el número de factura salía `[]`, se guardaba así en la
        // venta, y como la tabla tiene `unique (empresa_id, numero)` la segunda
        // venta de la empresa chocaba contra la primera y no entraba más.
        let json = try? JSONSerialization.jsonObject(with: datos, options: [.fragmentsAllowed])
        guard (200..<300).contains(code) else {
            let o = json as? [String: Any]
            // PostgREST explica bien lo suyo; su texto sirve más que un genérico.
            let m = (o?["message"] as? String) ?? (o?["hint"] as? String)
                ?? "La base respondió \(code)."
            throw ApiError.http(status: code, mensaje: m, ruta: ruta)
        }
        return json ?? []
    }

    /// `yyyy-MM-dd` como lo manda Postgres para un `date`.
    private static func fechaISO(_ s: String) -> Date? {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "America/Asuncion")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: String(s.prefix(10)))
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
        // El plan y el vencimiento vienen en el mismo viaje que el perfil.
        // Son los que deciden qué se puede hacer: sin ellos la app deja a todo
        // el mundo en gratis, y quien pagó no recibe lo que pagó.
        let crudo = try await pedir("GET", "/usuarios", query: [
            "select": "id,nombre,email,rol,empresas(nombre,plan,vence)",
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
        let emp = u["empresas"] as? [String: Any]
        return Perfil(
            id: (u["id"] as? String) ?? "",
            nombre: nombre,
            rol: (u["rol"] as? String) ?? "",
            empresa: (emp?["nombre"] as? String) ?? "",
            // Un plan que no reconocemos se ignora en vez de tratarse como
            // gratis: ante un valor raro en la columna, manda el directorio.
            plan: (emp?["plan"] as? String).flatMap(Plan.init(rawValue:)),
            vence: (emp?["vence"] as? String).flatMap(fechaISO)
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
        return filas(crudo).map(aProductoLocal)
    }

    /// Una fila de `zentra.productos` como la usa la app.
    private static func aProductoLocal(_ p: [String: Any]) -> InvProducto {
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
        // El proveedor viene embebido: sin él, un listado de compras no dice a
        // quién se le compró, que es la mitad de para qué se mira.
        let crudo = try await pedir("GET", "/compras", query: [
            "select": "*,compra_lineas(*),proveedores(id,nombre)", "order": "fecha.desc",
        ])
        return filas(crudo).map { c in
            let crudas = (c["compra_lineas"] as? [[String: Any]]) ?? []
            let lineas = crudas.map {
                CompraLinea(prodId: texto($0["producto_id"]),
                            nombre: ($0["nombre"] as? String) ?? "(sin nombre)",
                            unidad: ($0["unidad"] as? String) ?? "UNIDAD",
                            cantidad: numero($0["cantidad"]),
                            costo: entero($0["costo"]),
                            iva: Iva.desde($0["iva"]))
            }
            let prov = c["proveedores"] as? [String: Any]
            return Compra(
                id: texto(c["id"]),
                numero: (c["numero"] as? String) ?? "",
                provId: texto(prov?["id"]),
                proveedor: (prov?["nombre"] as? String) ?? "",
                producto: lineas.first?.nombre ?? "(sin detalle)",
                cantidad: lineas.first?.cantidad ?? 0,
                costo: lineas.first?.costo ?? 0,
                iva: lineas.first?.iva ?? .diez,
                pago: ((c["condicion"] as? String) ?? "Contado"),
                pagada: ((c["estado"] as? String) ?? "") == "Pagada",
                fecha: String(((c["fecha"] as? String) ?? "").prefix(10)),
                factura: (c["factura"] as? String) ?? "",
                lineas: lineas
            )
        }
    }

    // MARK: - Escrituras

    /// Alta de producto en nuestras tablas.
    ///
    /// Faltaba: `RepoERP.crearProducto` iba siempre al ERP, incluso en la
    /// instalación pública, que no tiene ninguno. El alta contestaba 401 y el
    /// producto no se guardaba en ningún lado.
    ///
    /// El stock inicial **no va acá**: lo mantiene el trigger de movimientos,
    /// no la app. Escribirlo a mano dejaría la fila diciendo una cosa y el
    /// historial de movimientos otra, y el que manda es el historial.
    static func crearProducto(
        nombre: String, sku: String, barras: String, unidad: String,
        costo: Int, precio: Int, stockInicial: Double, minimo: Double,
        categoria: String, deposito: String
    ) async throws -> InvProducto {
        let empresa = try await empresaActual()
        var fila: [String: Any] = [
            "empresa_id": empresa, "nombre": nombre,
            // El SKU es obligatorio y único por empresa. Sin uno escrito se
            // arma del nombre: mejor un código feo que un alta rechazada.
            "sku": sku.isEmpty ? skuDesde(nombre) : sku,
            "unidad": unidad.isEmpty ? "UNIDAD" : unidad,
            "costo": costo, "precio": precio, "minimo": minimo,
        ]
        if !barras.isEmpty { fila["barras"] = barras }
        if !categoria.isEmpty { fila["categoria"] = categoria }
        if !deposito.isEmpty { fila["deposito"] = deposito }

        let crudo = try await pedir("POST", "/productos", cuerpo: [fila],
                                    preferencia: "return=representation")
        guard let o = filas(crudo).first else {
            throw ApiError.http(status: 200, mensaje: "La base no devolvió el producto creado.",
                                ruta: "/productos")
        }
        let creado = aProductoLocal(o)

        // El inventario inicial entra como movimiento, que es lo que mueve el
        // stock. Si falla, el producto ya existe: se avisa y se puede ajustar.
        if stockInicial > 0 {
            _ = try? await pedir("POST", "/movimientos", cuerpo: [[
                "empresa_id": empresa, "producto_id": creado.id,
                "tipo": "ENTRADA", "cantidad": stockInicial,
                "origen": "Inventario inicial",
            ]])
            return try await producto(creado.id) ?? creado
        }
        return creado
    }

    /// Alta de proveedor en nuestras tablas.
    ///
    /// Acá `entrega_dias` sí se guarda: la tabla tiene la columna. En el ERP no
    /// existe, y por eso en Android el campo se escribe y se tira.
    static func crearProveedor(
        nombre: String, doc: String, rubro: String, ciudad: String,
        contacto: String, tel: String, email: String,
        entregaDias: Int, creditoPlazoDias: Int?
    ) async throws -> Proveedor {
        let empresa = try await empresaActual()
        var fila: [String: Any] = [
            "empresa_id": empresa, "nombre": nombre,
            "entrega_dias": max(0, entregaDias),
        ]
        for (k, v) in ["doc": doc, "rubro": rubro, "ciudad": ciudad,
                       "contacto": contacto, "tel": tel, "email": email]
        where !v.isEmpty { fila[k] = v }
        if let d = creditoPlazoDias, d > 0 { fila["credito_plazo_dias"] = d }

        let crudo = try await pedir("POST", "/proveedores", cuerpo: [fila],
                                    preferencia: "return=representation")
        guard let o = filas(crudo).first else {
            throw ApiError.http(status: 200, mensaje: "La base no devolvió el proveedor creado.",
                                ruta: "/proveedores")
        }
        let plazo = o["credito_plazo_dias"] as? Int
        return Proveedor(
            id: texto(o["id"]), nombre: (o["nombre"] as? String) ?? "",
            doc: (o["doc"] as? String) ?? "",
            condicion: plazo.map { "Crédito \($0) días" } ?? "Contado",
            rubro: (o["rubro"] as? String) ?? "", ciudad: (o["ciudad"] as? String) ?? "",
            contacto: (o["contacto"] as? String) ?? "", tel: (o["tel"] as? String) ?? "",
            email: (o["email"] as? String) ?? "",
            activo: ((o["estado"] as? String) ?? "Activo") != "Inactivo"
        )
    }

    /// Un producto por id, para releerlo después de moverle el stock.
    static func producto(_ id: String) async throws -> InvProducto? {
        let crudo = try await pedir("GET", "/productos",
                                    query: ["id": "eq.\(id)", "limit": "1"])
        return filas(crudo).first.map(aProductoLocal)
    }

    /// Un SKU a partir del nombre, para cuando no lo escribieron.
    private static func skuDesde(_ nombre: String) -> String {
        let letras = nombre.uppercased().filter { $0.isLetter || $0.isNumber }
        let raiz = String(letras.prefix(6))
        return (raiz.isEmpty ? "PROD" : raiz) + "-" + String(Int(Date().timeIntervalSince1970) % 100000)
    }

    /// Borra la cuenta de quien está en sesión. **No se puede deshacer.**
    ///
    /// Lo hace una función del servidor y no un `DELETE` desde acá: la clave
    /// pública de la app no puede tocar `auth.users`, y además la decisión de
    /// qué se arrastra —la empresa entera si era el último usuario, sólo el
    /// perfil si quedan compañeros— es del servidor, que es el único que ve a
    /// todos.
    static func eliminarMiCuenta() async throws {
        _ = try await pedir("POST", "/rpc/eliminar_mi_cuenta", cuerpo: [String: Any]())
    }

    /// Un ajuste de stock, como movimiento.
    ///
    /// La cantidad va **con signo**: negativa en salidas y mermas. Es lo que
    /// espera la columna, y lo que hace que el trigger mueva el stock para el
    /// lado correcto. El motivo va en `origen`, que es la columna que existe
    /// —`motivo` no existe, y escribirlo hace que PostgREST rechace la fila.
    static func ajustarStock(
        productoId: String, tipo: String, cantidad: Double, motivo: String
    ) async throws -> Double {
        let empresa = try await empresaActual()
        let signo: Double = tipo == "SALIDA" ? -1 : 1
        let con = signo * abs(cantidad)
        guard con != 0 else {
            throw ApiError.http(status: 400, mensaje: "La cantidad no puede ser cero.",
                                ruta: "/movimientos")
        }

        _ = try await pedir("POST", "/movimientos", cuerpo: [[
            "empresa_id": empresa, "producto_id": productoId,
            "tipo": tipo, "cantidad": con, "origen": motivo,
        ]])

        // Se relee el producto en vez de sumar el delta acá: el stock lo
        // mantiene el trigger, y si dos personas ajustan a la vez el que vale
        // es el de la base, no la cuenta que hizo este teléfono.
        return try await producto(productoId)?.stock ?? 0
    }

    /// Una compra con sus líneas, en nuestras tablas.
    ///
    /// Son dos viajes sin transacción —la cabecera y las líneas—, y hay que
    /// saberlo: si se corta la señal en el medio queda una compra con el
    /// número consumido y sin líneas. Se ve en el listado y se puede anular.
    /// Hacerlo en uno solo necesita una función del lado del servidor.
    static func crearCompra(
        provId: String?, lineas: [CompraLinea],
        credito: Bool, plazoDias: Int, cuotas: Int,
        timbrado: String, comprobante: String,
        moneda: String, tipoCambio: Double
    ) async throws -> String {
        let empresa = try await empresaActual()

        let numeroCrudo = try await pedir("POST", "/rpc/siguiente_numero",
                                          cuerpo: ["p_empresa": empresa, "p_tipo": "compra"])
        let numero = (numeroCrudo as? String) ?? texto(numeroCrudo)

        var cabecera: [String: Any] = [
            "empresa_id": empresa, "numero": numero,
            "condicion": credito ? "Crédito" : "Contado",
            // Al contado se cierra en el acto; a crédito queda por pagar.
            "estado": credito ? "Pendiente" : "Pagada",
            "cuotas": max(1, cuotas),
            "moneda": moneda,
        ]
        if let provId, !provId.isEmpty { cabecera["proveedor_id"] = provId }
        if credito { cabecera["plazo_dias"] = max(1, plazoDias) }
        if !timbrado.isEmpty { cabecera["timbrado"] = timbrado }
        if !comprobante.isEmpty { cabecera["factura"] = comprobante }
        // La tabla exige cotización si la compra no es en guaraníes.
        if moneda != "PYG" { cabecera["tipo_cambio"] = tipoCambio }

        let crudo = try await pedir("POST", "/compras", cuerpo: [cabecera],
                                    preferencia: "return=representation")
        guard let c = filas(crudo).first else {
            throw ApiError.http(status: 200, mensaje: "La base no devolvió la compra creada.",
                                ruta: "/compras")
        }
        let compraId = texto(c["id"])

        _ = try await pedir("POST", "/compra_lineas", cuerpo: lineas.map { l in
            [
                "compra_id": compraId, "producto_id": l.prodId,
                "nombre": l.nombre, "unidad": l.unidad,
                "cantidad": l.cantidad, "costo": l.costo,
                "iva": l.iva.rawValue,
            ]
        })

        // Una compra entra stock. Va como movimiento, que es lo que lo mueve.
        _ = try? await pedir("POST", "/movimientos", cuerpo: lineas.map { l in
            [
                "empresa_id": empresa, "producto_id": l.prodId,
                "tipo": "ENTRADA", "cantidad": l.cantidad,
                "origen": "Compra \(numero)", "ref": numero,
            ]
        })

        return numero
    }

    /// Corrige un producto ya cargado, en nuestras tablas.
    ///
    /// Viaja sólo lo que cambió. Mandar todo pisaría con lo que tiene este
    /// teléfono lo que otro acaba de editar: el campo se toma como "cambialo"
    /// por el hecho de estar presente.
    ///
    /// **El stock no se toca acá.** Se mueve con un ajuste, que deja un
    /// movimiento y se puede auditar. Editarlo a mano haría que el stock y su
    /// historial dijeran cosas distintas, y el que manda es el historial.
    static func editarProducto(_ id: String, _ cambios: [String: Any]) async throws -> InvProducto {
        guard !cambios.isEmpty else {
            guard let p = try await producto(id) else {
                throw ApiError.http(status: 404, mensaje: "Ese producto ya no existe.",
                                    ruta: "/productos")
            }
            return p
        }
        let crudo = try await pedir("PATCH", "/productos", query: ["id": "eq.\(id)"],
                                    cuerpo: cambios, preferencia: "return=representation")
        guard let o = filas(crudo).first else {
            throw ApiError.http(status: 200, mensaje: "La base no devolvió el producto editado.",
                                ruta: "/productos")
        }
        return aProductoLocal(o)
    }

    /// Corrige un proveedor ya cargado. Mismas reglas que el producto.
    static func editarProveedor(_ id: String, _ cambios: [String: Any]) async throws -> Proveedor {
        let crudo = try await pedir("PATCH", "/proveedores", query: ["id": "eq.\(id)"],
                                    cuerpo: cambios, preferencia: "return=representation")
        guard let o = filas(crudo).first else {
            throw ApiError.http(status: 200, mensaje: "La base no devolvió el proveedor editado.",
                                ruta: "/proveedores")
        }
        let plazo = o["credito_plazo_dias"] as? Int
        return Proveedor(
            id: texto(o["id"]), nombre: (o["nombre"] as? String) ?? "",
            doc: (o["doc"] as? String) ?? "",
            condicion: plazo.map { "Crédito \($0) días" } ?? "Contado",
            rubro: (o["rubro"] as? String) ?? "", ciudad: (o["ciudad"] as? String) ?? "",
            contacto: (o["contacto"] as? String) ?? "", tel: (o["tel"] as? String) ?? "",
            email: (o["email"] as? String) ?? "",
            activo: ((o["estado"] as? String) ?? "Activo") != "Inactivo"
        )
    }

    /// Guarda el token de este teléfono en nuestras tablas.
    ///
    /// Faltaba enrutar esto: `registrarDispositivo` salía siempre al ERP, y en
    /// la instalación pública no hay ninguno. Fallaba con `.sinApi`, y como va
    /// con `try?` fallaba callado — el token no se guardaba en ninguna parte y
    /// desde afuera parecía que el push estaba configurado.
    ///
    /// Lo hace una función del servidor porque antes de insertar borra
    /// cualquier fila con el mismo token: el teléfono pudo haber sido de otro
    /// empleado, y dos filas con el mismo token mandan el aviso dos veces, o a
    /// quien ya no usa ese teléfono.
    static func registrarDispositivo(_ token: String, plataforma: String = "ios") async throws {
        _ = try await pedir("POST", "/rpc/registrar_dispositivo",
                            cuerpo: ["p_token": token, "p_plataforma": plataforma])
    }

    /// Da de baja el token al cerrar sesión.
    static func bajaDispositivo(_ token: String) async throws {
        _ = try await pedir("DELETE", "/dispositivos",
                            query: ["token": "eq.\(token)"])
    }

    static func crearCliente(_ campos: [String: Any]) async throws -> Cliente {
        // Sin `empresa_id` la política de seguridad rechaza la fila: la regla
        // es "sólo podés insertar en tu empresa", y una fila sin empresa no
        // cumple con ninguna. El alta de cliente nunca lo mandaba.
        var fila = campos
        fila["empresa_id"] = try await empresaActual()
        let crudo = try await pedir("POST", "/clientes", cuerpo: [fila],
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
