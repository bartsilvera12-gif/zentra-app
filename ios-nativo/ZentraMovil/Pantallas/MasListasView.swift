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
              vacioTexto: "Todavía no hay proveedores cargados en el ERP.") {
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
                Button { nuevo = true } label: { Image(systemName: "plus") }
                    .segunPlan(Planes.motivoBloqueo(.proveedoresAlta, estado.contextoPlan()))
            }
        }
        .sheet(isPresented: $nuevo) { NuevoProveedorView() }
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
              vacioTexto: "Todavía no hay compras cargadas en el ERP.") {
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
    @State private var cargando = true
    @State private var error: String?

    var body: some View {
        Lista(titulo: "Conversaciones", cargando: cargando, error: error, vacio: filas.isEmpty,
              vacioTexto: "No hay conversaciones todavía.",
              encabezado: {
                  // El final mudo: todo parece bien —interruptor prendido,
                  // permiso dado, token guardado— y no suena nada, porque el
                  // ERP manda los avisos de chat por `agent_id` y este usuario
                  // no tiene uno. Vale decirlo en vez de dejar que lo descubra.
                  if estado.esAgente == false {
                      Aviso(texto: "No estás dado de alta como agente de conversaciones, así que los avisos de chat no te van a llegar aunque los tengas prendidos. Pedile a un administrador que te sume.",
                            bg: Tint.avisoBg, ink: Tint.avisoInk)
                  }
              }) {
            ForEach(filas) { c in
                NavigationLink { ChatView(chat: c) } label: {
                FilaCard {
                    HStack(spacing: 12) {
                        Inicial(texto: c.nombre, color: C.naranja)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(c.nombre).font(Tipo.barlow(.semibold, 14.5))
                                .foregroundStyle(t.ink).lineLimit(1)
                            Text(c.vistaPrevia.isEmpty ? "Sin mensajes" : c.vistaPrevia)
                                .font(Tipo.barlow(.regular, 12)).foregroundStyle(t.ink2).lineLimit(1)
                        }
                        Spacer(minLength: 0)
                        VStack(alignment: .trailing, spacing: 5) {
                            Text(c.hora).font(Tipo.barlow(.regular, 11)).foregroundStyle(t.ink3)
                            if c.noLeidos > 0 {
                                Text("\(c.noLeidos)")
                                    .font(Tipo.barlow(.semibold, 11)).foregroundStyle(.white)
                                    .frame(minWidth: 20, minHeight: 20)
                                    .background(C.cian, in: .circle)
                            }
                        }
                    }
                }
                }
                .buttonStyle(.plain)
            }
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
    @State private var cargando = true
    @State private var error: String?

    private var vistas: [Venta] {
        let n = q.trimmingCharacters(in: .whitespaces).lowercased()
        guard !n.isEmpty else { return filas }
        return filas.filter {
            $0.numero.lowercased().contains(n) || $0.cliente.lowercased().contains(n)
        }
    }

    var body: some View {
        Lista(titulo: "Ventas", cargando: cargando, error: error, vacio: filas.isEmpty,
              vacioTexto: "No hay ventas en los últimos 30 días.") {
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
        .searchable(text: $q, prompt: "Buscar por número o cliente")
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
