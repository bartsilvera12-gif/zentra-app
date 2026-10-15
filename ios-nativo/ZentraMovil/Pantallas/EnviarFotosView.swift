import SwiftUI
import PhotosUI

/// Lo que se va a mandar, ya leído del selector.
struct FotoElegida: Identifiable, Equatable {
    let id = UUID()
    /// En un video es la portada; en una foto, la foto achicada.
    var imagen: UIImage?
    var nombre: String
    /// Los bytes que viajan: la foto ya comprimida, o el video tal cual.
    var datos: Data
    var tipo: String = "image/jpeg"
    var esVideo: Bool = false
}

/// Vista previa de las fotos antes de mandarlas.
///
/// Dos cosas que el chat de Android no tiene:
///
///   - **Se ve lo que se va a mandar.** Mandar una foto sin verla antes es la
///     forma más rápida de mandar la equivocada a un cliente, y en WhatsApp lo
///     que salió no se puede volver atrás de verdad.
///   - **Varias a la vez.** Mandar seis fotos de un pedido de a una es seis
///     veces el mismo baile de abrir el selector.
///
/// Las fotos se achican antes de subir: una de iPhone pesa varios megas y el
/// vendedor suele estar con datos móviles, no en la oficina.
struct EnviarFotosView: View {
    let chatId: String
    let alEnviar: () -> Void

    @Environment(\.tema) private var t
    @Environment(\.dismiss) private var cerrar

    @State private var seleccion: [PhotosPickerItem] = []
    @State private var fotos: [FotoElegida] = []
    @State private var pie = ""
    @State private var leyendo = false
    @State private var enviando = false
    @State private var progreso = 0
    @State private var error: String?

    /// Lado máximo al que se achica. 1600 px alcanza para leer una etiqueta o
    /// un comprobante y deja la foto en unos cientos de kB.
    private let ladoMaximo: CGFloat = 1600

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if fotos.isEmpty && !leyendo {
                    vacio
                } else {
                    grilla
                }

                if let error {
                    Aviso(texto: error, bg: Tint.errorBg, ink: Tint.errorInk)
                        .padding(.bottom, 8)
                }

