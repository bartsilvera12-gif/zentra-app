import SwiftUI

/// Proveedores, contra `GET /proveedores`.
struct ProveedoresView: View {
    @Environment(\.tema) private var t
    @Environment(Estado.self) private var estado
    @State private var filas: [Proveedor] = []
    @State private var q = ""
    @State private var cargando = true
    @State private var error: String?
    @State private var nuevo = false
    @State private var aviso: String?

    private var vistas: [Proveedor] {
        let n = q.trimmingCharacters(in: .whitespaces).lowercased()
        guard !n.isEmpty else { return filas }
        return filas.filter {
            $0.nombre.lowercased().contains(n) || $0.doc.lowercased().contains(n)
                || $0.rubro.lowercased().contains(n)
        }
    }

    var body: some View {
        Lista(titulo: "Proveedores", cargando: cargando, error: error, vacio: filas.isEmpty,
              vacioTexto: "Todavía no hay proveedores cargados.") {
            ForEach(vistas) { p in
                NavigationLink { ProveedorDetalleView(p: p) } label: {
                FilaCard {
                    HStack(spacing: 12) {
                        Inicial(texto: p.nombre, color: C.cian)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(p.nombre).font(Tipo.barlow(.semibold, 14.5))
                                .foregroundStyle(t.ink).lineLimit(1)
                            Text([p.doc, p.rubro].filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(Tipo.barlow(.regular, 11.5)).foregroundStyle(t.ink2).lineLimit(1)
                            Text(p.condicion).font(Tipo.barlow(.semibold, 11))
                                .foregroundStyle(p.condicion == "Contado" ? Tint.okInk : Tint.infoInk)
                        }
                        Spacer(minLength: 0)
                        if !p.activo {
                            Chip(texto: "Inactivo", bg: Tint.errorBg, ink: Tint.errorInk)
                        }
                    }
                }
                }
                .buttonStyle(.plain)
            }
        }
        .searchable(text: $q, prompt: "Buscar por nombre, RUC o rubro")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    if let m = Planes.motivoBloqueo(.proveedoresAlta, estado.contextoPlan()) {
                        withAnimation(.spring(duration: 0.3)) { aviso = m }
                    } else { nuevo = true }
                } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $nuevo) { NuevoProveedorView() }
        .avisoPlan($aviso)
        .task { await cargar() }
        .refreshable { await cargar() }
    }

    private func cargar() async {
        cargando = filas.isEmpty
        do { filas = try await RepoERP.proveedores(); error = nil }
        catch { self.error = (error as? LocalizedError)?.errorDescription ?? "No pudimos cargar." }
        cargando = false
    }
}

/// Compras, contra `GET /compras`.
struct ComprasView: View {
    @Environment(\.tema) private var t
    @State private var filas: [Compra] = []
    @State private var q = ""
    @State private var cargando = true
    @State private var error: String?
    @State private var nueva = false

    private var vistas: [Compra] {
        let n = q.trimmingCharacters(in: .whitespaces).lowercased()
        guard !n.isEmpty else { return filas }
        return filas.filter {
            $0.numero.lowercased().contains(n) || $0.producto.lowercased().contains(n)
        }
    }

    var body: some View {
        Lista(titulo: "Compras", cargando: cargando, error: error, vacio: filas.isEmpty,
              vacioTexto: "Todavía no hay compras cargadas.") {
            ForEach(vistas) { c in
                NavigationLink { CompraDetalleView(c: c) } label: {
                FilaCard {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(c.numero).font(Tipo.barlow(.semibold, 14)).foregroundStyle(t.ink)
                            Spacer(minLength: 0)
                            Chip(texto: c.pagada ? "Pagada" : "Pendiente",
                                 bg: c.pagada ? Tint.okBg : Tint.avisoBg,
                                 ink: c.pagada ? Tint.okInk : Tint.avisoInk)
                        }
                        Text(c.producto).font(Tipo.barlow(.regular, 12.5))
                            .foregroundStyle(t.ink2).lineLimit(1)
                        HStack(spacing: 10) {
                            Text("\(Int(c.cantidad)) × \(Panel.gs(c.costo))")
                                .font(Tipo.barlow(.semibold, 12)).foregroundStyle(t.ink)
                            Text(c.pago).font(Tipo.barlow(.regular, 11.5)).foregroundStyle(t.ink3)
                            Spacer(minLength: 0)
                            Text(c.fecha).font(Tipo.barlow(.regular, 11.5)).foregroundStyle(t.ink3)
                        }
                    }
                }
                }
                .buttonStyle(.plain)
            }
        }
        .searchable(text: $q, prompt: "Buscar por número o producto")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { nueva = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $nueva) { NuevaCompraView() }
        .task { await cargar() }
        .refreshable { await cargar() }
    }

    private func cargar() async {
        cargando = filas.isEmpty
        do { filas = try await RepoERP.compras(); error = nil }
        catch { self.error = (error as? LocalizedError)?.errorDescription ?? "No pudimos cargar." }
        cargando = false
    }
}

