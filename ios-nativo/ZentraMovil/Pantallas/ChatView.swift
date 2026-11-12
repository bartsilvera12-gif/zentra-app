import AVKit
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
    /// El cursor está en el campo de texto.
    ///
    /// Citar un mensaje es el paso previo a escribir la respuesta, siempre. Sin
    /// esto quedaba la barra de la cita armada y el teclado abajo, y había que
    /// tocar el campo para empezar a escribir: un toque de más en lo que más se
    /// hace en esta pantalla.
    @FocusState private var escribiendo: Bool
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
    @State private var grabador = Grabador()
    /// El panel de emojis y stickers, abierto o cerrado.
    @State private var panel = false
    @State private var solapaPanel = "Emojis"
    @State private var favoritos: [String] = Ajustes.favoritosChat()

    /// El mensaje al que acabamos de saltar desde una cita, para destacarlo un
    /// segundo. Sin esto se llega al mensaje sin saber a cuál se llegó.
    @State private var destacado: String?

    /// El anuncio del que vino este contacto, si vino de uno.
    @State private var pauta: Pauta?

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
            // Mientras se busca, la franja no va: el campo de búsqueda se
            // dibuja justo ahí y los dos quedaban encimados, ilegibles. Y
            // buscando un mensaje viejo, de dónde vino el contacto no importa.
            if let pauta, !buscando { franja(pauta) }

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
        // Citar es el paso previo a escribir: el teclado sube solo. El panel de
        // emojis se cierra, que si no el teclado lo empujaría fuera de la vista.
        .onChange(of: citando?.id) { _, nueva in
            guard nueva != nil else { return }
            panel = false
            escribiendo = true
        }
        .navigationTitle(chat.nombre)
        .navigationBarTitleDisplayMode(.inline)
        // La barra con su color y no con el de abajo: iOS le pasa el fondo del
        // primer elemento del contenido, y con la franja arriba el nombre del
        // contacto quedaba blanco sobre lila.
        .toolbarBackground(t.card, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
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
                        Label("Transferir conversación", systemImage: "arrow.right.arrow.left")
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
            pauta = await RepoERP.pauta(chat.id)
        }
        .latido(cada: 8, activo: true) { await refrescar() }
    }

    /// De dónde vino este contacto, bajo el encabezado.
    ///
    /// Va acá arriba y no en el menú de los tres puntos porque cambia cómo se
    /// atiende desde el primer mensaje: no es lo mismo alguien que tocó una
    /// promo que alguien que escribió por su cuenta. Tocarla abre el anuncio.
    ///
    /// Los colores salen del tema y no de los tintes de estado. Los tintes son
    /// siempre claros a propósito —van en chips chicos, con su fondo propio—,
    /// pero esto es una banda de lado a lado pegada al encabezado: en modo
    /// oscuro quedaba como una tira blanca, y como iOS le pasa el fondo del
    /// primer elemento a la barra de navegación, el nombre del contacto salía
    /// blanco sobre lila. Qué red fue lo dice el rótulo, que para eso está.
    private func franja(_ p: Pauta) -> some View {
        Link(destination: p.url) {
            HStack(spacing: 6) {
                Image(systemName: "megaphone.fill").font(.system(size: 10, weight: .semibold))
                Text(p.rotulo).font(Tipo.barlow(.semibold, 11.5))
                if !p.titulo.isEmpty {
                    Text(p.titulo)
                        .font(Tipo.barlow(.regular, 11.5))
                        .foregroundStyle(t.ink2)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "arrow.up.right").font(.system(size: 10, weight: .semibold))
            }
            .foregroundStyle(t.marca)
            .padding(.horizontal, 12).padding(.vertical, 7)
            .frame(maxWidth: .infinity)
            .background(t.card)
            .overlay(alignment: .bottom) { Rectangle().fill(t.border).frame(height: 0.5) }
        }
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
                    ForEach(Array(visibles.enumerated()), id: \.element.id) { i, m in
                        // El día, cuando cambia. Va antes del primer mensaje
                        // también: una conversación que arranca sin fecha deja
                        // sin saber de cuándo es lo de más arriba.
                        if let d = diaSiCambia(en: i) {
                            Text(d)
                                .font(Tipo.barlow(.semibold, 11))
                                .foregroundStyle(t.ink2)
                                .padding(.horizontal, 10).padding(.vertical, 4)
                                .background(t.card, in: .capsule)
                                .padding(.vertical, 6)
                        }
                        if m.reaccion.isEmpty { globo(m).id(m.id) } else { reaccion(m).id(m.id) }
                    }
                }
                .padding(.vertical, 12)
            }
            // Abre abajo, en lo último, que es lo que uno quiere ver al entrar.
            .onChange(of: msgs.count) { _, _ in alFinal(sc) }
            .onAppear { alFinal(sc) }
            .onChange(of: saltarA) { _, id in
                guard let id else { return }
                saltarA = nil
                withAnimation { sc.scrollTo(id, anchor: .center) }
                destacado = id
                Task {
                    try? await Task.sleep(for: .seconds(1.6))
                    withAnimation { destacado = nil }
                }
            }
        }
    }

    /// A qué mensaje hay que saltar. Lo pone `irALaCita` y lo consume la lista,
    /// que es la única que tiene el `ScrollViewProxy`.
    @State private var saltarA: String?

    /// El rótulo del día si este mensaje abre uno nuevo; `nil` si sigue el mismo.
    private func diaSiCambia(en i: Int) -> String? {
        guard let f = visibles[i].fecha else { return nil }
        if i > 0, let anterior = visibles[i - 1].fecha,
           Calendar.current.isDate(f, inSameDayAs: anterior) {
            return nil
        }
        return Self.dia(f)
    }

    /// "Hoy", "Ayer", o el día escrito. Dentro de la misma semana alcanza con el
    /// nombre; más atrás hace falta la fecha.
    static func dia(_ f: Date, ahora: Date = Date()) -> String {
        let cal = Calendar.current
        if cal.isDate(f, inSameDayAs: ahora) { return "Hoy" }
        if let ayer = cal.date(byAdding: .day, value: -1, to: ahora),
           cal.isDate(f, inSameDayAs: ayer) { return "Ayer" }
        let dias = cal.dateComponents([.day], from: cal.startOfDay(for: f),
                                      to: cal.startOfDay(for: ahora)).day ?? 0
        let df = DateFormatter()
        df.locale = Locale(identifier: "es_PY")
        df.dateFormat = (1...6).contains(dias) ? "EEEE" : "d 'de' MMMM 'de' yyyy"
        // En español el formateador escribe "martes" y "octubre" en minúscula,
        // que es lo correcto en una oración pero no en un rótulo suelto.
        let texto = df.string(from: f)
        return texto.prefix(1).uppercased() + texto.dropFirst()
    }

    /// Lleva a lo que cita este mensaje.
    ///
    /// Sólo si el citado está entre los que se trajeron: saltar a algo que no
    /// está cargado no es "no pasa nada", es la lista dando un tirón al vacío.
    private func irALaCita(_ m: Mensaje) {
        guard !m.citaWamid.isEmpty,
              let objetivo = msgs.first(where: { $0.wamid == m.citaWamid })
        else { return }
        busqueda = ""
        saltarA = objetivo.id
    }

    /// Ya llegamos abajo una vez en esta conversación.
    ///
    /// La primera vez no se anima: el chat tiene que **abrir** en el último
    /// mensaje, no empezar arriba y caer en picada hasta el final, que es lo
    /// que se veía. De ahí en adelante sí, porque ahí el movimiento significa
    /// algo —llegó un mensaje— y sin animación aparece de golpe.
    @State private var yaBajo = false

    private func alFinal(_ sc: ScrollViewProxy) {
        guard let u = visibles.last else { return }

        guard yaBajo else {
            // Sin retardo y sin animación. El retardo de cinco centésimas era
            // lo que dejaba ver el principio de la conversación antes del
            // salto.
            sc.scrollTo(u.id, anchor: .bottom)
            yaBajo = true
            // Otra vez en el siguiente ciclo: en una conversación con fotos y
            // audios, los globos todavía no midieron lo que van a medir y el
            // primer salto queda corto.
            DispatchQueue.main.async { sc.scrollTo(u.id, anchor: .bottom) }
            return
        }

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
                // Tocarlo lleva hasta el original, como en WhatsApp.
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
                    .contentShape(.rect(cornerRadius: 7))
                    .onTapGesture { irALaCita(m) }
                }

                if !m.imagen.isEmpty {
                    Button { viendo = m } label: { miniatura(m.imagen) }
                        .buttonStyle(.plain)
                } else if !m.video.isEmpty {
                    Button { viendo = m } label: {
                        ZStack {
                            if let u = URL(string: m.video) { MiniaturaVideo(url: u) }
                            Image(systemName: "play.circle.fill")
                                .font(.system(size: 38)).foregroundStyle(.white.opacity(0.9))
                        }
                    }
                    .buttonStyle(.plain)
                } else if !m.audio.isEmpty {
                    if let u = URL(string: m.audio) {
                        ReproductorAudio(url: u, claro: m.mio, avisarArrastre: $moviendoAudio)
                            .frame(width: 210)
                    } else {
                        // Llegó marcado como audio pero sin enlace utilizable.
                        // Decirlo es mejor que un reproductor que no suena.
                        Label("Audio no disponible", systemImage: "mic.slash")
                            .font(Tipo.barlow(.regular, 14))
                            .foregroundStyle(m.mio ? .white : t.ink)
                    }
                } else if !m.documento.isEmpty {
                    documento(m)
                } else if !m.sticker.isEmpty {
                    // Un sticker que llegó sin imagen: se dice que lo era, con
                    // el símbolo del sistema en vez de una carita de relleno.
                    Label("Sticker", systemImage: "face.smiling")
                        .font(Tipo.barlow(.regular, 14))
                        .foregroundStyle(m.mio ? .white : t.ink)
                }

                // Una foto con pie vuelve a tener globo; sin pie, va sola.
                if !m.texto.isEmpty || !m.epigrafe.isEmpty {
                    let cuerpo = m.texto.isEmpty ? m.epigrafe : m.texto
                    let largo = !abiertos.contains(m.id) && Self.esLargo(cuerpo)

                    Text(TextoConEnlaces.armar(largo ? Self.recortar(cuerpo) : cuerpo,
                                               claro: m.mio))
                        .font(Tipo.barlow(.regular, 14))
                        .lineLimit(largo ? Self.lineasCortadas : nil)
                        .tint(m.mio ? .white : C.azulMedio)
                        .foregroundStyle(m.mio ? .white : t.ink)
                        .multilineTextAlignment(.leading)
                        // El globo se ajusta a lo que dice, como en WhatsApp.
                        //
                        // Acá el texto pedía `maxWidth: .infinity`, así que
                        // estiraba el globo hasta el tope aunque el mensaje
                        // fuera un emoji: dos corazones ocupaban el ancho de la
                        // pantalla. El ancho máximo ya lo pone el `Spacer` del
                        // otro lado, que deja siempre 50 puntos libres.
                        //
                        // `fixedSize` en vertical para que un mensaje largo
                        // siga cortándose en varias líneas en vez de achicarse.
                        .fixedSize(horizontal: false, vertical: true)
                        // Seleccionable: copiar un número o una dirección de un
                        // mensaje es de las cosas que más se hacen en un chat.
                        .textSelection(.enabled)

                    if largo {
                        Button {
                            withAnimation(.snappy(duration: 0.22)) { abiertos.insert(m.id) }
                        } label: {
                            Text("Ver más")
                                .font(Tipo.barlow(.semibold, 12.5))
                                .foregroundStyle(m.mio ? .white : C.azulMedio)
                                .underline()
                        }
                        .buttonStyle(.plain)
                    }
                }

                HStack(spacing: 4) {
                    Text(m.hora).font(Tipo.barlow(.regular, 10))
                    if !m.tick.isEmpty { Text(m.tick).font(Tipo.barlow(.regular, 10)) }
                }
                .foregroundStyle(m.mio ? .white.opacity(0.75) : t.ink3)
            }
            .padding(.horizontal, 12).padding(.vertical, 9)
            .background(m.mio ? C.azulMedio : t.card, in: .rect(cornerRadius: 14))
            // Al llegar desde una cita, un destello: marca cuál de todos era.
            .overlay {
                RoundedRectangle(cornerRadius: 14)
                    .fill(C.ambar.opacity(destacado == m.id ? 0.28 : 0))
            }
            .overlay {
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(C.ambar, lineWidth: destacado == m.id ? 2.5 : 0)
            }
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
        .offset(x: arrastrado == m.id ? dx : 0)
        .animation(.snappy(duration: 0.28), value: destacado)
        // `simultaneousGesture` y no `gesture`: con el segundo el reconocedor
        // del globo compite con el del scroll y la lista se traba en cada
        // mensaje hasta que el gesto falla. Así conviven y el scroll manda.
        .simultaneousGesture(gestoResponder(m))
    }

    /// Los mensajes largos que la persona decidió abrir.
    ///
    /// Vive en la pantalla y no en el mensaje: abrir uno es algo de este rato,
    /// no un dato que haya que guardar. Al salir del chat se olvida, que es lo
    /// que uno espera.
    @State private var abiertos: Set<String> = []

    /// Cuántas líneas se muestran antes de cortar.
    ///
    /// Ocho: un saludo largo o un mensaje de bienvenida entra entero, y lo que
    /// se corta es de verdad un texto largo. Con menos, se corta todo y el
    /// "Ver más" se vuelve un trámite en cada globo.
    private static let lineasCortadas = 8

    /// A partir de cuánto se corta. Se mira el largo y los renglones: un
    /// mensaje de veinte líneas cortas también es largo aunque tenga pocas
    /// letras.
    static func esLargo(_ t: String) -> Bool {
        t.count > 420 || t.components(separatedBy: "\n").count > lineasCortadas + 2
    }

    /// El recorte, por si `lineLimit` no alcanza.
    ///
    /// `lineLimit` sólo esconde; el texto completo sigue midiéndose y en un
    /// mensaje de miles de caracteres eso se nota al desplazar. Cortarlo
    /// además mantiene el globo liviano.
    static func recortar(_ t: String) -> String {
        guard t.count > 600 else { return t }
        return String(t.prefix(600)) + "…"
    }

    /// Hasta dónde hay que arrastrar para que quede citado.
    private static let umbralCita: CGFloat = 56

    /// Cuál globo se está arrastrando, y cuánto. Uno solo a la vez.
    @State private var arrastrado: String?
    @State private var dx: CGFloat = 0
    /// El dedo está moviendo la barra de un audio. Los dos gestos son
    /// horizontales y conviven por `simultaneousGesture`, así que el del globo
    /// se abstiene: elegir desde dónde escuchar no tiene que preparar una cita.
    @State private var moviendoAudio = false

    /// Deslizar hacia la derecha para responder, como en WhatsApp.
    ///
    /// Sólo sigue al dedo si el movimiento es más horizontal que vertical: si
    /// no, arrastrar la lista movería los globos de costado.
    private func gestoResponder(_ m: Mensaje) -> some Gesture {
        DragGesture(minimumDistance: 24)
            .onChanged { v in
                guard !moviendoAudio else { return }
                guard abs(v.translation.width) > abs(v.translation.height) else { return }
                arrastrado = m.id
                dx = max(0, min(v.translation.width, Self.umbralCita + 14))
            }
            .onEnded { _ in
                if arrastrado == m.id, dx >= Self.umbralCita { citando = m }
                withAnimation(.snappy(duration: 0.2)) { dx = 0 }
                arrastrado = nil
            }
    }

    /// Miniatura liviana: la imagen entera se carga recién en el visor.
    /// Un documento adjunto: cómo se llama, de qué tipo es, y abrirlo.
    ///
    /// Antes era la palabra "Documento" y nada más, sin forma de abrirlo: no
    /// se sabía si era el presupuesto o el catálogo, y para verlo había que ir
    /// a la computadora.
    @ViewBuilder
    private func documento(_ m: Mensaje) -> some View {
        let nombre = [m.archivo, m.epigrafe].first { !$0.isEmpty } ?? "Documento"
        let extension_ = (m.archivo as NSString).pathExtension.uppercased()
        let contenido = HStack(spacing: 9) {
            Image(systemName: "doc.fill")
                .font(.system(size: 20))
                .foregroundStyle(m.mio ? .white.opacity(0.9) : C.azulMedio)
            VStack(alignment: .leading, spacing: 1) {
                Text(nombre)
                    .font(Tipo.barlow(.semibold, 13.5))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if !extension_.isEmpty {
                    Text(extension_)
                        .font(Tipo.barlow(.regular, 10.5))
                        .foregroundStyle(m.mio ? .white.opacity(0.7) : t.ink3)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "arrow.down.circle")
                .font(.system(size: 16))
                .foregroundStyle(m.mio ? .white.opacity(0.75) : t.ink3)
        }
        .foregroundStyle(m.mio ? .white : t.ink)
        .frame(width: 210)

        if let u = URL(string: m.documento) {
            Link(destination: u) { contenido }
        } else {
            contenido
        }
    }

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
                    .font(Tipo.barlow(.semibold, 11.5)).foregroundStyle(t.marca)
                Text(m.texto.isEmpty ? m.epigrafe : m.texto)
                    .font(Tipo.barlow(.regular, 12)).foregroundStyle(t.ink2).lineLimit(1)
            }
            Spacer(minLength: 0)
            Button { citando = nil } label: {
                Image(systemName: "xmark").font(.system(size: 12, weight: .bold))
                    .foregroundStyle(t.ink3)
            }
            .accessibilityLabel("No responder a ese mensaje")
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .background(t.card)
    }

    private var barra: some View {
        VStack(spacing: 0) {
            if panel { panelEmojis }
            if grabador.grabando { barraGrabando } else { barraEscritura }
        }
        .background(t.card)
    }

    /// Mientras se graba, la barra es otra: cancelar, el tiempo, y enviar.
    ///
    /// Reemplaza a la de escribir en vez de convivir con ella. Grabando no hay
    /// nada más que hacer, y dejar el campo de texto al lado invita a escribir
    /// encima de una nota de voz que se está grabando.
    private var barraGrabando: some View {
        HStack(spacing: 12) {
            Button { grabador.cancelar() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Tint.errorInk)
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cancelar grabación")

            HStack(spacing: 8) {
                Circle().fill(Tint.errorInk).frame(width: 9, height: 9)
                Text(Grabador.reloj(grabador.segundos))
                    .font(Tipo.barlow(.semibold, 15)).foregroundStyle(t.ink)
                    .monospacedDigit()
                Text("Grabando…")
                    .font(Tipo.barlow(.regular, 12.5)).foregroundStyle(t.ink2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button { Task { await enviarAudio() } } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 16, weight: .bold)).foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(C.azulMedio, in: .circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Enviar nota de voz")
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
    }

    private var barraEscritura: some View {
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
                    .foregroundStyle(t.marca)
                    .frame(width: 34, height: 40)
            }
            .disabled(enviando)

            // Crece con el mensaje, hasta cinco líneas.
            TextField("Escribí un mensaje…", text: $texto, axis: .vertical)
                .focused($escribiendo)
                .font(.system(size: 16))
                .lineLimit(1...5)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(t.card, in: .rect(cornerRadius: 20))
                .overlay { RoundedRectangle(cornerRadius: 20).stroke(t.border) }

            Button { withAnimation(.easeOut(duration: 0.18)) { panel.toggle() } } label: {
                Image(systemName: panel ? "keyboard" : "face.smiling")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(C.azulMedio)
                    .frame(width: 34, height: 40)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Emojis y stickers")

            // Con texto escrito el botón manda; vacío, graba. Es el gesto de
            // WhatsApp, y evita un botón más en una barra que ya está llena.
            if puedeEnviar || enviando {
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
            } else {
                Button { Task { await arrancarAudio() } } label: {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 16, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(C.azulMedio, in: .circle)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Grabar nota de voz")
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
    }

    /// Los emojis y los stickers del panel, los mismos de `src/lib/data.ts`.
    ///
    /// Estos sí son emojis y no interfaz: son contenido que se manda, elegido
    /// por quien escribe. La regla de no usar emojis es para lo que dibuja la
    /// app, no para lo que la app le deja decir a la gente.
    private static let emojisPanel = ["😀", "😅", "😂", "🙂", "😉", "😍", "🤝", "👍",
                                      "👌", "🙏", "💪", "🔥", "✅", "❌", "⏰", "📦",
                                      "🚚", "🧾", "💰", "📈", "🍺", "🥤", "💧", "🧊"]
    private static let stickersPanel = ["🧾", "📦", "🚚", "🫡", "🤙", "🎉", "😎",
                                        "🙌", "💵", "⏳"]

    /// Los favoritos primero: es para lo que sirve marcarlos.
    private func ordenados(_ lista: [String]) -> [String] {
        lista.filter { favoritos.contains($0) } + lista.filter { !favoritos.contains($0) }
    }

    private var panelEmojis: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 7) {
                ForEach(["Emojis", "Stickers"], id: \.self) { k in
                    let on = solapaPanel == k
                    Button { solapaPanel = k } label: {
                        Text(k)
                            .font(Tipo.barlow(.semibold, 11.5))
                            .foregroundStyle(on ? C.azul : t.ink2)
                            .padding(.horizontal, 12).frame(height: 28)
                            .background(on ? Tint.avisoBg : t.card, in: .capsule)
                            .overlay { Capsule().stroke(on ? C.azulMedio : t.border) }
                    }
                    .buttonStyle(.plain)
                }
            }

            ScrollView {
                let esEmoji = solapaPanel == "Emojis"
                let lado: CGFloat = esEmoji ? 40 : 58
                FlujoHorizontal(spacing: 8) {
                    ForEach(ordenados(esEmoji ? Self.emojisPanel : Self.stickersPanel), id: \.self) { g in
                        let fav = favoritos.contains(g)
                        Text(g)
                            .font(.system(size: esEmoji ? 22 : 30))
                            .frame(width: lado, height: lado)
                            .background(fav ? Tint.avisoBg : (esEmoji ? .clear : t.bg),
                                        in: .rect(cornerRadius: 12))
                            .overlay {
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(fav ? t.marca : (esEmoji ? .clear : t.border))
                            }
                            .overlay(alignment: .topTrailing) {
                                if fav {
                                    Image(systemName: "star.fill")
                                        .font(.system(size: 8))
                                        .foregroundStyle(t.marca)
                                        .padding(.top, 2).padding(.trailing, 3)
                                }
                            }
                            .contentShape(.rect)
                            .onTapGesture { usar(g, esEmoji: esEmoji) }
                            // Mantener apretado lo marca como favorito. Es el
                            // gesto que ya se usa para esto en cualquier
                            // teclado, y no roba el toque corto, que es mandar.
                            .onLongPressGesture { marcarFavorito(g) }
                            .accessibilityHint(fav
                                ? "Mantené apretado para quitar de favoritos"
                                : "Mantené apretado para marcar como favorito")
                    }
                }
                .padding(.horizontal, 2)
            }
            .frame(maxHeight: 148)
        }
        .padding(.horizontal, 12).padding(.top, 10).padding(.bottom, 4)
        .overlay(alignment: .top) { Divider() }
    }

    /// Un emoji se escribe en el mensaje; un sticker se manda solo.
    ///
    /// Nuestros "stickers" son emojis, no archivos .webp: van como texto, que
    /// es lo que de verdad son y lo que llega bien a WhatsApp. El endpoint de
    /// stickers del ERP espera una URL, y para eso haría falta un catálogo de
    /// stickers que la app no tiene.
    private func usar(_ g: String, esEmoji: Bool) {
        if esEmoji { texto += g; return }
        panel = false
        Task {
            let antes = texto
            texto = g
            await enviar()
            // Si el envío falló, `enviar()` deja el texto puesto; ahí no se
            // pisa lo que la persona venía escribiendo.
            if texto == g { texto = antes }
        }
    }

    private func marcarFavorito(_ g: String) {
        if let i = favoritos.firstIndex(of: g) { favoritos.remove(at: i) }
        else { favoritos.append(g) }
        Ajustes.guardarFavoritosChat(favoritos)
    }

    private func arrancarAudio() async {
        do { try await grabador.arrancar() }
        catch {
            // Negar el permiso es una respuesta válida, no un error que esconder.
            self.error = (error as? LocalizedError)?.errorDescription
                ?? "Necesitamos permiso para usar el micrófono."
        }
    }

    private func enviarAudio() async {
        // Un toque sin querer no manda un audio vacío.
        guard let g = grabador.detener() else { return }
        enviando = true; error = nil
        defer { enviando = false }
        do {
            let datos = try Data(contentsOf: g.url)
            try await RepoERP.enviarArchivo(chat.id, datos: datos, nombre: g.nombre,
                                            tipo: "audio/mp4", pie: "")
            msgs = (try? await RepoERP.mensajes(chat.id)) ?? msgs
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
                ?? "No se pudo enviar el mensaje."
        }
        try? FileManager.default.removeItem(at: g.url)
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
            self.error = (error as? LocalizedError)?.errorDescription ?? "No se pudo enviar el mensaje."
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
        // Sin `try?`: una reacción que no sale se tiene que ver. Con el error
        // tragado, el emoji no aparecía y no había forma de saber si era que
        // tardaba o que había fallado.
        do {
            try await RepoERP.reaccionar(chat.id, wamid: m.wamid, emoji: emoji)
            error = nil
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
                ?? "No se pudo reaccionar."
        }
        msgs = (try? await RepoERP.mensajes(chat.id)) ?? msgs
    }
}

