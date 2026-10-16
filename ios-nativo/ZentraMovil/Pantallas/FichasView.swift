import SwiftUI

// MARK: - Piezas de ficha

/// Una fila clave → valor. Si el valor está vacío, la fila no se dibuja: una
/// etiqueta con un guión al lado no informa nada y alarga la ficha.
struct Dato: View {
    @Environment(\.tema) private var t
    let k: String
    let v: String

    var body: some View {
        if !v.trimmingCharacters(in: .whitespaces).isEmpty {
            HStack(alignment: .top, spacing: 10) {
                Text(k).font(Tipo.barlow(.regular, 12.5)).foregroundStyle(t.ink2)
                Spacer(minLength: 12)
                Text(v).font(Tipo.barlow(.semibold, 13)).foregroundStyle(t.ink)
                    .multilineTextAlignment(.trailing)
                    // Seleccionable y copiable: un RUC, un teléfono o un número
                    // de factura es justo lo que uno quiere pegar en otro lado.
                    .textSelection(.enabled)
                    .contextMenu {
                        Button { UIPasteboard.general.string = v } label: {
                            Label("Copiar", systemImage: "doc.on.doc")
                        }
                    }
            }
        }
    }
}

struct Bloque<C: View>: View {
    @Environment(\.tema) private var t
    let titulo: String
    @ViewBuilder var c: C

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(titulo).font(Tipo.barlow(.semibold, 10)).tracking(1.4).foregroundStyle(t.ink2)
            c
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(t.card, in: .rect(cornerRadius: 14))
        .padding(.horizontal, 14)
    }
}

/// Un botón que abre WhatsApp, el teléfono o el correo con el dato de la ficha.
struct AccionContacto: View {
    @Environment(\.tema) private var t
    let icono: String
    let titulo: String
    let destino: URL?

    var body: some View {
        if let destino {
            Button { UIApplication.shared.open(destino) } label: {
                HStack(spacing: 10) {
                    Image(systemName: icono).font(.system(size: 14, weight: .semibold))
                    Text(titulo).font(Tipo.barlow(.semibold, 13.5))
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(t.ink3)
                }
                .foregroundStyle(C.azulMedio)
            }
            .buttonStyle(.plain)
        }
    }
}

/// Teléfono paraguayo a formato internacional para WhatsApp.
/// "0981 000 450" → "595981000450". Si ya viene con 595, se respeta.
func waNumero(_ tel: String) -> String? {
    var d = tel.filter(\.isNumber)
    guard d.count >= 8 else { return nil }
    if d.hasPrefix("595") { return d }
    if d.hasPrefix("0") { d.removeFirst() }
    return "595" + d
}

// MARK: - Cliente

struct ClienteDetalleView: View {
    let cliente: Cliente
    @Environment(\.tema) private var t
    @State private var fresco: Cliente?

    private var c: Cliente { fresco ?? cliente }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Bloque(titulo: "CLIENTE") {
                    HStack(spacing: 12) {
                        Inicial(texto: c.nombre, color: C.azulMedio)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(c.nombre).font(Tipo.barlow(.semibold, 16)).foregroundStyle(t.ink)
                            Text(c.doc).font(Tipo.barlow(.regular, 12)).foregroundStyle(t.ink2)
                        }
                        Spacer(minLength: 0)
                        Chip(texto: c.activo ? "Activo" : "Inactivo",
                             bg: c.activo ? Tint.okBg : Tint.errorBg,
                             ink: c.activo ? Tint.okInk : Tint.errorInk)
                    }
                }

                Bloque(titulo: "DATOS") {
                    Dato(k: "Contacto", v: c.contacto)
                    Dato(k: "Teléfono", v: c.tel)
                    Dato(k: "Correo", v: c.email)
                    Dato(k: "Ciudad", v: c.zona)
                    Dato(k: "Dirección", v: c.direccion)
                    Dato(k: "Lista de precios", v: c.lista)
                }

                if !c.tel.isEmpty || !c.email.isEmpty {
                    Bloque(titulo: "CONTACTAR") {
                        if let n = waNumero(c.tel) {
                            AccionContacto(icono: "message.fill", titulo: "WhatsApp",
                                           destino: URL(string: "https://wa.me/\(n)"))
                            AccionContacto(icono: "phone.fill", titulo: "Llamar",
                                           destino: URL(string: "tel://\(c.tel.filter(\.isNumber))"))
                        }
                        if !c.email.isEmpty {
                            AccionContacto(icono: "envelope.fill", titulo: "Correo",
                                           destino: URL(string: "mailto:\(c.email)"))
                        }
                    }
                }
            }
            .padding(.vertical, 12)
        }
        .background(t.bg)
        .navigationTitle("Ficha")
        .navigationBarTitleDisplayMode(.inline)
        // La ficha completa trae campos que el listado no selecciona. Si falla,
        // se queda con lo del listado en vez de vaciarse.
        .task { fresco = (try? await RepoERP.cliente(cliente.id)) ?? nil }
    }
}

