import Foundation

final class ApiClient {
    struct TokenResponse: Decodable {
        let access_token: String
        let token_type: String
        let expires_in: Int
    }

    struct MobileDoor: Decodable, Hashable {
        let door_id: String
        let ble_id: String
    }

    struct MobileGrant: Decodable, Hashable {
        let grant_id: String
        let from_ts: Int64
        let to_ts: Int64
        let doors: [MobileDoor]
    }

    struct MobileGrantsResponse: Decodable {
        let key_id: String
        let secret_base_b64: String
        let grants: [MobileGrant]
    }

    enum ApiError: Error, LocalizedError {
        case invalidURL
        case invalidResponse
        case unauthorized
        case backend(String)

        var errorDescription: String? {
            switch self {
            case .invalidURL: return "URL API invalide"
            case .invalidResponse: return "Reponse API invalide"
            case .unauthorized: return "Authentification invalide"
            case .backend(let message): return message
            }
        }
    }

    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func baseURL() throws -> URL {
        let raw = UserDefaults.standard.string(forKey: "api_base_url") ?? "http://10.42.0.1:18000"
        guard let url = URL(string: raw) else { throw ApiError.invalidURL }
        return url
    }

    func guestLogin(email: String, password: String) async throws -> TokenResponse {
        let endpoint = try baseURL().appendingPathComponent("/v1/auth/login")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": email,
            "password": password
        ])

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ApiError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401 { throw ApiError.unauthorized }
            throw ApiError.backend(String(data: data, encoding: .utf8) ?? "Erreur login")
        }
        return try JSONDecoder().decode(TokenResponse.self, from: data)
    }

    func fetchMobileGrants(token: String) async throws -> MobileGrantsResponse {
        let endpoint = try baseURL().appendingPathComponent("/v1/mobile/grants")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ApiError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401 { throw ApiError.unauthorized }
            throw ApiError.backend(String(data: data, encoding: .utf8) ?? "Erreur grants")
        }
        return try JSONDecoder().decode(MobileGrantsResponse.self, from: data)
    }
}

