import SwiftUI

// MARK: - Design System

private extension Color {
    static let hotelBg       = Color(red: 0.039, green: 0.039, blue: 0.059)   // #0A0A0F
    static let hotelSurface  = Color(red: 0.071, green: 0.071, blue: 0.102)   // #121219
    static let hotelCard     = Color(red: 0.102, green: 0.102, blue: 0.157)   // #1A1A28
    static let hotelGold     = Color(red: 0.788, green: 0.659, blue: 0.298)   // #C9A84C
    static let hotelGoldSoft = Color(red: 0.910, green: 0.788, blue: 0.478)   // #E8C97A
    static let hotelGoldDark = Color(red: 0.100, green: 0.080, blue: 0.010)   // button fg
    static let hotelSuccess  = Color(red: 0.298, green: 0.686, blue: 0.478)   // #4CAF7A
    static let hotelError    = Color(red: 0.878, green: 0.322, blue: 0.322)   // #E05252
    static let hotelText     = Color(red: 0.941, green: 0.929, blue: 0.910)   // #F0EDE8
    static let hotelMuted    = Color(red: 0.541, green: 0.541, blue: 0.604)   // #8A8A9A
}

// MARK: - Root View

struct ContentView: View {
    @StateObject private var vm = ClientViewModel()
    @State private var tab: Int = 0

    var body: some View {
        ZStack(alignment: .top) {
            Color.hotelBg.ignoresSafeArea()

            // Ambient glow at top
            RadialGradient(
                colors: [Color.hotelGold.opacity(0.09), .clear],
                center: .top, startRadius: 0, endRadius: 380
            )
            .frame(height: 380)
            .ignoresSafeArea()

            TabView(selection: $tab) {
                AccessTab(vm: vm)
                    .tabItem { Label("Accès", systemImage: "key.fill") }
                    .tag(0)

                BLETab(vm: vm)
                    .tabItem { Label("Bluetooth", systemImage: "antenna.radiowaves.left.and.right") }
                    .tag(1)

                AccountTab(vm: vm)
                    .tabItem { Label("Compte", systemImage: "person.crop.circle") }
                    .tag(2)
            }
            .tint(.hotelGold)
        }
    }
}

// MARK: - Shared Components

private struct TagLabel: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .semibold, design: .monospaced))
            .tracking(2.5)
            .foregroundColor(.hotelGold.opacity(0.75))
    }
}

private struct GlassCard<Content: View>: View {
    let cornerRadius: CGFloat
    @ViewBuilder let content: Content
    init(cornerRadius: CGFloat = 18, @ViewBuilder content: () -> Content) {
        self.cornerRadius = cornerRadius
        self.content = content()
    }
    var body: some View {
        content
            .background(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(Color.hotelCard)
                    .overlay(
                        RoundedRectangle(cornerRadius: cornerRadius)
                            .stroke(Color.white.opacity(0.07), lineWidth: 1)
                    )
            )
    }
}

private struct StatusBanner: View {
    let message: String
    let isBusy: Bool

    private var tone: (color: Color, icon: String) {
        if isBusy { return (.hotelGold, "clock") }
        let lower = message.lowercased()
        if lower.contains("ouverte") || lower.contains("connecte") || lower.contains("charge") || lower.contains("ok") {
            return (.hotelSuccess, "checkmark.circle.fill")
        }
        if lower.contains("erreur") || lower.contains("refuse") || lower.contains("invalide") || lower.contains("ko")
            || lower.contains("indisponible") || lower.contains("impossible") {
            return (.hotelError, "exclamationmark.circle.fill")
        }
        return (.hotelMuted, "info.circle.fill")
    }

    var body: some View {
        HStack(spacing: 12) {
            if isBusy {
                ProgressView().tint(.hotelGold).scaleEffect(0.8)
            } else {
                Image(systemName: tone.icon)
                    .font(.system(size: 15))
                    .foregroundColor(tone.color)
            }
            Text(message)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.hotelText)
                .lineLimit(3)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .background(
            RoundedRectangle(cornerRadius: 13)
                .fill(tone.color.opacity(0.09))
                .overlay(
                    RoundedRectangle(cornerRadius: 13)
                        .stroke(tone.color.opacity(0.28), lineWidth: 1)
                )
        )
        .animation(.easeInOut(duration: 0.25), value: message)
    }
}

