import SwiftUI

/// El aviso de lo que todavía no llega al ERP.
///
/// Ya casi no hace falta: el alta de producto, la de proveedor y el registro de
/// compra **ahora sí** se guardan en el ERP. Queda sólo para el ajuste de stock,
/// que es lo único que sigue como `pendiente()` del otro lado.
///
/// Un ajuste que se ve aplicado y que el depósito nunca recibe es peor que un
/// botón que falta: alguien baja 20 unidades, las ve bajar, y el stock real
/// queda intacto.
struct AvisoLocal: View {
    var que: String = "Este cambio queda sólo en el teléfono"

    var body: some View {
        Aviso(texto: "\(que): el ERP todavía no expone el endpoint para guardarlo. Se pierde al recargar.",
              bg: Tint.avisoBg, ink: Tint.avisoInk)
    }
}

// MARK: - Movimientos y ajuste de stock

/// Lo que se ajustó desde el teléfono en esta sesión. Vive acá y no en cada
/// pantalla para que el listado y la ficha vean lo mismo.
@Observable
final class AjustesLocales {
    struct Mov: Identifiable {
        let id = UUID()
        var prodId: String
        var prodNombre: String
        var tipo: String        // ENTRADA · SALIDA · AJUSTE
        var cantidad: Double    // con signo
        var motivo: String
        var cuando = Date()
    }

    var movs: [Mov] = []
    /// Delta por producto, para mostrar el stock ya corregido.
    var delta: [String: Double] = [:]

    func aplicar(_ p: InvProducto, tipo: String, cantidad: Double, motivo: String) {
        let signo: Double = tipo == "SALIDA" ? -1 : 1
        delta[p.id, default: 0] += signo * cantidad
        movs.insert(Mov(prodId: p.id, prodNombre: p.nombre, tipo: tipo,
                        cantidad: signo * cantidad, motivo: motivo), at: 0)
    }

    func stock(_ p: InvProducto) -> Double { p.stock + (delta[p.id] ?? 0) }
}

struct AjusteStockView: View {
    let producto: InvProducto
    @Environment(\.tema) private var t
    @Environment(\.dismiss) private var cerrar
    @Environment(AjustesLocales.self) private var locales
    @Environment(Estado.self) private var estado

    /// La espera entre dos ajustes del mismo producto. El plan dice "1 vez al
    /// mes"; se cuenta en días y no en mes calendario porque un ajuste el 31 y
    /// otro el 1 serían dos meses con horas de diferencia, y eso no es lo que
    /// se vendió.
    private var bloqueo: String? {
        let ultimo = locales.movs.first { $0.prodId == producto.id }?.cuando
        return Planes.motivoBloqueo(.inventarioAjuste,
                                    estado.contextoPlan(ultimoAjuste: ultimo))
    }

    @State private var tipo = "ENTRADA"
    @State private var cantidad = ""
    @State private var motivo = "Merma"

    /// Los mismos de `MOTIVOS` en `src/lib/data.ts`, en el mismo orden.
    ///
    /// No son una lista de ideas: el motivo es lo que después explica un
    /// faltante. Si acá dice "Vencimiento" y en Android "Inventario inicial",
    /// los dos ajustes del mismo depósito no se pueden ni comparar.
    private let motivos = ["Merma", "Rotura", "Inventario físico",
                           "Devolución", "Inventario inicial"]
    private var n: Double { Double(cantidad.replacingOccurrences(of: ",", with: ".")) ?? 0 }
    private var puede: Bool { n > 0 }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    if let bloqueo {
                        Aviso(texto: bloqueo, bg: Tint.avisoBg, ink: Tint.avisoInk)
                    }
                    AvisoLocal(que: "Este ajuste queda sólo en el teléfono")

                    Bloque(titulo: "PRODUCTO") {
                        Text(producto.nombre).font(Tipo.barlow(.semibold, 15)).foregroundStyle(t.ink)
                        Dato(k: "Stock actual", v: "\(fmt(locales.stock(producto))) \(producto.unidad)")
                        if n > 0 {
                            Dato(k: "Quedaría en",
                                 v: "\(fmt(locales.stock(producto) + (tipo == "SALIDA" ? -n : n))) \(producto.unidad)")
                        }
                    }