/// Conversaciones, contra `GET /mobile/asesor/conversations`.
///
/// Son los chats de WhatsApp del ERP. El listado trae sólo la vista previa del
/// último mensaje; abrir una conversación y escribir todavía no está portado.
struct ConversacionesView: View {
    @Environment(\.tema) private var t
    @Environment(Estado.self) private var estado
    @State private var filas: [Chat] = []
    @State private var q = ""
    @State private var filtro = Colas.todas
    @State private var cargando = true
    @State private var error: String?
    @State private var nueva = false

    private static let sinLeer = "No leídas"
    private static let cerradas = "Cerradas"

    private var colas: [Colas.Cola] { Colas.desde(filas.filter { !$0.cerrada }) }

    /// Un solo filtro, no dos.
    ///
    /// Había dos filas —"Todas / No leídas" por un lado y las colas por otro— y
    /// las dos empezaban con "Todas": dos botones iguales, uno al lado del
    /// otro, que hacían cosas distintas. Ahora es una sola fila con una sola
    /// selección. Se pierde "no leídas DE una cola", que casi nadie cruza, y se
    /// gana que el filtro se entienda de un vistazo.
    private var colaActiva: String {
        colas.contains { $0.nombre == filtro } ? filtro : Colas.todas
    }

    private var vistas: [Chat] {
        let verCerradas = filtro == Self.cerradas
        let n = q.trimmingCharacters(in: .whitespaces).lowercased()
        return filas.filter { c in
            // Una cerrada no aparece entre las abiertas aunque el ERP la mande.
            if verCerradas ? !c.cerrada : c.cerrada { return false }
            if !Colas.entra(c, en: colaActiva) { return false }
            if filtro == Self.sinLeer, c.noLeidos == 0 { return false }
            return n.isEmpty
                || [c.nombre, c.vistaPrevia].contains { $0.lowercased().contains(n) }
        }
    }

    private var noLeidosTotal: Int {
        filas.filter { !$0.cerrada }.reduce(0) { $0 + $1.noLeidos }
    }

    /// Lo que va bajo el título: cuántas hay y cuántas esperan respuesta.
    private var resumen: String {
        let abiertas = filas.filter { !$0.cerrada }.count
        let base = "\(abiertas) abierta\(abiertas == 1 ? "" : "s")"
        return noLeidosTotal > 0 ? "\(base) · \(noLeidosTotal) sin leer" : base
    }

