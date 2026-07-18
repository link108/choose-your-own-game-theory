import Foundation
import Security

/// Keychain-backed credential storage. Three slots: the short-lived access JWT, the
/// rotating refresh token, and the account-less guest token. Never UserDefaults.
struct TokenStore {
    enum Slot: String {
        case access = "org.byah.cyoa.access"
        case refresh = "org.byah.cyoa.refresh"
        case guest = "org.byah.cyoa.guest"
    }

    func get(_ slot: Slot) -> String? {
        var query = baseQuery(slot)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func set(_ slot: Slot, _ value: String) {
        let data = Data(value.utf8)
        var query = baseQuery(slot)
        let update = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            query[kSecValueData as String] = data
            query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(query as CFDictionary, nil)
        }
    }

    func clear(_ slot: Slot) {
        SecItemDelete(baseQuery(slot) as CFDictionary)
    }

    func clearAll() {
        clear(.access)
        clear(.refresh)
        clear(.guest)
    }

    private func baseQuery(_ slot: Slot) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: slot.rawValue,
        ]
    }
}
