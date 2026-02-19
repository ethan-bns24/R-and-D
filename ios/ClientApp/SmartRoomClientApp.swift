import SwiftUI

@main
struct SmartRoomClientApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView(viewModel: ClientViewModel())
        }
    }
}