private struct BLEBadge: View {
    let scanning: Bool
    @State private var pulse = false

    var body: some View {
        HStack(spacing: 6) {
            ZStack {
                if scanning {
                    Circle()
                        .stroke(Color.hotelSuccess.opacity(0.5), lineWidth: 1.5)
                        .scaleEffect(pulse ? 2.2 : 1)
                        .opacity(pulse ? 0 : 1)
                        .frame(width: 7, height: 7)
                }
                Circle()
                    .fill(scanning ? Color.hotelSuccess : Color.hotelMuted)
                    .frame(width: 7, height: 7)
            }
            .onAppear { animate() }
            .onChange(of: scanning) { _ in animate() }

            Text(scanning ? "BLE" : "OFF")
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .tracking(1)
                .foregroundColor(scanning ? .hotelSuccess : .hotelMuted)
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(Color.hotelSurface)
                .overlay(
                    Capsule()
                        .stroke(
                            scanning ? Color.hotelSuccess.opacity(0.3) : Color.white.opacity(0.06),
                            lineWidth: 1
                        )
                )
        )
    }

    private func animate() {
        guard scanning else { pulse = false; return }
        withAnimation(.easeOut(duration: 1.6).repeatForever(autoreverses: false)) { pulse = true }
    }
}

// MARK: - ACCESS TAB

private struct AccessTab: View {
    @ObservedObject var vm: ClientViewModel

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 26) {

                // ── Header ──────────────────────────────────────────────
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("SMART ROOM")
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            .tracking(4)
                            .foregroundColor(.hotelGold)
                        Text("Accès Hôtel")
                            .font(.system(size: 30, weight: .thin))
                            .foregroundColor(.hotelText)
                    }
                    Spacer()
                    BLEBadge(scanning: vm.isBleScanning)
                }
                .padding(.top, 20)

                // ── Status ──────────────────────────────────────────────
                if !vm.statusMessage.isEmpty {
                    StatusBanner(message: vm.statusMessage, isBusy: vm.isBusy)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }

                // ── Content ─────────────────────────────────────────────
                if vm.grants.isEmpty {
                    EmptyGrantsPlaceholder()
                } else {
                    // Grant selector
                    VStack(alignment: .leading, spacing: 12) {
                        TagLabel(text: "RÉSERVATION ACTIVE")
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                ForEach(vm.grants, id: \.grant_id) { grant in
                                    GrantCard(
                                        grant: grant,
                                        isSelected: vm.selectedGrantID == grant.grant_id
                                    ) {
                                        withAnimation(.spring(response: 0.3)) {
                                            vm.selectedGrantID = grant.grant_id
                                            vm.selectedDoorID = grant.doors.first?.door_id
                                        }
                                    }
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }

                    // Door selector
                    if let grant = vm.selectedGrant, !grant.doors.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            TagLabel(text: "SÉLECTIONNER UNE PORTE")
                            VStack(spacing: 8) {
                                ForEach(grant.doors, id: \.door_id) { door in
                                    DoorRow(
                                        door: door,
                                        isSelected: vm.selectedDoorID == door.door_id
                                    ) {
                                        withAnimation(.spring(response: 0.3)) {
                                            vm.selectedDoorID = door.door_id
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Open button
                    OpenDoorButton(vm: vm)
                }

                Spacer(minLength: 50)
            }
            .padding(.horizontal, 20)
        }
        .background(Color.hotelBg)
    }
}

// MARK: - Empty Grants Placeholder

private struct EmptyGrantsPlaceholder: View {
    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "key.slash")
                .font(.system(size: 40, weight: .thin))
                .foregroundColor(.hotelGold.opacity(0.4))
            VStack(spacing: 6) {
                Text("Aucune réservation active")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.hotelText)
                Text("Connectez-vous dans l'onglet Compte\npour accéder à votre chambre.")
                    .font(.system(size: 13))
                    .foregroundColor(.hotelMuted)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(44)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(Color.hotelCard)
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(Color.white.opacity(0.06), lineWidth: 1)
                )
        )
        .padding(.top, 12)
    }
}