// MARK: - Producto

struct ProductoDetalleView: View {
    let producto: InvProducto
    @Environment(\.tema) private var t
    @State private var fresco: InvProducto?
    @State private var ajustar = false
    @State private var editar = false
    @State private var aviso: String?
    @Environment(Estado.self) private var estado

    private var p: InvProducto { fresco ?? producto }

    private var margen: Int? {
        guard p.costo > 0, p.precio > 0 else { return nil }
        let r = RepoERP.tasa(p.iva)
        // El precio incluye IVA; el costo no. Se compara contra el neto o el
        // margen sale inflado por el impuesto.
        let neto = Double(p.precio) / (1 + r)
        return Int(((neto - Double(p.costo)) / Double(p.costo) * 100).rounded())
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Bloque(titulo: "PRODUCTO") {
                    Text(p.nombre).font(Tipo.barlow(.semibold, 17)).foregroundStyle(t.ink)
                    HStack(spacing: 10) {
                        Text(Panel.gs(p.precio)).font(Tipo.barlow(.bold, 22)).foregroundStyle(t.ink)
                        Chip(texto: "IVA \(p.iva.rawValue)", bg: Tint.infoBg, ink: Tint.infoInk)
                    }
                }

                Bloque(titulo: "STOCK") {
                    Dato(k: "Disponible", v: cantidad(p.stock) + " " + p.unidad)
                    Dato(k: "Mínimo", v: p.minimo > 0 ? cantidad(p.minimo) + " " + p.unidad : "")
                    if p.stock <= 0 {
                        Aviso(texto: "Agotado: no se puede vender.", bg: Tint.errorBg, ink: Tint.errorInk)
                            .padding(.horizontal, -14)
                    } else if p.minimo > 0 && p.stock <= p.minimo {
                        Aviso(texto: "Bajo el mínimo: conviene reponer.", bg: Tint.avisoBg, ink: Tint.avisoInk)
                            .padding(.horizontal, -14)
                    }
                }

                Bloque(titulo: "DATOS") {
                    Dato(k: "Código", v: p.sku)
                    Dato(k: "Código de barras", v: p.barras)
                    Dato(k: "Unidad", v: p.unidad)
                    Dato(k: "Costo promedio", v: p.costo > 0 ? Panel.gs(p.costo) : "")
                    Dato(k: "Margen sobre el neto", v: margen.map { "\($0) %" } ?? "")
                }
            }
            .padding(.vertical, 12)
        }
        .background(t.bg)
        .navigationTitle("Producto")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Ajustar") { ajustar = true }
            }
            ToolbarItem(placement: .topBarTrailing) {
                // El botón no se apaga: se toca y dice por qué. Un botón gris
                // sin explicación hace creer que la app se rompió.
                Button("Editar") {
                    if let m = Planes.motivoBloqueo(.inventarioEditar, estado.contextoPlan()) {
                        withAnimation(.spring(duration: 0.3)) { aviso = m }
                    } else { editar = true }
                }
            }
        }
        .sheet(isPresented: $ajustar) { AjusteStockView(producto: p) }
        .sheet(isPresented: $editar) {
            // Al volver se queda con lo que devolvió el servidor, no con lo
            // que escribió el formulario: si el ERP normalizó algo, manda eso.
            NuevoProductoView(editando: p) { fresco = $0 }
        }
        .avisoPlan($aviso)
        .task { fresco = (try? await RepoERP.producto(producto.id)) ?? nil }
    }

    /// Sin redondear: se vende por kilo y hay medios kilos.
    private func cantidad(_ n: Double) -> String {
        n == n.rounded() ? String(Int(n)) : String(format: "%.3f", n)
    }
}

