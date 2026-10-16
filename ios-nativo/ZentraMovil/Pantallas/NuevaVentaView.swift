import SwiftUI

/// Nueva venta. Port del asistente de `VentaScreen.tsx`:
/// Cliente → Productos → Pago → Resumen, y al confirmar se registra en el ERP.
///
/// **El IVA va contenido en el precio**, como se factura en Paraguay: de ₲33.500
/// al 10% el impuesto son ₲3.045, no ₲3.350. Se suma sin redondear y se redondea
/// una sola vez al final; redondear por línea y después sumar da un guaraní de
/// diferencia, y ahí la factura y lo que guarda el ERP dejan de coincidir.
struct NuevaVentaView: View {
    @Environment(\.tema) private var t
    @Environment(\.dismiss) private var cerrar
    @Environment(Estado.self) private var estado
    @State private var aviso: String?

    /// El crédito no está en todos los planes. Se suma a la regla del ERP —que
    /// exige cliente identificado— y son dos cosas distintas: una es comercial
    /// y la otra es contable.
    private var sinCredito: String? {
        Planes.motivoBloqueo(.ventasCredito, estado.contextoPlan())
    }

    /// El orden es el de `PASOS_VENTA` en Android: el resumen va **antes** del
    /// pago, no después.
    ///
    /// Primero se cierra qué se vende y cuánto da, y recién después se decide
    /// cómo se cobra: el plazo del crédito se elige mirando el total, no al
    /// revés. Con el pago en el medio, el resumen quedaba de trámite —ya estaba
    /// todo decidido— y nadie lo leía.
    enum Paso: Int, CaseIterable {
        case cliente, productos, resumen, pago
        var titulo: String {
            switch self {
            case .cliente: "Cliente"; case .productos: "Productos"
            case .resumen: "Resumen"; case .pago: "Pago"
            }
        }
    }

    @State private var paso: Paso = .cliente
    @State private var clientes: [Cliente] = []
    @State private var catalogo: [InvProducto] = []
    @State private var cargando = true

    @State private var cliente: Cliente?
    @State private var sinNombre = false
    @State private var nuevoCliente = false
    @State private var buscar = ""
    @State private var carrito: [String: Double] = [:]   // id de producto → cantidad

    @State private var credito = false
    @State private var plazo = 30
    @State private var metodo = "efectivo"

    @State private var guardando = false
    @State private var resultado: String?
    @State private var error: String?

    private var lineas: [(producto: InvProducto, cantidad: Double)] {
        catalogo.compactMap { p in
            guard let q = carrito[p.id], q > 0 else { return nil }
            return (p, q)
        }
    }

    /// El precio que corresponde a este cliente, no el de lista a secas.
    private func precio(_ p: InvProducto) -> Int { Precios.aCobrar(p, cliente) }

    private var total: Int {
        lineas.reduce(0) { $0 + Int((Double(precio($1.producto)) * $1.cantidad).rounded()) }
    }

    /// Se suma sin redondear y se redondea una sola vez al final.
    private var iva: Int {
        let crudo = lineas.reduce(0.0) { a, l in
            let bruto = Double(precio(l.producto)) * l.cantidad
            let r = RepoERP.tasa(l.producto.iva)
            return a + bruto * r / (1 + r)
        }
        return Int(crudo.rounded())
    }

    /// El crédito exige cliente identificado: es la regla del ERP.
    private var puedeCredito: Bool { cliente != nil }

    private var puedeAvanzar: Bool {
        switch paso {
        case .cliente: cliente != nil || sinNombre
        case .productos: !lineas.isEmpty
        case .pago: !credito || puedeCredito
        case .resumen: !guardando
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            pasos
            Divider()
            contenido
            barra
        }
        .background(t.bg)
        .cerrarTeclado()
        .avisoPlan($aviso)
        .sheet(isPresented: $nuevoCliente) {
            // Al guardar queda elegido para esta venta: quien lo dio de alta
            // acá lo hizo para facturarle ahora, no para tenerlo en la lista.
            NuevoClienteView(desdeVenta: true) { c in
                clientes.insert(c, at: 0)
                cliente = c
                sinNombre = false
            }
        }
        .navigationTitle("Nueva venta")
        .navigationBarTitleDisplayMode(.inline)
        .task { await cargar() }
        .alert("Venta realizada", isPresented: .constant(resultado != nil)) {
            Button("Listo") { cerrar() }
        } message: {
            Text("Número \(resultado ?? "")")
        }
    }

