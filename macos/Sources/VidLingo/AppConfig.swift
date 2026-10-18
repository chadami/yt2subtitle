import Foundation

struct AppConfig: Codable, Equatable {
    var port: Int = 3000
    var provider: String = "deepseek"
    var model: String = "deepseek-chat"
    var useCustomEndpoint: Bool = false
    var customProtocol: String = "openai"
    var baseUrl: String = ""
    var machineTranslationProvider: String = "off"
    var launchAtLogin: Bool = false
    var startServerOnLaunch: Bool = true
    var googleTranslationEnabled: Bool = false

    enum CodingKeys: String, CodingKey {
        case port, provider, model, useCustomEndpoint, customProtocol, baseUrl
        case machineTranslationProvider
        case launchAtLogin, startServerOnLaunch, googleTranslationEnabled
    }

    init() {}

    /// Missing keys must fall back to defaults instead of failing the whole decode —
    /// otherwise adding a new field would silently reset the user's existing settings.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        port = try container.decodeIfPresent(Int.self, forKey: .port) ?? 3000
        provider = try container.decodeIfPresent(String.self, forKey: .provider) ?? "deepseek"
        model = try container.decodeIfPresent(String.self, forKey: .model) ?? "deepseek-chat"
        useCustomEndpoint = try container.decodeIfPresent(Bool.self, forKey: .useCustomEndpoint)
            ?? !((try container.decodeIfPresent(String.self, forKey: .baseUrl)) ?? "").isEmpty
        customProtocol = try container.decodeIfPresent(String.self, forKey: .customProtocol) ?? "openai"
        baseUrl = try container.decodeIfPresent(String.self, forKey: .baseUrl) ?? ""
        machineTranslationProvider = try container.decodeIfPresent(String.self, forKey: .machineTranslationProvider) ?? "off"
        launchAtLogin = try container.decodeIfPresent(Bool.self, forKey: .launchAtLogin) ?? false
        startServerOnLaunch = try container.decodeIfPresent(Bool.self, forKey: .startServerOnLaunch) ?? true
        googleTranslationEnabled = try container.decodeIfPresent(Bool.self, forKey: .googleTranslationEnabled) ?? false
    }

    static let providers: [(id: String, name: String, defaultModel: String)] = [
        ("deepseek", "DeepSeek", "deepseek-chat"),
        ("gemini", "Google Gemini", "gemini-2.5-flash"),
        ("openai", "OpenAI", "gpt-4.1-mini"),
        ("claude", "Anthropic Claude", "claude-sonnet-4-5"),
        ("qwen", "通义千问 Qwen", "qwen-plus"),
        ("mimo", "小米 MiMo", "mimo-v2-flash")
    ]

    /// Protocols that a custom endpoint can speak. Most gateways are OpenAI compatible.
    static let customProtocols: [(id: String, name: String)] = [
        ("openai", "OpenAI 兼容"),
        ("gemini", "Gemini"),
        ("claude", "Claude")
    ]

    var effectiveProvider: String {
        useCustomEndpoint ? customProtocol : provider
    }

    var providerName: String {
        if useCustomEndpoint {
            let protocolName = Self.customProtocols.first(where: { $0.id == customProtocol })?.name ?? customProtocol
            return "自定义（\(protocolName)）"
        }
        return Self.providers.first(where: { $0.id == provider })?.name ?? provider
    }

    var localApiBase: String {
        "http://127.0.0.1:\(port)"
    }
}

enum AppPaths {
    static let support: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support")
        let dir = base.appendingPathComponent("VidLingo", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    static var dataDir: URL {
        let dir = support.appendingPathComponent("data", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    static var configFile: URL {
        support.appendingPathComponent("config.json")
    }

    static var logFile: URL {
        support.appendingPathComponent("server.log")
    }

    static func loadConfig() -> AppConfig {
        guard let data = try? Data(contentsOf: configFile),
              let config = try? JSONDecoder().decode(AppConfig.self, from: data) else {
            return AppConfig()
        }
        return config
    }

    static func saveConfig(_ config: AppConfig) {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(config) else { return }
        try? data.write(to: configFile, options: .atomic)
    }
}
