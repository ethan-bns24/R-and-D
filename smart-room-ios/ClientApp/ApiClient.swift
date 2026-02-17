import Foundation

/// Client HTTP vers le GRMS et le room-core (cœur de chambre) qui simule la porte.
final class ApiClient {
    /// IP locale de ton Mac (trouvée via `ipconfig getifaddr en0`)
    private let grmsURL = URL(string: "http://10.5.174.21:4000")!
    private let roomCoreURL = URL(string: "http://10.5.174.21:5001")!

    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }
    
    /// Ajoute le JWT dans les headers si disponible
    private func addAuthHeader(to request: inout URLRequest) {
        if let token = AuthService.shared.getToken() {
            request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
    }

    // MARK: - Authentification JWT
    
    struct LoginResponse: Decodable {
        let token: String
        let user: User
    }
    
    struct LoginRequest: Encodable {
        let email: String
        let password: String
    }
    
    /// Connecte l'utilisateur avec email et mot de passe, retourne le JWT
    func login(email: String, password: String) async throws -> LoginResponse {
        var request = URLRequest(url: grmsURL.appendingPathComponent("/auth/login"))
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = LoginRequest(email: email, password: password)
        request.httpBody = try JSONEncoder().encode(body)
        
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        
        if http.statusCode == 401 {
            throw ApiError.unauthorized
        }
        
        if !(200..<300).contains(http.statusCode) {
            throw URLError(.badServerResponse)
        }
        
        let decoded = try JSONDecoder().decode(LoginResponse.self, from: data)
        return decoded
    }
    
    /// Vérifie le token JWT actuel
    func verifyMe() async throws -> User {
        var request = URLRequest(url: grmsURL.appendingPathComponent("/auth/me"))
        request.httpMethod = "GET"
        addAuthHeader(to: &request)
        
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        
        if http.statusCode == 401 {
            throw ApiError.unauthorized
        }
        
        struct MeResponse: Decodable {
            let user: User
        }
        
        let decoded = try JSONDecoder().decode(MeResponse.self, from: data)
        return decoded.user
    }
    
    // MARK: - Room Core
    
    struct RoomAuthResponse: Decodable {
        let ok: Bool
        let reason: String?
        let lockedUntil: String?
    }

    /// Appelle le room-core pour authentifier le token et ouvrir la porte.
    /// Le room-core vérifie avec le GRMS et simule l'ouverture de la porte.
    func verifyToken(token: String, roomId: Int) async throws -> RoomAuthResponse {
        var request = URLRequest(url: roomCoreURL.appendingPathComponent("/auth"))
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        
        // Ajoute le JWT si disponible (pour traçabilité côté GRMS)
        addAuthHeader(to: &request)

        // Le room-core accepte roomId optionnel pour gérer plusieurs chambres
        let body: [String: Any] = [
            "tokenValue": token,
            "roomId": roomId
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }

        // Même en cas d'erreur, le room-core renvoie un JSON
        if !(200..<500).contains(http.statusCode) {
            throw URLError(.badServerResponse)
        }

        let decoded = try JSONDecoder().decode(RoomAuthResponse.self, from: data)
        return decoded
    }
    
    enum ApiError: Error, LocalizedError {
        case unauthorized
        
        var errorDescription: String? {
            switch self {
            case .unauthorized:
                return "Email ou mot de passe incorrect"
            }
        }
    }
}