                    Bloque(titulo: "AJUSTE") {
                        Picker("", selection: $tipo) {
                            Text("Entrada").tag("ENTRADA")
                            Text("Salida").tag("SALIDA")
                            Text("Ajuste").tag("AJUSTE")
                        }
                        .pickerStyle(.segmented)

                        VStack(alignment: .leading, spacing: 5) {
                            Text("CANTIDAD").font(Tipo.barlow(.semibold, 10)).tracking(1.2)
                                .foregroundStyle(t.ink2)
                            TextField("0", text: $cantidad)
                                // Decimal y no numérico: hay productos por kilo.
                                .keyboardType(.decimalPad)
                                .font(.system(size: 16))
                                .padding(.horizontal, 12).frame(height: 44)
                                .background(t.bg, in: .rect(cornerRadius: 10))
                                .overlay { RoundedRectangle(cornerRadius: 10).stroke(t.border) }
                        }

                        VStack(alignment: .leading, spacing: 7) {
                            Text("MOTIVO").font(Tipo.barlow(.semibold, 10)).tracking(1.2)
                                .foregroundStyle(t.ink2)
                            // A la vista y no detrás de un menú: el motivo se
                            // elige siempre, y un menú lo deja en el que vino
                            // por defecto sin que nadie lo mire.
                            FlujoHorizontal(spacing: 7) {
                                ForEach(motivos, id: \.self) { k in
                                    let on = motivo == k
                                    Button { motivo = k } label: {
                                        Text(k)
                                            .font(Tipo.barlow(.semibold, 12))
                                            .foregroundStyle(on ? Color(hex: "#04617A") : t.ink2)
                                            .padding(.horizontal, 13).padding(.vertical, 8)
                                            .background(on ? Color(hex: "#E2F0F4") : t.card,
                                                        in: .capsule)
                                            .overlay {
                                                Capsule()
                                                    .stroke(on ? Color(hex: "#04617A") : t.border)
                                            }
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }
                .padding(.vertical, 12)
            }
            .background(t.bg)
            .navigationTitle("Ajuste de stock")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        locales.aplicar(producto, tipo: tipo, cantidad: n, motivo: motivo)
                        cerrar()
                    }
                    .disabled(!puede || bloqueo != nil)
                }
            }
        }
    }

    private func fmt(_ v: Double) -> String {
        v == v.rounded() ? String(Int(v)) : String(format: "%.3f", v)
    }
}

struct MovimientosView: View {
    @Environment(\.tema) private var t
    @Environment(AjustesLocales.self) private var locales
    @State private var delErp: [[String: Any]] = []
    @State private var cargando = true

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                if !locales.movs.isEmpty {
                    AvisoLocal(que: "Los ajustes hechos desde acá quedan sólo en el teléfono")
                }

                if cargando {
                    ProgressView().padding(.top, 30)
                } else if delErp.isEmpty && locales.movs.isEmpty {
                    Aviso(texto: "No hay movimientos de ese tipo en el período.", bg: t.card, ink: t.ink2)
                }

                // Los del ERP primero, que son los de verdad.
                ForEach(Array(delErp.enumerated()), id: \.offset) { _, m in
                    FilaCard {
                        HStack(spacing: 12) {
                            let cant = (m["cantidad"] as? NSNumber)?.doubleValue ?? 0
                            Text(cant > 0 ? "+\(fmt(cant))" : fmt(cant))
                                .font(Tipo.barlow(.bold, 15))
                                .foregroundStyle(cant > 0 ? Tint.okInk : Tint.errorInk)
                                .frame(minWidth: 54, alignment: .leading)
                            VStack(alignment: .leading, spacing: 2) {
                                Text((m["producto_nombre"] as? String) ?? "(sin nombre)")
                                    .font(Tipo.barlow(.semibold, 14))
                                    .foregroundStyle(t.ink).lineLimit(1)
                                Text([(m["tipo"] as? String), (m["origen"] as? String)]
                                        .compactMap { $0 }.joined(separator: " · "))
                                    .font(Tipo.barlow(.regular, 11.5)).foregroundStyle(t.ink2)
                            }
                            Spacer(minLength: 0)
                            Text(String(((m["fecha"] as? String) ?? "").prefix(10)))
                                .font(Tipo.barlow(.regular, 11)).foregroundStyle(t.ink3)
                        }
                    }
                }

