import Foundation

/// Encerramento de sessão — assim como no web (callback `onExit`), este app
/// não implementa login; só dispara o logout e delega a navegação de volta
/// para a tela de autenticação a quem monta o app (ver `RootView`).
protocol AuthService {
    func logout() async throws
}

final class MockAuthService: AuthService {
    func logout() async throws {
        try await Task.sleep(nanoseconds: 200_000_000)
    }
}
