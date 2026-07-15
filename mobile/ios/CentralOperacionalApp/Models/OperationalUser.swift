import Foundation

/// Usuário logado + rótulo de permissão exibido no cabeçalho ("Administrador
/// · Acesso total"). Vem da sessão autenticada — este app não implementa
/// login, apenas recebe o usuário já autenticado.
struct OperationalUser: Decodable, Equatable {
    var name: String
    var roleLabel: String

    static let placeholder = OperationalUser(name: "Administrador", roleLabel: "Acesso total")
}
