import SwiftUI

/// Presupuestos: una venta que todavía no pasó.
///
/// Ocupa el lugar de Conversaciones en Inicio para quien usa Zentra sola. El
/// chat de WhatsApp llega por el ERP, así que sin ERP esa pantalla no tiene
/// nada que mostrar; esto sí.
struct PresupuestosView: View {
    @Environment(\.tema) private var t
    @Environment(Estado.self) private var estado

    @State private var filas: [Presupuesto] = []
    @State private var q = ""
    @State private var filtro = "Todos"
    @State private var cargando = true
    @State private var error: String?
    @State private var nuevo = false

    private let filtros = ["Todos", "Pendientes", "Aceptados", "Vendidos"]

    private var vistas: [Presupuesto] {
        var r = filas
        switch filtro {
        // Un vencido sigue siendo un pendiente: el cliente no contestó. Entra
        // acá porque es el que hay que ir a buscar, no el que hay que olvidar.
        case "Pendientes": r = r.filter { ["pendiente", "vencido"].contains($0.estadoVisible()) }
        case "Aceptados": r = r.filter { $0.estadoVisible() == "aceptado" }
        case "Vendidos": r = r.filter { $0.estado == "convertido" }
        default: break
        }
        let n = q.trimmingCharacters(in: .whitespaces).lowercased()
        guard !n.isEmpty else { return r }
        return r.filter {
            $0.clienteTexto.lowercased().contains(n) || $0.numero.lowercased().contains(n)
        }
    }

    /// Cuánto hay esperando respuesta. Es el número por el que se entra acá:
    /// plata que todavía no es plata pero puede serlo esta semana.
    private var enEspera: Int {
        filas.filter { ["pendiente", "aceptado"].contains($0.estadoVisible()) }
            .reduce(0) { $0 + $1.total }
    }

