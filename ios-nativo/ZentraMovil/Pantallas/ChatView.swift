import SwiftUI

/// Una conversación de WhatsApp del ERP.
///
/// Port del bloque grande de `ConversacionesScreen.tsx`: citar al responder,
/// reaccionar, visor propio de fotos y video, y marcar como leído al entrar.
struct ChatView: View {
    let chat: Chat
    @Environment(\.tema) private var t

    @State private var msgs: [Mensaje] = []
    @State private var texto = ""
    @State private var cargando = true
    @State private var enviando = false
    @State private var error: String?

    /// A qué mensaje estoy respondiendo. Se arma tocando "Responder".
    @State private var citando: Mensaje?
    /// A cuál le estoy por poner un emoji.
    @State private var reaccionando: Mensaje?
    /// La foto o el video abiertos a pantalla completa.
    @State private var viendo: Mensaje?

    /// Buscador dentro de la conversación.
    @State private var buscando = false
    @State private var busqueda = ""

    @State private var ficha: FichaContacto?
    @State private var verFicha = false
    @State private var transferir = false
    @State private var mandarFotos = false
    @State private var mandarDoc = false
    @State private var ubicacion = Ubicacion()

    private let emojis = ["👍", "❤️", "😂", "😮", "😢", "🙏"]

    /// Los que coinciden con la búsqueda. Sin búsqueda, todos.
    private var visibles: [Mensaje] {
        let q = busqueda.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return msgs }
        return msgs.filter {
            $0.texto.lowercased().contains(q) || $0.epigrafe.lowercased().contains(q)
                || $0.citaTexto.lowercased().contains(q)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            if cargando {
                Spacer(); ProgressView(); Spacer()
            } else {
                lista
            }

            if let error {
                Text(error).font(Tipo.barlow(.regular, 12)).foregroundStyle(Tint.errorInk)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(10).background(Tint.errorBg)
            }

            if let citando { barraCita(citando) }
            barra
        }
        .background(t.bg)
        .navigationTitle(chat.nombre)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { buscando.toggle(); if !buscando { busqueda = "" } } label: {
                        Label("Buscar en el chat", systemImage: "magnifyingglass")
                    }
                    Button { verFicha = true } label: {
                        Label("Ficha del contacto", systemImage: "person.text.rectangle")
                    }
                    Button { transferir = true } label: {
                        Label("Transferir", systemImage: "arrow.right.arrow.left")
                    }
                    Button {
                        // Toda la conversación al portapapeles, por si hay que
                        // pegarla en un correo o en el ERP.
                        UIPasteboard.general.string = msgs.map {
                            "\($0.mio ? "Yo" : chat.nombre) (\($0.hora)): \($0.texto.isEmpty ? $0.epigrafe : $0.texto)"
                        }.joined(separator: "\n")
                    } label: {
                        Label("Copiar conversación", systemImage: "doc.on.doc")
                    }
                } label: { Image(systemName: "ellipsis.circle") }
            }
        }
        .searchable(text: $busqueda, isPresented: $buscando,
                    prompt: "Buscar en esta conversación")
        .sheet(item: $viendo) { VisorView(mensaje: $0) }
        .sheet(isPresented: $verFicha) { FichaContactoView(chatId: chat.id, nombre: chat.nombre) }
        .sheet(isPresented: $transferir) { TransferirView(chatId: chat.id) }
        .fileImporter(isPresented: $mandarDoc,
                      allowedContentTypes: [.pdf, .plainText, .spreadsheet, .presentation,
                                            .image, .zip, .data],
                      allowsMultipleSelection: false) { r in
            Task { await mandarDocumento(r) }
        }
        .sheet(isPresented: $mandarFotos) {
            EnviarFotosView(chatId: chat.id) {
                // Al volver se relee: así los globos nuevos salen con la hora y
                // el estado que puso el servidor.
                Task { msgs = (try? await RepoERP.mensajes(chat.id)) ?? msgs }
            }
        }
        .confirmationDialog("Reaccionar", isPresented: .constant(reaccionando != nil),
                            titleVisibility: .hidden) {
            ForEach(emojis, id: \.self) { e in
                Button(e) { Task { await reaccionar(e) } }
            }
            Button("Sacar la reacción", role: .destructive) { Task { await reaccionar("") } }
            Button("Cancelar", role: .cancel) { reaccionando = nil }
        }
        .task {
            await cargar()
            // Abrir la conversación es lo que la marca como leída.
            await RepoERP.marcarLeido(chat.id)
        }
        .latido(cada: 8, activo: true) { await refrescar() }
    }

    private var lista: some View {
        ScrollViewReader { sc in
            ScrollView {
                LazyVStack(spacing: 8) {
                    if visibles.isEmpty {
                        Aviso(texto: busqueda.isEmpty
                                ? "No hay mensajes en esta conversación."
                                : "Ningún mensaje contiene “\(busqueda)”.",
                              bg: t.card, ink: t.ink2).padding(.top, 20)
                    }
                    ForEach(visibles) { m in
                        if m.reaccion.isEmpty { globo(m).id(m.id) } else { reaccion(m).id(m.id) }
                    }
                }
                .padding(.vertical, 12)
            }
            // Abre abajo, en lo último, que es lo que uno quiere ver al entrar.
            .onChange(of: msgs.count) { _, _ in alFinal(sc) }
            .onAppear { alFinal(sc) }
        }
    }

    private func alFinal(_ sc: ScrollViewProxy) {
        guard let u = visibles.last else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            withAnimation { sc.scrollTo(u.id, anchor: .bottom) }
        }
    }

    // MARK: - Globo

    private func globo(_ m: Mensaje) -> some View {
        HStack {
            if m.mio { Spacer(minLength: 50) }

            VStack(alignment: m.mio ? .trailing : .leading, spacing: 5) {
                if m.reenviado {
                    Label("Reenviado", systemImage: "arrowshape.turn.up.right")
                        .font(Tipo.barlow(.regular, 10.5))
                        .foregroundStyle(m.mio ? .white.opacity(0.7) : t.ink3)
                }

                // El mensaje citado, arriba y con una barra al costado.
                if !m.citaTexto.isEmpty {
                    HStack(spacing: 6) {
                        Rectangle().fill(C.ambar).frame(width: 3)
                        Text(m.citaTexto)
                            .font(Tipo.barlow(.regular, 11.5))
                            .foregroundStyle(m.mio ? .white.opacity(0.8) : t.ink2)
                            .lineLimit(2)
                    }
                    .padding(6)
                    .background((m.mio ? Color.white : t.ink).opacity(0.1), in: .rect(cornerRadius: 7))
                }

                if !m.imagen.isEmpty {
                    Button { viendo = m } label: { miniatura(m.imagen) }
                        .buttonStyle(.plain)
                } else if !m.video.isEmpty {
                    Button { viendo = m } label: {
                        ZStack {
                            miniatura(m.video)
                            Image(systemName: "play.circle.fill")
                                .font(.system(size: 38)).foregroundStyle(.white.opacity(0.9))
                        }
                    }
                    .buttonStyle(.plain)
                } else if !m.audio.isEmpty {
                    Label("Audio", systemImage: "mic.fill")
                        .font(Tipo.barlow(.regular, 14))
                        .foregroundStyle(m.mio ? .white : t.ink)
                } else if !m.documento.isEmpty {
                    Label(m.epigrafe.isEmpty ? "Documento" : m.epigrafe, systemImage: "doc.fill")
                        .font(Tipo.barlow(.regular, 14))
                        .foregroundStyle(m.mio ? .white : t.ink)
                } else if !m.sticker.isEmpty {
                    // Un sticker que llegó sin imagen: se dice que lo era, con
                    // el símbolo del sistema en vez de una carita de relleno.
                    Label("Sticker", systemImage: "face.smiling")
                        .font(Tipo.barlow(.regular, 14))
                        .foregroundStyle(m.mio ? .white : t.ink)
                }

                // Una foto con pie vuelve a tener globo; sin pie, va sola.
                if !m.texto.isEmpty || !m.epigrafe.isEmpty {
                    Text(m.texto.isEmpty ? m.epigrafe : m.texto)
                        .font(Tipo.barlow(.regular, 14))
                        .foregroundStyle(m.mio ? .white : t.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        // Seleccionable: copiar un número o una dirección de un
                        // mensaje es de las cosas que más se hacen en un chat.
                        .textSelection(.enabled)
                }

                HStack(spacing: 4) {
                    Text(m.hora).font(Tipo.barlow(.regular, 10))
                    if !m.tick.isEmpty { Text(m.tick).font(Tipo.barlow(.regular, 10)) }
                }
                .foregroundStyle(m.mio ? .white.opacity(0.75) : t.ink3)
            }
            .padding(.horizontal, 12).padding(.vertical, 9)
            .background(m.mio ? C.azulMedio : t.card, in: .rect(cornerRadius: 14))
            .contextMenu {
                Button { citando = m } label: { Label("Responder", systemImage: "arrowshape.turn.up.left") }
                Button { reaccionando = m } label: { Label("Reaccionar", systemImage: "face.smiling") }
                Button {
                    UIPasteboard.general.string = m.texto.isEmpty ? m.epigrafe : m.texto
                } label: { Label("Copiar", systemImage: "doc.on.doc") }
            }

            if !m.mio { Spacer(minLength: 50) }
        }
        .padding(.horizontal, 14)
    }

    /// Miniatura liviana: la imagen entera se carga recién en el visor.
    private func miniatura(_ url: String) -> some View {
        AsyncImage(url: URL(string: url)) { img in
            img.resizable().scaledToFill()
        } placeholder: {
            ZStack { Color.black.opacity(0.1); ProgressView() }
        }
        .frame(width: 200, height: 150)
        .clipShape(.rect(cornerRadius: 10))
    }

    private func reaccion(_ m: Mensaje) -> some View {
        HStack {
            if m.reaccionSobreMio { Spacer(minLength: 50) }
            Text(m.reaccion).font(.system(size: 18))
                .padding(.horizontal, 9).padding(.vertical, 5)
                .background(t.card, in: .capsule)
                .overlay { Capsule().stroke(t.border) }
            if !m.reaccionSobreMio { Spacer(minLength: 50) }
        }
        .padding(.horizontal, 14).padding(.top, -4)
    }

    // MARK: - Barra

    private func barraCita(_ m: Mensaje) -> some View {
        HStack(spacing: 8) {
            Rectangle().fill(C.ambar).frame(width: 3, height: 32)
            VStack(alignment: .leading, spacing: 1) {
                Text(m.mio ? "Vos" : chat.nombre)
                    .font(Tipo.barlow(.semibold, 11.5)).foregroundStyle(C.azulMedio)
                Text(m.texto.isEmpty ? m.epigrafe : m.texto)
                    .font(Tipo.barlow(.regular, 12)).foregroundStyle(t.ink2).lineLimit(1)
            }
            Spacer(minLength: 0)
            Button { citando = nil } label: {
                Image(systemName: "xmark").font(.system(size: 12, weight: .bold))
                    .foregroundStyle(t.ink3)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .background(t.card)
    }

    private var barra: some View {
        HStack(spacing: 10) {
            Menu {
                Button { mandarFotos = true } label: {
                    Label("Fotos", systemImage: "photo.on.rectangle")
                }
                Button { mandarDoc = true } label: {
                    Label("Documento", systemImage: "doc")
                }
                Button { Task { await mandarUbicacion() } } label: {
                    Label("Mi ubicación", systemImage: "location")
                }
            } label: {
                Image(systemName: "paperclip")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(C.azulMedio)
                    .frame(width: 34, height: 40)
            }
            .disabled(enviando)

            // Crece con el mensaje, hasta cinco líneas.
            TextField("Escribí un mensaje", text: $texto, axis: .vertical)
                .font(.system(size: 16))
                .lineLimit(1...5)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(t.card, in: .rect(cornerRadius: 20))
                .overlay { RoundedRectangle(cornerRadius: 20).stroke(t.border) }

            Button { Task { await enviar() } } label: {
                ZStack {
                    if enviando { ProgressView().tint(.white) }
                    else { Image(systemName: "arrow.up").font(.system(size: 16, weight: .bold)) }
                }
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(puedeEnviar ? C.azulMedio : t.dim, in: .circle)
            }
            .buttonStyle(.plain)
            .disabled(!puedeEnviar)
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(t.card)
    }

    private var puedeEnviar: Bool {
        !enviando && !texto.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    // MARK: - Acciones

    private func cargar() async {
        do { msgs = try await RepoERP.mensajes(chat.id); error = nil }
        catch { self.error = (error as? LocalizedError)?.errorDescription ?? "No pudimos cargar." }
        cargando = false
    }

    /// Relectura silenciosa: no toca `cargando` ni pisa el error, para que un
    /// latido con señal mala no haga parpadear la pantalla.
    private func refrescar() async {
        if let nuevos = try? await RepoERP.mensajes(chat.id), nuevos != msgs { msgs = nuevos }
    }

    private func enviar() async {
        let t0 = texto.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t0.isEmpty else { return }
        enviando = true; error = nil
        let cita = citando.map { (wamid: $0.wamid,
                                  texto: $0.texto.isEmpty ? $0.epigrafe : $0.texto,
                                  mio: $0.mio) }
        do {
            try await RepoERP.enviarMensaje(chat.id, texto: t0, cita: cita)
            texto = ""; citando = nil
            // Se relee en vez de agregar el globo a mano: así la hora y el tick
            // son los que puso el servidor y no los que yo supongo.
            msgs = (try? await RepoERP.mensajes(chat.id)) ?? msgs
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "No se pudo enviar."
        }
        enviando = false
    }

    /// La ubicación va como enlace de mapa: el ERP no sabe mandar el tipo
    /// "ubicación" de WhatsApp todavía. Del otro lado se toca y abre el mapa.
    private func mandarUbicacion() async {
        enviando = true; error = nil
        do {
            let p = try await ubicacion.actual()
            try await RepoERP.enviarMensaje(chat.id, texto: Ubicacion.texto(p))
            msgs = (try? await RepoERP.mensajes(chat.id)) ?? msgs
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
                ?? "No pudimos mandar tu ubicación."
        }
        enviando = false
    }

    private func mandarDocumento(_ r: Result<[URL], Error>) async {
        guard case .success(let urls) = r, let url = urls.first else { return }
        enviando = true; error = nil
        // El archivo viene de fuera del sandbox: hay que pedir el permiso y
        // soltarlo, o la lectura falla sin decir por qué.
        let abierto = url.startAccessingSecurityScopedResource()
        defer { if abierto { url.stopAccessingSecurityScopedResource() } }
        do {
            let datos = try Data(contentsOf: url)
            try await RepoERP.enviarArchivo(
                chat.id, datos: datos, nombre: url.lastPathComponent,
                tipo: tipoDe(url), pie: ""
            )
            msgs = (try? await RepoERP.mensajes(chat.id)) ?? msgs
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
                ?? "No pudimos mandar el archivo."
        }
        enviando = false
    }

    private func tipoDe(_ url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "pdf": "application/pdf"
        case "png": "image/png"
        case "jpg", "jpeg": "image/jpeg"
        case "txt": "text/plain"
        case "csv": "text/csv"
        case "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        case "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        case "zip": "application/zip"
        default: "application/octet-stream"
        }
    }

    private func reaccionar(_ emoji: String) async {
        guard let m = reaccionando else { return }
        reaccionando = nil
        guard !m.wamid.isEmpty else {
            error = "Ese mensaje no se puede reaccionar: el ERP no mandó su id de WhatsApp."
            return
        }
        try? await RepoERP.reaccionar(chat.id, wamid: m.wamid, emoji: emoji)
        msgs = (try? await RepoERP.mensajes(chat.id)) ?? msgs
    }
}

/// Foto o video a pantalla completa, con zoom y la opción de guardar.
struct VisorView: View {
    let mensaje: Mensaje
    @Environment(\.dismiss) private var cerrar
    @State private var escala: CGFloat = 1

    private var url: URL? {
        URL(string: mensaje.imagen.isEmpty ? mensaje.video : mensaje.imagen)
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let url {
                AsyncImage(url: url) { img in
                    img.resizable().scaledToFit()
                        .scaleEffect(escala)
                        .gesture(MagnifyGesture()
                            .onChanged { escala = max(1, $0.magnification) }
                            .onEnded { _ in withAnimation { escala = max(1, escala) } })
                } placeholder: {
                    ProgressView().tint(.white)
                }
            }

            VStack {
                HStack {
                    Button { cerrar() } label: {
                        Image(systemName: "xmark").font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white).padding(12)
                            .background(.black.opacity(0.4), in: .circle)
                    }
                    Spacer()
                    if let url {
                        // `ShareLink` entrega la URL al sistema, que ahí sí
                        // ofrece guardar en Fotos y todo lo demás.
                        ShareLink(item: url) {
                            Image(systemName: "square.and.arrow.up")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(.white).padding(12)
                                .background(.black.opacity(0.4), in: .circle)
                        }
                    }
                }
                .padding(16)
                Spacer()
                if !mensaje.epigrafe.isEmpty {
                    Text(mensaje.epigrafe)
                        .font(Tipo.barlow(.regular, 14)).foregroundStyle(.white)
                        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                        .background(.black.opacity(0.5))
                }
            }
        }
    }
}

struct FichaContactoView: View {
    let chatId: String
    let nombre: String
    @Environment(\.tema) private var t
    @Environment(\.dismiss) private var cerrar
    @State private var ficha: FichaContacto?
    @State private var cargando = true
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    if cargando { ProgressView().padding(.top, 40) }
                    else if let error { Aviso(texto: error, bg: Tint.errorBg, ink: Tint.errorInk) }
                    else if let f = ficha {
                        Bloque(titulo: "CONTACTO") {
                            HStack(spacing: 12) {
                                Inicial(texto: f.nombre, color: C.naranja)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(f.nombre).font(Tipo.barlow(.semibold, 16))
                                        .foregroundStyle(t.ink)
                                    Text(f.telefono).font(Tipo.barlow(.regular, 12))
                                        .foregroundStyle(t.ink2)
                                }
                                Spacer(minLength: 0)
                            }
                        }
                        if !f.lineas.isEmpty {
                            Bloque(titulo: "DATOS") {
                                ForEach(Array(f.lineas.enumerated()), id: \.offset) { _, l in
                                    Dato(k: l.0, v: l.1)
                                }
                            }
                        }
                    } else {
                        Aviso(texto: "El ERP no tiene una ficha para este contacto.",
                              bg: t.card, ink: t.ink2)
                    }
                }
                .padding(.vertical, 12)
            }
            .background(t.bg)
            .navigationTitle("Ficha")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cerrar") { cerrar() } } }
            .task {
                do { ficha = try await RepoERP.fichaContacto(chatId) }
                catch { self.error = (error as? LocalizedError)?.errorDescription ?? "No pudimos cargar la ficha." }
                cargando = false
            }
        }
    }
}