                ForEach(locales.movs) { m in
                    FilaCard {
                        HStack(spacing: 12) {
                            Text(m.cantidad > 0 ? "+\(fmt(m.cantidad))" : fmt(m.cantidad))
                                .font(Tipo.barlow(.bold, 15))
                                .foregroundStyle(m.cantidad > 0 ? Tint.okInk : Tint.errorInk)
                                .frame(minWidth: 54, alignment: .leading)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(m.prodNombre).font(Tipo.barlow(.semibold, 14))
                                    .foregroundStyle(t.ink).lineLimit(1)
                                Text("\(m.tipo) · \(m.motivo)")
                                    .font(Tipo.barlow(.regular, 11.5)).foregroundStyle(t.ink2)
                            }
                            Spacer(minLength: 0)
                            Text(m.cuando, style: .time)
                                .font(Tipo.barlow(.regular, 11)).foregroundStyle(t.ink3)
                        }
                    }
                }
            }
            .padding(.vertical, 12)
        }
        .background(t.bg)
        .navigationTitle("Movimientos")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            delErp = (try? await RepoERP.movimientos()) ?? []
            cargando = false
        }
        .refreshable { delErp = (try? await RepoERP.movimientos()) ?? delErp }
    }

    private func fmt(_ v: Double) -> String {
        v == v.rounded() ? String(Int(v)) : String(format: "%.3f", v)
    }
}

// MARK: - Altas que todavía no persisten

struct NuevoProductoView: View {
    @Environment(\.tema) private var t
    @Environment(\.dismiss) private var cerrar

    @State private var nombre = ""
    @State private var sku = ""
    @State private var costo = ""
    @State private var precio = ""
    @State private var unidad = "UNIDAD"
    @State private var iva = Iva.diez
    @State private var minimo = ""
    @State private var barras = ""
    @State private var stockInicial = ""
    @State private var categoriaId = ""
    @State private var ubicacionId = ""
    @State private var categorias: [RepoERP.Opcion] = []
    @State private var ubicaciones: [RepoERP.Opcion] = []
    @State private var guardando = false
    @State private var error: String?
    var alGuardar: (InvProducto) -> Void = { _ in }

    private var c: Double { Double(costo) ?? 0 }
    private var p: Double { Double(precio) ?? 0 }
    /// El precio incluye IVA y el costo no: se compara contra el neto o el
    /// margen sale inflado por el impuesto.
    private var margen: Int? {
        guard c > 0, p > 0 else { return nil }
        let neto = p / (1 + RepoERP.tasa(iva))
        return Int(((neto - c) / c * 100).rounded())
    }
    private var puede: Bool { nombre.trimmingCharacters(in: .whitespaces).count >= 2 && p > 0 }

    /// Las mismas cinco de `UNIDADES` en `src/lib/data.ts`, en el mismo orden.
    private let unidades = ["UNIDAD", "CAJA", "KG", "LT", "PAQUETE"]
    /// Las que se venden por peso. Decide si la cantidad admite decimales, así
    /// que no es una etiqueta: cambia lo que el formulario deja escribir.
    private let pesables = ["KG", "LT", "GR", "ML"]

    /// La unidad como botones y no como campo libre.
    ///
    /// Escrita a mano aparecen "kg", "Kg", "kilo" y "KG" para la misma cosa, y
    /// después no hay forma de sumar stock ni de saber qué admite decimales.
    private var selectorUnidad: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Envuelve solo: en un teléfono angosto las cinco no entran en una
            // línea, y un scroll horizontal esconde las últimas.
            FlujoHorizontal(spacing: 7) {
                ForEach(unidades, id: \.self) { u in
                    let on = unidad == u
                    Button { unidad = u } label: {
                        Text(u)
                            .font(Tipo.barlow(.semibold, 12))
                            .foregroundStyle(on ? Color(hex: "#04617A") : t.ink2)
                            .padding(.horizontal, 13).padding(.vertical, 8)
                            .background(on ? Color(hex: "#E2F0F4") : t.card, in: .capsule)
                            .overlay {
                                Capsule().stroke(on ? Color(hex: "#04617A") : t.border)
                            }
                    }
                    .buttonStyle(.plain)
                }
            }

