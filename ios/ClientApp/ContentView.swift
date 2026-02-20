import SwiftUI

struct ContentView: View {
    @StateObject private var vm = ClientViewModel()

    var body: some View {
        NavigationView {
            ZStack {
                backgroundLayer

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 16) {
                        if vm.isAuthenticated {
                            dashboardView
                        } else {
                            loginView
                        }
                    }
                    .padding(16)
                }
            }
            .navigationBarHidden(true)
        }
    }

    private var backgroundLayer: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.04, green: 0.07, blue: 0.12),
                    Color(red: 0.08, green: 0.15, blue: 0.23),
                    Color(red: 0.11, green: 0.25, blue: 0.35)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            Circle()
                .fill(Color.white.opacity(0.08))
                .frame(width: 220, height: 220)
                .offset(x: -120, y: -280)
                .blur(radius: 2)

            Circle()
                .fill(Color.cyan.opacity(0.12))
                .frame(width: 180, height: 180)
                .offset(x: 130, y: -180)
                .blur(radius: 6)

            Circle()
                .fill(Color.blue.opacity(0.10))
                .frame(width: 260, height: 260)
                .offset(x: 140, y: 360)
                .blur(radius: 12)
        }
    }

    private var loginView: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Door Access")
                .font(.system(size: 36, weight: .heavy, design: .rounded))
                .foregroundColor(.white)

            Text("Connexion securisee puis ouverture automatique par proximite BLE.")
                .font(.subheadline)
                .foregroundColor(.white.opacity(0.82))

            VStack(alignment: .leading, spacing: 12) {
                Text("Connexion")
                    .font(.headline)

                TextField("Email", text: $vm.email)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
                    .textFieldStyle(.roundedBorder)

                SecureField("Mot de passe", text: $vm.password)
                    .textFieldStyle(.roundedBorder)

                Button {
                    Task { await vm.login() }
                } label: {
                    HStack {
                        Spacer()
                        Text(vm.isBusy ? "Connexion..." : "Se connecter")
                            .fontWeight(.semibold)
                        Spacer()
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0.06, green: 0.45, blue: 0.92))
                .disabled(vm.isBusy)

                Text(vm.statusMessage.isEmpty ? " " : vm.statusMessage)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .padding(16)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: .black.opacity(0.18), radius: 12, x: 0, y: 8)

            Text("Mode auto: conditions BLE + verification 5s + ouverture + cooldown 30s")
                .font(.caption)
                .foregroundColor(.white.opacity(0.82))
        }
        .padding(.top, 30)
    }

    private var dashboardView: some View {
        VStack(alignment: .leading, spacing: 14) {
            headerBar
            heroStatusCard
            realtimeConditionsCard
            doorsGrid
            nearbyScanCard
            toolsCard
        }
    }

    private var headerBar: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Dashboard")
                    .font(.system(size: 30, weight: .heavy, design: .rounded))
                    .foregroundColor(.white)
                Text("Etat live des portes autorisees")
                    .font(.subheadline)
                    .foregroundColor(.white.opacity(0.82))
            }

            Spacer()

            VStack(spacing: 8) {
                Button("Refresh") {
                    Task { await vm.refreshGrants() }
                }
                .buttonStyle(.bordered)
                .tint(.white)
                .disabled(vm.isBusy)

                Button("Logout") {
                    vm.logout()
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0.78, green: 0.20, blue: 0.26))
            }
        }
    }

    private var heroStatusCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(autoStateTitle)
                    .font(.title3.weight(.bold))
                Spacer()
                statusCapsule(text: vm.isBleScanning ? "Scan actif" : "Scan arrete", color: vm.isBleScanning ? .green : .orange)
            }

            Text(autoStateSubtitle)
                .font(.subheadline)
                .foregroundColor(.secondary)

            HStack(spacing: 8) {
                statusCapsule(text: "Bluetooth: \(vm.bleCentralStateLabel)", color: .blue)
                if vm.autoOpenCooldownRemaining > 0 {
                    statusCapsule(text: "Cooldown \(vm.autoOpenCooldownRemaining)s", color: .orange)
                } else if vm.autoOpenArmingRemaining > 0 {
                    statusCapsule(text: "Verification \(vm.autoOpenArmingRemaining)s", color: .purple)
                } else {
                    statusCapsule(text: "Auto pret", color: .green)
                }
            }

            Text(vm.autoOpenRuleLabel)
                .font(.caption)
                .foregroundColor(.secondary)

            Text(vm.statusMessage)
                .font(.caption)
                .foregroundColor(.primary)
        }
        .padding(16)
        .background(
            LinearGradient(
                colors: [Color.white, Color(red: 0.96, green: 0.98, blue: 1.0)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 10, x: 0, y: 8)
    }

    private var realtimeConditionsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Proximite temps reel")
                .font(.headline)

            if let nearest = vm.nearestDetectedDoor {
                HStack(spacing: 10) {
                    metricTile(title: "Porte", value: nearest.bleID)
                    metricTile(title: "Signal", value: "\(nearest.rssi ?? -127) dBm")
                    metricTile(
                        title: "Distance",
                        value: nearest.estimatedDistanceMeters.map { String(format: "%.2f m", $0) } ?? "-"
                    )
                }

                conditionRow(title: "Porte autorisee detectee", isOn: nearest.isDetected)
                conditionRow(title: "Proximite validee (RSSI + distance)", isOn: nearest.isCloseEnoughToOpen)
                conditionRow(title: "Stabilite 5 secondes", isOn: vm.autoOpenArmingRemaining == 0 && nearest.isCloseEnoughToOpen)
            } else {
                Text("Aucune porte autorisee detectee pour le moment.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                conditionRow(title: "Porte autorisee detectee", isOn: false)
                conditionRow(title: "Proximite validee (RSSI + distance)", isOn: false)
                conditionRow(title: "Stabilite 5 secondes", isOn: false)
            }
        }
        .padding(16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var doorsGrid: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Portes autorisees")
                    .font(.headline)
                Spacer()
                Text("\(vm.doorRealtimeStatuses.count)")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.secondary)
            }

            if vm.doorRealtimeStatuses.isEmpty {
                Text("Aucune porte disponible")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            } else {
                ForEach(vm.doorRealtimeStatuses) { door in
                    DoorAccessCard(door: door)
                }
            }
        }
        .padding(16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var nearbyScanCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Scan BLE brut")
                .font(.headline)

            if vm.scannedDevices.isEmpty {
                Text("Aucun device BLE detecte")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            } else {
                ForEach(Array(vm.scannedDevices.prefix(10))) { device in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(device.name)
                                .font(.subheadline.weight(.medium))
                            Text(device.identifier)
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("\(device.rssi) dBm")
                                .font(.subheadline.monospacedDigit())
                            Text(device.isRegistered ? "autorise" : "inconnu")
                                .font(.caption2)
                                .foregroundColor(device.isRegistered ? .green : .secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .padding(16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var toolsCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button("Tester emission BLE") {
                vm.runBleEmitterTest()
            }
            .buttonStyle(.bordered)
            .disabled(vm.isBusy)

            Text(vm.bleEmitterTestStatus)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var autoStateTitle: String {
        if vm.autoOpenCooldownRemaining > 0 {
            return "Cooldown actif"
        }
        if vm.autoOpenArmingRemaining > 0 {
            return "Verification proximite"
        }
        if let nearest = vm.nearestDetectedDoor, nearest.isCloseEnoughToOpen {
            return "Pret pour ouverture"
        }
        return "En attente de proximite"
    }

    private var autoStateSubtitle: String {
        if vm.autoOpenCooldownRemaining > 0 {
            return "Nouvelle ouverture automatique possible dans \(vm.autoOpenCooldownRemaining) secondes."
        }
        if vm.autoOpenArmingRemaining > 0 {
            let door = vm.autoOpenArmingDoorName ?? "porte"
            return "Conditions reunies pour \(door), attente de stabilite: \(vm.autoOpenArmingRemaining)s"
        }
        if let nearest = vm.nearestDetectedDoor {
            return nearest.isCloseEnoughToOpen
                ? "Signal suffisant detecte. Verification de stabilite avant ouverture."
                : "Porte detectee mais encore trop loin."
        }
        return "Approchez-vous d'une porte autorisee pour declencher l'ouverture auto."
    }

    private func statusCapsule(text: String, color: Color) -> some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundColor(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(color.opacity(0.13))
            .clipShape(Capsule())
    }

    private func metricTile(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption2)
                .foregroundColor(.secondary)
            Text(value)
                .font(.subheadline.monospacedDigit())
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color(red: 0.95, green: 0.97, blue: 1.0))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func conditionRow(title: String, isOn: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: isOn ? "checkmark.circle.fill" : "xmark.circle")
                .foregroundColor(isOn ? .green : .orange)
            Text(title)
                .font(.subheadline)
                .foregroundColor(.primary)
            Spacer()
        }
    }
}

private struct DoorAccessCard: View {
    let door: ClientViewModel.DoorRealtimeStatus

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(door.bleID)
                        .font(.subheadline.weight(.semibold))
                    Text("Door: \(door.doorID)")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }

                Spacer()

                Text(door.isCloseEnoughToOpen ? "PRET" : "ATTENTE")
                    .font(.caption.weight(.bold))
                    .foregroundColor(door.isCloseEnoughToOpen ? .green : .orange)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background((door.isCloseEnoughToOpen ? Color.green : Color.orange).opacity(0.12))
                    .clipShape(Capsule())
            }

            HStack(spacing: 12) {
                Text("Signal: \(door.rssi.map { "\($0) dBm" } ?? "-")")
                    .font(.caption)
                Text("Distance: \(door.estimatedDistanceMeters.map { String(format: "%.2f m", $0) } ?? "-")")
                    .font(.caption)
            }
            .foregroundColor(.secondary)

            Text("Validite: \(door.validFrom.formatted(date: .abbreviated, time: .shortened)) -> \(door.validTo.formatted(date: .abbreviated, time: .shortened))")
                .font(.caption2)
                .foregroundColor(.secondary)

            if let seen = door.lastSeen {
                Text("Derniere detection: \(seen.formatted(date: .omitted, time: .standard))")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .padding(12)
        .background(
            LinearGradient(
                colors: door.isCloseEnoughToOpen
                    ? [Color.green.opacity(0.12), Color.white]
                    : [Color.gray.opacity(0.12), Color.white],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

#Preview {
    ContentView()
}
