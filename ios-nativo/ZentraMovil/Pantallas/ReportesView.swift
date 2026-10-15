import SwiftUI

/// Reportes. Port de `src/mobile/screens/ReportesScreen.tsx`.
///
/// Tres solapas y cuatro rangos, igual que Android. Los números salen del ERP:
/// `GET /ventas` para la solapa de ventas y `GET /productos` para la de
/// inventario. Compras todavía no tiene su endpoint mapeado de este lado, y lo
/// dice en vez de mostrar ceros.
struct ReportesView: View {
    @Environment(\.tema) private var t

    enum Solapa: String, CaseIterable { case ventas = "Ventas", inventario = "Inventario", compras = "Compras" }
    enum Rango: String, CaseIterable {
        case hoy = "Hoy", siete = "7 días", treinta = "30 días", mes = "Este mes"

        /// Días hacia atrás, contando hoy.
        var dias: Int {
            switch self {
            case .hoy: 1
            case .siete: 7
            case .treinta: 30
            case .mes: Calendar.current.component(.day, from: Date())
            }
        }
    }

    @State private var solapa: Solapa = .ventas
    @State private var rango: Rango = .siete
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
        .navigationTitle("Reportes")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink { DetalleVentasView() } label: { Text("Detalle") }
            }
        }
        .task(id: rango) { await cargar() }
        .refreshable { await cargar() }
    }

    // MARK: selectores

    private var selectorSolapa: some View {
        HStack(spacing: 0) {
            ForEach(Solapa.allCases, id: \.self) { s in
                Button { solapa = s } label: {
                    Text(s.rawValue)
                        .font(Tipo.barlow(.semibold, 13.5))
                        .foregroundStyle(solapa == s ? C.azul : .white.opacity(0.85))
                        .frame(maxWidth: .infinity).frame(height: 40)
                        .background(solapa == s ? .white : .clear, in: .rect(cornerRadius: 10))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(5)
        .background(C.azulMedio, in: .rect(cornerRadius: 14))
        .padding(.horizontal, 14)
    }

    private var selectorRango: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(Rango.allCases, id: \.self) { r in
                    Button { rango = r } label: {
                        Text(r.rawValue)
                            .font(Tipo.barlow(.semibold, 12.5))
                            .foregroundStyle(rango == r ? .white : t.ink2)
                            .padding(.horizontal, 16).frame(height: 34)
                            .background(rango == r ? C.cian : t.card, in: .capsule)
                            .overlay { Capsule().stroke(rango == r ? .clear : t.border) }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 14)
        }
        .scrollIndicators(.hidden)
    }

    // MARK: ventas

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
                            .stroke(C.teal, style: StrokeStyle(lineWidth: 14, lineCap: .butt))
                            .rotationEffect(.degrees(-90))
                        VStack(spacing: 1) {
                            Text("\(pct)%").font(Tipo.barlow(.bold, 18)).foregroundStyle(t.ink)
                            Text("COBRADO").font(Tipo.barlow(.medium, 9))
                                .tracking(0.9).foregroundStyle(t.ink2)
                        }
                    }
                    .frame(width: 96, height: 96)

                    VStack(alignment: .leading, spacing: 8) {
                        leyenda("Cobrado", Panel.gs(cobrado), C.teal)
                        leyenda("Pendiente", Panel.gs(total - cobrado), C.ambar)
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
                        .fill(v > 0 ? C.cian : t.border)
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
                leyenda("Agotados", "\(agotados.count)", Tint.errorInk)
                leyenda("Bajo mínimo", "\(bajo.count)", Tint.avisoInk)
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

    private var cuerpoCompras: some View {
        let pagadas = comprasFilas.filter(\.pagada)
        // En compras el IVA va POR ENCIMA del costo: el proveedor cotiza neto.
        // Es al revés que en ventas, y confundirlo cambia el total.
        func total(_ c: Compra) -> Int {
            let neto = Double(c.costo) * c.cantidad
            return Int((neto * (1 + RepoERP.tasa(c.iva))).rounded())
        }
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

    private var textoRango: String {
        let f = DateFormatter(); f.locale = Locale(identifier: "es_PY"); f.dateFormat = "d MMM"
        let hasta = Date()
        let desde = Calendar.current.date(byAdding: .day, value: -(rango.dias - 1), to: hasta) ?? hasta
        return "\(f.string(from: desde)) — \(f.string(from: hasta)) · \(rango.dias) día\(rango.dias == 1 ? "" : "s")"
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
        let hasta = Date()
        let desde = Calendar.current.date(byAdding: .day, value: -(rango.dias - 1), to: hasta) ?? hasta

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