            Text(pesables.contains(unidad)
                 ? "Se vende por peso: admite decimales (1,350) y el precio es por \(unidad)."
                 : "Se cuenta de a uno: la cantidad siempre es entera.")
                .font(Tipo.barlow(.regular, 11.5))
                .foregroundStyle(t.ink2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    Bloque(titulo: "PRODUCTO") {
                        campo("Nombre", $nombre)
                        campo("Código / SKU", $sku)
                        campo("Código de barras", $barras)
                        if !categorias.isEmpty {
                            Picker("Categoría", selection: $categoriaId) {
                                Text("Sin categoría").tag("")
                                ForEach(categorias) { Text($0.nombre).tag($0.id) }
                            }
                            .pickerStyle(.menu).tint(C.azulMedio)
                        }
                        if !ubicaciones.isEmpty {
                            Picker("Depósito", selection: $ubicacionId) {
                                Text("Sin depósito").tag("")
                                ForEach(ubicaciones) { Text($0.nombre).tag($0.id) }
                            }
                            .pickerStyle(.menu).tint(C.azulMedio)
                        }
                    }

                    Bloque(titulo: "UNIDAD DE MEDIDA") {
                        selectorUnidad
                    }

                    Bloque(titulo: "PRECIOS") {
                        campo("Costo unitario promedio", $costo, teclado: .decimalPad)
                        campo("Precio de venta", $precio, teclado: .decimalPad)
                        Picker("IVA", selection: $iva) {
                            Text("10%").tag(Iva.diez)
                            Text("5%").tag(Iva.cinco)
                            Text("Exenta").tag(Iva.exenta)
                        }
                        .pickerStyle(.segmented)
                        if let margen {
                            Dato(k: "Margen sobre el neto", v: "\(margen) %")
                        }
                    }

                    Bloque(titulo: "STOCK") {
                        campo("Inventario inicial", $stockInicial, teclado: .decimalPad)
                        campo("Mínimo", $minimo, teclado: .decimalPad)
                    }

                    if let error { Aviso(texto: error, bg: Tint.errorBg, ink: Tint.errorInk) }
                }
                .padding(.vertical, 12)
            }
            .background(t.bg)
            .navigationTitle("Nuevo producto")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { Task { await guardar() } }
                        .disabled(!puede || guardando)
                }
            }
            .task {
                // Los catálogos son opcionales: si el ERP no los da, el producto
                // se carga igual sin categoría ni depósito.
                async let c = RepoERP.categorias()
                async let u = RepoERP.ubicaciones()
                (categorias, ubicaciones) = await (c, u)
            }
        }
    }

    private func guardar() async {
        guardando = true; error = nil
        do {
            let p = try await RepoERP.crearProducto(
                nombre: nombre.trimmingCharacters(in: .whitespaces),
                sku: sku.trimmingCharacters(in: .whitespaces),
                barras: barras, unidad: unidad,
                costo: Int(c.rounded()), precio: Int(p.rounded()),
                stockInicial: Double(stockInicial) ?? 0,
                minimo: Double(minimo) ?? 0,
                categoriaId: categoriaId, ubicacionId: ubicacionId
            )
            alGuardar(p)
            cerrar()
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
                ?? "No se pudo guardar el producto."
        }
        guardando = false
    }

    private func campo(_ e: String, _ v: Binding<String>,
                       teclado: UIKeyboardType = .default) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(e.uppercased()).font(Tipo.barlow(.semibold, 10)).tracking(1.2)
                .foregroundStyle(t.ink2)
            TextField("", text: v)
                .keyboardType(teclado)
                .autocorrectionDisabled()
                .font(.system(size: 16))
                .padding(.horizontal, 12).frame(height: 44)
                .background(t.bg, in: .rect(cornerRadius: 10))
                .overlay { RoundedRectangle(cornerRadius: 10).stroke(t.border) }
        }
    }
}

struct NuevoProveedorView: View {
    @Environment(\.tema) private var t
    @Environment(\.dismiss) private var cerrar

    @State private var nombre = ""
    @State private var ruc = ""
    @State private var rubro = ""
    @State private var contacto = ""
    @State private var tel = ""
    @State private var email = ""
    @State private var credito = false
    @State private var plazo = 30
    @State private var rubroIds: Set<String> = []
    @State private var rubros: [RepoERP.Opcion] = []
    @State private var guardando = false
    @State private var error: String?
    var alGuardar: (Proveedor) -> Void = { _ in }

