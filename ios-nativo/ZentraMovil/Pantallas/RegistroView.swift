import SwiftUI

/// Alta de cuenta. Port de `RegistroScreen.tsx`.
///
/// El registro **siempre va a la instalación pública**: en la de un cliente con
/// ERP los usuarios los da de alta el dueño, no se registra cualquiera.
///
/// En tres pasos y no en una sola pantalla. Con nueve campos seguidos el alta
/// se leía como un formulario de banco, y con el teclado abierto quedaban dos a
/// la vista. De a tres o cuatro por paso, cada pantalla entra entera, y lo que
/// es elegir —rubro, tamaño, cómo nos conoció— se elige tocando, sin abrir una
/// lista: es un toque en vez de tres.
struct RegistroView: View {
    @Environment(\.dismiss) private var cerrar
    @Environment(Estado.self) private var estado

    @State private var datos = Registro.Datos()
    @State private var paso = 0
    @State private var trabajando = false
    @State private var error: String?
    @State private var confirmar = false

    private var pasos: [Registro.Paso] { Registro.Paso.allCases }
    private var actual: Registro.Paso { pasos[min(paso, pasos.count - 1)] }
    private var ultimo: Bool { paso == pasos.count - 1 }

    /// Que coinciden se avisa mientras se escribe; que no coinciden, no: a
    /// mitad de tipear la segunda siempre es distinta de la primera.
    private var clavesIguales: Bool {
        datos.clave.count >= 6 && !datos.clave2.isEmpty && datos.clave == datos.clave2
    }

    var body: some View {
        VStack(spacing: 0) {
            encabezado
            ScrollView {
                contenido
                    .padding(.horizontal, 22)
                    .padding(.top, 22)
                    .padding(.bottom, 8)
                    // `id` hace que cada paso entre con su transición, y no
                    // sólo el primero.
                    .id(actual)
                    .transition(.opacity)
            }
            .scrollDismissesKeyboard(.interactively)
            pie
        }
        .background(Color(hex: "#f3f5f8"))
        .environment(\.colorScheme, .light)
        // El reclamo se va en cuanto la persona toca algo: dejarlo puesto
        // mientras corrige es señalarle un error que ya no existe.
        .onChange(of: datos) { error = nil }
    }

