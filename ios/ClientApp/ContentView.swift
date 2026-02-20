import SwiftUI

struct ContentView: View {
    @StateObject private var vm = ClientViewModel()

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    GroupBox("Connexion Guest") {
                        VStack(alignment: .leading, spacing: 10) {
                            TextField("Email", text: $vm.email)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled(true)
                                .textFieldStyle(.roundedBorder)

                            SecureField("Mot de passe", text: $vm.password)
                                .textFieldStyle(.roundedBorder)

                            HStack {
                                Button("Login") {
                                    Task { await vm.login() }
                                }
                                .disabled(vm.isBusy)

                                Button("Refresh Grants") {
                                    Task { await vm.refreshGrants() }
                                }
                                .disabled(vm.isBusy)

                                Button("Logout") {
                                    vm.logout()
                                }
                            }
                        }
                    }

                    GroupBox("Selection ouverture") {
                        VStack(alignment: .leading, spacing: 10) {
                            if vm.grants.isEmpty {
                                Text("Aucun grant actif")
                                    .foregroundColor(.secondary)
                            } else {
                                Picker("Grant", selection: $vm.selectedGrantID) {
                                    ForEach(vm.grants, id: \.grant_id) { grant in
                                        Text("\(grant.grant_id.prefix(8))... [\(Date(timeIntervalSince1970: TimeInterval(grant.from_ts)).formatted()) -> \(Date(timeIntervalSince1970: TimeInterval(grant.to_ts)).formatted())]")
                                            .tag(Optional(grant.grant_id))
                                    }
                                }

                                if let grant = vm.selectedGrant {
                                    Picker("Door", selection: $vm.selectedDoorID) {
                                        ForEach(grant.doors, id: \.door_id) { door in
                                            Text("\(door.door_id) / \(door.ble_id)")
                                                .tag(Optional(door.door_id))
                                        }
                                    }
                                }

                                Button("Ouvrir la porte") {
                                    vm.openSelectedDoor()
                                }
                                .disabled(vm.isBusy)
                            }
                        }
                    }

                    GroupBox("Status") {
                        Text(vm.statusMessage)
                            .font(.body)
                            .foregroundColor(.primary)
                    }

                    GroupBox("Scan BLE") {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(vm.isBleScanning ? "Scan actif" : "Scan arrete")
                                .font(.subheadline)
                                .foregroundColor(vm.isBleScanning ? .green : .secondary)

                            Text("Etat Bluetooth: \(vm.bleCentralStateLabel)")
                                .font(.caption)
                                .foregroundColor(.secondary)

                            HStack {
                                Button("Tester emission BLE") {
                                    vm.runBleEmitterTest()
                                }
                                .disabled(vm.isBusy)

                                Text(vm.bleEmitterTestStatus)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }

                            if vm.scannedDevices.isEmpty {
                                Text("Aucun device detecte")
                                    .foregroundColor(.secondary)
                            } else {
                                ForEach(Array(vm.scannedDevices.prefix(20))) { device in
                                    HStack(alignment: .top) {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(device.name)
                                                .font(.subheadline)
                                            Text(device.identifier)
                                                .font(.caption2)
                                                .foregroundColor(.secondary)
                                            Text("Vu: \(device.lastSeen.formatted(date: .omitted, time: .standard))")
                                                .font(.caption2)
                                                .foregroundColor(.secondary)
                                        }
                                        Spacer()
                                        VStack(alignment: .trailing, spacing: 2) {
                                            Text("\(device.rssi) dBm")
                                                .font(.subheadline.monospacedDigit())
                                            Text(device.isRegistered ? "Enregistre" : "Inconnu")
                                                .font(.caption2)
                                                .foregroundColor(device.isRegistered ? .green : .secondary)
                                        }
                                    }
                                    .padding(.vertical, 4)
                                }
                            }
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Hotel Access")
        }
    }
}

#Preview {
    ContentView()
}
