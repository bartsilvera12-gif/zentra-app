import SwiftUI
import UserNotifications

/// Estado de sesión de la app. Lo que en la web vive en el store.
@Observable
final class Estado {
    var perfil: Perfil?
    var tenant: TenantConfig?
    var entrando = false
    var error = ""

    var dentro: Bool { perfil != nil }

    /// Tener `apiUrl` es lo que distingue a una empresa con ERP propio, y con
    /// ERP no hay plan que consultar: tiene todo.
    var conErp: Bool { !(tenant?.apiUrl ?? "").isEmpty }

    func contextoPlan(productos: Int? = nil, ultimoAjuste: Date? = nil) -> ContextoPlan {
        ContextoPlan(conErp: conErp, plan: tenant?.plan ?? .free,
                     productos: productos, ultimoAjuste: ultimoAjuste)
    }

    /// Entra: resuelve la instalación, valida contra Supabase y trae el perfil.
    ///
    /// El orden importa. Sin resolver primero a qué instalación entra, no se sabe
    /// contra qué Supabase validar las credenciales — código vacío es la
    /// instalación pública.
    func entrar(codigo: String, usuario: String, clave: String) async {
        guard !usuario.trimmingCharacters(in: .whitespaces).isEmpty,
              !clave.isEmpty else {
            error = "Completá usuario y contraseña."
            return
        }

        entrando = true
        error = ""
        defer { entrando = false }

        do {
            let t = try await Directorio.resolver(codigo)
            await Auth.shared.activar(t)
            tenant = t

            try await Auth.shared.entrar(usuario: usuario, clave: clave)
            let p = try await ApiERP.perfil()
            perfil = p
            aplicarPlan(de: p)
            await registrarTelefono()
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription
                ?? "No pudimos conectar. Probá de nuevo."
            await Auth.shared.salir()
            perfil = nil
        }
    }

    /// Reanuda sin pedir contraseña: hay sesión guardada y un código recordado.
    func reanudar() async {
        guard await Auth.shared.haySesion() else { return }
        let codigo = Guardado.ultimoCodigo
        guard let t = codigo.isEmpty ? Directorio.publico() : Guardado.leer(codigo) else { return }
        await Auth.shared.activar(t)
        tenant = t
        // Si el perfil falla, la sesión venció o se revocó: se vuelve al login
        // en vez de entrar a una app que no sabe quién es.
        if let p = try? await ApiERP.perfil() {
            perfil = p
            aplicarPlan(de: p)
            await registrarTelefono()
        } else {
            await Auth.shared.salir()
        }
    }

    /// Guarda el token de este teléfono para que el ERP pueda mandarle avisos.
    ///
    /// Va sin bloquear ni romper el login: que los avisos no se puedan registrar
    /// no es motivo para dejar a un vendedor afuera. El token cambia al
    /// reinstalar la app, así que se vuelve a mandar en cada entrada.
    /// El plan que dice la base manda sobre el del directorio.
    ///
    /// El directorio da el plan de arranque —para la instalación pública,
    /// gratis—, pero el que vale es el de `zentra.empresas`, que es el que
    /// actualiza el server cuando entra un pago. Sin esto, pagar no desbloquea
    /// nada: la app seguiría tratando a esa empresa como gratis para siempre.
    ///
    /// `nil` no pisa: significa "no se pudo leer", y ahí es mejor dejar lo que
    /// venía que bajarle el plan a alguien por una lectura que falló.
    /// Relee el plan sin tocar la sesión ni la pantalla.
    ///
    /// Se llama al volver del segundo plano. Hace falta porque el plan cambia
    /// **afuera** de la app: se paga en el navegador, el server actualiza la
    /// empresa, y acá nadie se entera. Hasta ahora el único momento en que se
    /// leía era al abrir la app desde cero, así que quien pagaba volvía a la
    /// app y seguía viendo todo bloqueado — que es justo cuando quiere usar lo
    /// que acaba de comprar.
    ///
    /// Si falla no pasa nada: queda el plan que ya tenía. Una lectura que no
    /// salió no es motivo para bajarle el plan a nadie.
    func refrescarPlan() async {
        guard tenant != nil, await Auth.shared.haySesion() else { return }
        if let p = try? await ApiERP.perfil() {
            perfil = p
            aplicarPlan(de: p)
        }
    }

    private func aplicarPlan(de p: Perfil) {
        guard var t = tenant else { return }
        if let plan = p.plan { t.plan = plan }
        if let vence = p.vence { t.vence = vence }
        tenant = t
    }

    /// Guarda el token de este teléfono para el usuario de la sesión.
    ///
    /// El error se anota en vez de tragarse. Sin esto, "no me llegan los
    /// avisos" no tiene dónde mirarse: todo se ve bien —permiso dado, clave
    /// subida, interruptor prendido— y no llega nada.
    private func registrarTelefono() async {
        guard let token = tokenPush, !token.isEmpty else { return }
        do {
            esAgente = try await RepoERP.registrarDispositivo(token).esAgente
            print("[push] teléfono registrado · agente: "
                  + (esAgente.map(String.init) ?? "no aplica"))
        } catch {
            print("[push] no se pudo registrar el teléfono: "
                  + ((error as? LocalizedError)?.errorDescription ?? "\(error)"))
        }
    }

    /// Si este usuario está dado de alta como agente de conversaciones.
    ///
    /// El ERP elige a quién mandarle el aviso de un chat por su `agent_id`. Un
    /// usuario que no es agente no tiene ninguno, así que **no le va a llegar
    /// jamás** un aviso de chat — por más que el interruptor esté prendido, el
    /// permiso dado y el token guardado. `nil` cuando el ERP no lo informa:
    /// entonces no se afirma nada, ni a favor ni en contra.
    var esAgente: Bool?

    /// Lo deja `Push` cuando Firebase entrega el token.
    var tokenPush: String?

    /// Engancha la llegada del token y, si el permiso ya está dado, registra.
    ///
    /// El token puede llegar antes o después de que haya sesión: Firebase lo
    /// entrega cuando quiere. Por eso se guarda siempre y se manda al ERP sólo
    /// cuando hay con quién asociarlo; si llega antes de entrar, lo levanta
    /// `registrarTelefono()` al abrir sesión.
    @MainActor
    func engancharPush() async {
        Push.shared.alLlegarToken = { [weak self] token in
            guard let self else { return }
            self.tokenPush = token
            Task { await self.registrarTelefono() }
        }
        // Sin permiso no se registra: iOS da un solo diálogo y lo pide la
        // pantalla de Configuración, que es donde se prende el interruptor.
        if await UNUserNotificationCenter.current()
            .notificationSettings().authorizationStatus == .authorized {
            await Push.shared.registrar()
        }
    }

    func salir() async {
        if let token = tokenPush, !token.isEmpty {
            try? await RepoERP.bajaDispositivo(token)
        }
        await Auth.shared.salir()
        perfil = nil
        tenant = nil
    }
}
