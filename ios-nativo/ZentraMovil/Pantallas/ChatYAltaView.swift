import SwiftUI

/// Alta de cliente, con consulta de RUC en la SET.
struct NuevoClienteView: View {
    @Environment(\.tema) private var t
    @Environment(\.dismiss) private var cerrar
    var alGuardar: (Cliente) -> Void = { _ in }

    @State private var doc = ""
    @State private var nombre = ""
    @State private var contacto = ""
    @State private var tel = ""
    @State private var email = ""
    @State private var ciudad = ""
    @State private var direccion = ""

    @State private var consultando = false
    @State private var avisoSet: String?
    @State private var guardando = false
    @State private var error: String?

    private var puedeGuardar: Bool {
        nombre.trimmingCharacters(in: .whitespaces).count >= 2 && !guardando
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    Bloque(titulo: "DOCUMENTO") {
                        campo("RUC o CI", $doc, teclado: .numbersAndPunctuation)
                        Button { Task { await consultarSet() } } label: {
                            HStack(spacing: 8) {
                                if consultando { ProgressView().controlSize(.small) }
                                Text("Consultar en la SET").font(Tipo.barlow(.semibold, 13.5))
                            }
                            .foregroundStyle(C.azulMedio)
                        }
                        .buttonStyle(.plain)
                        .disabled(doc.trimmingCharacters(in: .whitespaces).isEmpty || consultando)

                        if let avisoSet {
                            Text(avisoSet).font(Tipo.barlow(.regular, 12))
                                .foregroundStyle(Tint.infoInk)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(10).background(Tint.infoBg, in: .rect(cornerRadius: 10))
                        }
                    }

                    Bloque(titulo: "DATOS") {
                        campo("Nombre o razón social", $nombre)
                        campo("Contacto", $contacto)
                        campo("Teléfono", $tel, teclado: .phonePad)
                        campo("Correo", $email, teclado: .emailAddress)
                        campo("Ciudad", $ciudad)
                        campo("Dirección", $direccion)
                    }

                    if let error {
                        Aviso(texto: error, bg: Tint.errorBg, ink: Tint.errorInk)
                    }
                }
                .padding(.vertical, 12)
            }
            .background(t.bg)
            .navigationTitle("Nuevo cliente")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { cerrar() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { Task { await guardar() } }
                        .disabled(!puedeGuardar)
                }
            }
        }
    }

    private func campo(_ etiqueta: String, _ v: Binding<String>,
                       teclado: UIKeyboardType = .default) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(etiqueta.uppercased()).font(Tipo.barlow(.semibold, 10)).tracking(1.2)
                .foregroundStyle(t.ink2)
            TextField("", text: v)
                .keyboardType(teclado)
                .textInputAutocapitalization(teclado == .emailAddress ? .never : .words)
                .autocorrectionDisabled()
                // 16pt: por debajo, iOS hace zoom al enfocar y la pantalla salta.
                .font(.system(size: 16))
                .padding(.horizontal, 12).frame(height: 44)
                .background(t.bg, in: .rect(cornerRadius: 10))
                .overlay { RoundedRectangle(cornerRadius: 10).stroke(t.border) }
        }
    }

    private func consultarSet() async {
        consultando = true; avisoSet = nil
        defer { consultando = false }
        do {
            if let r = try await RepoERP.consultarSet(doc.trimmingCharacters(in: .whitespaces)) {
                nombre = r.razonSocial
                avisoSet = r.activo
                    ? "Encontrado en la SET: \(r.razonSocial)"
                    : "Encontrado, pero figura INACTIVO en la SET."
            } else {
                avisoSet = "No se encontró ese documento en la SET. Podés cargarlo a mano."
            }
        } catch {
            avisoSet = (error as? LocalizedError)?.errorDescription
                ?? "No pudimos consultar la SET."
        }
    }

    private func guardar() async {
        guardando = true; error = nil
        var campos: [String: Any] = ["nombre": nombre.trimmingCharacters(in: .whitespaces)]
        // Sólo se mandan los que tienen algo: un campo vacío puede pisar un dato
        // que el ERP ya tenía por defecto.
        for (k, v) in [("ruc", doc), ("nombre_contacto", contacto), ("telefono", tel),
                       ("email", email), ("ciudad", ciudad), ("direccion", direccion)] {
            let s = v.trimmingCharacters(in: .whitespaces)
            if !s.isEmpty { campos[k] = s }
        }
        do {
            let c = try await RepoERP.crearCliente(campos)
            alGuardar(c)
            cerrar()
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
                ?? "No pudimos guardar el cliente."
        }
        guardando = false
    }
}