// MARK: - Grant Card

private struct GrantCard: View {
    let grant: ApiClient.MobileGrant
    let isSelected: Bool
    let action: () -> Void

    private var fromDate: Date { Date(timeIntervalSince1970: TimeInterval(grant.from_ts)) }
    private var toDate:   Date { Date(timeIntervalSince1970: TimeInterval(grant.to_ts)) }

    private static let fmt: DateFormatter = {
        let f = DateFormatter(); f.dateStyle = .short; f.timeStyle = .short; return f
    }()

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Image(systemName: "creditcard.fill")
                        .font(.system(size: 20))
                        .foregroundColor(isSelected ? .hotelGold : .hotelMuted)
                    Spacer()
                    if isSelected {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.hotelGold)
                            .transition(.scale.combined(with: .opacity))
                    }
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text("\(grant.doors.count) porte\(grant.doors.count > 1 ? "s" : "")")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.hotelText)
                    Text(grant.grant_id.prefix(12) + "…")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(.hotelMuted)
                }

                Divider().background(Color.white.opacity(0.08))

                VStack(alignment: .leading, spacing: 4) {
                    Label(Self.fmt.string(from: fromDate), systemImage: "arrow.right.circle")
                        .font(.system(size: 11))
                        .foregroundColor(.hotelMuted)
                    Label(Self.fmt.string(from: toDate), systemImage: "xmark.circle")
                        .font(.system(size: 11))
                        .foregroundColor(.hotelMuted)
                }
            }
            .padding(18)
            .frame(width: 210)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(isSelected ? Color.hotelGold.opacity(0.11) : Color.hotelCard)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(
                                isSelected ? Color.hotelGold.opacity(0.45) : Color.white.opacity(0.07),
                                lineWidth: 1
                            )
                    )
            )
        }
        .buttonStyle(.plain)
        .animation(.spring(response: 0.3), value: isSelected)
    }
}

// MARK: - Door Row

private struct DoorRow: View {
    let door: ApiClient.MobileDoor
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(isSelected ? Color.hotelGold.opacity(0.15) : Color.hotelSurface)
                        .frame(width: 42, height: 42)
                    Image(systemName: "door.left.hand.closed")
                        .font(.system(size: 18))
                        .foregroundColor(isSelected ? .hotelGold : .hotelMuted)
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text("PORTE")
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                        .tracking(1.5)
                        .foregroundColor(isSelected ? .hotelGold : .hotelMuted)
                    Text(door.ble_id)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.hotelText)
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.hotelGold)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 13)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color.hotelCard)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(
                                isSelected ? Color.hotelGold.opacity(0.38) : Color.white.opacity(0.06),
                                lineWidth: 1
                            )
                    )
            )
        }
        .buttonStyle(.plain)
        .animation(.spring(response: 0.3), value: isSelected)
    }
}

// MARK: - Open Door Button

private struct OpenDoorButton: View {
    @ObservedObject var vm: ClientViewModel
    @State private var ring1Scale: CGFloat = 1
    @State private var ring1Opacity: Double = 0.55
    @State private var ring2Scale: CGFloat = 1
    @State private var ring2Opacity: Double = 0.35

    private var canOpen: Bool {
        vm.selectedGrantID != nil && vm.selectedDoorID != nil && !vm.isBusy
    }

