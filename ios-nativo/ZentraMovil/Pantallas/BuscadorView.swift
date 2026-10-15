import SwiftUI

/// Buscador general: una sola caja que mira clientes, productos, proveedores y
/// ventas a la vez.
///
/// Esto no lo tiene Android. La app tiene un buscador por pantalla, pero para
/// encontrar algo hay que saber de antemano en cuál está: quien tiene el nombre
/// de alguien y no sabe si es cliente o proveedor tiene que probar en dos lados.
struct BuscadorView: View {
    @Environment(\.tema) private var t
    @State private var q = ""
    @State private var clientes: [Cliente] = []
    @State private var productos: [InvProducto] = []
    @State private var proveedores: [Proveedor] = []
    @State private var ventas: [Venta] = []
    @State private var cargando = true

    private var n: String { q.trimmingCharacters(in: .whitespaces).lowercased() }

    private var cli: [Cliente] {
        n.isEmpty ? [] : clientes.filter {
            $0.nombre.lowercased().contains(n) || $0.doc.lowercased().contains(n)
                || $0.tel.contains(n)
        }
    }
    private var prod: [InvProducto] {
        n.isEmpty ? [] : productos.filter {
            $0.nombre.lowercased().contains(n) || $0.sku.lowercased().contains(n)
                || $0.barras.contains(n)
        }
    }
    private var prov: [Proveedor] {
        n.isEmpty ? [] : proveedores.filter {
            $0.nombre.lowercased().contains(n) || $0.doc.lowercased().contains(n)
        }
    }
    private var vta: [Venta] {
        n.isEmpty ? [] : ventas.filter {
            $0.numero.lowercased().contains(n) || $0.cliente.lowercased().contains(n)
        }
    }

    private var total: Int { cli.count + prod.count + prov.count + vta.count }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                if cargando {
                    ProgressView().padding(.top, 40)
                } else if n.isEmpty {
                    Aviso(texto: "Escribí un nombre, un RUC, un código o un número de factura. Busca en clientes, productos, proveedores y ventas a la vez.",
                          bg: t.card, ink: t.ink2)
                } else if total == 0 {
                    Aviso(texto: "Nada coincide con “\(q)”.", bg: t.card, ink: t.ink2)
                } else {
                    seccion("CLIENTES", cli.count) {
                        ForEach(cli.prefix(8)) { c in
                            NavigationLink { ClienteDetalleView(cliente: c) } label: {
                                fila(c.nombre, c.doc, C.azulMedio)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    seccion("PRODUCTOS", prod.count) {
                        ForEach(prod.prefix(8)) { p in
                            NavigationLink { ProductoDetalleView(producto: p) } label: {
                                fila(p.nombre, "\(p.sku) · \(Panel.gs(p.precio))", C.naranja)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    seccion("PROVEEDORES", prov.count) {
                        ForEach(prov.prefix(8)) { p in
                            NavigationLink { ProveedorDetalleView(p: p) } label: {
                                fila(p.nombre, p.doc, C.cian)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    seccion("VENTAS", vta.count) {
                        ForEach(vta.prefix(8)) { v in
                            NavigationLink { VentaDetalleView(venta: v) } label: {
                                fila(v.numero, "\(v.cliente) · \(Panel.gs(v.total))", C.teal)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(.vertical, 12)
        }
        .background(t.bg)
        .navigationTitle("Buscar")
        .searchable(text: $q, prompt: "Nombre, RUC, código o factura")
        .task {
            // Todo de una vez y en memoria: son listados que la app ya pide por
            // separado, y buscar contra el ERP en cada tecla lo castigaría.
            async let a = try? RepoERP.clientes()
            async let b = try? RepoERP.inventario()
            async let c = try? RepoERP.proveedores()
            let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
            let hasta = Date()
            let desde = Calendar.current.date(byAdding: .day, value: -89, to: hasta) ?? hasta
            async let d = try? RepoERP.ventas(desde: f.string(from: desde),
                                              hasta: f.string(from: hasta))
            let (cc, pp, vv, nn) = await (a, b, c, d)
            clientes = cc ?? []; productos = pp ?? []; proveedores = vv ?? []; ventas = nn ?? []
            cargando = false
        }
    }

    @ViewBuilder
    private func seccion<C: View>(_ titulo: String, _ cuantos: Int,
                                  @ViewBuilder _ c: () -> C) -> some View {
        if cuantos > 0 {
            VStack(alignment: .leading, spacing: 8) {
                Text("\(titulo) · \(cuantos)")
                    .font(Tipo.barlow(.semibold, 10)).tracking(1.4)
                    .foregroundStyle(t.ink2)
                    .padding(.horizontal, 18)
                c()
            }
        }
    }

    private func fila(_ titulo: String, _ sub: String, _ color: Color) -> some View {
        FilaCard {
            HStack(spacing: 12) {
                Inicial(texto: titulo, color: color)
                VStack(alignment: .leading, spacing: 2) {
                    Text(titulo).font(Tipo.barlow(.semibold, 14)).foregroundStyle(t.ink).lineLimit(1)
                    Text(sub).font(Tipo.barlow(.regular, 11.5)).foregroundStyle(t.ink2).lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(t.ink3)
            }
        }
    }
}
