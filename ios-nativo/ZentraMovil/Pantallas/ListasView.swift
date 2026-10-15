import SwiftUI

/// Clientes, contra `GET /clientes` del ERP.
struct ClientesView: View {
    @Environment(\.tema) private var t
    @State private var filas: [Cliente] = []
    @State private var q = ""
    @State private var cargando = true
    @State private var error: String?
    @State private var nuevo = false

    private var vistas: [Cliente] {
        let n = q.trimmingCharacters(in: .whitespaces).lowercased()
        guard !n.isEmpty else { return filas }
        return filas.filter {
            $0.nombre.lowercased().contains(n) || $0.doc.lowercased().contains(n)
        }
    }

    var body: some View {
        Lista(titulo: "Clientes", cargando: cargando, error: error, vacio: filas.isEmpty,
              vacioTexto: "Todavía no hay clientes cargados en el ERP.") {
            ForEach(vistas) { c in
                NavigationLink { ClienteDetalleView(cliente: c) } label: {
                FilaCard {
                    HStack(spacing: 12) {
                        Inicial(texto: c.nombre, color: C.azulMedio)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(c.nombre)
                                .font(Tipo.barlow(.semibold, 14.5)).foregroundStyle(t.ink)
                                .lineLimit(1)
                            Text([c.doc, c.zona].filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(Tipo.barlow(.regular, 11.5)).foregroundStyle(t.ink2)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 0)
                        Chip(texto: c.activo ? "Activo" : "Inactivo",
                             bg: c.activo ? Tint.okBg : Tint.errorBg,
                             ink: c.activo ? Tint.okInk : Tint.errorInk)
                    }
                }
                }
                .buttonStyle(.plain)
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { nuevo = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $nuevo) {
            // Al guardar se agrega arriba sin recargar todo: el ERP ya lo
            // devolvió completo y una recarga perdería el scroll.
            NuevoClienteView { c in filas.insert(c, at: 0) }
        }
        .searchable(text: $q, prompt: "Buscar por nombre o RUC")
        .task { await cargar() }
        .refreshable { await cargar() }
    }

    private func cargar() async {
        cargando = filas.isEmpty
        do {
            filas = try await RepoERP.clientes()
            error = nil
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "No pudimos cargar."
        }
        cargando = false
    }
}

/// Inventario, contra `GET /productos` del ERP.
struct InventarioView: View {
    @Environment(\.tema) private var t
    @Environment(Estado.self) private var estado
    @Environment(Ajustes.self) private var ajustes
    @State private var filas: [InvProducto] = []
    @State private var q = ""
    @State private var filtro = "Todos"
    @State private var cargando = true
    @State private var error: String?
    @State private var nuevoProd = false

    /// El tope de productos se consulta con cuántos hay cargados, así el aviso
    /// aparece antes de llegar y no de golpe cuando ya no se puede.
    private var bloqueoAlta: String? {
        Planes.motivoBloqueo(.inventarioAlta, estado.contextoPlan(productos: filas.count))
    }

    private let filtros = ["Todos", "Bajo mínimo", "Agotados", "Con stock"]

    private var vistas: [InvProducto] {
        var r = filas
        switch filtro {
        // "Bajo mínimo" es "le queda poco", no "no le queda": el agotado se
        // cuenta aparte, igual que en el panel de inicio.
        case "Bajo mínimo": r = r.filter { $0.stock > 0 && $0.minimo > 0 && $0.stock <= $0.minimo }
        case "Agotados": r = r.filter { $0.stock <= 0 }
        case "Con stock": r = r.filter { $0.stock > 0 }
        default: break
        }
        let n = q.trimmingCharacters(in: .whitespaces).lowercased()
        if !n.isEmpty {
            r = r.filter {
                $0.nombre.lowercased().contains(n) || $0.sku.lowercased().contains(n)
                    || $0.barras.contains(n)
            }
        }
        return r
    }

    var body: some View {
        Lista(titulo: "Inventario", cargando: cargando, error: error, vacio: filas.isEmpty,
              vacioTexto: "Todavía no hay productos cargados en el ERP.",
              encabezado: {
                  VStack(spacing: 10) {
                  if let bloqueoAlta { AvisoPlan(motivo: bloqueoAlta) }
                  ScrollView(.horizontal) {
                      HStack(spacing: 8) {
                          ForEach(filtros, id: \.self) { f in
                              Button { filtro = f } label: {
                                  Text(f)
                                      .font(Tipo.barlow(.semibold, 12.5))
                                      .foregroundStyle(filtro == f ? .white : t.ink2)
                                      .padding(.horizontal, 14).frame(height: 32)
                                      .background(filtro == f ? C.cian : t.card, in: .capsule)
                                      .overlay { Capsule().stroke(filtro == f ? .clear : t.border) }
                              }
                              .buttonStyle(.plain)
                          }
                      }
                      .padding(.horizontal, 14)
                  }
                  .scrollIndicators(.hidden)
                  }
              }) {
            ForEach(vistas) { p in
                NavigationLink { ProductoDetalleView(producto: p) } label: {
                FilaCard {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(p.nombre)
                                .font(Tipo.barlow(.semibold, 14.5)).foregroundStyle(t.ink)
                                .lineLimit(1)
                            Text([p.sku, p.unidad].filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(Tipo.barlow(.regular, 11.5)).foregroundStyle(t.ink2)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 0)
                        VStack(alignment: .trailing, spacing: 3) {
                            Text(Panel.gs(p.precio))
                                .font(Tipo.barlow(.semibold, 14)).foregroundStyle(t.ink)
                            Text(stockTexto(p))
                                .font(Tipo.barlow(.semibold, 11.5))
                                .foregroundStyle(colorStock(p))
                        }
                    }
                }
                }
                .buttonStyle(.plain)
            }
        }
        .searchable(text: $q, prompt: "Buscar por nombre, código o barras")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink { MovimientosView() } label: {
                    Image(systemName: "arrow.left.arrow.right")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { nuevoProd = true } label: { Image(systemName: "plus") }
                    .segunPlan(bloqueoAlta)
            }
        }
        .sheet(isPresented: $nuevoProd) { NuevoProductoView() }
        .task { await cargar() }
        .refreshable { await cargar() }
    }