    private var puede: Bool {
        nombre.trimmingCharacters(in: .whitespaces).count >= 2 && !guardando
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    Bloque(titulo: "PROVEEDOR") {
                        campo("Nombre o razón social", $nombre)
                        campo("RUC", $ruc)
                        // El rubro son las categorías del ERP, no texto libre:
                        // mandarlo escrito a mano no lo clasificaría en nada.
                        if rubros.isEmpty {
                            campo("Rubro", $rubro)
                        } else {
                            Text("RUBROS").font(Tipo.barlow(.semibold, 10)).tracking(1.2)
                                .foregroundStyle(t.ink2)
                            ForEach(rubros) { r in
                                Button {
                                    if rubroIds.contains(r.id) { rubroIds.remove(r.id) }
                                    else { rubroIds.insert(r.id) }
                                } label: {
                                    HStack {
                                        Text(r.nombre).font(Tipo.barlow(.regular, 13.5))
                                            .foregroundStyle(t.ink)
                                        Spacer()
                                        if rubroIds.contains(r.id) {
                                            Image(systemName: "checkmark").foregroundStyle(C.cian)
                                        }
                                    }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    Bloque(titulo: "CONTACTO") {
                        campo("Persona de contacto", $contacto)
                        campo("Teléfono", $tel, teclado: .phonePad)
                        campo("Correo", $email, teclado: .emailAddress)
                    }
                    Bloque(titulo: "CONDICIÓN DE PAGO") {
                        Picker("", selection: $credito) {
                            Text("Contado").tag(false)
                            Text("Crédito").tag(true)
                        }
                        .pickerStyle(.segmented)
                        if credito {
                            Stepper("Plazo: \(plazo) días", value: $plazo, in: 1...180, step: 15)
                                .font(Tipo.barlow(.regular, 14))
                        }
                    }

                    if let error { Aviso(texto: error, bg: Tint.errorBg, ink: Tint.errorInk) }
                }
                .padding(.vertical, 12)
            }
            .background(t.bg)
            .navigationTitle("Nuevo proveedor")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { Task { await guardar() } }.disabled(!puede)
                }
            }
            .task { rubros = await RepoERP.categoriasProveedor() }
        }
    }

    private func guardar() async {
        guardando = true; error = nil
        do {
            let p = try await RepoERP.crearProveedor(
                nombre: nombre.trimmingCharacters(in: .whitespaces),
                ruc: ruc, tel: tel, email: email,
                direccion: "", contacto: contacto,
                credito: credito, plazoDias: plazo,
                categoriaIds: Array(rubroIds)
            )
            alGuardar(p)
            cerrar()
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
                ?? "No se pudieron guardar los cambios."
        }
        guardando = false
    }

    private func campo(_ e: String, _ v: Binding<String>,
                       teclado: UIKeyboardType = .default) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(e.uppercased()).font(Tipo.barlow(.semibold, 10)).tracking(1.2)
                .foregroundStyle(t.ink2)
            TextField("", text: v)
                .keyboardType(teclado)
                .textInputAutocapitalization(teclado == .emailAddress ? .never : .words)
                .autocorrectionDisabled()
                .font(.system(size: 16))
                .padding(.horizontal, 12).frame(height: 44)
                .background(t.bg, in: .rect(cornerRadius: 10))
                .overlay { RoundedRectangle(cornerRadius: 10).stroke(t.border) }
        }
    }
}

/// Registrar compra: Proveedor → Producto → Condiciones.
struct NuevaCompraView: View {
    @Environment(\.tema) private var t
    @Environment(\.dismiss) private var cerrar

    @State private var provs: [Proveedor] = []
    @State private var prods: [InvProducto] = []
    @State private var provId = ""
    @State private var prodId = ""

    @State private var cantidad = ""
    @State private var costo = ""
    @State private var iva = Iva.diez
    @State private var credito = false
    @State private var plazo = 30
    @State private var cuotas = 1
    @State private var cargando = true
    @State private var timbrado = ""
    @State private var comprobante = ""
    @State private var cuentas: [RepoERP.Opcion] = []
    @State private var cuentaContableId = ""
    @State private var cuentaPagoId = ""
    @State private var nuevoProv = false
    @State private var guardando = false
    @State private var error: String?
    @State private var aviso: String?
    @Environment(Estado.self) private var estado
    var alGuardar: (Compra) -> Void = { _ in }

