import SwiftUI

/// El catálogo público: prenderlo, pintarlo y repartir el enlace.
///
/// La dirección ya está reservada desde que se creó la cuenta, así que acá no
/// se elige "si tener uno" sino cuándo abrirlo. Lo único que falta de verdad es
/// el WhatsApp a donde van a llegar los pedidos.
struct CatalogoView: View {
    @Environment(\.tema) private var t
    @Environment(Estado.self) private var estado

    @State private var c: Catalogo?
    @State private var cargando = true
    @State private var guardando = false
    @State private var error: String?
    @State private var copiado = false
    @State private var cuantos: Int?
    @State private var verAyuda = false

    /// Los colores que se ofrecen.
    ///
    /// Una paleta corta y no un selector de color libre: quien abre esto está
    /// armando una vidriera, no eligiendo un tono. Seis que funcionan sobre
    /// blanco con texto blanco encima evitan el morado fosforescente con letra
    /// gris que nadie puede leer.
    private static let colores = [
        "#04617A", "#C94F7C", "#1F5C46", "#8C4A1F", "#4B3C86", "#0F3B5C",
    ]

    var body: some View {
        Lista(titulo: "Catálogo", resumen: resumen,
              cargando: cargando, error: error, vacio: false,
              vacioTexto: "", encabezado: { EmptyView() }) {
            if let c {
                contenido(c)
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { verAyuda = true } label: {
                    Image(systemName: "questionmark.circle")
                }
                .accessibilityLabel("Cómo funciona el catálogo")
            }
        }
        .sheet(isPresented: $verAyuda) {
            AyudaCatalogoView()
                .presentationDragIndicator(.visible)
        }
        .task { await cargar() }
        .refreshable { await cargar() }
    }

    private var resumen: String? {
        guard let c else { return nil }
        if !c.activo { return "Apagado" }
        guard let cuantos else { return "Abierto" }
        return cuantos == 1 ? "Abierto · 1 producto a la vista"
                            : "Abierto · \(cuantos) productos a la vista"
    }

    @ViewBuilder
    private func contenido(_ c: Catalogo) -> some View {
        // Lo primero: la dirección. Es lo que la persona vino a buscar.
        FilaCard {
            VStack(alignment: .leading, spacing: 9) {
                Text(c.activo ? "LA DIRECCIÓN DE TU CATÁLOGO" : "VA A ESTAR EN")
                    .font(Tipo.barlow(.semibold, 10)).tracking(1.4)
                    .foregroundStyle(t.ink2)

                Text(c.enlace)
                    .font(Tipo.barlow(.semibold, 13.5))
                    .foregroundStyle(t.marca)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 8) {
                    Button {
                        UIPasteboard.general.string = c.enlace
                        withAnimation { copiado = true }
                        Task {
                            try? await Task.sleep(for: .seconds(2))
                            withAnimation { copiado = false }
                        }
                    } label: {
                        chico(copiado ? "Copiado" : "Copiar enlace",
                              copiado ? "checkmark" : "doc.on.doc")
                    }
                    .buttonStyle(.plain)

                    if c.activo, let u = URL(string: c.enlace) {
                        ShareLink(item: u) { chico("Compartir", "square.and.arrow.up") }
                            .buttonStyle(.plain)
                        Link(destination: u) { chico("Abrir", "arrow.up.right") }
                            .buttonStyle(.plain)
                    }
                }
            }
        }

        // El WhatsApp. Lo único que falta para poder abrirlo, así que va antes
        // que el color: primero que funcione, después que sea lindo.
        FilaCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("A QUÉ WHATSAPP LLEGAN LOS PEDIDOS")
                    .font(Tipo.barlow(.semibold, 10)).tracking(1.4)
                    .foregroundStyle(t.ink2)

                TextField("0981 123 456", text: enlazar(\.whatsapp))
                    .font(Tipo.barlow(.regular, 16))
                    .keyboardType(.phonePad)
                    .padding(.horizontal, 12).frame(height: 44)
                    .background(t.bg, in: .rect(cornerRadius: 11))
                    .overlay { RoundedRectangle(cornerRadius: 11).stroke(t.border) }

                Text("El cliente arma su pedido y te llega acá como un mensaje. No se guarda en ningún lado.")
                    .font(Tipo.barlow(.regular, 12))
                    .foregroundStyle(t.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }

        FilaCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("COLOR").font(Tipo.barlow(.semibold, 10)).tracking(1.4)
                    .foregroundStyle(t.ink2)
                HStack(spacing: 10) {
                    ForEach(Self.colores, id: \.self) { hex in
                        Button { cambiar { $0.color = hex } } label: {
                            Circle()
                                .fill(Color(hex: hex))
                                .frame(width: 36, height: 36)
                                .overlay {
                                    if c.color.caseInsensitiveCompare(hex) == .orderedSame {
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 14, weight: .bold))
                                            .foregroundStyle(.white)
                                    }
                                }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }

        FilaCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("LO QUE SE LEE ARRIBA").font(Tipo.barlow(.semibold, 10)).tracking(1.4)
                    .foregroundStyle(t.ink2)
                TextField("Horarios, zona de envío, formas de pago…",
                          text: enlazar(\.mensaje), axis: .vertical)
                    .font(Tipo.barlow(.regular, 14))
                    .lineLimit(2...4)
                    .padding(12)
                    .background(t.bg, in: .rect(cornerRadius: 11))
                    .overlay { RoundedRectangle(cornerRadius: 11).stroke(t.border) }
            }
        }

        if c.activo {
            Button { cambiar { $0.activo = false } } label: {
                grande("Cerrar el catálogo", "pause.circle", bg: t.card, ink: Tint.errorInk)
            }
            .buttonStyle(.plain)

            Text("Mientras está cerrado, quien entre al enlace ve que no está disponible. No se borra nada.")
                .font(Tipo.barlow(.regular, 12)).foregroundStyle(t.ink2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
        } else {
            Button { cambiar { $0.activo = true } } label: {
                grande("Abrir el catálogo", "storefront", bg: C.azulMedio, ink: .white)
            }
            .buttonStyle(.plain)
            .disabled(c.faltaWhatsapp || guardando)
            .opacity(c.faltaWhatsapp ? 0.45 : 1)

            if c.faltaWhatsapp {
                Aviso(texto: "Cargá tu WhatsApp para poder abrirlo. Sin ese número el cliente no tiene cómo mandarte el pedido.",
                      bg: Tint.avisoBg, ink: Tint.avisoInk)
            }
        }

        // Lo que no se ve en el catálogo, dicho antes de que lo pregunten.
        FilaCard {
            VStack(alignment: .leading, spacing: 6) {
                Text("QUÉ VE EL CLIENTE").font(Tipo.barlow(.semibold, 10)).tracking(1.4)
                    .foregroundStyle(t.ink2)
                Text("El nombre, la foto, el precio y la categoría de cada producto. Nunca el costo, el stock ni tus proveedores.")
                    .font(Tipo.barlow(.regular, 12.5)).foregroundStyle(t.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Los productos sin precio cargado no se muestran.")
                    .font(Tipo.barlow(.regular, 12.5)).foregroundStyle(t.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func chico(_ texto: String, _ simbolo: String) -> some View {
        HStack(spacing: 5) {
            Image(systemName: simbolo).font(.system(size: 11, weight: .semibold))
            Text(texto).font(Tipo.barlow(.semibold, 12.5))
        }
        .foregroundStyle(t.marca)
        .padding(.horizontal, 12).frame(height: 34)
        .background(t.bg, in: .capsule)
        .overlay { Capsule().stroke(t.border) }
    }

    private func grande(_ texto: String, _ simbolo: String, bg: Color, ink: Color) -> some View {
        HStack(spacing: 8) {
            if guardando { ProgressView().tint(ink) }
            else { Image(systemName: simbolo).font(.system(size: 15, weight: .semibold)) }
            Text(texto).font(Tipo.barlow(.semibold, 15.5))
        }
        .foregroundStyle(ink)
        .frame(maxWidth: .infinity).frame(height: 50)
        .background(bg, in: .rect(cornerRadius: 13))
        .overlay { RoundedRectangle(cornerRadius: 13).stroke(t.border) }
        .padding(.horizontal, 14)
    }

    /// Un campo de texto que guarda al dejar de escribir.
    ///
    /// Guardar en cada letra sería un viaje por tecla; un botón "Guardar"
    /// aparte se olvida y la persona sale creyendo que cambió algo. Se guarda
    /// al terminar.
    private func enlazar(_ ruta: WritableKeyPath<Catalogo, String>) -> Binding<String> {
        Binding(
            get: { c?[keyPath: ruta] ?? "" },
            set: { nuevo in
                c?[keyPath: ruta] = nuevo
                Task {
                    let antes = nuevo
                    try? await Task.sleep(for: .seconds(0.8))
                    guard c?[keyPath: ruta] == antes else { return }
                    await guardar()
                }
            }
        )
    }

    private func cambiar(_ hacer: (inout Catalogo) -> Void) {
        guard var nuevo = c else { return }
        hacer(&nuevo)
        c = nuevo
        Task { await guardar() }
    }

    private func cargar() async {
        cargando = c == nil
        do {
            c = try await RepoERP.catalogo()
            error = nil
            // Cuántos productos llegan a la vidriera de verdad: los que tienen
            // precio. Decirlo acá evita la pregunta de por qué el catálogo
            // tiene menos cosas que el inventario.
            cuantos = (try? await RepoERP.inventario())?.filter { $0.precio > 0 }.count
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "No pudimos cargar."
        }
        cargando = false
    }

    private func guardar() async {
        guard let c else { return }
        guardando = true
        defer { guardando = false }
        do {
            try await RepoERP.guardarCatalogo(c)
            error = nil
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
                ?? "No pudimos guardar el cambio."
        }
    }
}


/// Qué es el catálogo, en el orden en que a alguien le aparecen las dudas.
///
/// Va como hoja aparte y no como textos sueltos en la pantalla de ajustes: ahí
/// estorban al que ya entendió, y a este lo lee una vez quien recién lo abre.
///
/// Está escrito desde el lado del negocio —qué hago, qué ve mi cliente, qué me
/// llega— y no desde cómo está construido. Nadie necesita saber que hay una
/// vista de Postgres.
struct AyudaCatalogoView: View {
    @Environment(\.tema) private var t
    @Environment(\.dismiss) private var cerrar

    private struct Paso: Identifiable {
        let id = UUID()
        let simbolo: String
        let titulo: String
        let cuerpo: String
    }

    private let pasos: [Paso] = [
        .init(simbolo: "link",
              titulo: "Tu catálogo es un enlace",
              cuerpo: "Una página con tus productos que vive en internet. Se la mandás al cliente por WhatsApp o la pegás en la bio de tu Instagram."),
        .init(simbolo: "arrow.triangle.2.circlepath",
              titulo: "Se actualiza solo",
              cuerpo: "Muestra lo que tenés cargado en Inventario, en vivo. Cambiás un precio acá y el cliente ve el nuevo, sin que tengas que mandar nada otra vez."),
        .init(simbolo: "cart",
              titulo: "El cliente arma su pedido",
              cuerpo: "Elige productos, pone cuántos quiere y deja una nota si hace falta. Todo desde su teléfono, sin bajar ninguna app ni crearse una cuenta."),
        .init(simbolo: "paperplane.fill",
              titulo: "Y te llega por WhatsApp",
              cuerpo: "El pedido te llega como un mensaje, con lo que pidió, el total, su nombre y su teléfono. No se guarda en ningún lado: lo atendés donde ya atendés todo."),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    ForEach(pasos) { p in
                        FilaCard {
                            HStack(alignment: .top, spacing: 13) {
                                Image(systemName: p.simbolo)
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(.white)
                                    .frame(width: 38, height: 38)
                                    .background(C.azulMedio, in: .rect(cornerRadius: 11))
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(p.titulo)
                                        .font(Tipo.barlow(.semibold, 15)).foregroundStyle(t.ink)
                                    Text(p.cuerpo)
                                        .font(Tipo.barlow(.regular, 13.5)).foregroundStyle(t.ink2)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                Spacer(minLength: 0)
                            }
                        }
                    }

                    // Las tres preguntas que llegan igual, contestadas antes.
                    FilaCard {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("LO QUE SUELEN PREGUNTAR")
                                .font(Tipo.barlow(.semibold, 10)).tracking(1.4)
                                .foregroundStyle(t.ink2)

                            duda("¿Ven mis costos o mi stock?",
                                 "No. Sólo el nombre, la foto, el precio y la categoría. El costo, el stock y tus proveedores no salen de la app.")
                            duda("¿Por qué no aparece un producto?",
                                 "Porque no tiene precio cargado, o porque le apagaste “Mostrarlo en el catálogo” en su ficha.")
                            duda("¿Puedo cerrarlo?",
                                 "Cuando quieras. Quien entre al enlace ve que no está disponible, y no se borra nada. Lo volvés a abrir y vuelve igual.")
                        }
                    }

                    FilaCard {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("PARA QUE SE VEA BIEN")
                                .font(Tipo.barlow(.semibold, 10)).tracking(1.4)
                                .foregroundStyle(t.ink2)
                            Text("Ponele foto y descripción a cada producto, desde Inventario. Un catálogo con fotos se mira; uno sin fotos se cierra.")
                                .font(Tipo.barlow(.regular, 13.5)).foregroundStyle(t.ink2)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(.vertical, 12)
            }
            .background(t.bg)
            .navigationTitle("Cómo funciona")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Listo") { cerrar() }
                }
            }
        }
    }

    private func duda(_ q: String, _ a: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(q).font(Tipo.barlow(.semibold, 13.5)).foregroundStyle(t.ink)
            Text(a).font(Tipo.barlow(.regular, 13)).foregroundStyle(t.ink2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