    /// El stock no se redondea: se vende por kilo y hay medios kilos.
    private func stockTexto(_ p: InvProducto) -> String {
        let n = p.stock
        let s = n == n.rounded() ? String(Int(n)) : String(format: "%.3f", n)
        return "\(s) \(p.unidad)"
    }

    private func colorStock(_ p: InvProducto) -> Color {
        if p.stock <= 0 { return Tint.errorInk }
        if p.minimo > 0 && p.stock <= p.minimo { return Tint.avisoInk }
        return Tint.okInk
    }

    private func cargar() async {
        cargando = filas.isEmpty
        do {
            filas = try await RepoERP.inventario()
            error = nil
            // Aviso local: lo arma el teléfono con lo que acaba de leer. No
            // reemplaza un aviso del servidor, sirve para enterarse al abrir.
            await Avisos.revisar(filas, activado: ajustes.stockBajo)
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "No pudimos cargar."
        }
        cargando = false
    }
}

// MARK: - Piezas compartidas

/// El armazón común de las listas: título, estado de carga, error y vacío.
///
/// Los tres estados se distinguen a propósito. Una lista vacía porque el ERP no
/// tiene nada y una lista vacía porque la llamada falló se ven igual si no se
/// separan, y mandan a buscar el problema al lado equivocado.
struct Lista<Contenido: View, Encabezado: View>: View {
    @Environment(\.tema) private var t
    let titulo: String
    let cargando: Bool
    let error: String?
    let vacio: Bool
    let vacioTexto: String
    @ViewBuilder var encabezado: Encabezado
    @ViewBuilder var contenido: Contenido

    init(titulo: String, cargando: Bool, error: String?, vacio: Bool, vacioTexto: String,
         @ViewBuilder encabezado: () -> Encabezado = { EmptyView() },
         @ViewBuilder contenido: () -> Contenido) {
        self.titulo = titulo; self.cargando = cargando; self.error = error
        self.vacio = vacio; self.vacioTexto = vacioTexto
        self.encabezado = encabezado(); self.contenido = contenido()
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                encabezado
                if cargando {
                    ProgressView().padding(.top, 40)
                } else if let error {
                    Aviso(texto: error, bg: Tint.errorBg, ink: Tint.errorInk)
                } else if vacio {
                    Aviso(texto: vacioTexto, bg: t.card, ink: t.ink2)
                } else {
                    contenido
                }
            }
            .padding(.vertical, 12)
        }
        .background(t.bg)
        .navigationTitle(titulo)
        .navigationBarTitleDisplayMode(.large)
    }
}

struct FilaCard<C: View>: View {
    @Environment(\.tema) private var t
    @ViewBuilder var c: C
    var body: some View {
        c.padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(t.card, in: .rect(cornerRadius: 14))
            .padding(.horizontal, 14)
    }
}

struct Inicial: View {
    let texto: String
    let color: Color
    var body: some View {
        Text(Formato.inicialDe(texto))
            .font(Tipo.barlow(.semibold, 14)).foregroundStyle(.white)
            .frame(width: 38, height: 38)
            .background(color, in: .circle)
    }
}

struct Chip: View {
    let texto: String
    let bg: Color
    let ink: Color
    var body: some View {
        Text(texto)
            .font(Tipo.barlow(.semibold, 11))
            .foregroundStyle(ink)
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(bg, in: .capsule)
    }
}

struct Aviso: View {
    let texto: String
    let bg: Color
    let ink: Color
    var body: some View {
        Text(texto)
            .font(Tipo.barlow(.regular, 13)).foregroundStyle(ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(bg, in: .rect(cornerRadius: 14))
            .padding(.horizontal, 14)
    }
}
