import SwiftUI

/// Alta de cuenta. Port de `RegistroScreen.tsx`.
///
/// El registro **siempre va a la instalación pública**: en la de un cliente con
/// ERP los usuarios los da de alta el dueño, no se registra cualquiera.
struct RegistroView: View {
    @Environment(\.dismiss) private var cerrar
    @Environment(Estado.self) private var estado

    @State private var datos = Registro.Datos()
    @State private var trabajando = false
    @State private var error: String?
    @State private var confirmar = false

    // El botón no se apaga por campo incompleto: apagado no dice qué falta, y
    // con nueve campos eso es dejar a alguien mirando un botón gris. Se puede
    // tocar siempre, y al tocarlo aparece la frase de lo que falta.
    private var puede: Bool { !trabajando }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if confirmar {
                        Aviso(texto: "Te mandamos un correo para confirmar la cuenta. Abrilo y después volvé a entrar.",
                              bg: Tint.okBg, ink: Tint.okInk)
                    } else {
                        CampoLogin("Nombre y apellido", $datos.nombre, marcador: "Juan Pérez")
                        CampoLogin("Nombre de tu empresa", $datos.empresa, marcador: "Opcional")
                        CampoLogin("Correo", $datos.correo, marcador: "vos@empresa.com", teclado: .emailAddress)
                        CampoFecha("Fecha de nacimiento", $datos.nacimiento)
                        CampoElegir("A qué se dedica tu negocio", $datos.rubro,
                                    opciones: Registro.rubros, marcador: "Elegí el rubro")
                        CampoElegir("Cuántas personas trabajan con vos", $datos.tamano,
                                    opciones: Registro.tamanos, marcador: "Elegí el tamaño")
                        CampoElegir("Cómo conociste Zentra", $datos.comoConocio,
                                    opciones: Registro.comoConocio, marcador: "Elegí una opción")
                        CampoLogin("Contraseña", $datos.clave, marcador: "Mínimo 6 caracteres", secreto: true)
                        // Escribirla dos veces: mal tipeada acá no se nota
                        // hasta el día siguiente, con la cuenta ya creada.
                        CampoLogin("Repetí la contraseña", $datos.clave2,
                                   marcador: "La misma de arriba", secreto: true)

                        if let error {
                            Aviso(texto: error, bg: Tint.errorBg, ink: Tint.errorInk)
                        }

                        Button { Task { await crear() } } label: {
                            ZStack {
                                if trabajando { ProgressView().tint(.white) }
                                else { Text("Crear cuenta").font(Tipo.barlow(.semibold, 15)) }
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity).frame(height: 48)
                            .background(puede ? C.azulMedio : C.azulMedio.opacity(0.4),
                                        in: .rect(cornerRadius: 12))
                        }
                        .buttonStyle(.plain)
                        .disabled(!puede)

                        Text("La cuenta nueva arranca en blanco, con tu propia empresa. Si tu empresa ya tiene un ERP con nosotros, no te registres: pedile el usuario a tu administrador.")
                            .font(Tipo.barlow(.regular, 11.5))
                            .foregroundStyle(Color(hex: "#65707f"))
                    }
                }
                .padding(20)
            }
            .background(Color(hex: "#f3f5f8"))
            .environment(\.colorScheme, .light)
            .navigationTitle("Crear cuenta")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cerrar") { cerrar() } }
            }
        }
    }

    private func crear() async {
        // Una frase por vez, en el orden de la pantalla. La validación vive en
        // `Registro` porque la comparten esta pantalla y la de la app web.
        if let falta = Registro.validar(datos) {
            error = falta
            return
        }
        trabajando = true; error = nil
        do {
            // La instalación pública, siempre.
            let t = Directorio.publico()
            guard !t.supabaseUrl.isEmpty else {
                error = "No hay instalación pública configurada en esta app."
                trabajando = false
                return
            }
            await Auth.shared.activar(t)
            let meta = Registro.metadatos(datos)
            let necesita = try await Auth.shared.registrar(
                correo: datos.correo, clave: datos.clave, datos: meta
            )
            if necesita { confirmar = true }
            else {
                estado.tenant = t
                estado.perfil = Perfil(id: "", nombre: meta["nombre"] ?? "", rol: "ADMIN",
                                       empresa: meta["empresa"] ?? "")
                cerrar()
            }
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "No pudimos crear la cuenta."
        }
        trabajando = false
    }
}