    var body: some View {
        Lista(titulo: "Conversaciones", resumen: resumen,
              cargando: cargando, error: error, vacio: vistas.isEmpty,
              vacioTexto: filas.isEmpty
                ? "No hay conversaciones todavía."
                : "Probá con otro nombre.",
              encabezado: {
                  VStack(spacing: 10) {
                      // El final mudo: todo parece bien —interruptor prendido,
                      // permiso dado, token guardado— y no suena nada, porque el
                      // ERP manda los avisos de chat por `agent_id` y este usuario
                      // no tiene uno. Vale decirlo en vez de dejar que lo descubra.
                      if let b = Planes.motivoBloqueo(.chatModulo, estado.contextoPlan()) {
                          Aviso(texto: b, bg: Tint.avisoBg, ink: Tint.avisoInk)
                      } else if estado.esAgente == false {
                          Aviso(texto: "No estás dado de alta como agente de conversaciones, así que los avisos de chat no te van a llegar aunque los tengas prendidos. Pedile a un administrador que te sume.",
                                bg: Tint.avisoBg, ink: Tint.avisoInk)
                      }

                      ScrollView(.horizontal) {
                          HStack(spacing: 8) {
                              chip(Colas.todas, Colas.todas, "bubble.left.and.bubble.right")
                              chip(Self.sinLeer, Self.sinLeer, "circle.fill")
                              chip(Self.cerradas, Self.cerradas, nil)
                              // Las colas sólo si el ERP las informa; si no, la
                              // fila queda como antes.
                              ForEach(colas) { c in
                                  chip(c.nombre,
                                       c.sinLeer > 0
                                        ? "\(c.nombre) (\(c.sinLeer > 99 ? "99+" : "\(c.sinLeer)"))"
                                        : c.nombre,
                                       "tag")
                              }
                          }
                          .padding(.horizontal, 14)
                      }
                      .scrollIndicators(.hidden)
                  }
              }) {
            ForEach(vistas) { c in
                NavigationLink { ChatView(chat: c) } label: {
                FilaCard {
                    HStack(spacing: 12) {
                        Inicial(texto: c.nombre, color: C.naranja)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(c.nombre).font(Tipo.barlow(.semibold, 14.5))
                                .foregroundStyle(t.ink).lineLimit(1)
                            Text(c.vistaPrevia.isEmpty ? "Sin mensajes" : c.vistaPrevia)
                                .font(Tipo.barlow(.regular, 12)).foregroundStyle(t.ink2).lineLimit(1)
                            // Sólo si el ERP mandó el campo: "Sin asignar" en
                            // todas sería afirmar algo que no sabemos.
                            if c.informaResponsable {
                                Text(c.responsable ?? "Sin asignar")
                                    .font(Tipo.barlow(.regular, 10.5))
                                    .foregroundStyle(t.ink3).lineLimit(1)
                            }
                        }
                        Spacer(minLength: 0)
                        VStack(alignment: .trailing, spacing: 5) {
                            Text(c.hora).font(Tipo.barlow(.regular, 11)).foregroundStyle(t.ink3)
                            if c.noLeidos > 0 {
                                Text(c.noLeidos > 99 ? "99+" : "\(c.noLeidos)")
                                    .font(Tipo.barlow(.semibold, 11)).foregroundStyle(.white)
                                    .padding(.horizontal, 6)
                                    .frame(minWidth: 20, minHeight: 20)
                                    .background(C.cian, in: .capsule)
                            }
                        }
                    }
                }
                }
                .buttonStyle(.plain)
            }
        }
        .searchable(text: $q, prompt: "Buscar conversación…")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { nueva = true } label: {
                    Image(systemName: "square.and.pencil")
                }
                .accessibilityLabel("Nueva conversación")
            }
        }
        .sheet(isPresented: $nueva) {
            NuevaConversacionView(abiertas: filas)
        }
        .task { await cargar() }
        .refreshable { await cargar() }
        // 25s en el listado: no hace falta tan seguido como adentro de un chat.
        .latido(cada: 25, activo: true) {
            if let nuevas = try? await RepoERP.conversaciones(), nuevas != filas {
                filas = nuevas
            }
        }
    }

    private func chip(_ valor: String, _ texto: String, _ simbolo: String?) -> some View {
        let on = filtro == valor
        return Button { filtro = valor } label: {
            HStack(spacing: 5) {
                if let simbolo {
                    Image(systemName: simbolo)
                        // El punto de "No leídas" es más chico que un ícono:
                        // es una marca, no un dibujo.
                        .font(.system(size: simbolo == "circle.fill" ? 7 : 11, weight: .semibold))
                }
                Text(texto)
            }
            .font(Tipo.barlow(.semibold, 12.5))
            .foregroundStyle(on ? .white : t.ink2)
            .padding(.horizontal, 14).frame(height: 32)
            .background(on ? C.cian : t.card, in: .capsule)
            .overlay { Capsule().stroke(on ? .clear : t.border) }
        }
        .buttonStyle(.plain)
    }

    private func cargar() async {
        cargando = filas.isEmpty
        do { filas = try await RepoERP.conversaciones(); error = nil }
        catch { self.error = (error as? LocalizedError)?.errorDescription ?? "No pudimos cargar." }
        cargando = false
    }
}

