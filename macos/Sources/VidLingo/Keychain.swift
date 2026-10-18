import Foundation
import Security

@MainActor
enum Keychain {
    private static let service = "com.vidlingo.desktop"

    static func read(_ account: String) throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw KeychainError(status: status) }
        guard let data = item as? Data else { throw KeychainError(status: errSecDecode) }
        return String(data: data, encoding: .utf8)
    }

    static func write(_ value: String, account: String) throws {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]

        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else { throw KeychainError(status: updateStatus) }

        var create = query
        create.merge(attributes) { _, new in new }
        let status = SecItemAdd(create as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError(status: status) }
    }

    static func delete(_ account: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw KeychainError(status: status) }
    }

    /// Reads a generated secret, creating and persisting it on first use.
    static func ensureSecret(account: String, bytes: Int = 32) throws -> String {
        if let existing = try read(account), existing.count >= 24 { return existing }
        var buffer = [UInt8](repeating: 0, count: bytes)
        let status = SecRandomCopyBytes(kSecRandomDefault, buffer.count, &buffer)
        guard status == errSecSuccess else { throw KeychainError(status: status) }
        let value = Data(buffer).base64EncodedString()
        try write(value, account: account)
        return value
    }
}
