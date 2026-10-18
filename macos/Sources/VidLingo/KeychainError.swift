import Foundation
import Security

struct KeychainError: LocalizedError {
    let status: OSStatus
    var errorDescription: String? {
        let detail = SecCopyErrorMessageString(status, nil) as String? ?? "错误码 \(status)"
        return "钥匙串访问失败：\(detail)"
    }
}