/// Detalle de ventas: el listado de facturas del período.
struct DetalleVentasView: View {
    @Environment(\.tema) private var t
    @State private var filas: [Venta] = []
    @State private var q = ""
    @State private var filtro = "Todas"
    @State private var cargando = true
    @State private var error: String?

    private let filtros = ["Todas", "Cobradas", "Pendientes", "Crédito"]

    private var vistas: [Venta] {
        var r = filas
        switch filtro {
        case "Cobradas": r = r.filter(\.cobrada)
        case "Pendientes": r = r.filter { !$0.cobrada }
        // Crédito se lee de la forma de pago y no del estado: una venta a
        // crédito ya cobrada sigue siendo a crédito, y es la que hay que poder
        // mirar aparte cuando se revisa la cuenta corriente.
        case "Crédito": r = r.filter { $0.pago.localizedCaseInsensitiveContains("Crédito") }
        default: break
        }
        let n = q.trimmingCharacters(in: .whitespaces).lowercased()
        guard !n.isEmpty else { return r }
        // Busca también dentro de las líneas: muchas veces lo único que se
        // recuerda de una factura es qué producto llevaba.
        return r.filter { v in
            ([v.numero, v.cliente] + v.lineas.map(\.nombre))
                .contains { $0.lowercased().contains(n) }
        }
    }

    private var total: Int { vistas.reduce(0) { $0 + $1.total } }

    /// El rango que se está mirando, con los mismos 30 días que trae `cargar()`.
    private var textoRango: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_PY")
        f.dateFormat = "d MMM"
        let hasta = Date()
        let desde = Calendar.current.date(byAdding: .day, value: -29, to: hasta) ?? hasta
        return "\(f.string(from: desde)) — \(f.string(from: hasta))"
    }

    /// La lista como texto plano, que es lo que se comparte.
    ///
    /// Android tiene acá dos botones que sólo cambian su propia etiqueta y no
    /// producen nada. Los textos son los mismos; lo que cambia es que estos sí
    /// entregan el archivo, porque en iOS compartir ya viene hecho y un botón
    /// que dice "Compartir lista" y no comparte nada es peor que no tenerlo.
    private var listaTexto: String {
        let encabezado = "Detalle de ventas · \(textoRango)\n"
            + "\(vistas.count) factura\(vistas.count == 1 ? "" : "s") · \(Panel.gs(total))\n"
        let cuerpo = vistas.map {
            "\($0.iso)  \($0.numero)  \($0.cliente)  \($0.pago)  \(Panel.gs($0.total))"
        }.joined(separator: "\n")
        return encabezado + "\n" + cuerpo
    }

    var body: some View {
        Lista(titulo: "Detalle de ventas", resumen: textoRango,
              cargando: cargando, error: error, vacio: vistas.isEmpty,
              vacioTexto: filas.isEmpty
                ? "No hay ventas en los últimos 30 días."
                : "No hay ventas en el rango con ese filtro.",
              encabezado: {
                  VStack(spacing: 10) {
                      HStack(spacing: 10) {
                          Kpi(rotulo: "FACTURAS",
                              valor: "\(vistas.count) factura\(vistas.count == 1 ? "" : "s")")
                          Kpi(rotulo: "TOTAL", valor: Panel.gs(total))
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
                                          .overlay {
                                              Capsule().stroke(filtro == f ? .clear : t.border)
                                          }
                                  }
                                  .buttonStyle(.plain)
                              }
                          }
                          .padding(.horizontal, 14)
                      }
                      .scrollIndicators(.hidden)
                  }
              }) {
            ForEach(vistas) { v in
                NavigationLink { VentaDetalleView(venta: v) } label: {
                FilaCard {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(v.numero).font(Tipo.barlow(.semibold, 14)).foregroundStyle(t.ink)
                            Spacer(minLength: 0)
                            Chip(texto: v.cobrada ? "Cobrada" : "Pendiente",
                                 bg: v.cobrada ? Tint.okBg : Tint.avisoBg,
                                 ink: v.cobrada ? Tint.okInk : Tint.avisoInk)
                        }
                        Text(v.cliente).font(Tipo.barlow(.regular, 12.5))
                            .foregroundStyle(t.ink2).lineLimit(1)
                        HStack {
                            Text(v.pago).font(Tipo.barlow(.regular, 11.5)).foregroundStyle(t.ink3)
                            Spacer(minLength: 0)
                            Text(Panel.gs(v.total))
                                .font(Tipo.barlow(.bold, 15)).foregroundStyle(t.ink)
                        }
                        Text("\(v.lineas.count) ítem\(v.lineas.count == 1 ? "" : "s") · \(v.iso)")
                            .font(Tipo.barlow(.regular, 11)).foregroundStyle(t.ink3)
                    }
                }
                }
                .buttonStyle(.plain)
            }
        }
        .safeAreaInset(edge: .bottom) {
            if !vistas.isEmpty {
                HStack(spacing: 10) {
                    ShareLink(item: Pdf.deTexto(listaTexto, titulo: "Detalle de ventas"),
                              preview: SharePreview("Detalle de ventas")) {
                        Text("Exportar PDF").frame(maxWidth: .infinity)
                    }
                    ShareLink(item: listaTexto) {
                        Text("Compartir lista").frame(maxWidth: .infinity)
                    }
                }
                .font(Tipo.barlow(.semibold, 13.5))
                .foregroundStyle(t.ink)
                .buttonStyle(.plain)
                .padding(.horizontal, 14).padding(.top, 11).padding(.bottom, 13)
                .background(.bar)
            }
        }
        .searchable(text: $q, prompt: "N.º de factura, cliente o producto")
        .task { await cargar() }
        .refreshable { await cargar() }
    }

    private func cargar() async {
        cargando = filas.isEmpty
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        let hasta = Date()
        let desde = Calendar.current.date(byAdding: .day, value: -29, to: hasta) ?? hasta
        do {
            filas = try await RepoERP.ventas(desde: f.string(from: desde), hasta: f.string(from: hasta))
            error = nil
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "No pudimos cargar."
        }
        cargando = false
    }
}