    var body: some View {
        Lista(titulo: "Presupuestos",
              resumen: filas.isEmpty ? nil
                : "\(vistas.count) de \(filas.count) · \(Panel.gs(enEspera)) esperando",
              cargando: cargando, error: error, vacio: vistas.isEmpty,
              vacioTexto: filas.isEmpty
                ? "Todavía no hiciste ningún presupuesto."
                : "Probá con otro nombre o cambiá el filtro.",
              encabezado: {
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
              }) {
            ForEach(vistas) { p in
                NavigationLink {
                    PresupuestoDetalleView(presupuesto: p) { await cargar() }
                } label: {
                    FilaCard {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(p.clienteTexto)
                                    .font(Tipo.barlow(.semibold, 14.5))
                                    .foregroundStyle(t.ink).lineLimit(1)
                                Text(p.numero)
                                    .font(Tipo.barlow(.regular, 11.5)).foregroundStyle(t.ink2)
                                Chip(texto: Presupuesto.rotulos[p.estadoVisible()] ?? "",
                                     bg: Self.fondo(p.estadoVisible()),
                                     ink: Self.tinta(p.estadoVisible()))
                            }
                            Spacer(minLength: 0)
                            VStack(alignment: .trailing, spacing: 3) {
                                Text(Panel.gs(p.total))
                                    .font(Tipo.barlow(.semibold, 14)).foregroundStyle(t.ink)
                                if let v = p.validoHasta {
                                    Text("Vale hasta \(TextoPresupuesto.dia(v))")
                                        .font(Tipo.barlow(.regular, 10.5))
                                        .foregroundStyle(t.ink3)
                                }
                            }
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .searchable(text: $q, prompt: "Buscar por cliente o número")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { nuevo = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Nuevo presupuesto")
            }
        }
        .navigationDestination(isPresented: $nuevo) {
            NuevaVentaView(alRegistrar: { Task { await cargar() } }, modo: .presupuesto)
        }
        .task { await cargar() }
        .refreshable { await cargar() }
    }

    static func fondo(_ estado: String) -> Color {
        switch estado {
        case "aceptado": Tint.okBg
        case "rechazado": Tint.errorBg
        case "convertido": Tint.infoBg
        case "vencido": Tint.avisoBg
        default: Tint.tealBg
        }
    }

    static func tinta(_ estado: String) -> Color {
        switch estado {
        case "aceptado": Tint.okInk
        case "rechazado": Tint.errorInk
        case "convertido": Tint.infoInk
        case "vencido": Tint.avisoInk
        default: Tint.tealInk
        }
    }

    private func cargar() async {
        cargando = filas.isEmpty
        do {
            filas = try await RepoERP.presupuestos()
            error = nil
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "No pudimos cargar."
        }
        cargando = false
    }
}

/// Un presupuesto: qué lleva, qué contestó el cliente, y pasarlo a venta.
struct PresupuestoDetalleView: View {
    let presupuesto: Presupuesto
    let alCambiar: () async -> Void

    @Environment(\.tema) private var t
    @Environment(Estado.self) private var estado
    @Environment(\.dismiss) private var cerrar

    @State private var p: Presupuesto
    @State private var guardando = false
    @State private var error: String?
    @State private var convertir = false

    init(presupuesto: Presupuesto, alCambiar: @escaping () async -> Void) {
        self.presupuesto = presupuesto
        self.alCambiar = alCambiar
        _p = State(initialValue: presupuesto)
    }

    private var visible: String { p.estadoVisible() }
    private var vencido: Bool { visible == "vencido" }

    private var texto: String {
        TextoPresupuesto.armar(p, negocio: estado.tenant?.nombre ?? estado.perfil?.empresa ?? "")
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                FilaCard {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(p.clienteTexto)
                                .font(Tipo.barlow(.bold, 17)).foregroundStyle(t.ink)
                            Spacer(minLength: 8)
                            Chip(texto: Presupuesto.rotulos[visible] ?? "",
                                 bg: PresupuestosView.fondo(visible),
                                 ink: PresupuestosView.tinta(visible))
                        }
                        Text(p.numero)
                            .font(Tipo.barlow(.regular, 12)).foregroundStyle(t.ink2)
                        if let v = p.validoHasta {
                            Text(vencido ? "Venció el \(TextoPresupuesto.dia(v))"
                                 : "Válido hasta el \(TextoPresupuesto.dia(v))")
                                .font(Tipo.barlow(.regular, 12))
                                .foregroundStyle(vencido ? t.ojo : t.ink2)
                        }
                    }
                }

                FilaCard {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(p.lineas) { l in
                            HStack {
                                Text("\(Formato.miles(l.cantidad)) × \(l.nombre)")
                                    .font(Tipo.barlow(.regular, 13))
                                    .foregroundStyle(t.ink2).lineLimit(1)
                                Spacer(minLength: 8)
                                Text(Panel.gs(Int((Double(l.precio) * l.cantidad).rounded())))
                                    .font(Tipo.barlow(.semibold, 13)).foregroundStyle(t.ink)
                            }
                        }
                        Divider()
                        HStack {
                            Text("TOTAL").font(Tipo.barlow(.semibold, 12)).tracking(1.2)
                                .foregroundStyle(t.ink2)
                            Spacer()
                            Text(Panel.gs(p.total))
                                .font(Tipo.barlow(.bold, 20)).foregroundStyle(t.ink)
                        }
                    }
                }

