import SwiftUI

/// Configuración. Port de `src/mobile/screens/ConfigScreen.tsx`.
///
/// Cuatro bloques: apariencia, notificaciones, soporte y cuenta. El borrado de
/// cuenta no es opcional — las dos tiendas lo exigen si la app permite
/// registrarse, y Apple lo hace cumplir.
struct ConfiguracionView: View {
    @Environment(\.tema) private var t
    @Environment(Ajustes.self) private var ajustes
    @Environment(Estado.self) private var estado

    @State private var confirmarSalir = false
    @State private var confirmarBorrar = false
    @State private var textoBorrar = ""
    @State private var borrando = false
    @State private var errorBorrar: String?
    /// La instalación tiene ERP propio: entonces la cuenta no es nuestra.
    @State private var conErp = false

    var body: some View {
        @Bindable var a = ajustes

        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                apariencia($a)
                notificaciones($a)
                plan
                soporte
                cuenta

                Text("Zentra ERP · versión 2.4.1 · \(estado.tenant?.nombre ?? "Zentra")")
                    .font(Tipo.barlow(.regular, 11.5))
                    .foregroundStyle(t.ink3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 4)
            }
            .padding(14)
        }
        .background(t.bg)
        .safeAreaInset(edge: .top, spacing: 0) { encabezado }
        .alert("¿Cerrar sesión?", isPresented: $confirmarSalir) {
            Button("Cancelar", role: .cancel) {}
            Button("Cerrar sesión", role: .destructive) { Task { await estado.salir() } }
        } message: {
            Text("Vas a tener que volver a escribir tu usuario y contraseña.")
        }
        .sheet(isPresented: $confirmarBorrar) { hojaBorrar }
    }

    private var encabezado: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Configuración")
                .font(Tipo.barlow(.bold, 24))
                .foregroundStyle(t.ink)
            Text("Preferencias visuales y avisos")
                .font(Tipo.barlow(.regular, 12.5))
                .foregroundStyle(t.ink2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 14)
        .background(t.card)
        .overlay(alignment: .bottom) { Rectangle().fill(t.border).frame(height: 1) }
    }

    // MARK: - Apariencia

    private func apariencia(_ a: Bindable<Ajustes>) -> some View {
        tarjeta {
            etiqueta("APARIENCIA")

            HStack(spacing: 12) {
                modo(.claro, "Modo claro", "sun.max")
                modo(.oscuro, "Modo oscuro", "moon")
            }
            // Elegir un modo a mano implica dejar de seguir al teléfono: si no,
            // se toca "Modo oscuro" y no pasa nada visible.
            .disabled(ajustes.seguirSistema)
            .opacity(ajustes.seguirSistema ? 0.45 : 1)

            fila("Usar la del sistema", "Usar el tema del teléfono") {
                Toggle("", isOn: a.seguirSistema.animation(.easeInOut(duration: 0.2)))
                    .labelsHidden().tint(C.teal)
            }
        }
    }

    // MARK: - Notificaciones

    private func notificaciones(_ a: Bindable<Ajustes>) -> some View {
        tarjeta {
            etiqueta("NOTIFICACIONES")
            fila("Avisos push", "Ventas, cobros y entregas") {
                Toggle("", isOn: a.push).labelsHidden().tint(C.teal)
                    // Prender el interruptor es lo que pide el permiso y
                    // registra el teléfono. No se pide al arrancar: iOS da un
                    // solo diálogo, y gastarlo antes de que nadie lo haya
                    // pedido es gastarlo mal.
                    .onChange(of: ajustes.push) { _, prendido in
                        guard prendido else { return }
                        Task {
                            if await Avisos.pedirPermiso() {
                                Push.shared.registrar()
                            } else {
                                // Lo negaron: el interruptor no puede quedar
                                // prendido prometiendo algo que no va a pasar.
                                ajustes.push = false
                            }
                        }
                    }
            }
            fila("Stock bajo", "Alertar bajo el mínimo") {
                Toggle("", isOn: a.stockBajo).labelsHidden().tint(C.teal)
            }
            fila("Resumen diario", "Todos los días a las 19:00") {
                Toggle("", isOn: a.resumenDiario).labelsHidden().tint(C.teal)
            }
            fila("Sonido y vibración", "Al recibir un aviso") {
                Toggle("", isOn: a.sonido).labelsHidden().tint(C.teal)
            }
        }
    }

    /// La suscripción: qué plan, cómo está y hasta cuándo.
    ///
    /// Con ERP propio no se muestra — esas empresas pagan su ERP, no un plan de
    /// Zentra. Es la misma primera línea de `motivoBloqueo()`.
    ///
    /// El texto viene armado desde `Planes.suscripcion()`: acá no se decide qué
    /// decir según los días que faltan. Si esta pantalla tuviera que saberlo,
    /// el dato viviría en dos lugares y terminarían diciendo cosas distintas.
    @ViewBuilder
    private var plan: some View {
        if let sus = Planes.suscripcion(conErp: estado.conErp,
                                        plan: estado.tenant?.plan ?? .free,
                                        vence: estado.tenant?.vence) {
            tarjeta {
                etiqueta("SUSCRIPCIÓN")

                HStack(alignment: .firstTextBaseline) {
                    Text(sus.plan)
                        .font(Tipo.barlow(.bold, 18)).foregroundStyle(t.ink)
                    Spacer(minLength: 12)
                    Text(sus.estado)
                        .font(Tipo.barlow(.semibold, 12.5))
                        // El rojo se guarda para lo que ya venció. Un "vence en
                        // 5 días" en rojo es la alarma gritando todos los días.
                        .foregroundStyle(sus.urgente ? Tint.errorInk : t.ink2)
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(sus.urgente ? Tint.errorBg : t.bg, in: .capsule)
                }

                Text(sus.detalle)
                    .font(Tipo.barlow(.regular, 13))
                    .foregroundStyle(t.ink2)
                    .fixedSize(horizontal: false, vertical: true)

                // Cómo se sube de plan.
                //
                // Ni el botón de pagar ni la dirección de cobro: las tiendas
                // prohíben dirigir a pagar afuera, y nombrar la dirección
                // cuenta igual que enlazarla.
                //
                // Queda escribirle a soporte, que sí está permitido y además
                // es mejor: hoy el botón mandaba a alguien solo a una página
                // de pago, y nadie del otro lado se enteraba de que había
                // intención de comprar.
                if let url = Config.linkDePago {
                    Link(destination: url) {
                        Text("Ver planes y pagar")
                            .font(Tipo.barlow(.semibold, 15)).foregroundStyle(.white)
                            .frame(maxWidth: .infinity).frame(height: 46)
                            .background(C.teal, in: .rect(cornerRadius: 12))
                    }
                } else if let wa = Soporte.link(Config.soporteWhatsapp, .ayuda,
                                                Soporte.contacto(nombre: estado.perfil?.nombre,
                                                                 empresa: estado.perfil?.empresa)) {
                    Link(destination: wa) {
                        Text("Escribirnos para cambiar de plan")
                            .font(Tipo.barlow(.semibold, 15)).foregroundStyle(.white)
                            .frame(maxWidth: .infinity).frame(height: 46)
                            .background(C.teal, in: .rect(cornerRadius: 12))
                    }
                }
            }
        }
    }

    // MARK: - Soporte

    /// Dos puertas, no tres: escribir a soporte y sugerir una mejora.
    ///
    /// El mensaje ya va armado con quién sos, de qué empresa y qué versión
    /// tenés. Esa vuelta —"¿qué versión usás?", "¿en qué pantalla?"— es la que
    /// convierte diez minutos de soporte en dos días de ida y vuelta.
    private var soporte: some View {
        let d = Soporte.contacto(nombre: estado.perfil?.nombre,
                                 empresa: estado.tenant?.nombre)
        return tarjeta {
            etiqueta("SOPORTE")
            ForEach([Soporte.Motivo.ayuda, .mejora], id: \.titulo) { m in
                filaSoporte(m.simbolo, m.titulo, m.detalle,
                            destino: Soporte.link(Config.soporteWhatsapp, m, d))
            }
        }
    }

    // MARK: - Cuenta

    private var cuenta: some View {
        tarjeta {
            etiqueta("CUENTA")

            if let p = estado.perfil {
                VStack(alignment: .leading, spacing: 2) {
                    Text(Formato.nombreCorto(p.nombre))
                        .font(Tipo.barlow(.semibold, 14.5)).foregroundStyle(t.ink)
                    Text(Formato.rolLegible(p.rol))
                        .font(Tipo.barlow(.regular, 12)).foregroundStyle(t.ink2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button { confirmarSalir = true } label: {
                Text("Cerrar sesión")
                    .font(Tipo.barlow(.semibold, 14.5))
                    .foregroundStyle(t.ink)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .background(t.bg, in: .rect(cornerRadius: 12))
                    .overlay { RoundedRectangle(cornerRadius: 12).stroke(t.border) }
            }
            .buttonStyle(.plain)

            Button { textoBorrar = ""; confirmarBorrar = true } label: {
                Text("Eliminar mi cuenta")
                    .font(Tipo.barlow(.semibold, 14.5))
                    .foregroundStyle(Tint.errorInk)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .background(Tint.errorBg, in: .rect(cornerRadius: 12))
            }
            .buttonStyle(.plain)
        }
    }

    /// Se escribe la palabra sin importar mayúsculas, igual que en Android.
    private var puedeBorrar: Bool {
        !borrando && textoBorrar.trimmingCharacters(in: .whitespaces).uppercased() == "ELIMINAR"
    }

    /// Borra la cuenta y vuelve al login.
    ///
    /// La sesión guardada apunta a un usuario que ya no existe: hay que
    /// soltarla, o la próxima apertura intenta entrar con ella y falla sin que
    /// se entienda por qué.
    private func borrarCuenta() async {
        guard puedeBorrar else { return }
        borrando = true; errorBorrar = nil
        do {
            try await RepoERP.eliminarMiCuenta()
            // `salir()` y no sólo olvidar la sesión: también da de baja el
            // token push de este teléfono. Sin eso, el servidor seguiría
            // mandándole avisos a una cuenta que ya no existe.
            await estado.salir()
            confirmarBorrar = false
            textoBorrar = ""
        } catch {
            errorBorrar = (error as? LocalizedError)?.errorDescription
                ?? "No pudimos borrar la cuenta."
        }
        borrando = false
    }

    /// Pide escribir ELIMINAR: un toque accidental no puede borrar un negocio.
    private var hojaBorrar: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Eliminar mi cuenta")
                .font(Tipo.barlow(.bold, 19)).foregroundStyle(t.ink)
            Text("Se borran tu perfil y tus datos. **No se puede deshacer.**")
                .font(Tipo.barlow(.regular, 13)).foregroundStyle(t.ink2)
            Text("Escribí ELIMINAR para habilitar el botón.")
                .font(Tipo.barlow(.regular, 12.5)).foregroundStyle(t.ink2)

            TextField("ELIMINAR", text: $textoBorrar)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .font(.system(size: 16))
                .padding(.horizontal, 14).frame(height: 46)
                .background(t.card, in: .rect(cornerRadius: 12))
                .overlay { RoundedRectangle(cornerRadius: 12).stroke(t.border) }

            // Sólo donde es cierto. En la instalación pública la cuenta es
            // nuestra y se borra entera; decirle a esa persona que "el acceso
            // es el del ERP" sería mentirle sobre lo que está por pasar.
            if conErp {
                Text("En esta instalación el acceso es el del ERP, así que tu usuario para entrar al sistema de tu empresa no se toca: se van tu perfil y tus datos de la app.")
                    .font(Tipo.barlow(.regular, 11.5)).foregroundStyle(t.ink3)
            }

            if let errorBorrar {
                Text(errorBorrar)
                    .font(Tipo.barlow(.regular, 12.5)).foregroundStyle(Tint.errorInk)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(11).background(Tint.errorBg, in: .rect(cornerRadius: 10))
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button { Task { await borrarCuenta() } } label: {
                ZStack {
                    if borrando { ProgressView().tint(.white) }
                    else { Text("Eliminar definitivamente").font(Tipo.barlow(.semibold, 15)) }
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity).frame(height: 46)
                .background(puedeBorrar ? Tint.errorInk : t.dim, in: .rect(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .disabled(!puedeBorrar)

            Spacer()
        }
        .task { conErp = await RepoERP.usaErp() }
        .padding(20)
        .background(t.bg)
        .presentationDetents([.medium])
    }

    // MARK: - Piezas

    private func etiqueta(_ s: String) -> some View {
        Text(s).font(Tipo.barlow(.semibold, 10.5)).tracking(1.68).foregroundStyle(t.ink2)
    }

    private func fila(_ titulo: String, _ detalle: String, @ViewBuilder _ control: () -> some View) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo).font(Tipo.barlow(.semibold, 14.5)).foregroundStyle(t.ink)
                Text(detalle).font(Tipo.barlow(.regular, 12)).foregroundStyle(t.ink2)
            }
            Spacer(minLength: 0)
            control()
        }
    }

    private func filaSoporte(_ simbolo: String, _ titulo: String, _ detalle: String,
                             destino: URL?) -> some View {
        Button {
            if let destino { UIApplication.shared.open(destino) }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: simbolo)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(C.teal)
                    .frame(width: 38, height: 38)
                    .background(t.bg, in: .rect(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 2) {
                    Text(titulo).font(Tipo.barlow(.semibold, 14)).foregroundStyle(t.ink)
                    Text(detalle).font(Tipo.barlow(.regular, 11.5)).foregroundStyle(t.ink2)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold)).foregroundStyle(t.ink3)
            }
        }
        .buttonStyle(.plain)
        .disabled(destino == nil)
    }

    private func modo(_ cual: Ajustes.Tema, _ titulo: String, _ icono: String) -> some View {
        let activo = ajustes.tema == cual && !ajustes.seguirSistema
        return Button {
            withAnimation(.easeInOut(duration: 0.2)) { ajustes.tema = cual }
        } label: {
            VStack(spacing: 8) {
                Image(systemName: icono).font(.system(size: 20))
                Text(titulo).font(Tipo.barlow(.semibold, 14))
            }
            .foregroundStyle(activo ? Tint.tealInk : t.ink)
            .frame(maxWidth: .infinity).padding(.vertical, 18)
            .background(activo ? Tint.tealBg : t.card, in: .rect(cornerRadius: 12))
            .overlay {
                RoundedRectangle(cornerRadius: 12)
                    .stroke(activo ? C.teal : t.border, lineWidth: activo ? 1.5 : 1)
            }
        }
        .buttonStyle(.plain)
    }

    private func tarjeta<C: View>(@ViewBuilder _ c: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 14, content: c)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(t.card, in: .rect(cornerRadius: 14))
    }
}