/// Foto o video a pantalla completa, con zoom y la opción de guardar.
struct VisorView: View {
    let mensaje: Mensaje
    @Environment(\.dismiss) private var cerrar
    @State private var escala: CGFloat = 1
    /// Uno solo por apertura: armarlo adentro del `body` lo volvería a crear en
    /// cada redibujo y el video arrancaría de cero cada vez.
    @State private var player: AVPlayer?

    private func reproductor(_ url: URL) -> AVPlayer {
        if let player { return player }
        let p = AVPlayer(url: url)
        DispatchQueue.main.async { self.player = p }
        return p
    }

    private var esVideo: Bool { mensaje.imagen.isEmpty && !mensaje.video.isEmpty }

    private var url: URL? {
        URL(string: mensaje.imagen.isEmpty ? mensaje.video : mensaje.imagen)
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let url {
                // Un video no se abre con `AsyncImage`: eso descarga y
                // decodifica imágenes, así que un `.mp4` dejaba la rueda
                // girando para siempre. Se mira con el reproductor del
                // sistema, que trae sus controles y la pantalla completa.
                if esVideo {
                    VideoPlayer(player: reproductor(url))
                        .ignoresSafeArea()
                } else {
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
                // Ancho entero aunque adentro sólo haya una ruedita. Sin esto
                // la pila se encoge al tamaño del `ProgressView`, el `ScrollView`
                // se encoge con ella y el fondo quedaba pintado en una franja
                // de cuatro dedos en el medio de la hoja: parecía un error, y
                // se arreglaba solo cuando llegaba la ficha y la ensanchaba.
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
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