    private var n: Double { Double(cantidad.replacingOccurrences(of: ",", with: ".")) ?? 0 }
    private var cu: Double { Double(costo) ?? 0 }
    /// En compras el IVA va POR ENCIMA del costo: el proveedor cotiza neto.
    private var neto: Int { Int((cu * n).rounded()) }
    private var impuesto: Int { Int((Double(neto) * RepoERP.tasa(iva)).rounded()) }
    private var prov: Proveedor? { provs.first { $0.id == provId } }
    private var prod: InvProducto? { prods.first { $0.id == prodId } }
    private var puede: Bool {
        prov != nil && prod != nil && n > 0 && cu > 0
            && !cuentaContableId.isEmpty && (credito || !cuentaPagoId.isEmpty)
            && !guardando
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    if cargando { ProgressView().padding(.top, 30) } else {
                        Bloque(titulo: "PROVEEDOR") {
                            Picker("Proveedor", selection: $provId) {
                                Text("Elegir…").tag("")
                                ForEach(provs) { Text($0.nombre).tag($0.id) }
                            }
                            .pickerStyle(.menu).tint(C.azulMedio)
                            // Cargar un proveedor sin salir de la compra: si hay
                            // que volver atrás, se pierde lo ya cargado.
                            Button("Cargar un proveedor nuevo") {
                                if let m = Planes.motivoBloqueo(.comprasNuevoProveedor,
                                                                estado.contextoPlan()) {
                                    withAnimation(.spring(duration: 0.3)) { aviso = m }
                                } else { nuevoProv = true }
                            }
                            .font(Tipo.barlow(.semibold, 13))
                            .foregroundStyle(C.azulMedio)
                        }
                        Bloque(titulo: "PRODUCTO") {
                            Picker("Producto", selection: $prodId) {
                                Text("Elegir…").tag("")
                                ForEach(prods) { Text($0.nombre).tag($0.id) }
                            }
                            .pickerStyle(.menu).tint(C.azulMedio)
                            campo("Cantidad", $cantidad, teclado: .decimalPad)
                                .onChange(of: prodId) { _, _ in
                                    if costo.isEmpty, let c = prod?.costo, c > 0 { costo = "\(c)" }
                                    if let i = prod?.iva { iva = i }
                                }
                            campo("Costo unitario (neto)", $costo, teclado: .decimalPad)
                            Picker("IVA", selection: $iva) {
                                Text("10%").tag(Iva.diez)
                                Text("5%").tag(Iva.cinco)
                                Text("Exenta").tag(Iva.exenta)
                            }
                            .pickerStyle(.segmented)
                        }
                        Bloque(titulo: "COMPROBANTE") {
                            campo("Timbrado", $timbrado, teclado: .numberPad)
                            campo("N.° de factura", $comprobante)
                        }
                        Bloque(titulo: "CONDICIÓN") {
                            Picker("", selection: $credito) {
                                Text("Contado").tag(false)
                                Text("Crédito").tag(true)
                            }
                            .pickerStyle(.segmented)
                            if credito {
                                Stepper("Plazo: \(plazo) días", value: $plazo, in: 1...180, step: 15)
                                    .font(Tipo.barlow(.regular, 14))
                                Stepper("Cuotas: \(cuotas)", value: $cuotas, in: 1...36)
                                    .font(Tipo.barlow(.regular, 14))
                            }
                        }
                        // Las dos cuentas no son decorativas: sin ellas el ERP
                        // no puede asentar el movimiento y rechaza la compra.
                        Bloque(titulo: "CONTABILIDAD") {
                            Text("Elegí en qué cuenta contable se asienta la compra.")
                                .font(Tipo.barlow(.regular, 12)).foregroundStyle(t.ink3)
                            Picker("Cuenta contable", selection: $cuentaContableId) {
                                Text("Elegir…").tag("")
                                ForEach(cuentas) { Text($0.nombre).tag($0.id) }
                            }
                            .pickerStyle(.menu).tint(C.azulMedio)
                            if !credito {
                                Picker("Cuenta de pago", selection: $cuentaPagoId) {
                                    Text("Elegir…").tag("")
                                    ForEach(cuentas) { Text($0.nombre).tag($0.id) }
                                }
                                .pickerStyle(.menu).tint(C.azulMedio)
                                Text("Elegí de qué cuenta sale el pago.")
                                    .font(Tipo.barlow(.regular, 11.5)).foregroundStyle(t.ink3)
                            }
                        }
                        if let error { Aviso(texto: error, bg: Tint.errorBg, ink: Tint.errorInk) }
                        if neto > 0 {
                            Bloque(titulo: "TOTAL") {
                                Dato(k: "Neto", v: Panel.gs(neto))
                                Dato(k: "IVA \(iva.rawValue) sobre el costo", v: Panel.gs(impuesto))
                                HStack {
                                    Text("TOTAL").font(Tipo.barlow(.semibold, 12)).tracking(1.2)
                                        .foregroundStyle(t.ink2)
                                    Spacer()
                                    Text(Panel.gs(neto + impuesto))
                                        .font(Tipo.barlow(.bold, 20)).foregroundStyle(t.ink)
                                }
                            }
                        }
                    }
                }
                .padding(.vertical, 12)
            }
            .background(t.bg)
            .navigationTitle("Nueva compra")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { cerrar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { Task { await guardar() } }.disabled(!puede)
                }
            }
            .avisoPlan($aviso)
            .sheet(isPresented: $nuevoProv) {
                NuevoProveedorView { p in
                    provs.insert(p, at: 0)
                    provId = p.id
                }
            }
            .task {
                async let a = try? RepoERP.proveedores()
                async let b = try? RepoERP.inventario()
                async let c = RepoERP.cuentasContables()
                let (pv, pr, cu) = await (a, b, c)
                provs = pv ?? []; prods = pr ?? []; cuentas = cu
                cargando = false
            }
        }
    }

    private func guardar() async {
        guard let pv = prov, let pd = prod else { return }
        guardando = true; error = nil
        do {
            let c = try await RepoERP.crearCompra(
                provId: pv.id, provNombre: pv.nombre,
                prod: pd, cantidad: n, costo: Int(cu.rounded()), iva: iva,
                credito: credito, plazoDias: plazo, cuotas: cuotas,
                timbrado: timbrado, comprobante: comprobante,
                cuentaContableId: cuentaContableId, cuentaPagoId: cuentaPagoId
            )
            alGuardar(c)
            cerrar()
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
                ?? "No se pudo registrar la compra."
        }
        guardando = false
    }

    private func campo(_ e: String, _ v: Binding<String>,
                       teclado: UIKeyboardType = .default) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(e.uppercased()).font(Tipo.barlow(.semibold, 10)).tracking(1.2)
                .foregroundStyle(t.ink2)
            TextField("", text: v)
                .keyboardType(teclado).autocorrectionDisabled()
                .font(.system(size: 16))
                .padding(.horizontal, 12).frame(height: 44)
                .background(t.bg, in: .rect(cornerRadius: 10))
                .overlay { RoundedRectangle(cornerRadius: 10).stroke(t.border) }
        }
    }
}

