import Foundation

/// Service pour gérer l'authentification JWT et le stockage du token
final class AuthService {
    static let shared = AuthService()
    
    private let jwtKey = "grms_jwt_token"
    private let userKey = "grms_user_data"
    
    private init() {}
    
    /// Sauvegarde le JWT et les données utilisateur
    func saveAuth(token: String, user: User) {
        UserDefaults.standard.set(token, forKey: jwtKey)
        if let userData = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(userData, forKey: userKey)
        }
    }
    
    /// Récupère le JWT sauvegardé
    func getToken() -> String? {
        return UserDefaults.standard.string(forKey: jwtKey)
    }
    
    /// Récupère les données utilisateur sauvegardées
    func getUser() -> User? {
        guard let userData = UserDefaults.standard.data(forKey: userKey),
              let user = try? JSONDecoder().decode(User.self, from: userData) else {
            return nil
        }
        return user
    }
    
    /// Vérifie si l'utilisateur est connecté
    func isAuthenticated() -> Bool {
        return getToken() != nil
    }
    
    /// Déconnecte l'utilisateur
    func logout() {
        UserDefaults.standard.removeObject(forKey: jwtKey)
        UserDefaults.standard.removeObject(forKey: userKey)
    }
}

/// Modèle utilisateur
struct User: Codable {
    let id: Int
    let name: String
    let email: String?
    let phone: String?
    let status: String?
}
