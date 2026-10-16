import SwiftUI

/// Reportes. Port de `src/mobile/screens/ReportesScreen.tsx`.
///
/// Tres solapas y cuatro rangos, igual que Android. Los números salen del ERP:
/// `GET /ventas` para la solapa de ventas y `GET /productos` para la de
/// inventario. Compras todavía no tiene su endpoint mapeado de este lado, y lo
/// dice en vez de mostrar ceros.
struct ReportesView: View {
    @Environment(\.tema) private var t
    @Environment(\.colorScheme) private var esquema
    @Environment(Estado.self) private var estado
    @State private var aviso: String?

    /// El color de la solapa activa. Cada reporte tiene el suyo: el color
    /// identifica de qué estás mirando, no decora.
    private var tono: Color { solapa.colorReporte.color(oscuro: esquema == .dark) }

    enum Solapa: String, CaseIterable { case ventas = "Ventas", inventario = "Inventario", compras = "Compras" }
    /// Los atajos de rango.
    ///
    /// Eran Hoy / 7 días / 30 días / Este mes, igual que la primera versión de
    /// Android, y "30 días" y "Este mes" se pisan: a mitad de mes son casi lo
    /// mismo, y entre los dos ocupaban el lugar del que falta de verdad, que
    /// es el año. Van de lo chico a lo grande sin repetirse.
    enum Rango: String, CaseIterable {
        case hoy = "Hoy", siete = "7 días", mes = "Este mes", anio = "Este año"

        /// Desde cuándo, contando siempre desde hoy.
        func desde(_ hoy: Date = Date()) -> Date {
            let c = Calendar.current
            switch self {
            case .hoy: return c.startOfDay(for: hoy)
            case .siete: return c.date(byAdding: .day, value: -6, to: c.startOfDay(for: hoy)) ?? hoy
            case .mes: return c.date(from: c.dateComponents([.year, .month], from: hoy)) ?? hoy
            case .anio: return c.date(from: c.dateComponents([.year], from: hoy)) ?? hoy
            }
        }
    }

    /// Qué acción del plan habilita cada reporte. Ventas no se bloquea nunca:
    /// si no se pudiera ver lo que se vendió, la app no serviría para nada.
    private func accion(_ s: Solapa) -> Accion? {
        switch s {
        case .ventas: nil
        case .inventario: .dashboardInventario
        case .compras: .dashboardCompras
        }
    }

    private func bloqueo(_ s: Solapa) -> String? {
        accion(s).flatMap { Planes.motivoBloqueo($0, estado.contextoPlan()) }
    }

    @State private var solapa: Solapa = .ventas
    @State private var rango: Rango? = .siete
    @State private var desde: Date = Rango.siete.desde()
    @State private var hasta: Date = Date()

    /// Cuántos días abarca el rango elegido, contando los dos extremos.
    private var dias: Int {
        let c = Calendar.current
        let d = c.dateComponents([.day], from: c.startOfDay(for: desde),
                                 to: c.startOfDay(for: hasta)).day ?? 0
        return max(1, d + 1)
    }
    @State private var ventas: [Venta] = []
    @State private var productos: [InvProducto] = []
    @State private var comprasFilas: [Compra] = []
    @State private var cargando = true
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                selectorSolapa
                selectorRango
                Text(textoRango)
                    .font(Tipo.barlow(.regular, 11.5)).foregroundStyle(t.ink2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)

