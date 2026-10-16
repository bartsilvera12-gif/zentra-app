import SwiftUI

/// Clientes, contra `GET /clientes` del ERP.
struct ClientesView: View {
    @Environment(\.tema) private var t
    @State private var filas: [Cliente] = []
    @State private var q = ""
    @State private var cargando = true
    @State private var error: String?
    @State private var nuevo = false

    @State private var filtro = "Todos"

    private var activos: Int { filas.filter(\.activo).count }

    /// Qué dice cada filtro y cuántos cae en él.
    ///
    /// El número va en la etiqueta a propósito: sin él hay que entrar en cada
    /// filtro para descubrir que está vacío.
    private var filtros: [(String, Int)] {
        [("Todos", filas.count), ("Activos", activos), ("Inactivos", filas.count - activos)]
    }

    private var vistas: [Cliente] {
        var r = filas
        switch filtro {
        case "Activos": r = r.filter(\.activo)
        case "Inactivos": r = r.filter { !$0.activo }
        default: break
        }
        let n = q.trimmingCharacters(in: .whitespaces).lowercased()
        guard !n.isEmpty else { return r }
        // Busca también por contacto y correo, igual que Android: a un cliente
        // se lo busca por la persona con la que se habla, no sólo por la razón
        // social con la que se factura.
        return r.filter {
            [$0.nombre, $0.doc, $0.contacto, $0.email]
                .contains { $0.lowercased().contains(n) }
        }
    }

    var body: some View {
        Lista(titulo: "Clientes",
              resumen: "\(filas.count) en total · \(activos) activos",
              cargando: cargando, error: error, vacio: vistas.isEmpty,
              vacioTexto: filas.isEmpty
                ? "Todavía no hay clientes cargados."
                : "Probá con otro término o cambiá el filtro.",
              encabezado: {
                  ScrollView(.horizontal) {
                      HStack(spacing: 8) {
                          ForEach(filtros, id: \.0) { f, n in
                              Button { filtro = f } label: {
                                  Text("\(f) (\(n))")
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
              }) {
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
        .searchable(text: $q, prompt: "Nombre, RUC, contacto o correo")
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
    @State private var ajuste = false
    @State private var aviso: String?

    /// Cuánto vale lo que hay en el depósito, a costo.
    private var valuacion: Int {
        filas.reduce(0) { $0 + Int(($1.stock * Double($1.costo)).rounded()) }
    }

    /// Cuántos están por debajo de su mínimo **sin haberse agotado**: el
    /// agotado ya no es un aviso de reponer, es un faltante.
    private var bajoMinimo: Int {
        filas.filter { $0.stock > 0 && $0.minimo > 0 && $0.stock <= $0.minimo }.count
    }

    /// El tope de productos se consulta con cuántos hay cargados, así el aviso
    /// aparece antes de llegar y no de golpe cuando ya no se puede.
    /// "12 de 20 productos". El tope avisa antes de llegar, no de golpe
    /// cuando ya no se puede.
    private var textoCupo: String {
        let c = Planes.cupoProductos(estado.contextoPlan(productos: filas.count))
        let u = Formato.miles(filas.reduce(0) { $0 + $1.stock })
        guard let tope = c.tope else { return "\(filas.count) productos · \(u) unidades" }
        return "\(c.usados) de \(tope) productos · \(u) unidades"
    }

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
        Lista(titulo: "Inventario", resumen: textoCupo,
              cargando: cargando, error: error, vacio: vistas.isEmpty,
              vacioTexto: filas.isEmpty
                ? "Todavía no hay productos cargados."
                : "Probá con otro término o cambiá el filtro.",
              encabezado: {
                  VStack(spacing: 10) {
                  HStack(spacing: 10) {
                      Kpi(rotulo: "VALUACIÓN", valor: Panel.gs(valuacion))
                      Kpi(rotulo: "BAJO MÍNIMO", valor: "\(bajoMinimo) prod.",
                          tinte: bajoMinimo > 0 ? Tint.avisoInk : nil)
                  }
                  .padding(.horizontal, 14)

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

                  // Las dos acciones que no son sobre un producto en
                  // particular. En la barra de arriba no entran junto al "+",
                  // y escondidas detrás de un ícono no las encuentra nadie.
                  HStack(spacing: 8) {
                      NavigationLink { MovimientosView() } label: {
                          Text("Ver movimientos").frame(maxWidth: .infinity)
                      }
                      Button { ajuste = true } label: {
                          Text("Ajustar stock").frame(maxWidth: .infinity)
                      }
                  }
                  .font(Tipo.barlow(.semibold, 13))
                  .foregroundStyle(t.ink)
                  .buttonStyle(.plain)
                  .padding(.horizontal, 14)
                  .frame(height: 40)
                  .padding(.horizontal, 14)
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
        .searchable(text: $q, prompt: "Producto, SKU o código de barras")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                // El botón no se apaga: se toca y dice por qué. Un botón gris
                // sin explicación hace creer que la app se rompió.
                Button {
                    if let m = bloqueoAlta {
                        withAnimation(.spring(duration: 0.3)) { aviso = m }
                    } else { nuevoProd = true }
                } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $nuevoProd) { NuevoProductoView() }
        .sheet(isPresented: $ajuste) { ElegirProductoAjusteView(productos: filas) }
        .avisoPlan($aviso)
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
    /// La línea chica bajo el título: cuántos hay, cuántos entran, cuánto suman.
    ///
    /// Va acá y no en cada pantalla porque es la misma pregunta en todas —
    /// "¿esto que estoy viendo es todo?"— y porque sin ella un listado vacío y
    /// un listado filtrado a cero se ven idénticos.
    var resumen: String? = nil
    let cargando: Bool
    let error: String?
    let vacio: Bool
    let vacioTexto: String
    @ViewBuilder var encabezado: Encabezado
    @ViewBuilder var contenido: Contenido

    init(titulo: String, resumen: String? = nil,
         cargando: Bool, error: String?, vacio: Bool, vacioTexto: String,
         @ViewBuilder encabezado: () -> Encabezado = { EmptyView() },
         @ViewBuilder contenido: () -> Contenido) {
        self.titulo = titulo; self.resumen = resumen
        self.cargando = cargando; self.error = error
        self.vacio = vacio; self.vacioTexto = vacioTexto
        self.encabezado = encabezado(); self.contenido = contenido()
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                if let resumen {
                    Text(resumen)
                        .font(Tipo.barlow(.regular, 12)).foregroundStyle(t.ink2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                }
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

/// Un número con su rótulo arriba, de los que van en fila sobre un listado.
///
/// Son los dos o tres datos que contestan la pregunta antes de que alguien se
/// ponga a sumar de a una las filas: cuántas facturas, cuánto suman, cuánto
/// está bajo mínimo. Por eso van **arriba** de la lista y no al final.
struct Kpi: View {
    @Environment(\.tema) private var t
    let rotulo: String
    let valor: String
    /// El color del número. Por defecto el del texto normal: se tiñe sólo
    /// cuando el dato en sí es un aviso, como "bajo mínimo".
    var tinte: Color?

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(rotulo)
                .font(Tipo.barlow(.semibold, 9.5)).tracking(1.33)
                .foregroundStyle(t.ink2)
            Text(valor)
                .font(Tipo.barlow(.bold, 16))
                .foregroundStyle(tinte ?? t.ink)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12).padding(.vertical, 11)
        .background(t.card, in: .rect(cornerRadius: 13))
        .overlay { RoundedRectangle(cornerRadius: 13).stroke(t.border) }
    }
}