    var body: some View {
        VStack(spacing: 18) {
            ZStack {
                // Pulse rings
                if canOpen {
                    Circle()
                        .stroke(Color.hotelGold.opacity(ring2Opacity), lineWidth: 1)
                        .frame(width: 148, height: 148)
                        .scaleEffect(ring2Scale)

                    Circle()
                        .stroke(Color.hotelGold.opacity(ring1Opacity), lineWidth: 1.5)
                        .frame(width: 148, height: 148)
                        .scaleEffect(ring1Scale)
                }

                // Button
                Button {
                    guard canOpen else { return }
                    let gen = UIImpactFeedbackGenerator(style: .heavy)
                    gen.impactOccurred()
                    vm.openSelectedDoor()
                } label: {
                    ZStack {
                        Circle()
                            .fill(
                                canOpen
                                ? LinearGradient(
                                    colors: [Color.hotelGoldSoft, Color.hotelGold, Color(red: 0.65, green: 0.46, blue: 0.14)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                  )
                                : LinearGradient(
                                    colors: [Color.hotelSurface, Color.hotelCard],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                  )
                            )
                            .frame(width: 116, height: 116)
                            .shadow(
                                color: canOpen ? Color.hotelGold.opacity(0.45) : .clear,
                                radius: 24, y: 10
                            )

                        if vm.isBusy {
                            ProgressView()
                                .tint(Color.hotelGoldDark)
                                .scaleEffect(1.2)
                        } else {
                            VStack(spacing: 5) {
                                Image(systemName: canOpen ? "lock.open.fill" : "lock.fill")
                                    .font(.system(size: 28, weight: .medium))
                                    .foregroundColor(canOpen ? Color.hotelGoldDark : .hotelMuted)
                                Text("OUVRIR")
                                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                                    .tracking(2.5)
                                    .foregroundColor(canOpen ? Color.hotelGoldDark : .hotelMuted)
                            }
                        }
                    }
                }
                .disabled(!canOpen)
            }
            .onAppear { if canOpen { startPulse() } }
            .onChange(of: canOpen) { enabled in if enabled { startPulse() } }

            if let door = vm.selectedDoor {
                HStack(spacing: 6) {
                    Image(systemName: "dot.radiowaves.right")
                        .font(.system(size: 11))
                        .foregroundColor(.hotelMuted)
                    Text(door.ble_id)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundColor(.hotelMuted)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
    }

    private func startPulse() {
        ring1Scale = 1; ring1Opacity = 0.55
        ring2Scale = 1; ring2Opacity = 0.35
        withAnimation(.easeOut(duration: 2.0).repeatForever(autoreverses: false)) {
            ring1Scale = 1.55; ring1Opacity = 0
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
            withAnimation(.easeOut(duration: 2.0).repeatForever(autoreverses: false)) {
                ring2Scale = 1.55; ring2Opacity = 0
            }
        }
    }
}

// MARK: - BLE TAB

private struct BLETab: View {
    @ObservedObject var vm: ClientViewModel

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 24) {

                // Header
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("BLUETOOTH")
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            .tracking(4)
                            .foregroundColor(.hotelGold)
                        Text("Scan BLE")
                            .font(.system(size: 30, weight: .thin))
                            .foregroundColor(.hotelText)
                    }
                    Spacer()
                }
                .padding(.top, 20)

                // State card
                GlassCard(cornerRadius: 16) {
                    HStack(spacing: 16) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(vm.isBleScanning ? "Scan actif" : "Scan arrêté")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundColor(.hotelText)
                            Text(vm.bleCentralStateLabel)
                                .font(.system(size: 12))
                                .foregroundColor(.hotelMuted)
                        }
                        Spacer()

                        Button {
                            vm.runBleEmitterTest()
                        } label: {
                            Text("Tester")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.hotelGold)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 9)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 9)
                                        .stroke(Color.hotelGold.opacity(0.45), lineWidth: 1)
                                )
                        }
                        .disabled(vm.isBusy)
                    }
                    .padding(18)
                }

                // Emitter test result
                if !vm.bleEmitterTestStatus.isEmpty && vm.bleEmitterTestStatus != "Non lance" {
                    HStack(spacing: 10) {
                        Image(systemName: "antenna.radiowaves.left.and.right")
                            .font(.system(size: 13))
                            .foregroundColor(.hotelGold)
                        Text(vm.bleEmitterTestStatus)
                            .font(.system(size: 12))
                            .foregroundColor(.hotelMuted)
                        Spacer()
                    }
                    .padding(14)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color.hotelGold.opacity(0.07))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color.hotelGold.opacity(0.2), lineWidth: 1)
                            )
                    )
                }

                // Devices list
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        TagLabel(text: "APPAREILS DÉTECTÉS")
                        Spacer()
                        if !vm.scannedDevices.isEmpty {
                            Text("\(min(vm.scannedDevices.count, 20))")
                                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                                .foregroundColor(.hotelMuted)
                        }
                    }

                    if vm.scannedDevices.isEmpty {
                        VStack(spacing: 14) {
                            Image(systemName: "antenna.radiowaves.left.and.right.slash")
                                .font(.system(size: 30, weight: .thin))
                                .foregroundColor(.hotelMuted.opacity(0.4))
                            Text("Aucun appareil détecté")
                                .font(.system(size: 13))
                                .foregroundColor(.hotelMuted)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(44)
                    } else {
                        VStack(spacing: 6) {
                            ForEach(Array(vm.scannedDevices.prefix(20))) { device in
                                BLEDeviceRow(device: device)
                            }
                        }
                    }
                }

                Spacer(minLength: 50)
            }
            .padding(.horizontal, 20)
        }
        .background(Color.hotelBg)
    }
}