                if cargando {
                    ProgressView().padding(.top, 40)
                } else if let error {
                    Aviso(texto: error, bg: Tint.errorBg, ink: Tint.errorInk)
                } else if let b = bloqueo(solapa) {
                    Aviso(texto: b, bg: Tint.avisoBg, ink: Tint.avisoInk)
                } else if !hayDatos {
                    vacio
                } else {
                    switch solapa {
                    case .ventas: cuerpoVentas
                    case .inventario: cuerpoInventario
                    case .compras: cuerpoCompras
                    }
                }
            }
            .padding(.vertical, 12)
        }
        .background(t.bg)
        .avisoPlan($aviso)
        .navigationTitle("Reportes")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink { DetalleVentasView() } label: { Text("Detalle") }
            }
            ToolbarItem(placement: .topBarTrailing) {
                // En Android este botón sólo cambia su propia etiqueta a
                // "✓ Exportado" y no produce ningún archivo. El texto es el
                // mismo; acá entrega el PDF, porque compartir ya viene hecho
                // en iOS y prometer un archivo que no llega se descubre justo
                // cuando alguien lo necesita.
                ShareLink(item: Pdf.deTexto(reporteTexto, titulo: "Reporte \(solapa.rawValue)"),
                          preview: SharePreview("Reporte \(solapa.rawValue)")) {
                    Text("Exportar")
                }
            }
        }
        .task(id: [desde, hasta]) { await cargar() }
        .refreshable { await cargar() }
    }

    /// Si hay algo que graficar. Sin esto, un período sin ventas dibuja un
    /// gráfico de ceros, que parece un dato y no lo es.
    private var hayDatos: Bool {
        switch solapa {
        case .ventas: !ventas.isEmpty
        case .inventario: !productos.isEmpty
        case .compras: !comprasFilas.isEmpty
        }
    }

    /// Qué decir cuando no hay nada, con los mismos textos que Android.
    ///
    /// El detalle repite el rango y nombra los atajos: "no hay datos" sin decir
    /// de cuándo deja a alguien convencido de que la app no anda, cuando lo que
    /// pasa es que eligió una semana en la que no vendió.
    private var vacio: some View {
        VStack(spacing: 6) {
            Text(solapa == .inventario ? "Todavía no hay productos"
                 : solapa == .ventas ? "No hubo ventas en este período"
                 : "No hubo compras en este período")
                .font(Tipo.barlow(.semibold, 14.5)).foregroundStyle(t.ink)
            Text(solapa == .inventario
                 ? "Cargá productos en Inventario y el reporte se arma solo."
                 : "\(textoRango). Probá con un rango más amplio: tocá “Este mes” o “Este año”.")
                .font(Tipo.barlow(.regular, 12.5)).foregroundStyle(t.ink2)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 26).padding(.horizontal, 18)
        .background(t.card, in: .rect(cornerRadius: 14))
        .padding(.horizontal, 14)
    }

    /// El reporte como texto plano, que es lo que se exporta.
    private var reporteTexto: String {
        var l = ["Reporte de \(solapa.rawValue.lowercased()) · \(textoRango)", ""]
        switch solapa {
        case .ventas:
            let total = ventas.reduce(0) { $0 + $1.total }
            l.append("Facturado: \(Panel.gs(total)) · \(ventas.count) facturas")
            l.append("")
            l += ventas.map { "\($0.iso)  \($0.numero)  \($0.cliente)  \(Panel.gs($0.total))" }
        case .inventario:
            let v = productos.reduce(0) { $0 + Int(($1.stock * Double($1.costo)).rounded()) }
            l.append("Valuación: \(Panel.gs(v)) · \(productos.count) productos")
            l.append("")
            l += productos.map {
                "\($0.nombre)  \(Formato.miles($0.stock)) \($0.unidad)  \(Panel.gs($0.precio))"
            }
        case .compras:
            l.append("\(comprasFilas.count) compras en el período")
            l.append("")
            l += comprasFilas.map { "\($0.numero)  \($0.producto)  \(Panel.gs(total($0)))" }
        }
        return l.joined(separator: "\n")
    }

    // MARK: selectores

    private var selectorSolapa: some View {
        HStack(spacing: 0) {
            ForEach(Solapa.allCases, id: \.self) { s in
                let b = bloqueo(s)
                Button {
                    if let b { withAnimation(.spring(duration: 0.3)) { aviso = b } }
                    else { solapa = s }
                } label: {
                    HStack(spacing: 4) {
                        // Adelante del nombre, igual que Android: así se lee
                        // "cerrado · Inventario" y no "Inventario, ah, cerrado".
                        if b != nil {
                            Image(systemName: "lock.fill").font(.system(size: 9, weight: .semibold))
                        }
                        Text(s.rawValue)
                    }
                        .font(Tipo.barlow(.semibold, 13.5))
                        .foregroundStyle(solapa == s ? C.azul
                                         : .white.opacity(b == nil ? 0.85 : 0.45))
                        .frame(maxWidth: .infinity).frame(height: 40)
                        .background(solapa == s ? .white : .clear, in: .rect(cornerRadius: 10))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(5)
        .background(tono, in: .rect(cornerRadius: 14))
        .padding(.horizontal, 14)
    }

    private var selectorRango: some View {
        VStack(spacing: 10) {
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(Rango.allCases, id: \.self) { r in
                        Button {
                            rango = r
                            desde = r.desde()
                            hasta = Date()
                        } label: {
                            Text(r.rawValue)
                                .font(Tipo.barlow(.semibold, 12.5))
                                .foregroundStyle(rango == r ? .white : t.ink2)
                                .padding(.horizontal, 16).frame(height: 34)
                                .background(rango == r ? tono : t.card, in: .capsule)
                                .overlay { Capsule().stroke(rango == r ? .clear : t.border) }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 14)
            }
            .scrollIndicators(.hidden)

            // Las fechas sueltas, para el rango que ningún atajo cubre: el mes
            // pasado, una quincena, el día de una feria. `rango` se pone en
            // `nil` al tocarlas porque ya no hay atajo que describa lo elegido,
            // y dejar uno marcado diría algo falso.
            HStack(spacing: 10) {
                fecha("DESDE", $desde, hasta: hasta)
                fecha("HASTA", $hasta, desde: desde)
            }
            .padding(.horizontal, 14)
        }
    }

    /// Una de las dos fechas del rango, acotada para que no se crucen.
    private func fecha(_ rotulo: String, _ valor: Binding<Date>,
                       desde minimo: Date? = nil, hasta maximo: Date? = nil) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(rotulo).font(Tipo.barlow(.semibold, 10)).tracking(1.2)
                .foregroundStyle(t.ink2)
            DatePicker("", selection: Binding(
                get: { valor.wrappedValue },
                set: { valor.wrappedValue = $0; rango = nil }
            ), in: rangoValido(minimo: minimo, maximo: maximo),
                       displayedComponents: .date)
                .labelsHidden()
                .datePickerStyle(.compact)
                .tint(tono)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func rangoValido(minimo: Date?, maximo: Date?) -> ClosedRange<Date> {
        // El tope de arriba es hoy: un reporte de la semana que viene no existe.
        let techo = min(maximo ?? Date(), Date())
        let piso = minimo ?? Date(timeIntervalSince1970: 0)
        return piso <= techo ? piso...techo : techo...techo
    }

    private var cuerpoVentas: some View {
        let cobradas = ventas.filter(\.cobrada)
        let total = ventas.reduce(0) { $0 + $1.total }
        let cobrado = cobradas.reduce(0) { $0 + $1.total }
        let ticket = ventas.isEmpty ? 0 : total / ventas.count

        return VStack(spacing: 12) {
            HStack(spacing: 12) {
                kpi("FACTURADO", Panel.gs(total), "\(ventas.count) en el período")
                kpi("TICKET PROMEDIO", Panel.gs(ticket), "\(ventas.count) facturas emitidas")
            }
            .padding(.horizontal, 14)

            tarjeta("VENTAS DEL PERÍODO") {
                Text(Panel.gs(total))
                    .font(Tipo.barlow(.bold, 24)).foregroundStyle(t.ink)
                Text("Un punto por día del período elegido.")
                    .font(Tipo.barlow(.regular, 12)).foregroundStyle(t.ink2)
                grafico
            }

            tarjeta("PARTICIPACIÓN POR FORMA DE PAGO") {
                let pct = total > 0 ? Int((Double(cobrado) / Double(total) * 100).rounded()) : 0
                HStack(spacing: 18) {
                    ZStack {
                        Circle().stroke(t.border, lineWidth: 14)
                        Circle().trim(from: 0, to: Double(pct) / 100)
                            .stroke(ColorReporte.verde.color(oscuro: esquema == .dark),
                                    style: StrokeStyle(lineWidth: 14, lineCap: .butt))
                            .rotationEffect(.degrees(-90))
                        VStack(spacing: 1) {
                            Text("\(pct)%").font(Tipo.barlow(.bold, 18)).foregroundStyle(t.ink)
                            Text("COBRADO").font(Tipo.barlow(.medium, 9))
                                .tracking(0.9).foregroundStyle(t.ink2)
                        }
                    }
                    .frame(width: 96, height: 96)

                    VStack(alignment: .leading, spacing: 8) {
                        leyenda("Cobrado", Panel.gs(cobrado), ColorReporte.verde.color(oscuro: esquema == .dark))
                        leyenda("Pendiente", Panel.gs(total - cobrado), ColorReporte.ambar.color(oscuro: esquema == .dark))
                    }
                    Spacer(minLength: 0)
                }
            }

            if !ventas.isEmpty {
                tarjeta("ÚLTIMAS VENTAS") {
                    ForEach(ventas.prefix(8)) { v in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(v.numero).font(Tipo.barlow(.semibold, 13)).foregroundStyle(t.ink)
                                Text(v.cliente).font(Tipo.barlow(.regular, 11.5))
                                    .foregroundStyle(t.ink2).lineLimit(1)
                            }
                            Spacer(minLength: 0)
                            Text(Panel.gs(v.total))
                                .font(Tipo.barlow(.semibold, 13)).foregroundStyle(t.ink)
                        }
                    }
                }
            }
        }
    }

    private var grafico: some View {
        let dias = Panel.ultimos7()
        var porDia = [String: Int]()
        for d in dias { porDia[d] = 0 }
        for v in ventas where porDia[String(v.iso.prefix(10))] != nil {
            porDia[String(v.iso.prefix(10)), default: 0] += v.total
        }
        let serie = dias.map { porDia[$0] ?? 0 }
        let tope = max(1, serie.max() ?? 1)

        return HStack(alignment: .bottom, spacing: 6) {
            ForEach(Array(serie.enumerated()), id: \.offset) { i, v in
                VStack(spacing: 4) {
                    RoundedRectangle(cornerRadius: 3)
                        // Un solo tono de claro a oscuro: el color dice cuánto,
                        // igual que la altura, y se lee sin pensar.
                        .fill(v > 0
                              ? solapa.colorReporte.barra(Double(v), max: Double(tope),
                                                          oscuro: esquema == .dark)
                              : t.border)
                        .frame(height: max(3, CGFloat(v) / CGFloat(tope) * 70))
                    Text(String(dias[i].suffix(5)).replacingOccurrences(of: "-", with: "/"))
                        .font(Tipo.barlow(.regular, 9)).foregroundStyle(t.ink3)
                }
            }
        }
        .frame(height: 92, alignment: .bottom)
    }

    // MARK: inventario

    private var cuerpoInventario: some View {
        let agotados = productos.filter { $0.stock <= 0 }
        let bajo = productos.filter { $0.stock > 0 && $0.minimo > 0 && $0.stock <= $0.minimo }
        let valor = productos.reduce(0) { $0 + Int(Double($1.costo) * max(0, $1.stock)) }

        return VStack(spacing: 12) {
            HStack(spacing: 12) {
                kpi("PRODUCTOS", "\(productos.count)", "en el catálogo")
                kpi("VALOR DEL STOCK", Panel.gs(valor), "a costo promedio")
            }
            .padding(.horizontal, 14)

            tarjeta("ATENCIÓN") {
                leyenda("Agotados", "\(agotados.count)", ColorReporte.rojo.color(oscuro: esquema == .dark))
                leyenda("Bajo mínimo", "\(bajo.count)", ColorReporte.ambar.color(oscuro: esquema == .dark))
            }

            if !bajo.isEmpty {
                tarjeta("REPONER PRIMERO") {
                    ForEach(bajo.prefix(8)) { p in
                        HStack {
                            Text(p.nombre).font(Tipo.barlow(.regular, 13))
                                .foregroundStyle(t.ink).lineLimit(1)
                            Spacer(minLength: 0)
                            Text("\(Int(p.stock)) / \(Int(p.minimo))")
                                .font(Tipo.barlow(.semibold, 12.5)).foregroundStyle(Tint.avisoInk)
                        }
                    }
                }
            }
        }
    }

    // MARK: compras

    /// Lo que costó una compra, con IVA.
    ///
    /// En compras el IVA va POR ENCIMA del costo: el proveedor cotiza neto. Es
    /// al revés que en ventas, y confundirlo cambia el total.
    private func total(_ c: Compra) -> Int {
        let neto = Double(c.costo) * c.cantidad
        return Int((neto * (1 + RepoERP.tasa(c.iva))).rounded())
    }

    private var cuerpoCompras: some View {
        let pagadas = comprasFilas.filter(\.pagada)
        let gastado = comprasFilas.reduce(0) { $0 + total($1) }
        let deuda = comprasFilas.filter { !$0.pagada }.reduce(0) { $0 + total($1) }

        return VStack(spacing: 12) {
            HStack(spacing: 12) {
                kpi("COMPRADO", Panel.gs(gastado), "\(comprasFilas.count) en total")
                kpi("POR PAGAR", Panel.gs(deuda), "\(comprasFilas.count - pagadas.count) pendientes")
            }
            .padding(.horizontal, 14)

            tarjeta("ESTADO") {
                leyenda("Pagadas", "\(pagadas.count)", Tint.okInk)
                leyenda("Pendientes", "\(comprasFilas.count - pagadas.count)", Tint.avisoInk)
            }

            if !comprasFilas.isEmpty {
                tarjeta("ÚLTIMAS COMPRAS") {
                    ForEach(comprasFilas.prefix(8)) { c in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(c.numero).font(Tipo.barlow(.semibold, 13)).foregroundStyle(t.ink)
                                Text(c.producto).font(Tipo.barlow(.regular, 11.5))
                                    .foregroundStyle(t.ink2).lineLimit(1)
                            }
                            Spacer(minLength: 0)
                            Text(Panel.gs(total(c)))
                                .font(Tipo.barlow(.semibold, 13)).foregroundStyle(t.ink)
                        }
                    }
                }
            }
        }
    }

    // MARK: piezas

    /// El rango aplicado, en palabras. Dos fechas ISO no se leen de un vistazo.
    private var textoRango: String {
        let f = DateFormatter(); f.locale = Locale(identifier: "es_PY"); f.dateFormat = "d MMM"
        if Calendar.current.isDate(desde, inSameDayAs: hasta) { return f.string(from: desde) }
        return "\(f.string(from: desde)) — \(f.string(from: hasta)) · \(dias) día\(dias == 1 ? "" : "s")"
    }

    private func kpi(_ etiqueta: String, _ valor: String, _ pie: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(etiqueta).font(Tipo.barlow(.semibold, 10)).tracking(1.4).foregroundStyle(t.ink2)
            Text(valor).font(Tipo.barlow(.bold, 18)).foregroundStyle(t.ink).lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(pie).font(Tipo.barlow(.regular, 11)).foregroundStyle(t.ink3).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(t.card, in: .rect(cornerRadius: 14))
    }

    private func leyenda(_ k: String, _ v: String, _ color: Color) -> some View {
        HStack(spacing: 8) {
            Circle().fill(color).frame(width: 9, height: 9)
            Text(k).font(Tipo.barlow(.regular, 12.5)).foregroundStyle(t.ink2)
            Spacer(minLength: 8)
            Text(v).font(Tipo.barlow(.semibold, 13)).foregroundStyle(t.ink)
        }
    }

    private func tarjeta<C: View>(_ titulo: String, @ViewBuilder _ c: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(titulo).font(Tipo.barlow(.semibold, 10)).tracking(1.4).foregroundStyle(t.ink2)
            c()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(t.card, in: .rect(cornerRadius: 14))
        .padding(.horizontal, 14)
    }

    private func cargar() async {
        cargando = ventas.isEmpty && productos.isEmpty
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"

        async let v = try? RepoERP.ventas(desde: f.string(from: desde), hasta: f.string(from: hasta))
        async let p = try? RepoERP.inventario()
        async let c = try? RepoERP.compras()
        let (vv, pp, cc) = await (v, p, c)

        ventas = vv ?? []
        productos = pp ?? []
        comprasFilas = cc ?? []
        error = (vv == nil && pp == nil && cc == nil)
            ? "No pudimos cargar los reportes. Revisá tu conexión." : nil
        cargando = false
    }
}
