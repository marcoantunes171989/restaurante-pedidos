import Foundation

/// Implementação real — `GET {baseURL}/operacional/central` deve devolver o
/// shape de `OperationalSnapshot` (ver CodingKeys nos models). Troque
/// `MockOperationalRepository` por esta classe assim que o backend existir;
/// nenhuma outra camada precisa mudar.
final class RemoteOperationalRepository: OperationalRepository {
    let refreshInterval: TimeInterval

    private let baseURL: URL
    private let session: URLSession
    private let authTokenProvider: () -> String?

    init(
        baseURL: URL,
        session: URLSession = .shared,
        refreshInterval: TimeInterval = 5,
        authTokenProvider: @escaping () -> String? = { nil }
    ) {
        self.baseURL = baseURL
        self.session = session
        self.refreshInterval = refreshInterval
        self.authTokenProvider = authTokenProvider
    }

    func fetchSnapshot() async throws -> OperationalSnapshot {
        var request = URLRequest(url: baseURL.appendingPathComponent("operacional/central"))
        if let token = authTokenProvider() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw OperationalRepositoryError.network
        }

        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw OperationalRepositoryError.server(statusCode: statusCode)
        }

        do {
            let decoder = JSONDecoder()
            return try decoder.decode(OperationalSnapshot.self, from: data)
        } catch {
            throw OperationalRepositoryError.decoding
        }
    }
}
