import SwiftUI

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
            perfil = try await ApiERP.perfil()
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
    private func registrarTelefono() async {
        guard let token = tokenPush, !token.isEmpty else { return }
        esAgente = (try? await RepoERP.registrarDispositivo(token))?.esAgente
    }

    /// Si este usuario está dado de alta como agente de conversaciones.
    ///
    /// El ERP elige a quién mandarle el aviso de un chat por su `agent_id`. Un
    /// usuario que no es agente no tiene ninguno, así que **no le va a llegar
    /// jamás** un aviso de chat — por más que el interruptor esté prendido, el
    /// permiso dado y el token guardado. `nil` cuando el ERP no lo informa:
    /// entonces no se afirma nada, ni a favor ni en contra.
    var esAgente: Bool?

    /// Lo deja la capa de push cuando Firebase entrega el token.
    /// Todavía nadie lo setea: falta el plugin de notificaciones en iOS.
    var tokenPush: String?

    func salir() async {
        if let token = tokenPush, !token.isEmpty {
            try? await RepoERP.bajaDispositivo(token)
        }
        await Auth.shared.salir()
        perfil = nil
        tenant = nil
    }
}