/// Recuperar contraseña. Port de `RecuperoScreen.tsx`.
struct RecuperoView: View {
    @Environment(\.dismiss) private var cerrar
    @State private var correo = ""
    @State private var trabajando = false
    @State private var listo = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if listo {
                        // No se dice si el correo existe o no: eso dejaría
                        // averiguar qué cuentas hay probando direcciones.
                        Aviso(texto: "Si esa dirección tiene una cuenta, te va a llegar un correo con el enlace para poner una contraseña nueva.",
                              bg: Tint.okBg, ink: Tint.okInk)
                    } else {
                        Text("Escribí tu correo y te mandamos un enlace para poner una contraseña nueva.")
                            .font(Tipo.barlow(.regular, 13))
                            .foregroundStyle(Color(hex: "#65707f"))
                            .frame(maxWidth: .infinity, alignment: .leading)

                        CampoLogin("Correo", $correo, marcador: "vos@empresa.com", teclado: .emailAddress)

                        if let error { Aviso(texto: error, bg: Tint.errorBg, ink: Tint.errorInk) }

                        Button { Task { await enviar() } } label: {
                            ZStack {
                                if trabajando { ProgressView().tint(.white) }
                                else { Text("Enviar enlace").font(Tipo.barlow(.semibold, 15)) }
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity).frame(height: 48)
                            .background(correo.contains("@") ? C.azulMedio : C.azulMedio.opacity(0.4),
                                        in: .rect(cornerRadius: 12))
                        }
                        .buttonStyle(.plain)
                        .disabled(!correo.contains("@") || trabajando)
                    }
                }
                .padding(20)
            }
            .background(Color(hex: "#f3f5f8"))
            .environment(\.colorScheme, .light)
            .navigationTitle("Recuperar contraseña")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cerrar") { cerrar() } }
            }
        }
    }

    private func enviar() async {
        trabajando = true; error = nil
        do {
            await Auth.shared.activar(Directorio.publico())
            try await Auth.shared.recuperar(correo: correo)
            listo = true
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "No pudimos enviar el correo."
        }
        trabajando = false
    }
}

/// El campo del login y sus pantallas hermanas, sobre fondo claro.
/// Un campo de elegir, con la misma cara que `CampoLogin`.
///
/// Arranca vacío y mostrando el marcador: si arrancara con la primera opción
/// puesta, lo que se guarda sería lo que la app eligió, no lo que eligió la
/// persona.
struct CampoElegir: View {
    let etiqueta: String
    @Binding var valor: String
    let opciones: [String]
    var marcador = "Elegí una opción"

    init(_ etiqueta: String, _ valor: Binding<String>, opciones: [String],
         marcador: String = "Elegí una opción") {
        self.etiqueta = etiqueta; self._valor = valor
        self.opciones = opciones; self.marcador = marcador
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(etiqueta.uppercased())
                .font(Tipo.barlow(.semibold, 10.5)).tracking(1.26)
                .foregroundStyle(Color(hex: "#65707f"))
                .frame(maxWidth: .infinity, alignment: .leading)

            Menu {
                Picker("", selection: $valor) {
                    ForEach(opciones, id: \.self) { Text($0).tag($0) }
                }
            } label: {
                HStack {
                    Text(valor.isEmpty ? marcador : valor)
                        .font(.system(size: 16))
                        .foregroundStyle(valor.isEmpty ? Color(hex: "#8b95a3") : Color(hex: "#13232b"))
                        .lineLimit(1)
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color(hex: "#65707f"))
                }
                .padding(.horizontal, 14).frame(height: 46)
                .background(.white, in: .rect(cornerRadius: 12))
                .overlay { RoundedRectangle(cornerRadius: 12).stroke(Color(hex: "#d6dbe3")) }
            }
        }
    }
}

/// La fecha de nacimiento, con el calendario del sistema. No son tres cajitas
/// a mano: así no hay forma de escribir 31 de febrero.
struct CampoFecha: View {
    let etiqueta: String
    @Binding var valor: Date

    init(_ etiqueta: String, _ valor: Binding<Date>) {
        self.etiqueta = etiqueta; self._valor = valor
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(etiqueta.uppercased())
                .font(Tipo.barlow(.semibold, 10.5)).tracking(1.26)
                .foregroundStyle(Color(hex: "#65707f"))
                .frame(maxWidth: .infinity, alignment: .leading)

            DatePicker("", selection: $valor, in: ...Date(), displayedComponents: .date)
                .labelsHidden()
                .datePickerStyle(.compact)
                .padding(.horizontal, 10).frame(height: 46)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.white, in: .rect(cornerRadius: 12))
                .overlay { RoundedRectangle(cornerRadius: 12).stroke(Color(hex: "#d6dbe3")) }
        }
    }
}

struct CampoLogin: View {
    let etiqueta: String
    @Binding var texto: String
    var marcador: String = ""
    var teclado: UIKeyboardType = .default
    var secreto = false

    init(_ etiqueta: String, _ texto: Binding<String>, marcador: String = "",
         teclado: UIKeyboardType = .default, secreto: Bool = false) {
        self.etiqueta = etiqueta; self._texto = texto
        self.marcador = marcador; self.teclado = teclado; self.secreto = secreto
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(etiqueta.uppercased())
                .font(Tipo.barlow(.semibold, 10.5)).tracking(1.26)
                .foregroundStyle(Color(hex: "#65707f"))
                .frame(maxWidth: .infinity, alignment: .leading)

            Group {
                if secreto { SecureField(marcador, text: $texto) }
                else {
                    TextField(marcador, text: $texto)
                        .keyboardType(teclado)
                        .textInputAutocapitalization(teclado == .emailAddress ? .never : .words)
                }
            }
            .autocorrectionDisabled()
            // 16pt: por debajo, iOS hace zoom al enfocar y la pantalla salta.
            .font(.system(size: 16))
            .padding(.horizontal, 14).frame(height: 46)
            .background(.white, in: .rect(cornerRadius: 12))
            .overlay { RoundedRectangle(cornerRadius: 12).stroke(Color(hex: "#d6dbe3")) }
        }
    }
}
