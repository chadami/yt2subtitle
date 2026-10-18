import Foundation

struct HealthResponse: Decodable {
    let ok: Bool
}

struct AISummary: Decodable, Equatable {
    let configured: Bool
    let provider: String
    let model: String
}

struct QueueSummary: Decodable {
    let running: Int
    let pending: Int
}

struct JobCounts: Decodable {
    let active: Int
    let completed: Int
}

struct LocalStatus: Decodable {
    let ok: Bool
    let mode: String
    let port: Int
    let version: String
    let dataDir: String
    let ai: AISummary
    let machineTranslation: Bool
    let queue: QueueSummary
    let jobs: JobCounts
}

struct LocalSession: Decodable {
    let token: String
    let userId: String
    let apiBase: String
    let version: String?
    let ai: AISummary
}

struct JobSummary: Decodable, Identifiable {
    let jobId: String
    let status: String
    let createdAt: String?
    let completedAt: String?
    let sourceLang: String?
    let targetLang: String?
    let captionType: String?
    let provider: String?
    let model: String?
    let title: String?
    let url: String?

    var id: String { jobId }

    var statusLabel: String {
        switch status {
        case "completed": return "已完成"
        case "failed": return "失败"
        case "queued": return "排队中"
        case "cleaning": return "清洗字幕"
        case "translating": return "翻译中"
        case "compressing": return "压缩中"
        case "finalizing": return "收尾中"
        case "cancelled": return "已取消"
        default: return status
        }
    }
}

struct Preferences: Codable, Equatable {
    var targetLang: String
    var showSourceText: Bool
}

struct JobHistory: Decodable {
    let history: [JobSummary]
    let total: Int
    let nextCursor: String?
}

struct ModelList: Decodable {
    let models: [String]
}

struct APIError: Decodable {
    let error: String?
}

enum LocalAPI {
    private static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 10
        configuration.timeoutIntervalForResource = 30
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.connectionProxyDictionary = [:]
        configuration.waitsForConnectivity = false
        return URLSession(configuration: configuration)
    }()

    private static func buildRequest(
        base: String,
        path: String,
        method: String,
        token: String?,
        body: [String: Any]?
    ) -> URLRequest? {
        guard let url = URL(string: base + path) else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }
        return request
    }

    private static func decode<T: Decodable>(_ type: T.Type, data: Data, response: HTTPURLResponse) throws -> T {
        guard (200..<300).contains(response.statusCode) else {
            let message = (try? JSONDecoder().decode(APIError.self, from: data))?.error
            throw LocalAPIError.http(status: response.statusCode, message: message)
        }
        return try JSONDecoder().decode(type, from: data)
    }

    static func health(base: String) async -> Bool {
        guard let request = buildRequest(base: base, path: "/health", method: "GET", token: nil, body: nil) else { return false }
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return false }
            return (try? JSONDecoder().decode(HealthResponse.self, from: data))?.ok == true
        } catch {
            return false
        }
    }

    static func status(base: String, token: String) async throws -> LocalStatus {
        guard let request = buildRequest(base: base, path: "/api/local/status", method: "GET", token: token, body: nil) else {
            throw LocalAPIError.badURL
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw LocalAPIError.badURL }
        return try decode(LocalStatus.self, data: data, response: http)
    }

    static func history(base: String, token: String, cursor: String? = nil) async throws -> JobHistory {
        let path = "/api/jobs/history" + (cursor.map { "?cursor=\($0)" } ?? "")
        guard let request = buildRequest(base: base, path: path, method: "GET", token: token, body: nil) else {
            throw LocalAPIError.badURL
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw LocalAPIError.badURL }
        return try decode(JobHistory.self, data: data, response: http)
    }

    static func models(base: String, token: String, provider: String, apiKey: String, baseUrl: String = "") async throws -> [String] {
        var payload: [String: Any] = ["provider": provider, "apiKey": apiKey]
        if !baseUrl.isEmpty { payload["baseUrl"] = baseUrl }
        guard let request = buildRequest(
            base: base,
            path: "/api/ai/models",
            method: "POST",
            token: token,
            body: payload
        ) else { throw LocalAPIError.badURL }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw LocalAPIError.badURL }
        return try decode(ModelList.self, data: data, response: http).models
    }

    static func preferences(base: String, token: String) async throws -> Preferences {
        guard let request = buildRequest(base: base, path: "/api/local/preferences", method: "GET", token: token, body: nil) else {
            throw LocalAPIError.badURL
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw LocalAPIError.badURL }
        return try decode(Preferences.self, data: data, response: http)
    }

    static func updatePreferences(base: String, token: String, targetLang: String, showSourceText: Bool) async throws -> Preferences {
        guard let request = buildRequest(
            base: base,
            path: "/api/local/preferences",
            method: "PUT",
            token: token,
            body: ["targetLang": targetLang, "showSourceText": showSourceText]
        ) else { throw LocalAPIError.badURL }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw LocalAPIError.badURL }
        return try decode(Preferences.self, data: data, response: http)
    }
}

enum LocalAPIError: LocalizedError {
    case badURL
    case http(status: Int, message: String?)

    var errorDescription: String? {
        switch self {
        case .badURL:
            return "本地地址无效"
        case let .http(status, message):
            return message ?? "请求失败（HTTP \(status)）"
        }
    }
}