    // El encabezado es chico a propósito: el de antes era media pantalla
    // teal vacía con el logo en el medio, y le quitaba lugar a lo único que
    // importa acá, que son los campos.
    private var encabezado: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Button(action: atras) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 36, height: 36)
                        .background(.white.opacity(0.2), in: .rect(cornerRadius: 11))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(paso == 0 ? "Volver al inicio de sesión" : "Paso anterior")

                Spacer()
                Image("MarcaBlanca").resizable().scaledToFit().frame(width: 34)
                Spacer()
                Color.clear.frame(width: 36, height: 36)
            }

            if !confirmar {
                HStack(spacing: 6) {
                    ForEach(Array(pasos.enumerated()), id: \.element) { i, _ in
                        Capsule()
                            .fill(i <= paso ? .white : .white.opacity(0.28))
                            .frame(height: 4)
                    }
                }
                .padding(.top, 22)
                .animation(.easeOut(duration: 0.25), value: paso)

                Text("Paso \(paso + 1) de \(pasos.count)")
                    .font(Tipo.barlow(.semibold, 11)).tracking(1.54)
                    .foregroundStyle(.white.opacity(0.75))
                    .padding(.top, 14)

                Text(actual.titulo)
                    .font(Tipo.barlow(.bold, 24))
                    .foregroundStyle(.white)
                    .padding(.top, 6)

                Text(actual.bajada)
                    .font(Tipo.barlow(.regular, 13.5))
                    .foregroundStyle(.white.opacity(0.85))
                    .padding(.top, 5)
            }
        }
        .padding(.horizontal, 22)
        .padding(.top, 10)
        .padding(.bottom, 26)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            LinearGradient(colors: [C.teal, Color(hex: "#156F69")],
                           startPoint: .top, endPoint: .bottomTrailing)
                .clipShape(UnevenRoundedRectangle(bottomLeadingRadius: 26, bottomTrailingRadius: 26))
        }
    }

    @ViewBuilder
    private var contenido: some View {
        if confirmar {
            VStack(alignment: .leading, spacing: 14) {
                Text("Revisá tu correo").font(Tipo.barlow(.bold, 22))
                Aviso(texto: "Te mandamos un enlace a \(datos.correo.trimmingCharacters(in: .whitespaces)). Tocalo para confirmar tu cuenta y después volvé a entrar.",
                      bg: Tint.tealBg, ink: Tint.tealInk)
            }
        } else {
            VStack(spacing: 16) {
                switch actual {
                case .cuenta:
                    CampoLogin("Nombre y apellido", $datos.nombre, marcador: "Ulises Gómez")
                    CampoLogin("Correo", $datos.correo, marcador: "vos@correo.com", teclado: .emailAddress)
                    CampoLogin("Contraseña", $datos.clave, marcador: "Al menos 6 caracteres", secreto: true)
                    // Escribirla dos veces: mal tipeada acá no se nota hasta
                    // el día siguiente, con la cuenta ya creada.
                    VStack(alignment: .leading, spacing: 7) {
                        CampoLogin("Repetí la contraseña", $datos.clave2,
                                   marcador: "La misma de arriba", secreto: true)
                        if clavesIguales {
                            Text("✓ Coinciden")
                                .font(Tipo.barlow(.semibold, 12))
                                .foregroundStyle(Color(hex: "#0C7A6E"))
                        }
                    }

                case .negocio:
                    CampoLogin("Nombre del negocio", $datos.empresa,
                               marcador: "Opcional · ej. Despensa Doña Lucía")
                    Grupo("¿A qué se dedica?") {
                        Opciones(Registro.rubros, $datos.rubro)
                    }
                    Grupo("¿Cuántas personas trabajan con vos?") {
                        Opciones(Registro.tamanos, $datos.tamano)
                    }

                case .vos:
                    CampoFecha("Fecha de nacimiento", $datos.nacimiento)
                    Grupo("¿Cómo conociste Zentra?") {
                        Opciones(Registro.comoConocio, $datos.comoConocio)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // Abajo y fijo: el botón no se va con el scroll. Con el de antes al final
    // del formulario había que bajar para descubrir que existía.
    private var pie: some View {
        VStack(spacing: 12) {
            if let error, !confirmar {
                Text(error)
                    .font(Tipo.barlow(.medium, 13))
                    .foregroundStyle(Color(hex: "#9e3b3b"))
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }

            Button { confirmar ? cerrar() : seguir() } label: {
                Text(confirmar ? "Ir a iniciar sesión"
                     : trabajando ? "Creando tu cuenta…"
                     : ultimo ? "Crear cuenta" : "Seguir")
                    .font(Tipo.barlow(.semibold, 16)).tracking(0.48)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity).frame(height: 52)
                    .background(trabajando ? Color(hex: "#5C7A85") : C.azul,
                                in: .rect(cornerRadius: 14))
            }
            .buttonStyle(.plain)
            .disabled(trabajando)

            if paso == 0 && !confirmar {
                Button { cerrar() } label: {
                    Text("¿Ya tenés cuenta? ") .font(Tipo.barlow(.medium, 13.5))
                    + Text("Entrá").font(Tipo.barlow(.bold, 13.5)).underline()
                }
                .buttonStyle(.plain)
                .foregroundStyle(C.azulMedio)
            }

            // Sólo en el primer paso: en los otros son tres renglones de
            // letra chica que empujan los campos fuera de la pantalla.
            if paso == 0 && !confirmar {
                Text("La cuenta nueva arranca en blanco, con tu propia empresa. Si tu empresa ya tiene un ERP con nosotros, no te registres: pedile el usuario a tu administrador.")
                    .font(Tipo.barlow(.regular, 11))
                    .foregroundStyle(Color(hex: "#65707f"))
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, 22)
        .padding(.top, 12)
        .padding(.bottom, 16)
        .background(alignment: .top) {
            VStack(spacing: 0) {
                Rectangle().fill(Color(hex: "#d6dbe3")).frame(height: 1)
                Color(hex: "#f3f5f8")
            }
        }
    }

    private func atras() {
        error = nil
        if paso == 0 { cerrar() } else { paso -= 1 }
    }

    /// Avanzar, y en el último paso crear la cuenta.
    ///
    /// Se valida el paso antes de avanzar: descubrir en el tercero que el
    /// correo del primero estaba mal obliga a volver dos pantallas.
    private func seguir() {
        if let falta = Registro.validarPaso(actual, datos) {
            error = falta
            return
        }
        error = nil
        if !ultimo {
            paso += 1
            return
        }
        // Por las dudas, todo junto antes de mandar. Si algo de un paso
        // anterior quedó mal se vuelve a ese paso: el error mostrado en uno
        // que no lo tiene deja a la persona buscando.
        if let conFalta = Registro.pasoConFalta(datos) {
            paso = pasos.firstIndex(of: conFalta) ?? 0
            error = Registro.validarPaso(conFalta, datos)
            return
        }
        Task { await crear() }
    }

    private func crear() async {
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

/// Un título chico arriba de un grupo de opciones, con la cara de las
/// etiquetas de `CampoLogin`.
struct Grupo<Contenido: View>: View {
    let titulo: String
    @ViewBuilder let contenido: Contenido

    init(_ titulo: String, @ViewBuilder contenido: () -> Contenido) {
        self.titulo = titulo; self.contenido = contenido()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(titulo.uppercased())
                .font(Tipo.barlow(.semibold, 11)).tracking(1.32)
                .foregroundStyle(Color(hex: "#65707f"))
            contenido
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Opciones para tocar, en vez de una lista desplegable.
///
/// Con la lista había que tocar, buscar y volver a tocar, y mientras tanto no
/// se veía qué opciones había: "Elegí el rubro" no dice nada. Así se ven todas
/// de una, y la elegida queda marcada con el verde de la marca.
struct Opciones: View {
    let opciones: [String]
    @Binding var valor: String

    init(_ opciones: [String], _ valor: Binding<String>) {
        self.opciones = opciones; self._valor = valor
    }

    var body: some View {
        // Con un `HStack` las etiquetas largas —"Me la recomendó un
        // conocido"— se encogían hasta quedar ilegibles en vez de bajar de
        // renglón.
        FlujoHorizontal(spacing: 8) {
            ForEach(opciones, id: \.self) { o in
                let elegida = o == valor
                Button { valor = o } label: {
                    HStack(spacing: 6) {
                        if elegida { Text("✓") }
                        Text(o)
                    }
                    .font(Tipo.barlow(elegida ? .semibold : .medium, 14))
                    .foregroundStyle(elegida ? .white : Color(hex: "#13232b"))
                    .padding(.horizontal, 14)
                    .frame(minHeight: 40)
                    .background(elegida ? Color(hex: "#1C8C84") : .white, in: .capsule)
                    .overlay {
                        Capsule().stroke(elegida ? Color(hex: "#1C8C84") : Color(hex: "#d6dbe3"),
                                         lineWidth: 1.5)
                    }
                }
                .buttonStyle(.plain)
                .animation(.easeOut(duration: 0.15), value: elegida)
            }
        }
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
                        Aviso(texto: "Listo. Si ese correo tiene una cuenta, te llega el enlace en unos minutos. Mirá también en correo no deseado.",
                              bg: Tint.okBg, ink: Tint.okInk)
                    } else {
                        Text("Escribí tu correo y te mandamos un enlace para poner una contraseña nueva.")
                            .font(Tipo.barlow(.regular, 13))
                            .foregroundStyle(Color(hex: "#65707f"))
                            .frame(maxWidth: .infinity, alignment: .leading)

                        CampoLogin("Correo", $correo, marcador: "vos@correo.com", teclado: .emailAddress)

                        if let error { Aviso(texto: error, bg: Tint.errorBg, ink: Tint.errorInk) }

                        Button { Task { await enviar() } } label: {
                            ZStack {
                                if trabajando { ProgressView().tint(.white) }
                                else { Text("Enviar enlace").font(Tipo.barlow(.semibold, 15)) }
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity).frame(height: 48)
                            .background(trabajando ? C.azulMedio.opacity(0.4) : C.azulMedio,
                                        in: .rect(cornerRadius: 12))
                        }
                        .buttonStyle(.plain)
                        .disabled(trabajando)
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
        // Un "@" suelto dejaba pasar "a@b" y mandaba a esperar un correo que
        // nunca iba a llegar. Es la misma prueba que usa el alta.
        let limpio = correo.trimmingCharacters(in: .whitespaces)
        if limpio.range(of: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$", options: .regularExpression) == nil {
            error = "Revisá el correo: parece que falta algo."
            return
        }
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