// MARK: - Venta

struct VentaDetalleView: View {
    let venta: Venta
    @Environment(\.tema) private var t
    @State private var fresca: Venta?

    private var v: Venta { fresca ?? venta }

    /// IVA contenido: bruto × r / (1 + r). Se suma sin redondear y se redondea
    /// una sola vez al final, o la factura no cierra con lo que guarda el ERP.
    private var iva: Int {
        let crudo = v.lineas.reduce(0.0) { a, l in
            let bruto = Double(l.precio) * l.qty
            let r = RepoERP.tasa(l.iva)
            return a + bruto * r / (1 + r)
        }
        return Int(crudo.rounded())
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Bloque(titulo: "FACTURA") {
                    HStack {
                        Text(v.numero).font(Tipo.barlow(.bold, 18)).foregroundStyle(t.ink)
                        Spacer()
                        Chip(texto: v.cobrada ? "Cobrada" : "Pendiente",
                             bg: v.cobrada ? Tint.okBg : Tint.avisoBg,
                             ink: v.cobrada ? Tint.okInk : Tint.avisoInk)
                    }
                    Dato(k: "Cliente", v: v.cliente)
                    Dato(k: "Documento", v: v.doc)
                    Dato(k: "Fecha", v: v.iso)
                    Dato(k: "Condición", v: v.pago)
                }

                Bloque(titulo: "DETALLE") {
                    ForEach(Array(v.lineas.enumerated()), id: \.offset) { _, l in
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(l.nombre).font(Tipo.barlow(.regular, 13))
                                    .foregroundStyle(t.ink).lineLimit(2)
                                Text("\(l.qty == l.qty.rounded() ? String(Int(l.qty)) : String(format: "%.3f", l.qty)) × \(Panel.gs(l.precio)) · IVA \(l.iva.rawValue)")
                                    .font(Tipo.barlow(.regular, 11)).foregroundStyle(t.ink3)
                            }
                            Spacer(minLength: 8)
                            Text(Panel.gs(Int((Double(l.precio) * l.qty).rounded())))
                                .font(Tipo.barlow(.semibold, 13)).foregroundStyle(t.ink)
                        }
                    }
                    Divider()
                    Dato(k: "IVA incluido", v: Panel.gs(iva))
                    HStack {
                        Text("TOTAL").font(Tipo.barlow(.semibold, 12)).tracking(1.2)
                            .foregroundStyle(t.ink2)
                        Spacer()
                        Text(Panel.gs(v.total)).font(Tipo.barlow(.bold, 20)).foregroundStyle(t.ink)
                    }
                }
            }
            .padding(.vertical, 12)
        }
        .background(t.bg)
        .navigationTitle("Venta")
        .navigationBarTitleDisplayMode(.inline)
        // El listado de ventas no siempre trae las líneas; la ficha sí.
        .task { fresca = (try? await RepoERP.venta(venta.id)) ?? nil }
    }
}

// MARK: - Proveedor y compra (con lo que ya trae el listado)

struct ProveedorDetalleView: View {
    let p: Proveedor
    @Environment(\.tema) private var t
    @Environment(Estado.self) private var estado
    @State private var fresco: Proveedor?
    @State private var editar = false
    @State private var aviso: String?

