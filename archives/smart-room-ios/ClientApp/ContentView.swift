import SwiftUI

struct ContentView: View {
    @ObservedObject var viewModel: ClientViewModel

    var body: some View {
        if viewModel.isAuthenticated {
            mainView
        } else {
            loginView
        }
    }
    
    // MARK: - Login View
    private var loginView: some View {
        ZStack {
            // Fond dégradé sombre
            LinearGradient(
                colors: [Color(red: 0.008, green: 0.024, blue: 0.090), Color.black],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
            
            ScrollView {
                VStack(spacing: 0) {
                    // Encoche iPhone (simulation)
                    RoundedRectangle(cornerRadius: 20)
                        .fill(Color(red: 0.008, green: 0.024, blue: 0.090))
                        .frame(width: 110, height: 20)
                        .padding(.top, 8)
                        .padding(.bottom, 16)
                    
                    // Carte de connexion
                    VStack(spacing: 20) {
                        VStack(spacing: 8) {
                            Text("SmartRoom · Client")
                                .font(.system(size: 11, weight: .medium, design: .rounded))
                                .tracking(2)
                                .foregroundColor(Color(red: 0.22, green: 0.74, blue: 0.97))
                                .textCase(.uppercase)
                            
                            Text("Connexion")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundColor(.white)
                        }
                        .padding(.top, 8)
                        
                        Text("Connecte-toi avec ton compte GRMS pour accéder à ta chambre.")
                            .font(.system(size: 13))
                            .foregroundColor(Color(red: 0.62, green: 0.64, blue: 0.69))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 20)
                        
                        VStack(spacing: 16) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Email")
                                    .font(.system(size: 13))
                                    .foregroundColor(Color(red: 0.62, green: 0.64, blue: 0.69))
                                TextField("ton@email.com", text: $viewModel.email)
                                    .keyboardType(.emailAddress)
                                    .autocapitalization(.none)
                                    .autocorrectionDisabled()
                                    .font(.system(size: 16))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 12)
                                    .background(Color(red: 0.06, green: 0.09, blue: 0.16))
                                    .cornerRadius(14)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 14)
                                            .stroke(Color(red: 0.22, green: 0.25, blue: 0.32), lineWidth: 1)
                                    )
                            }
                            
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Mot de passe")
                                    .font(.system(size: 13))
                                    .foregroundColor(Color(red: 0.62, green: 0.64, blue: 0.69))
                                SecureField("••••••••", text: $viewModel.password)
                                    .font(.system(size: 16))
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 12)
                                    .background(Color(red: 0.06, green: 0.09, blue: 0.16))
                                    .cornerRadius(14)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 14)
                                            .stroke(Color(red: 0.22, green: 0.25, blue: 0.32), lineWidth: 1)
                                    )
                            }
                        }
                        .padding(.horizontal, 20)
                        
                        if !viewModel.loginError.isEmpty {
                            Text(viewModel.loginError)
                                .font(.system(size: 13))
                                .foregroundColor(Color(red: 1.0, green: 0.79, blue: 0.79))
                                .padding(.horizontal, 16)
                                .padding(.vertical, 12)
                                .frame(maxWidth: .infinity)
                                .background(Color(red: 0.73, green: 0.11, blue: 0.11).opacity(0.22))
                                .cornerRadius(14)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 14)
                                        .stroke(Color(red: 0.97, green: 0.44, blue: 0.44).opacity(0.7), lineWidth: 1)
                                )
                                .padding(.horizontal, 20)
                        }
                        
                        Button {
                            Task { await viewModel.login() }
                        } label: {
                            HStack {
                                if viewModel.isLoggingIn {
                                    ProgressView()
                                        .tint(.white)
                                } else {
                                    Text("Se connecter")
                                        .font(.system(size: 16, weight: .semibold))
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                            .foregroundColor(.white)
                            .background(
                                LinearGradient(
                                    colors: [
                                        Color(red: 0.03, green: 0.18, blue: 0.29),
                                        Color(red: 0.05, green: 0.65, blue: 0.91)
                                    ],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .cornerRadius(25)
                            .shadow(color: Color(red: 0.03, green: 0.18, blue: 0.29).opacity(0.5), radius: 15, x: 0, y: 8)
                        }
                        .disabled(viewModel.isLoggingIn)
                        .padding(.horizontal, 20)
                    }
                    .padding(.vertical, 20)
                    .padding(.horizontal, 16)
                    .background(
                        LinearGradient(
                            colors: [
                                Color(red: 0.06, green: 0.09, blue: 0.16),
                                Color(red: 0.06, green: 0.09, blue: 0.16).opacity(0.98)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .cornerRadius(35)
                    .overlay(
                        RoundedRectangle(cornerRadius: 35)
                            .stroke(Color(red: 0.12, green: 0.16, blue: 0.20), lineWidth: 1)
                    )
                    .shadow(color: Color.black.opacity(0.5), radius: 30, x: 0, y: 15)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 40)
                }
            }
        }
        .preferredColorScheme(.dark)
    }
    
    // MARK: - Main View
    private var mainView: some View {
        ZStack {
            // Fond dégradé sombre
            LinearGradient(
                colors: [Color(red: 0.008, green: 0.024, blue: 0.090), Color.black],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 0) {
                    // Encoche iPhone (simulation)
                    RoundedRectangle(cornerRadius: 20)
                        .fill(Color(red: 0.008, green: 0.024, blue: 0.090))
                        .frame(width: 110, height: 20)
                        .padding(.top, 8)
                        .padding(.bottom, 16)

                    // Carte principale
                    VStack(spacing: 20) {
                        // En-tête
                        VStack(spacing: 8) {
                            HStack {
                                Text("SmartRoom · Client")
                                    .font(.system(size: 11, weight: .medium, design: .rounded))
                                    .tracking(2)
                                    .foregroundColor(Color(red: 0.22, green: 0.74, blue: 0.97))
                                    .textCase(.uppercase)
                                Spacer()
                                Button {
                                    viewModel.logout()
                                } label: {
                                    Text("Déconnexion")
                                        .font(.system(size: 11))
                                        .foregroundColor(Color(red: 0.62, green: 0.64, blue: 0.69))
                                }
                            }

                            Text("Ma clé de chambre")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundColor(.white)
                            
                            if let user = viewModel.currentUser {
                                Text("Connecté en tant que \(user.name)")
                                    .font(.system(size: 12))
                                    .foregroundColor(Color(red: 0.62, green: 0.64, blue: 0.69))
                            }

                            HStack(spacing: 4) {
                                Text("Chambre")
                                    .font(.system(size: 11))
                                    .foregroundColor(Color(red: 0.42, green: 0.45, blue: 0.50))
                                Text("#\(viewModel.roomId.isEmpty ? "---" : viewModel.roomId)")
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundColor(.white)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Color(red: 0.06, green: 0.09, blue: 0.16))
                            .cornerRadius(20)
                            .overlay(
                                RoundedRectangle(cornerRadius: 20)
                                    .stroke(Color(red: 0.22, green: 0.25, blue: 0.32), lineWidth: 1)
                            )
                        }
                        .padding(.top, 8)

                        // Description
                        Text("Ta clé est récupérée automatiquement depuis le GRMS (mode démo). Approche-toi du lecteur pour ouvrir sans contact.")
                            .font(.system(size: 13))
                            .foregroundColor(Color(red: 0.62, green: 0.64, blue: 0.69))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 20)

                        // Formulaire
                        VStack(spacing: 16) {
                            // Champ Chambre (lecture seule)
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Numéro de chambre")
                                    .font(.system(size: 13))
                                    .foregroundColor(Color(red: 0.62, green: 0.64, blue: 0.69))
                                Text(viewModel.roomId.isEmpty ? "---" : viewModel.roomId)
                                    .font(.system(size: 16))
                                    .foregroundColor(.white)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 12)
                                    .background(Color(red: 0.06, green: 0.09, blue: 0.16))
                                    .cornerRadius(14)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 14)
                                            .stroke(Color(red: 0.22, green: 0.25, blue: 0.32), lineWidth: 1)
                                    )
                            }

                            // Clé numérique (masquée)
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Clé numérique")
                                    .font(.system(size: 13))
                                    .foregroundColor(Color(red: 0.62, green: 0.64, blue: 0.69))
                                HStack(spacing: 12) {
                                    Image(systemName: viewModel.token.isEmpty ? "lock.open" : "lock.fill")
                                        .font(.system(size: 20))
                                        .foregroundColor(viewModel.token.isEmpty ? Color(red: 0.62, green: 0.64, blue: 0.69) : Color(red: 0.47, green: 0.91, blue: 0.80))

                                    VStack(alignment: .leading, spacing: 4) {
                                        if viewModel.token.isEmpty {
                                            Text("Aucune clé active")
                                                .font(.system(size: 14))
                                                .foregroundColor(Color(red: 0.42, green: 0.45, blue: 0.50))
                                            Text("En attente d'un accès GRMS…")
                                                .font(.system(size: 12))
                                                .foregroundColor(Color(red: 0.42, green: 0.45, blue: 0.50))
                                        } else {
                                            Text("Clé active")
                                                .font(.system(size: 14, weight: .semibold))
                                                .foregroundColor(Color(red: 0.47, green: 0.91, blue: 0.80))
                                            Text("Prête pour l'ouverture")
                                                .font(.system(size: 12))
                                                .foregroundColor(Color(red: 0.62, green: 0.64, blue: 0.69))
                                        }
                                    }

                                    Spacer()
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 16)
                                .frame(minHeight: 80)
                                .background(Color(red: 0.06, green: 0.09, blue: 0.16))
                                .cornerRadius(14)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 14)
                                        .stroke(Color(red: 0.22, green: 0.25, blue: 0.32), lineWidth: 1)
                                )
                            }
                        }
                        .padding(.horizontal, 20)

                        // Bouton principal
                        Button {
                            Task { await viewModel.verifyAccess() }
                        } label: {
                            HStack {
                                if viewModel.isVerifying {
                                    ProgressView()
                                        .tint(.white)
                                } else {
                                    Text("Approcher du lecteur")
                                        .font(.system(size: 16, weight: .semibold))
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                            .foregroundColor(.white)
                            .background(
                                LinearGradient(
                                    colors: [
                                        Color(red: 0.03, green: 0.18, blue: 0.29),
                                        Color(red: 0.05, green: 0.65, blue: 0.91)
                                    ],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .cornerRadius(25)
                            .shadow(color: Color(red: 0.03, green: 0.18, blue: 0.29).opacity(0.5), radius: 15, x: 0, y: 8)
                        }
                        .disabled(viewModel.isVerifying)
                        .padding(.horizontal, 20)

                        // Message de statut
                        if !viewModel.statusMessage.isEmpty {
                            let isSuccess = viewModel.statusMessage.contains("autorisé") || viewModel.statusMessage.contains("Accès trouvé")
                            HStack {
                                Image(systemName: isSuccess ? "checkmark.circle.fill" : "xmark.circle.fill")
                                    .foregroundColor(isSuccess ? Color(red: 0.13, green: 0.64, blue: 0.29) : Color(red: 0.73, green: 0.29, blue: 0.29))
                                Text(viewModel.statusMessage)
                                    .font(.system(size: 13))
                                    .foregroundColor(isSuccess ? Color(red: 0.47, green: 0.91, blue: 0.80) : Color(red: 1.0, green: 0.79, blue: 0.79))
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .frame(maxWidth: .infinity)
                            .background(
                                isSuccess
                                    ? Color(red: 0.09, green: 0.64, blue: 0.29).opacity(0.2)
                                    : Color(red: 0.73, green: 0.11, blue: 0.11).opacity(0.22)
                            )
                            .cornerRadius(14)
                            .overlay(
                                RoundedRectangle(cornerRadius: 14)
                                    .stroke(
                                        isSuccess
                                            ? Color(red: 0.29, green: 0.87, blue: 0.50).opacity(0.7)
                                            : Color(red: 0.97, green: 0.44, blue: 0.44).opacity(0.7),
                                        lineWidth: 1
                                    )
                            )
                            .padding(.horizontal, 20)
                        }

                        // Note de bas de page
                        Text("Connectée au même GRMS que l'accueil. Toute ouverture ou erreur est visible dans les logs de la Smart Room.")
                            .font(.system(size: 11))
                            .foregroundColor(Color(red: 0.42, green: 0.45, blue: 0.50))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 20)
                            .padding(.top, 8)
                    }
                    .padding(.vertical, 20)
                    .padding(.horizontal, 16)
                    .background(
                        LinearGradient(
                            colors: [
                                Color(red: 0.06, green: 0.09, blue: 0.16),
                                Color(red: 0.06, green: 0.09, blue: 0.16).opacity(0.98)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .cornerRadius(35)
                    .overlay(
                        RoundedRectangle(cornerRadius: 35)
                            .stroke(Color(red: 0.12, green: 0.16, blue: 0.20), lineWidth: 1)
                    )
                    .shadow(color: Color.black.opacity(0.5), radius: 30, x: 0, y: 15)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 40)
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

#Preview {
    ContentView(viewModel: ClientViewModel())
}