/// Empezar una conversación con alguien que ya escribió.
///
/// Es un selector sobre las conversaciones que ya existen, no una agenda: el
/// chat es de WhatsApp y una conversación la abre quien escribe, no nosotros.
/// Por eso no hay "Clientes" y "Proveedores" como filtros — en el chat del ERP
/// todas son conversaciones de WhatsApp y el tipo es siempre "Cliente", así que
/// un filtro no devolvía nada y el otro no filtraba nada.
struct NuevaConversacionView: View {
    @Environment(\.tema) private var t
    @Environment(\.dismiss) private var cerrar
    let abiertas: [Chat]
    @State private var q = ""
    @State private var elegida: Chat?

    private var vistas: [Chat] {
        let n = q.trimmingCharacters(in: .whitespaces).lowercased()
        let vivas = abiertas.filter { !$0.cerrada }
        guard !n.isEmpty else { return vivas }
        return vivas.filter { $0.nombre.lowercased().contains(n) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 10) {
                    if vistas.isEmpty {
                        Aviso(texto: abiertas.isEmpty
                              ? "Sin contactos"
                              : "Probá con otro nombre.",
                              bg: t.card, ink: t.ink2)
                    }
                    ForEach(vistas) { c in
                        NavigationLink { ChatView(chat: c) } label: {
                            FilaCard {
                                HStack(spacing: 11) {
                                    Inicial(texto: c.nombre, color: C.naranja)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(c.nombre)
                                            .font(Tipo.barlow(.semibold, 14))
                                            .foregroundStyle(t.ink).lineLimit(1)
                                        Text("Cliente · conversación abierta")
                                            .font(Tipo.barlow(.regular, 11.5))
                                            .foregroundStyle(t.ink2)
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
            .searchable(text: $q, prompt: "Buscar cliente o proveedor…")
            .navigationTitle("Nueva conversación")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { cerrar() } }
            }
        }
    }
}