struct TransferirView: View {
    let chatId: String
    @Environment(\.tema) private var t
    @Environment(\.dismiss) private var cerrar
    @State private var colas: [Destino] = []
    @State private var agentes: [Destino] = []
    @State private var cargando = true
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    if cargando { ProgressView().padding(.top, 40) }
                    else if colas.isEmpty && agentes.isEmpty {
                        Aviso(texto: "No tenés destinos disponibles para transferir.",
                              bg: t.card, ink: t.ink2)
                    } else {
                        if !colas.isEmpty { bloque("COLAS", colas) }
                        if !agentes.isEmpty { bloque("AGENTES", agentes) }
                    }
                    if let error { Aviso(texto: error, bg: Tint.errorBg, ink: Tint.errorInk) }
                }
                .padding(.vertical, 12)
            }
            .background(t.bg)
            .navigationTitle("Transferir")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cerrar") { cerrar() } } }
            .task {
                (colas, agentes) = await RepoERP.destinos(chatId)
                cargando = false
            }
        }
    }

    private func bloque(_ titulo: String, _ ds: [Destino]) -> some View {
        Bloque(titulo: titulo) {
            ForEach(ds) { d in
                Button {
                    Task {
                        do { try await RepoERP.transferir(chatId, a: d); cerrar() }
                        catch {
                            self.error = (error as? LocalizedError)?.errorDescription
                                ?? "No se pudo transferir."
                        }
                    }
                } label: {
                    HStack {
                        Text(d.nombre).font(Tipo.barlow(.regular, 14)).foregroundStyle(t.ink)
                        Spacer()
                        Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(t.ink3)
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }
}
