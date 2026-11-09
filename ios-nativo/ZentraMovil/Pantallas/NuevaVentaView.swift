import SwiftUI

/// Nueva venta. Port del asistente de `VentaScreen.tsx`:
/// Cliente → Productos → Pago → Resumen, y al confirmar se registra en el ERP.
///
/// **El IVA va contenido en el precio**, como se factura en Paraguay: de ₲33.500
/// al 10% el impuesto son ₲3.045, no ₲3.350. Se suma sin redondear y se redondea
/// una sola vez al final; redondear por línea y después sumar da un guaraní de
/// diferencia, y ahí la factura y lo que guarda el ERP dejan de coincidir.
struct NuevaVentaView: View {
    /// Se llama cuando la venta quedó registrada en el ERP.
    ///
    /// Existe porque Inicio carga su panel una sola vez, con `.task`, y volver
    /// de acá no lo vuelve a disparar: el total del día se quedaba en lo que
    /// valía al abrir la app, y recién cambiaba tirando de la pantalla para
    /// refrescar. Quien acaba de facturar mira justamente ese número.
    ///
    /// Va como aviso hacia afuera y no recargando desde acá porque el panel es
    /// de Inicio: esta pantalla no tiene por qué saber qué hay que recargar,
    /// sólo que vendió.
    var alRegistrar: () -> Void = {}

    /// Qué se está armando.
    ///
    /// Los pasos son los mismos —cliente, productos, resumen— y es a propósito:
    /// reusar el armado es lo que hace que el cliente elegido, el precio
    /// mayorista y el IVA salgan igual que en una venta. Lo único que cambia es
    /// que al final, en vez de cobrar, se guarda.
    enum Modo { case venta, presupuesto }
    var modo: Modo = .venta

    /// El presupuesto que se está convirtiendo, si se está convirtiendo uno.
    /// Al registrar la venta queda marcado como vendido y apuntando a ella.
    var desdePresupuesto: Presupuesto?

    /// Los precios que el cliente aceptó, por producto.
    ///
    /// Al convertir un presupuesto mandan éstos y no los de la lista de hoy: el
    /// cliente dijo que sí a esos números y la venta no puede salir con otros.
    /// Vacío cuando no hay nada que fijar.
    var preciosFijos: [String: Int] = [:]

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

    /// Los pasos de este armado. Un presupuesto no se cobra, así que no tiene
    /// paso de pago: preguntar cómo se paga algo que todavía no se vendió
    /// confunde, y la respuesta no se guarda en ningún lado.
    private var pasosVisibles: [Paso] {
        modo == .presupuesto ? [.cliente, .productos, .resumen] : Paso.allCases
    }

    private var ultimoPaso: Paso { pasosVisibles.last ?? .pago }

    @State private var paso: Paso = .cliente
    /// Cuántos días vale el precio. Sólo en presupuesto.
    @State private var validez = 15
    /// Lo que se le escribe al cliente. Sólo en presupuesto.
    @State private var notas = ""
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
    ///
    /// Al convertir un presupuesto manda el precio que el cliente aceptó: si
    /// la lista cambió entre el presupuesto y la venta, el que vale es el que
    /// se le pasó por escrito.
    private func precio(_ p: InvProducto) -> Int {
        preciosFijos[p.id] ?? Precios.aCobrar(p, cliente)
    }

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
        if guardando { return false }
        switch paso {
        case .cliente: return cliente != nil || sinNombre
        case .productos: return !lineas.isEmpty
        case .pago: return !credito || puedeCredito
        case .resumen: return !lineas.isEmpty
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
        .navigationTitle(modo == .presupuesto ? "Nuevo presupuesto" : "Nueva venta")
        .navigationBarTitleDisplayMode(.inline)
        .task { await cargar() }
        .alert(modo == .presupuesto ? "Presupuesto guardado" : "Venta realizada",
               isPresented: .constant(resultado != nil)) {
            Button("Listo") { cerrar() }
        } message: {
            Text("Número \(resultado ?? "")")
        }
    }