/// Elegir sobre qué producto se ajusta el stock.
///
/// Es el paso que Android resuelve con un buscador dentro de la misma pantalla
/// del ajuste. Acá va antes y aparte porque el ajuste ya decide cantidad,
/// signo y motivo: meter además la búsqueda en la misma hoja deja cuatro
/// decisiones encima, y la primera —sobre qué producto— es la que no se puede
/// equivocar, porque el ajuste se aplica igual.
struct ElegirProductoAjusteView: View {
    @Environment(\.tema) private var t
    @Environment(\.dismiss) private var cerrar
    let productos: [InvProducto]
    @State private var q = ""

    private var vistas: [InvProducto] {
        let n = q.trimmingCharacters(in: .whitespaces).lowercased()
        guard !n.isEmpty else { return productos }
        return productos.filter {
            $0.nombre.lowercased().contains(n) || $0.sku.lowercased().contains(n)
                || $0.barras.contains(n)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    if vistas.isEmpty {
                        Aviso(texto: productos.isEmpty
                              ? "Todavía no hay productos cargados."
                              : "Probá con otro término.",
                              bg: t.card, ink: t.ink2)
                    }
                    ForEach(vistas) { p in
                        NavigationLink { AjusteStockView(producto: p) } label: {
                            FilaCard {
                                HStack(spacing: 12) {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(p.nombre)
                                            .font(Tipo.barlow(.semibold, 14.5))
                                            .foregroundStyle(t.ink).lineLimit(1)
                                        Text([p.sku, p.unidad].filter { !$0.isEmpty }
                                            .joined(separator: " · "))
                                            .font(Tipo.barlow(.regular, 11.5))
                                            .foregroundStyle(t.ink2).lineLimit(1)
                                    }
                                    Spacer(minLength: 0)
                                    Image(systemName: "chevron.right")
                                        .font(.system(size: 12, weight: .semibold))
                                        .foregroundStyle(t.ink3)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 12)
            }
            .background(t.bg)
            .searchable(text: $q, prompt: "Producto, SKU o código de barras")
            .navigationTitle("Ajustar stock")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { cerrar() } }
            }
        }
    }
}