    private var v: Proveedor { fresco ?? p }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Bloque(titulo: "PROVEEDOR") {
                    HStack(spacing: 12) {
                        Inicial(texto: v.nombre, color: C.cian)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(v.nombre).font(Tipo.barlow(.semibold, 16)).foregroundStyle(t.ink)
                            Text(v.doc).font(Tipo.barlow(.regular, 12)).foregroundStyle(t.ink2)
                        }
                        Spacer(minLength: 0)
                        Chip(texto: v.activo ? "Activo" : "Inactivo",
                             bg: v.activo ? Tint.okBg : Tint.errorBg,
                             ink: v.activo ? Tint.okInk : Tint.errorInk)
                    }
                }
                Bloque(titulo: "DATOS") {
                    Dato(k: "Condición de pago", v: v.condicion)
                    Dato(k: "Rubro", v: v.rubro)
                    Dato(k: "Contacto", v: v.contacto)
                    Dato(k: "Teléfono", v: v.tel)
                    Dato(k: "Correo", v: v.email)
                    Dato(k: "Dirección", v: v.ciudad)
                }
                if !v.tel.isEmpty || !v.email.isEmpty {
                    Bloque(titulo: "CONTACTAR") {
                        if let n = waNumero(v.tel) {
                            AccionContacto(icono: "message.fill", titulo: "WhatsApp",
                                           destino: URL(string: "https://wa.me/\(n)"))
                            AccionContacto(icono: "phone.fill", titulo: "Llamar",
                                           destino: URL(string: "tel://\(v.tel.filter(\.isNumber))"))
                        }
                        if !v.email.isEmpty {
                            AccionContacto(icono: "envelope.fill", titulo: "Correo",
                                           destino: URL(string: "mailto:\(v.email)"))
                        }
                    }
                }
            }
            .padding(.vertical, 12)
        }
        .background(t.bg)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Editar") {
                    if let m = Planes.motivoBloqueo(.proveedoresEditar, estado.contextoPlan()) {
                        withAnimation(.spring(duration: 0.3)) { aviso = m }
                    } else { editar = true }
                }
            }
        }
        .sheet(isPresented: $editar) {
            NuevoProveedorView(editando: v) { fresco = $0 }
        }
        .avisoPlan($aviso)
        .navigationTitle("Proveedor")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct CompraDetalleView: View {
    let c: Compra
    @Environment(\.tema) private var t

    /// En compras el IVA va POR ENCIMA del costo: el proveedor cotiza neto.
    /// Es al revés que en ventas, y confundirlo cambia el total.
    private var neto: Int { Int((Double(c.costo) * c.cantidad).rounded()) }
    private var iva: Int { Int((Double(neto) * RepoERP.tasa(c.iva)).rounded()) }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Bloque(titulo: "COMPRA") {
                    HStack {
                        Text(c.numero).font(Tipo.barlow(.bold, 18)).foregroundStyle(t.ink)
                        Spacer()
                        Chip(texto: c.pagada ? "Pagada" : "Pendiente",
                             bg: c.pagada ? Tint.okBg : Tint.avisoBg,
                             ink: c.pagada ? Tint.okInk : Tint.avisoInk)
                    }
                    Dato(k: "Producto", v: c.producto)
                    Dato(k: "Fecha", v: c.fecha)
                    Dato(k: "Condición", v: c.pago)
                    Dato(k: "Comprobante", v: c.factura)
                }
                Bloque(titulo: "IMPORTES") {
                    Dato(k: "Cantidad", v: String(Int(c.cantidad)))
                    Dato(k: "Costo unitario (neto)", v: Panel.gs(c.costo))
                    Dato(k: "Neto", v: Panel.gs(neto))
                    Dato(k: "IVA \(c.iva.rawValue) sobre el costo", v: Panel.gs(iva))
                    HStack {
                        Text("TOTAL").font(Tipo.barlow(.semibold, 12)).tracking(1.2)
                            .foregroundStyle(t.ink2)
                        Spacer()
                        Text(Panel.gs(neto + iva)).font(Tipo.barlow(.bold, 20)).foregroundStyle(t.ink)
                    }
                }
            }
            .padding(.vertical, 12)
        }
        .background(t.bg)
        .navigationTitle("Compra")
        .navigationBarTitleDisplayMode(.inline)
    }
}