// MARK: - BLE Device Row

private struct BLEDeviceRow: View {
    let device: BleManager.ScannedDevice

    private var bars: Int {
        let clamped = max(-100, min(-40, device.rssi))
        let normalized = Double(clamped + 100) / 60.0
        return max(1, Int(normalized * 5))
    }

    var body: some View {
        HStack(spacing: 14) {
            // Signal bars
            HStack(alignment: .bottom, spacing: 2) {
                ForEach(1...5, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(
                            i <= bars
                            ? (device.isRegistered ? Color.hotelGold : Color.hotelMuted)
                            : Color.white.opacity(0.09)
                        )
                        .frame(width: 4, height: CGFloat(5 + i * 3))
                }
            }
            .frame(width: 30)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(device.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.hotelText)

                    if device.isRegistered {
                        Text("ENREGISTRÉ")
                            .font(.system(size: 8, weight: .bold, design: .monospaced))
                            .tracking(0.5)
                            .foregroundColor(.hotelGold)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(
                                Capsule()
                                    .fill(Color.hotelGold.opacity(0.12))
                                    .overlay(Capsule().stroke(Color.hotelGold.opacity(0.3), lineWidth: 0.5))
                            )
                    }
                }
                Text(device.identifier.prefix(22) + "…")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.hotelMuted.opacity(0.55))
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 3) {
                Text("\(device.rssi) dBm")
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundColor(device.isRegistered ? .hotelGold : .hotelMuted)
                Text(device.lastSeen.formatted(date: .omitted, time: .standard))
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.hotelMuted.opacity(0.5))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(device.isRegistered ? Color.hotelGold.opacity(0.07) : Color.hotelCard)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(
                            device.isRegistered ? Color.hotelGold.opacity(0.22) : Color.white.opacity(0.05),
                            lineWidth: 1
                        )
                )
        )
    }
}

// MARK: - ACCOUNT TAB