                if !fotos.isEmpty { barra }
            }
            .background(t.bg)
            .navigationTitle(fotos.isEmpty ? "Mandar fotos" : titulo)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { cerrar() }.disabled(enviando)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    PhotosPicker(selection: $seleccion, maxSelectionCount: 10,
                                 matching: .any(of: [.images, .videos])) {
                        Image(systemName: "plus")
                    }
                    .disabled(enviando)
                }
            }
            .onChange(of: seleccion) { _, nuevas in
                Task { await leer(nuevas) }
            }
        }
    }

    private var titulo: String {
        fotos.count == 1 ? "1 foto" : "\(fotos.count) fotos"
    }

    private var vacio: some View {
        VStack(spacing: 14) {
            Spacer()
            if leyendo {
                ProgressView()
                Text("Preparando las fotos…")
                    .font(Tipo.barlow(.regular, 13)).foregroundStyle(t.ink2)
            } else {
                Image(systemName: "photo.on.rectangle.angled")
                    .font(.system(size: 40, weight: .light)).foregroundStyle(t.ink3)
                Text("Elegí las fotos que querés mandar")
                    .font(Tipo.barlow(.semibold, 15)).foregroundStyle(t.ink)
                PhotosPicker(selection: $seleccion, maxSelectionCount: 10,
                             matching: .any(of: [.images, .videos])) {
                    Text("Elegir fotos")
                        .font(Tipo.barlow(.semibold, 15)).foregroundStyle(.white)
                        .padding(.horizontal, 22).frame(height: 46)
                        .background(C.azulMedio, in: .capsule)
                }
            }
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var grilla: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 10)], spacing: 10) {
                ForEach(fotos) { f in
                    ZStack(alignment: .topTrailing) {
                        ZStack {
                            if let img = f.imagen {
                                Image(uiImage: img).resizable().scaledToFill()
                            } else {
                                // Video: no se saca portada acá. Alcanza con el play y el
                                // peso para saber qué se está por mandar.
                                Rectangle().fill(t.ink3.opacity(0.25))
                                Image(systemName: "play.circle.fill")
                                    .font(.system(size: 30)).foregroundStyle(.white)
                            }
                        }
                        .frame(height: 104)
                        .frame(maxWidth: .infinity)
                        .clipShape(.rect(cornerRadius: 10))

                        // Sacar una sin tener que volver a empezar.
                        Button {
                            withAnimation { fotos.removeAll { $0.id == f.id } }
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 10, weight: .bold)).foregroundStyle(.white)
                                .padding(6).background(.black.opacity(0.55), in: .circle)
                        }
                        .buttonStyle(.plain)
                        .padding(5)
                        .disabled(enviando)

                        Text(peso(f.datos))
                            .font(Tipo.barlow(.semibold, 9)).foregroundStyle(.white)
                            .padding(.horizontal, 5).padding(.vertical, 2)
                            .background(.black.opacity(0.55), in: .capsule)
                            .padding(5)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                    }
                    .frame(height: 104)
                }
            }
            .padding(14)

            if leyendo { ProgressView().padding(.bottom, 12) }
        }
    }

    private var barra: some View {
        VStack(spacing: 10) {
            // Un solo pie para todas: es como se manda un lote en WhatsApp.
            TextField("Agregá un texto (opcional)", text: $pie, axis: .vertical)
                .font(.system(size: 16))
                .lineLimit(1...3)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(t.bg, in: .rect(cornerRadius: 12))
                .overlay { RoundedRectangle(cornerRadius: 12).stroke(t.border) }

            Button { Task { await enviar() } } label: {
                ZStack {
                    if enviando {
                        HStack(spacing: 8) {
                            ProgressView().tint(.white)
                            Text("Mandando \(progreso) de \(fotos.count)…")
                                .font(Tipo.barlow(.semibold, 14))
                        }
                    } else {
                        Text(fotos.count == 1 ? "Mandar la foto" : "Mandar las \(fotos.count)")
                            .font(Tipo.barlow(.semibold, 15))
                    }
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity).frame(height: 48)
                .background(enviando ? C.azulMedio.opacity(0.6) : C.azulMedio,
                            in: .rect(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .disabled(enviando)
        }
        .padding(14)
        .background(t.card)
    }

    // MARK: - Leer y mandar

    private func leer(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        leyendo = true
        error = nil
        for item in items {
            guard let datos = try? await item.loadTransferable(type: Data.self) else { continue }

            // Video: va tal cual. Achicarlo sería recodificarlo entero en el teléfono, y el
            // ERP ya lo convierte a MP4 cuando WhatsApp no acepta el formato.
            if item.supportedContentTypes.contains(where: { $0.conforms(to: .movie) }) {
                let quickTime = item.supportedContentTypes.contains { $0.conforms(to: .quickTimeMovie) }
                fotos.append(FotoElegida(
                    imagen: nil,
                    nombre: "video-\(Int(Date().timeIntervalSince1970))-\(fotos.count + 1)."
                        + (quickTime ? "mov" : "mp4"),
                    datos: datos,
                    tipo: quickTime ? "video/quicktime" : "video/mp4",
                    esVideo: true
                ))
                continue
            }

            guard let img = UIImage(data: datos) else { continue }
            let achicada = achicar(img)
            // 0.8 es el punto donde una foto de producto todavía se ve bien y
            // ya no pesa lo que pesaba.
            guard let jpg = achicada.jpegData(compressionQuality: 0.8) else { continue }
            fotos.append(FotoElegida(
                imagen: achicada,
                nombre: "foto-\(Int(Date().timeIntervalSince1970))-\(fotos.count + 1).jpg",
                datos: jpg
            ))
        }
        seleccion = []
        leyendo = false
    }

    private func achicar(_ img: UIImage) -> UIImage {
        let lado = max(img.size.width, img.size.height)
        guard lado > ladoMaximo else { return img }
        let f = ladoMaximo / lado
        let destino = CGSize(width: img.size.width * f, height: img.size.height * f)
        return UIGraphicsImageRenderer(size: destino).image { _ in
            img.draw(in: CGRect(origin: .zero, size: destino))
        }
    }

    private func enviar() async {
        enviando = true; error = nil; progreso = 0
        for (i, f) in fotos.enumerated() {
            do {
                // El pie va sólo con la primera: repetirlo en cada foto le
                // llegaría al cliente seis veces el mismo texto.
                try await RepoERP.enviarArchivo(
                    chatId, datos: f.datos, nombre: f.nombre, tipo: f.tipo,
                    pie: i == 0 ? pie : ""
                )
                progreso = i + 1
            } catch {
                self.error = "Se mandaron \(progreso) de \(fotos.count). "
                    + ((error as? LocalizedError)?.errorDescription ?? "Falló una.")
                enviando = false
                alEnviar()
                return
            }
        }
        enviando = false
        alEnviar()
        cerrar()
    }

    private func peso(_ d: Data) -> String {
        let kb = Double(d.count) / 1024
        return kb >= 1024 ? String(format: "%.1f MB", kb / 1024) : String(format: "%.0f kB", kb)
    }
}
