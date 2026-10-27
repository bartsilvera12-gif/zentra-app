import SwiftUI

/// Login. Port de `src/mobile/screens/LoginScreen.tsx`.
///
/// Arriba el fondo oscuro de marca con la "Z" y la palabra; abajo una hoja clara
/// con esquinas redondeadas donde va el formulario. El código de empresa aparece
/// sólo si la empresa ya tiene un ERP con nosotros: la mayoría no, y un campo que
/// no se entiende frena a quien no lo necesita.
struct LoginView: View {
    @Environment(Estado.self) private var estado

    @State private var usuario = ""
    @State private var clave = ""
    @State private var tieneErp = false
    @State private var codigo = Guardado.ultimoCodigo
    @State private var animar = false
    @State private var registro = false
    @State private var recupero = false
    @FocusState private var foco: Campo?

    private enum Campo { case usuario, clave, codigo }

    var body: some View {
        ZStack(alignment: .top) {
            // El teal del ícono, no el azul petróleo: es el color con el que
            // la app se ve en la App Store y en la pantalla de inicio del
            // teléfono, así que es el que alguien espera al abrirla.
            C.teal.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 0) {
                    marca
                    hoja
                }
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .sheet(isPresented: $registro) { RegistroView() }
        .sheet(isPresented: $recupero) { RecuperoView() }
        .onAppear {
            // La animación se dispara al aparecer, no al construir: en el `.ipa`
            // hay una pantalla de arranque del sistema por delante y si corre
            // antes, para cuando se ve la pantalla ya terminó.
            withAnimation(.spring(response: 0.85, dampingFraction: 0.55)) { animar = true }
        }
    }

    private var marca: some View {
        VStack(spacing: 2) {
            Image("MarcaBlanca")
                .resizable().scaledToFit()
                .frame(width: 132)
                .scaleEffect(animar ? 1 : 0.6)
                .opacity(animar ? 1 : 0)
            Image("PalabraBlanca")
                .resizable().scaledToFit()
                .frame(width: 212)
                .opacity(animar ? 1 : 0)
                .animation(.easeOut(duration: 0.7).delay(0.42), value: animar)
        }
        .padding(.top, 54)
        .padding(.bottom, 44)
    }

    private var hoja: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Iniciar sesión")
                .font(Tipo.barlow(.semibold, 17))
                .foregroundStyle(C.azul)

            campo("Usuario", texto: $usuario, marcador: "vendedor@zentra", campo: .usuario)
            campo("Contraseña", texto: $clave, marcador: "••••••••", campo: .clave, secreto: true)

            erp

            if !estado.error.isEmpty {
                Text(estado.error)
                    .font(Tipo.barlow(.regular, 12.5))
                    .foregroundStyle(Tint.errorInk)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(10)
                    .background(Tint.errorBg, in: .rect(cornerRadius: 10))
            }

            Button {
                foco = nil
                Task { await estado.entrar(codigo: tieneErp ? codigo : "", usuario: usuario, clave: clave) }
            } label: {
                ZStack {
                    if estado.entrando {
                        ProgressView().tint(.white)
                    } else {
                        Text("Entrar").font(Tipo.barlow(.semibold, 15))
                    }
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 46)
                .background(C.azulMedio, in: .rect(cornerRadius: 12))
            }
            .disabled(estado.entrando)
            .padding(.top, 2)

            HStack {
                Button("¿Olvidaste tu contraseña?") { recupero = true }
                    .font(Tipo.barlow(.medium, 12))
                    .foregroundStyle(C.azulMedio)
                Spacer()
                Button("Crear cuenta") { registro = true }
                    .font(Tipo.barlow(.semibold, 12))
                    .foregroundStyle(C.azulMedio)
            }
            .padding(.top, 2)

            if let wa = Config.linkWhatsapp("Hola, necesito ayuda para entrar a la app de Zentra.") {
                Link(destination: wa) {
                    Text("¿Problemas para entrar? Escribinos")
                        .font(Tipo.barlow(.regular, 11.5))
                        .foregroundStyle(C.azulMedio)
                        .underline()
                }
                .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 26)
        .padding(.bottom, 28)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            Color(hex: "#f3f5f8"),
            in: .rect(topLeadingRadius: 26, topTrailingRadius: 26)
        )
        // La hoja es clara siempre, así que sus controles tienen que
        // dibujarse como en modo claro: si no, con la app en oscuro el texto
        // que escribís sale blanco sobre un campo blanco.
        .environment(\.colorScheme, .light)
    }

    /// El código de empresa: sólo para los pocos que ya tienen un ERP con
    /// nosotros. Se pregunta primero y el campo aparece recién si contestan que sí.
    @ViewBuilder
    private var erp: some View {
        if tieneErp {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("CÓDIGO DE EMPRESA")
                        .font(Tipo.barlow(.semibold, 10.5))
                        .tracking(1.26)
                        .foregroundStyle(Color(hex: "#65707f"))
                    Spacer()
                    Button("No tengo") {
                        tieneErp = false
                        codigo = ""
                    }
                    .font(Tipo.barlow(.medium, 11))
                    .foregroundStyle(C.azulMedio)
                }

                TextField("El que te dimos, ej. JM", text: $codigo)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .focused($foco, equals: .codigo)
                    .font(.system(size: 16))
                    .tracking(0.9)
                    .padding(.horizontal, 14)
                    .frame(height: 46)
                    .background(.white, in: .rect(cornerRadius: 12))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12).stroke(Color(hex: "#d6dbe3"))
                    }
                    .onChange(of: codigo) { _, v in codigo = v.uppercased() }

                if let wa = Config.linkWhatsapp("Hola, necesito el código de empresa para entrar a la app de Zentra.") {
                    Link("¿No tenés tu código? Escribinos", destination: wa)
                        .font(Tipo.barlow(.regular, 11.5))
                        .foregroundStyle(C.azulMedio)
                }
            }
        } else {
            Button {
                tieneErp = true
                foco = .codigo
            } label: {
                Text("Mi empresa ya tiene un ERP con Zentra")
                    .font(Tipo.barlow(.medium, 12.5))
                    .foregroundStyle(C.azulMedio)
                    .underline()
            }
        }
    }

    private func campo(
        _ etiqueta: String,
        texto: Binding<String>,
        marcador: String,
        campo: Campo,
        secreto: Bool = false
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(etiqueta.uppercased())
                .font(Tipo.barlow(.semibold, 10.5))
                .tracking(1.26)
                .foregroundStyle(Color(hex: "#65707f"))

            Group {
                if secreto {
                    SecureField(marcador, text: texto)
                } else {
                    TextField(marcador, text: texto)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                }
            }
            .autocorrectionDisabled()
            .focused($foco, equals: campo)
            // 16pt y no 15: por debajo de 16 el WebView y los campos nativos
            // hacen zoom solo al enfocar, y la pantalla salta.
            .font(.system(size: 16))
            .padding(.horizontal, 14)
            .frame(height: 46)
            .background(.white, in: .rect(cornerRadius: 12))
            .overlay {
                RoundedRectangle(cornerRadius: 12).stroke(Color(hex: "#d6dbe3"))
            }
        }
    }
}