                if !p.notas.isEmpty {
                    FilaCard {
                        Text(p.notas)
                            .font(Tipo.barlow(.regular, 13)).foregroundStyle(t.ink2)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }

                if let error {
                    Aviso(texto: error, bg: Tint.errorBg, ink: Tint.errorInk)
                }

                acciones
            }
            .padding(.vertical, 12)
        }
        .background(t.bg)
        .navigationTitle("Presupuesto")
        .navigationBarTitleDisplayMode(.inline)
        // El teléfono no viaja en el presupuesto: se busca por el id del
        // cliente. El nombre no alcanza, puede haber dos iguales, y mandarle
        // un presupuesto con precios al cliente equivocado no se deshace.
        .task {
            guard let id = p.clienteId else { return }
            telefono = (try? await RepoERP.clientes())?.first { $0.id == id }?.tel
        }
        .navigationDestination(isPresented: $convertir) {
            NuevaVentaView(
                alRegistrar: { Task { await alCambiar(); cerrar() } },
                modo: .venta,
                desdePresupuesto: p,
                // Vencido: rige el precio de hoy, y se avisa abajo. Fijar un
                // precio que ya no vale sería vender a pérdida en silencio.
                preciosFijos: vencido ? [:] : Dictionary(
                    p.lineas.compactMap { l in l.productoId.map { ($0, l.precio) } },
                    uniquingKeysWith: { a, _ in a })
            )
        }
    }

    @ViewBuilder
    private var acciones: some View {
        VStack(spacing: 8) {
            // Mandarlo es lo primero que se hace con un presupuesto, así que va
            // arriba y entero. Si el cliente tiene teléfono cargado va directo
            // a su chat; si no, el sistema deja elegir a quién.
            if let tel = p.clienteId == nil ? nil : telefono,
               let url = TextoPresupuesto.enlace(telefono: tel, texto: texto) {
                Link(destination: url) {
                    etiqueta("Mandar por WhatsApp", "paperplane.fill", fuerte: true)
                }
            } else {
                ShareLink(item: texto) {
                    etiqueta("Mandar al cliente", "square.and.arrow.up", fuerte: true)
                }
            }

            if p.estado == "convertido" {
                Text("Ya se facturó.")
                    .font(Tipo.barlow(.regular, 12.5)).foregroundStyle(t.ink2)
            } else {
                if vencido {
                    Aviso(texto: "Este presupuesto venció. Si lo pasás a venta, rige el precio de hoy.",
                          bg: Tint.avisoBg, ink: Tint.avisoInk)
                }

                Button { convertir = true } label: {
                    etiqueta("Convertir en venta", "cart.fill.badge.plus", fuerte: true)
                }
                .buttonStyle(.plain)

                HStack(spacing: 8) {
                    boton("Aceptó", "aceptado", Tint.okBg, Tint.okInk)
                    boton("Rechazó", "rechazado", Tint.errorBg, Tint.errorInk)
                    if visible != "pendiente" {
                        boton("Pendiente", "pendiente", t.card, t.ink2)
                    }
                }
            }
        }
        .padding(.horizontal, 14)
    }

    /// El teléfono del cliente, si está cargado. Se busca por el id que guardó
    /// el presupuesto: el nombre no alcanza, puede haber dos iguales.
    @State private var telefono: String?

    private func etiqueta(_ texto: String, _ simbolo: String, fuerte: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: simbolo).font(.system(size: 14, weight: .semibold))
            Text(texto).font(Tipo.barlow(.semibold, 15))
        }
        .foregroundStyle(fuerte ? .white : t.ink)
        .frame(maxWidth: .infinity).frame(height: 48)
        .background(fuerte ? C.azulMedio : t.card, in: .rect(cornerRadius: 12))
    }

    private func boton(_ texto: String, _ nuevo: String, _ bg: Color, _ ink: Color) -> some View {
        Button { Task { await cambiar(nuevo) } } label: {
            ZStack {
                if guardando { ProgressView() } else { Text(texto) }
            }
            .font(Tipo.barlow(.semibold, 14))
            .foregroundStyle(ink)
            .frame(maxWidth: .infinity).frame(height: 44)
            .background(bg, in: .rect(cornerRadius: 11))
            .overlay { RoundedRectangle(cornerRadius: 11).stroke(t.border) }
        }
        .buttonStyle(.plain)
        .disabled(guardando || p.estado == nuevo)
        .opacity(p.estado == nuevo ? 0.45 : 1)
    }

    private func cambiar(_ nuevo: String) async {
        guardando = true; error = nil
        defer { guardando = false }
        do {
            try await RepoERP.estadoPresupuesto(p.id, nuevo)
            p.estado = nuevo
            await alCambiar()
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
                ?? "No se pudo guardar el cambio."
        }
    }
}