    private var pasos: some View {
        HStack(spacing: 6) {
            ForEach(Paso.allCases, id: \.self) { p in
                VStack(spacing: 5) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(p.rawValue <= paso.rawValue ? C.cian : t.border)
                        .frame(height: 4)
                    Text(p.titulo)
                        .font(Tipo.barlow(.semibold, 10.5))
                        .foregroundStyle(p == paso ? t.ink : t.ink3)
                }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(t.card)
    }

    @ViewBuilder
    private var contenido: some View {
        if cargando {
            Spacer(); ProgressView(); Spacer()
        } else {
            ScrollView {
                VStack(spacing: 10) {
                    switch paso {
                    case .cliente: pasoCliente
                    case .productos: pasoProductos
                    case .pago: pasoPago
                    case .resumen: pasoResumen
                    }
                }
                .padding(.vertical, 12)
            }
        }
    }

    // MARK: pasos

    private var pasoCliente: some View {
        VStack(spacing: 10) {
            Button { sinNombre = true; cliente = nil } label: {
                FilaCard {
                    HStack(spacing: 12) {
                        // "S/N" y no un ícono: es la sigla con la que se marca
                        // una venta sin nombre en la factura, la misma que se
                        // va a ver después en el listado.
                        Text("S/N")
                            .font(Tipo.barlow(.semibold, 12)).foregroundStyle(t.ink2)
                            .frame(width: 38, height: 38)
                            .background(t.bg, in: .rect(cornerRadius: 10))
                        Text("Sin nombre")
                            .font(Tipo.barlow(.semibold, 14)).foregroundStyle(t.ink)
                        Spacer()
                        if sinNombre { Image(systemName: "checkmark").foregroundStyle(C.cian) }
                    }
                }
            }
            .buttonStyle(.plain)

            Text("CLIENTE IDENTIFICADO")
                .font(Tipo.barlow(.semibold, 10)).tracking(1.4).foregroundStyle(t.ink2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)

            Button { nuevoCliente = true } label: {
                FilaCard {
                    HStack(spacing: 12) {
                        Image(systemName: "plus")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(C.cian)
                            .frame(width: 38, height: 38)
                            .background(t.bg, in: .rect(cornerRadius: 10))
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Registrar nuevo cliente")
                                .font(Tipo.barlow(.semibold, 14)).foregroundStyle(t.ink)
                            Text("RUC o cédula y nombre")
                                .font(Tipo.barlow(.regular, 11.5)).foregroundStyle(t.ink2)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold)).foregroundStyle(t.ink3)
                    }
                }
            }
            .buttonStyle(.plain)

            if clientes.isEmpty {
                Aviso(texto: "Todavía no hay clientes cargados.", bg: t.card, ink: t.ink2)
            }
            // Por documento además de por nombre: al mostrador se pregunta el
            // RUC, no la razón social exacta con la que quedó cargado.
            ForEach(clientes.filter { c in
                let n = buscar.trimmingCharacters(in: .whitespaces).lowercased()
                return n.isEmpty || [c.nombre, c.doc].contains { $0.lowercased().contains(n) }
            }) { c in
                Button { cliente = c; sinNombre = false } label: {
                    FilaCard {
                        HStack(spacing: 12) {
                            Inicial(texto: c.nombre, color: C.azulMedio)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(c.nombre).font(Tipo.barlow(.semibold, 14))
                                    .foregroundStyle(t.ink).lineLimit(1)
                                Text(c.doc).font(Tipo.barlow(.regular, 11.5)).foregroundStyle(t.ink2)
                            }
                            Spacer(minLength: 0)
                            if cliente?.id == c.id {
                                Image(systemName: "checkmark").foregroundStyle(C.cian)
                            }
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .searchable(text: $buscar, prompt: "Buscar por nombre, RUC o CI…")
    }

    private var pasoProductos: some View {
        VStack(spacing: 10) {
            if catalogo.isEmpty {
                Aviso(texto: "No hay stock disponible para vender.", bg: t.card, ink: t.ink2)
            }
            ForEach(catalogo.filter {
                buscar.isEmpty || $0.nombre.lowercased().contains(buscar.lowercased())
                    || $0.sku.lowercased().contains(buscar.lowercased())
            }) { p in
                FilaCard {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(p.nombre).font(Tipo.barlow(.semibold, 14))
                                .foregroundStyle(t.ink).lineLimit(1)
                            HStack(spacing: 6) {
                                Text("\(Panel.gs(precio(p))) · \(p.iva.rawValue) · stock \(Int(p.stock))")
                                    .font(Tipo.barlow(.regular, 11)).foregroundStyle(t.ink2)
                                if precio(p) != p.precio {
                                    Text("mayorista").font(Tipo.barlow(.semibold, 10))
                                        .foregroundStyle(Tint.okInk)
                                }
                            }
                        }
                        Spacer(minLength: 0)
                        Contador(carrito[p.id] ?? 0) { n in
                            carrito[p.id] = max(0, n)
                        }
                    }
                }
            }
        }
        .searchable(text: $buscar, prompt: "Buscar producto…")
    }

    private var pasoPago: some View {
        VStack(spacing: 12) {
            FilaCard {
                VStack(alignment: .leading, spacing: 12) {
                    Text("CONDICIÓN").font(Tipo.barlow(.semibold, 10)).tracking(1.4)
                        .foregroundStyle(t.ink2)
                    Picker("", selection: $credito) {
                        Text("Contado").tag(false)
                        Text("Crédito").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: credito) { _, nuevo in
                        if nuevo, let m = sinCredito {
                            credito = false
                            withAnimation(.spring(duration: 0.3)) { aviso = m }
                        }
                    }

                    if credito && !puedeCredito {
                        // La regla del ERP: a crédito hace falta saber a quién
                        // cobrarle. Una venta sin nombre no se puede fiar.
                        Text("El crédito es solo para clientes identificados.")
                            .font(Tipo.barlow(.regular, 12)).foregroundStyle(Tint.errorInk)
                            .padding(10).frame(maxWidth: .infinity, alignment: .leading)
                            .background(Tint.errorBg, in: .rect(cornerRadius: 10))
                    } else if credito {
                        Stepper("Plazo: \(plazo) días", value: $plazo, in: 1...180, step: 15)
                            .font(Tipo.barlow(.regular, 14))
                        Text("Se cobra después: no entra plata a la caja ahora.")
                            .font(Tipo.barlow(.regular, 12)).foregroundStyle(t.ink3)
                    } else {
                        Picker("Método", selection: $metodo) {
                            Text("Efectivo").tag("efectivo")
                            Text("Transferencia").tag("transferencia")
                            Text("Cheque").tag("cheque")
                        }
                        .pickerStyle(.segmented)
                        Text("Se cobra ahora.")
                            .font(Tipo.barlow(.regular, 12)).foregroundStyle(t.ink3)
                    }
                }
            }
        }
    }

    private var pasoResumen: some View {
        VStack(spacing: 10) {
            FilaCard {
                VStack(alignment: .leading, spacing: 8) {
                    fila("Cliente", cliente?.nombre ?? "Sin nombre")
                    Divider()
                    ForEach(lineas, id: \.producto.id) { l in
                        fila("\(Int(l.cantidad)) × \(l.producto.nombre)",
                             Panel.gs(Int((Double(precio(l.producto)) * l.cantidad).rounded())))
                    }
                    Divider()
                    fila("IVA incluido", Panel.gs(iva))
                    HStack {
                        Text("TOTAL").font(Tipo.barlow(.semibold, 12)).tracking(1.2)
                            .foregroundStyle(t.ink2)
                        Spacer()
                        Text(Panel.gs(total)).font(Tipo.barlow(.bold, 20)).foregroundStyle(t.ink)
                    }
                }
            }
            if let error {
                Aviso(texto: error, bg: Tint.errorBg, ink: Tint.errorInk)
            }
        }
    }

    private var barra: some View {
        HStack(spacing: 10) {
            if paso != .cliente {
                Button("Atrás") {
                    paso = Paso(rawValue: paso.rawValue - 1) ?? .cliente
                    buscar = ""
                }
                .font(Tipo.barlow(.semibold, 15)).foregroundStyle(t.ink2)
                .frame(maxWidth: .infinity).frame(height: 48)
            }
            Button {
                if paso == .pago { Task { await registrar() } }
                else { paso = Paso(rawValue: paso.rawValue + 1) ?? .pago; buscar = "" }
            } label: {
                ZStack {
                    if guardando { ProgressView().tint(.white) }
                    else { Text(paso == .pago ? "Confirmar venta" : "Continuar") }
                }
                .font(Tipo.barlow(.semibold, 15)).foregroundStyle(.white)
                .frame(maxWidth: .infinity).frame(height: 48)
                .background(puedeAvanzar ? C.azulMedio : t.dim, in: .rect(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .disabled(!puedeAvanzar)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(t.card)
    }

    private func fila(_ k: String, _ v: String) -> some View {
        HStack {
            Text(k).font(Tipo.barlow(.regular, 13)).foregroundStyle(t.ink2).lineLimit(1)
            Spacer(minLength: 8)
            Text(v).font(Tipo.barlow(.semibold, 13)).foregroundStyle(t.ink)
        }
    }

    private func cargar() async {
        async let c = try? RepoERP.clientes()
        async let p = try? RepoERP.inventario()
        let (cc, pp) = await (c, p)
        clientes = cc ?? []
        // Sólo lo que se puede vender: ofrecer algo sin stock lleva a una venta
        // que el ERP después rechaza.
        catalogo = (pp ?? []).filter { $0.stock > 0 }
        cargando = false
    }

    private func registrar() async {
        guardando = true; error = nil
        do {
            resultado = try await RepoERP.crearVenta(
                clienteId: cliente?.id, lineas: lineas,
                credito: credito, plazoDias: plazo, metodo: metodo,
                cliente: cliente
            )
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
                ?? "No se pudo registrar la venta. Probá de nuevo."
        }
        guardando = false
    }
}

/// Más/menos con la cantidad al medio.
///
/// Se llama `Contador` y no `Stepper` a propósito: un `Stepper` propio pisa al
/// del sistema en todo el archivo, y el del plazo de crédito dejaba de compilar.
struct Contador: View {
    @Environment(\.tema) private var t
    let valor: Double
    let cambiar: (Double) -> Void

    init(_ valor: Double, cambiar: @escaping (Double) -> Void) {
        self.valor = valor; self.cambiar = cambiar
    }

    var body: some View {
        HStack(spacing: 10) {
            boton("minus") { cambiar(valor - 1) }
            Text(valor == valor.rounded() ? "\(Int(valor))" : String(format: "%.2f", valor))
                .font(Tipo.barlow(.semibold, 15)).foregroundStyle(t.ink)
                .frame(minWidth: 26)
            boton("plus") { cambiar(valor + 1) }
        }
    }

    private func boton(_ icono: String, _ accion: @escaping () -> Void) -> some View {
        Button(action: accion) {
            Image(systemName: icono)
                .font(.system(size: 13, weight: .bold)).foregroundStyle(C.azulMedio)
                .frame(width: 30, height: 30)
                .background(t.bg, in: .circle)
        }
        .buttonStyle(.plain)
    }
}
