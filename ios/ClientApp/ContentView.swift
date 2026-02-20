import SwiftUI

struct ContentView: View {
    @StateObject private var vm = ClientViewModel()

    var body: some View {
        NavigationView {
            ZStack {
                LinearGradient(
                    colors: [Color(red: 0.06, green: 0.09, blue: 0.16), Color(red: 0.10, green: 0.18, blue: 0.26)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
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

    private var loginView: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Door Access")
                .font(.system(size: 34, weight: .heavy, design: .rounded))
                .foregroundColor(.white)

            Text("Connectez-vous pour activer le scan BLE automatique et l'ouverture de proximite.")
                .font(.subheadline)
                .foregroundColor(.white.opacity(0.85))

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
                .tint(Color(red: 0.10, green: 0.45, blue: 0.90))
                .disabled(vm.isBusy)

                Text(vm.statusMessage.isEmpty ? " " : vm.statusMessage)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .padding(16)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

            Text("Mode auto: scan continu, ouverture unique si proche, cooldown 30s.")
                .font(.caption)
                .foregroundColor(.white.opacity(0.80))
        }
    }

    private var dashboardView: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Dashboard")
                        .font(.system(size: 30, weight: .heavy, design: .rounded))
                        .foregroundColor(.white)
                    Text("Etat BLE et acces en temps reel")
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.85))
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
                    .tint(Color(red: 0.73, green: 0.16, blue: 0.23))
                }
            }

            statusStrip
            realtimeFocusCard
            grantsDoorList
            nearbyScanList
            diagnosticCard
        }
    }

    private var statusStrip: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                statusChip(
                    title: vm.isBleScanning ? "Scan actif" : "Scan arrete",
                    color: vm.isBleScanning ? .green : .orange
                )
                statusChip(
                    title: vm.autoOpenCooldownRemaining > 0 ? "Cooldown \(vm.autoOpenCooldownRemaining)s" : "Auto pret",
                    color: vm.autoOpenCooldownRemaining > 0 ? .orange : .green
                )
            }

            Text("Bluetooth: \(vm.bleCentralStateLabel)")
                .font(.caption)
                .foregroundColor(.secondary)
            Text(vm.autoOpenRuleLabel)
                .font(.caption)
                .foregroundColor(.secondary)
            Text(vm.statusMessage)
                .font(.caption)
                .foregroundColor(.primary)
        }
        .padding(14)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var realtimeFocusCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Proximite en temps reel")
                .font(.headline)

            if let nearest = vm.nearestDetectedDoor {
                Text("Porte detectee: \(nearest.bleID)")
                    .font(.subheadline)
                    .fontWeight(.semibold)

                HStack(spacing: 12) {
                    metricPill(label: "Signal", value: "\(nearest.rssi ?? -127) dBm")
                    metricPill(
                        label: "Distance",
                        value: nearest.estimatedDistanceMeters.map { String(format: "%.2f m", $0) } ?? "-"
                    )
                }

                HStack(spacing: 8) {
                    statusChip(
                        title: nearest.isCloseEnoughToOpen ? "Assez proche: OUI" : "Assez proche: NON",
                        color: nearest.isCloseEnoughToOpen ? .green : .orange
                    )
                    if let seen = nearest.lastSeen {
                        Text("Derniere vue: \(seen.formatted(date: .omitted, time: .standard))")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }
            } else {
                Text("Aucune porte autorisee detectee a proximite pour le moment.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
        }
        .padding(14)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var grantsDoorList: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Portes autorisees")
                    .font(.headline)
                Spacer()
                Text("\(vm.doorRealtimeStatuses.count)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            if vm.doorRealtimeStatuses.isEmpty {
                Text("Aucune porte dans les grants actifs")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            } else {
                ForEach(vm.doorRealtimeStatuses) { door in
                    DoorAccessCard(door: door)
                }
            }
        }
        .padding(14)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var nearbyScanList: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Scan BLE brut")
                .font(.headline)

            if vm.scannedDevices.isEmpty {
                Text("Aucun device BLE detecte")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            } else {
                ForEach(Array(vm.scannedDevices.prefix(12))) { device in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(device.name)
                                .font(.subheadline)
                                .fontWeight(.medium)
                            Text(device.identifier)
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("\(device.rssi) dBm")
                                .font(.subheadline.monospacedDigit())
                            Text(device.isRegistered ? "enregistre" : "inconnu")
                                .font(.caption2)
                                .foregroundColor(device.isRegistered ? .green : .secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .padding(14)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var diagnosticCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Button("Tester emission BLE") {
                    vm.runBleEmitterTest()
                }
                .buttonStyle(.bordered)
                .disabled(vm.isBusy)

                Text(vm.bleEmitterTestStatus)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding(14)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func statusChip(title: String, color: Color) -> some View {
        Text(title)
            .font(.caption.weight(.semibold))
            .foregroundColor(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(color.opacity(0.12))
            .clipShape(Capsule())
    }

    private func metricPill(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption2)
                .foregroundColor(.secondary)
            Text(value)
                .font(.subheadline.monospacedDigit())
                .fontWeight(.semibold)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color(red: 0.95, green: 0.97, blue: 1.0))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
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
                    Text("Grant: \(door.grantID)")
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

            HStack(spacing: 14) {
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
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(door.isCloseEnoughToOpen ? Color.green.opacity(0.08) : Color.gray.opacity(0.08))
        )
    }
}

#Preview {
    ContentView()
}