private struct AccountTab: View {
    @ObservedObject var vm: ClientViewModel

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 26) {

                // Header
                VStack(alignment: .leading, spacing: 5) {
                    Text("COMPTE")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .tracking(4)
                        .foregroundColor(.hotelGold)
                    Text("Connexion")
                        .font(.system(size: 30, weight: .thin))
                        .foregroundColor(.hotelText)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 20)

                // Login card
                VStack(spacing: 26) {
                    // Hotel emblem
                    VStack(spacing: 8) {
                        Image(systemName: "building.2")
                            .font(.system(size: 34, weight: .thin))
                            .foregroundColor(.hotelGold)
                        Text("SMART ROOM ACCESS")
                            .font(.system(size: 10, weight: .semibold, design: .monospaced))
                            .tracking(3)
                            .foregroundColor(.hotelGold.opacity(0.55))
                    }
                    .padding(.bottom, 4)

                    // Fields
                    VStack(spacing: 14) {
                        LuxuryField(
                            placeholder: "Adresse e-mail",
                            text: $vm.email,
                            icon: "envelope",
                            secure: false
                        )
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)

                        LuxuryField(
                            placeholder: "Mot de passe",
                            text: $vm.password,
                            icon: "lock",
                            secure: true
                        )
                    }

                    // Action buttons
                    VStack(spacing: 12) {
                        Button {
                            Task { await vm.login() }
                        } label: {
                            HStack {
                                Spacer()
                                if vm.isBusy {
                                    ProgressView().tint(Color.hotelGoldDark).scaleEffect(0.85)
                                } else {
                                    Text("SE CONNECTER")
                                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                                        .tracking(2)
                                        .foregroundColor(Color.hotelGoldDark)
                                }
                                Spacer()
                            }
                            .padding(.vertical, 16)
                            .background(
                                LinearGradient(
                                    colors: [Color.hotelGoldSoft, Color.hotelGold, Color(red: 0.65, green: 0.46, blue: 0.14)],
                                    startPoint: .topLeading, endPoint: .bottomTrailing
                                )
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 13))
                            .shadow(color: Color.hotelGold.opacity(0.35), radius: 16, y: 6)
                        }
                        .disabled(vm.isBusy)

                        HStack(spacing: 10) {
                            SecondaryButton(
                                label: "Actualiser",
                                icon: "arrow.clockwise",
                                color: .hotelMuted
                            ) {
                                Task { await vm.refreshGrants() }
                            }
                            .disabled(vm.isBusy)

                            SecondaryButton(
                                label: "Déconnexion",
                                icon: "arrow.left.circle",
                                color: .hotelError
                            ) {
                                withAnimation { vm.logout() }
                            }
                        }
                    }
                }
                .padding(24)
                .background(
                    RoundedRectangle(cornerRadius: 22)
                        .fill(Color.hotelCard)
                        .overlay(
                            RoundedRectangle(cornerRadius: 22)
                                .stroke(Color.white.opacity(0.07), lineWidth: 1)
                        )
                )

                // Status banner
                if !vm.statusMessage.isEmpty {
                    StatusBanner(message: vm.statusMessage, isBusy: vm.isBusy)
                }

                // Active grants summary
                if !vm.grants.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        TagLabel(text: "ACCÈS ACTIFS")
                        VStack(spacing: 6) {
                            ForEach(vm.grants, id: \.grant_id) { grant in
                                HStack {
                                    Image(systemName: "key.fill")
                                        .font(.system(size: 12))
                                        .foregroundColor(.hotelGold)
                                    Text(grant.grant_id.prefix(18) + "…")
                                        .font(.system(size: 11, design: .monospaced))
                                        .foregroundColor(.hotelMuted)
                                    Spacer()
                                    Text("\(grant.doors.count) porte\(grant.doors.count > 1 ? "s" : "")")
                                        .font(.system(size: 11, weight: .medium))
                                        .foregroundColor(.hotelMuted)
                                }
                                .padding(.horizontal, 14)
                                .padding(.vertical, 11)
                                .background(
                                    RoundedRectangle(cornerRadius: 11)
                                        .fill(Color.hotelSurface)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 11)
                                                .stroke(Color.white.opacity(0.05), lineWidth: 1)
                                        )
                                )
                            }
                        }
                    }
                }

                Spacer(minLength: 50)
            }
            .padding(.horizontal, 20)
        }
        .background(Color.hotelBg)
    }
}

// MARK: - Luxury Text Field

private struct LuxuryField: View {
    let placeholder: String
    @Binding var text: String
    let icon: String
    let secure: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 15))
                .foregroundColor(.hotelMuted)
                .frame(width: 20)

            if secure {
                SecureField(placeholder, text: $text)
                    .font(.system(size: 15))
                    .foregroundColor(.hotelText)
                    .tint(.hotelGold)
            } else {
                TextField(placeholder, text: $text)
                    .font(.system(size: 15))
                    .foregroundColor(.hotelText)
                    .tint(.hotelGold)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 15)
        .background(Color.hotelSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
    }
}

// MARK: - Secondary Button

private struct SecondaryButton: View {
    let label: String
    let icon: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(label, systemImage: icon)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(color)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(color.opacity(0.08))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(color.opacity(0.22), lineWidth: 1)
                        )
                )
        }
    }
}

// MARK: - Preview

#Preview {
    ContentView()
}
