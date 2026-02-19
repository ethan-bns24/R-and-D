# iOS Client (V2)

Folder format matches the existing `ios/` layout.

- `ClientApp/ApiClient.swift`: HTTP calls to backend `/v1`
- `ClientApp/AuthService.swift`: token storage (Keychain)
- `ClientApp/BleManager.swift`: BLE GATT challenge/auth flow
- `ClientApp/ClientViewModel.swift`: app state
- `ClientApp/ContentView.swift`: SwiftUI screen
- `ClientApp/SmartRoomClientApp.swift`: app entry point

Default API base URL fallback:
- `http://10.42.0.1:8000`

You can override it in app runtime with:
- `UserDefaults` key: `api_base_url`