    private var pasos: some View {
        HStack(spacing: 6) {
            ForEach(pasosVisibles, id: \.self) { p in
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
            buscador("Buscar por nombre, RUC o CI…")

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
    }

    private var pasoProductos: some View {
        VStack(spacing: 10) {
            buscador("Buscar producto…")

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
                                        .foregroundStyle(t.ok)
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
            if modo == .presupuesto {
                FilaCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("HASTA CUÁNDO VALE")
                            .font(Tipo.barlow(.semibold, 10)).tracking(1.4)
                            .foregroundStyle(t.ink2)
                        // Una fecha y no "7 días": el cliente lee el mensaje
                        // tres días después y tiene que saber hasta cuándo
                        // vale sin sacar la cuenta.
                        Picker("", selection: $validez) {
                            ForEach(Presupuesto.valideces, id: \.self) { d in
                                Text("\(d) días").tag(d)
                            }
                        }
                        .pickerStyle(.segmented)
                        Text("Válido hasta el \(TextoPresupuesto.dia(hasta))")
                            .font(Tipo.barlow(.regular, 12)).foregroundStyle(t.ink2)

                        Divider()

                        Text("NOTAS PARA EL CLIENTE")
                            .font(Tipo.barlow(.semibold, 10)).tracking(1.4)
                            .foregroundStyle(t.ink2)
                        TextField("Formas de pago, plazo de entrega…",
                                  text: $notas, axis: .vertical)
                            .font(Tipo.barlow(.regular, 14))
                            .lineLimit(2...5)
                    }
                }
            }

            if let error {
                Aviso(texto: error, bg: Tint.errorBg, ink: Tint.errorInk)
            }
        }
    }

    /// Hasta cuándo valdría con la validez elegida.
    private var hasta: Date {
        Calendar.current.date(byAdding: .day, value: validez, to: Date()) ?? Date()
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
                if paso == ultimoPaso { Task { await registrar() } }
                else { paso = Paso(rawValue: paso.rawValue + 1) ?? ultimoPaso; buscar = "" }
            } label: {
                ZStack {
                    if guardando { ProgressView().tint(.white) }
                    else {
                        Text(paso != ultimoPaso ? "Continuar"
                             : modo == .presupuesto ? "Guardar presupuesto"
                             : "Confirmar venta")
                    }
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

    /// El buscador del paso, adentro del contenido.
    ///
    /// Era un `.searchable` y no puede serlo: `.searchable` cuelga de la barra
    /// de navegación, y esta pantalla tiene su propia barra de pasos ahí
    /// arriba. iOS lo dibujaba flotando encima de "Cliente · Productos ·
    /// Resumen", sobre todo mientras cargaba. Un campo común no se mueve de
    /// donde se lo pone.
    private func buscador(_ texto: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(t.ink3)
            TextField(texto, text: $buscar)
                .font(Tipo.barlow(.regular, 14.5))
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if !buscar.isEmpty {
                Button { buscar = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 15))
                        .foregroundStyle(t.ink3)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12).frame(height: 42)
        .background(t.card, in: .rect(cornerRadius: 11))
        .overlay { RoundedRectangle(cornerRadius: 11).stroke(t.border) }
        .padding(.horizontal, 14)
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
        defer { guardando = false }

        if modo == .presupuesto {
            do {
                let p = try await RepoERP.crearPresupuesto(
                    clienteId: cliente?.id, cliente: cliente, lineas: lineas,
                    validezDias: validez, notas: notas)
                resultado = p.numero
                alRegistrar()
            } catch {
                self.error = (error as? LocalizedError)?.errorDescription
                    ?? "No se pudo guardar el presupuesto. Probá de nuevo."
            }
            return
        }

        do {
            resultado = try await RepoERP.crearVenta(
                clienteId: cliente?.id, lineas: lineas,
                credito: credito, plazoDias: plazo, metodo: metodo,
                cliente: cliente
            )
            // Acá y no al cerrar: entre que se confirma y que alguien toca
            // "Listo" pasan unos segundos, y que el panel los use para
            // recargar es gratis. Al volver, el número ya está puesto.
            alRegistrar()

            // El presupuesto queda cerrado y apuntando a la venta. Si esto
            // falla, la venta igual se hizo: lo que se pierde es la marca, no
            // la plata, así que no se deshace nada ni se muestra un error que
            // haría dudar de una venta que sí entró.
            if let pre = desdePresupuesto, let numero = resultado {
                try? await RepoERP.cerrarPresupuesto(pre.id, numeroDeVenta: numero)
            }
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
                ?? "No se pudo registrar la venta. Probá de nuevo."
        }
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
                .font(.system(size: 13, weight: .bold)).foregroundStyle(t.marca)
                .frame(width: 30, height: 30)
                .background(t.bg, in: .circle)
        }
        .buttonStyle(.plain)
    }
}
