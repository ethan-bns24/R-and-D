import Foundation
import Combine

@MainActor
final class ClientViewModel: ObservableObject {
    @Published var roomId: String = "101"
    @Published var token: String = ""
    @Published var statusMessage: String = ""
    @Published var isVerifying: Bool = false
    
    // Authentification
    @Published var isAuthenticated: Bool = false
    @Published var currentUser: User? = nil
    @Published var email: String = ""
    @Published var password: String = ""
    @Published var isLoggingIn: Bool = false
    @Published var loginError: String = ""

    private let api = ApiClient()
    
    init() {
        // Pour la démo, on force toujours la connexion au démarrage
        // En production, décommenter la ligne suivante pour garder la session
        // checkAuthStatus()
        isAuthenticated = false
        currentUser = nil
    }
    
    func checkAuthStatus() {
        isAuthenticated = AuthService.shared.isAuthenticated()
        currentUser = AuthService.shared.getUser()
    }
    
    func login() async {
        guard !email.isEmpty && !password.isEmpty else {
            loginError = "Email et mot de passe requis"
            return
        }
        
        isLoggingIn = true
        loginError = ""
        defer { isLoggingIn = false }
        
        do {
            let response = try await api.login(email: email, password: password)
            AuthService.shared.saveAuth(token: response.token, user: response.user)
            isAuthenticated = true
            currentUser = response.user
            email = ""
            password = ""
        } catch {
            loginError = error.localizedDescription
        }
    }
    
    func logout() {
        AuthService.shared.logout()
        isAuthenticated = false
        currentUser = nil
        email = ""
        password = ""
        token = ""
        statusMessage = ""
    }

    func verifyAccess() async {
        guard let room = Int(roomId.trimmingCharacters(in: .whitespaces)), !token.isEmpty else {
            statusMessage = "Renseigne un Room ID valide et une clé."
            return
        }

        isVerifying = true
        defer { isVerifying = false }

        do {
            let result = try await api.verifyToken(token: token, roomId: room)
            if result.ok {
                statusMessage = "Accès autorisé – la porte s'ouvre !"
            } else {
                let reason = result.reason ?? "erreur"
                statusMessage = "Accès refusé : \(reason)."
            }
        } catch {
            statusMessage = "Erreur de connexion au room-core : \(error.localizedDescription)"
        }
    }
}
