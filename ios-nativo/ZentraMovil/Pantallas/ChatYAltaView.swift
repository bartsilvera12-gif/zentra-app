import SwiftUI

/// Alta de cliente, con consulta de RUC en la SET.
///
/// Son dos formularios en uno, igual que en Android: el largo del módulo
/// Clientes y el corto de media venta.
///
/// La diferencia no es de estilo. Con alguien esperando en el mostrador, pedir
/// seis campos para emitir una factura es pedirle a quien atiende que elija
/// entre facturar rápido o cargar bien el cliente. El resto se completa después
/// desde el módulo, que es cuando hay tiempo.
struct NuevoClienteView: View {
    @Environment(\.tema) private var t
    @Environment(\.dismiss) private var cerrar
    /// De dónde se abrió. Decide qué se pide y qué dice el botón.
    var desdeVenta = false
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
                        campo("RUC o CI", $doc, teclado: .numbersAndPunctuation, codigo: true)
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
                        campo("Nombre o razón social", $nombre,
                              marcador: "Se completa con la SET, o escribilo")
                        // En media venta sólo el nombre: lo demás es para
                        // después, desde el módulo.
                        if !desdeVenta {
                            campo("Contacto", $contacto)
                            campo("Teléfono", $tel, teclado: .phonePad)
                            campo("Correo", $email, teclado: .emailAddress)
                            campo("Ciudad", $ciudad)
                            campo("Dirección", $direccion)
                        }
                    }

                    Text(desdeVenta
                         ? "Los demás datos se completan después desde el módulo Clientes."
                         : "Solo el nombre es obligatorio; el resto se puede completar después.")
                        .font(Tipo.barlow(.regular, 11.5)).foregroundStyle(t.ink2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                        .fixedSize(horizontal: false, vertical: true)

                    if let error {
                        Aviso(texto: error, bg: Tint.errorBg, ink: Tint.errorInk)
                    }
                }
                .padding(.vertical, 12)
            }
            .background(t.bg)
            .cerrarTeclado()
            .navigationTitle("Nuevo cliente")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { cerrar() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    // "Guardar y continuar" en media venta: el botón dice
                    // a dónde lleva, que es de vuelta a la factura.
                    Button(desdeVenta ? "Guardar y continuar" : "Guardar cliente") {
                        Task { await guardar() }
                    }
                        .disabled(!puedeGuardar)
                }
            }
        }
    }

    private func campo(_ etiqueta: String, _ v: Binding<String>,
                       teclado: UIKeyboardType = .default,
                       marcador: String = "",
                       codigo: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(etiqueta.uppercased()).font(Tipo.barlow(.semibold, 10)).tracking(1.2)
                .foregroundStyle(t.ink2)
            TextField(marcador, text: v)
                .keyboardType(teclado)
                .textInputAutocapitalization(teclado == .emailAddress ? .never : .words)
                .autocorrectionDisabled()
                .modifier(SiCodigo(activo: codigo, texto: v))
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
