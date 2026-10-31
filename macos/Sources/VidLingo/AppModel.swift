import AppKit
import Foundation
import Combine
import SwiftUI

struct Banner: Identifiable, Equatable {
    enum Kind { case info, success, error }
    let id = UUID()
    let text: String
    let kind: Kind
}

enum AppSection: String, CaseIterable, Identifiable {
    case overview
    case subtitles
    case ai
    case extensionBridge
    case history
    case advanced

    var id: String { rawValue }

    var title: String {
        switch self {
        case .overview: return "概览"
        case .subtitles: return "翻译语言"
        case .ai: return "AI 模型"
        case .extensionBridge: return "Chrome 插件"
        case .history: return "历史记录"
        case .advanced: return "高级"
        }
    }

    var icon: String {
        switch self {
        case .overview: return "gauge.medium"
        case .subtitles: return "captions.bubble"
        case .ai: return "sparkles"
        case .extensionBridge: return "puzzlepiece.extension"
        case .history: return "clock.arrow.circlepath"
        case .advanced: return "slider.horizontal.3"
        }
    }
}

@MainActor
final class AppModel: ObservableObject {
    @Published var config: AppConfig
    @Published var section: AppSection = .overview
    @Published var status: LocalStatus?
    @Published var jobs: [JobSummary] = []
    @Published private(set) var stoppingJobIDs: Set<String> = []
    @Published private(set) var historyTotal = 0
    @Published private(set) var historyCursor: String?
    @Published private(set) var isLoadingHistory = false
    private var loadedOlderHistory = false
    @Published var banner: Banner? {
        didSet { scheduleBannerDismiss() }
    }
    private var bannerDismissTask: Task<Void, Never>?

    @Published var preferences = Preferences(targetLang: "zh-Hans")
    @Published var targetLangDraft = "zh-Hans"
    @Published var isSavingPreferences = false
    private var preferencesLoaded = false
    private var isLoadingPreferences = false

    @Published var providerDraft: String
    @Published var modelDraft: String
    @Published var apiKeyDraft: String = ""
    @Published var useCustomEndpointDraft: Bool
    @Published var customProtocolDraft: String
    @Published var baseUrlDraft: String
    @Published var mtProviderDraft: String
    @Published var googleKeyDraft: String = ""
    @Published var portDraft: String
    @Published var models: [String] = []
    @Published var isLoadingModels = false
    @Published var isSaving = false

    @Published private(set) var hasAPIKey: Bool
    @Published private(set) var hasGoogleKey: Bool

    let server = ServerController()
    let translationInstaller = LocalTranslationInstaller()
    private(set) var localToken = ""
    private var cachedAPIKey = ""
    private var cachedGoogleKey = ""
    private var credentialsError: String?
    private var pollingTask: Task<Void, Never>?
    private var childSubscriptions: Set<AnyCancellable> = []

    init() {
        let loaded = AppPaths.loadConfig()
        config = loaded
        providerDraft = loaded.provider
        modelDraft = loaded.model
        useCustomEndpointDraft = loaded.useCustomEndpoint
        customProtocolDraft = loaded.customProtocol
        baseUrlDraft = loaded.baseUrl
        mtProviderDraft = loaded.machineTranslationProvider
        portDraft = String(loaded.port)
        hasAPIKey = false
        hasGoogleKey = false
        do {
            try loadCredentials()
        } catch {
            credentialsError = error.localizedDescription
            banner = Banner(text: error.localizedDescription, kind: .error)
        }

        server.objectWillChange.sink { [weak self] in
            self?.objectWillChange.send()
        }.store(in: &childSubscriptions)
        translationInstaller.objectWillChange.sink { [weak self] in
            self?.objectWillChange.send()
        }.store(in: &childSubscriptions)
        startPolling()
        if loaded.startServerOnLaunch && credentialsError == nil {
            startServer()
        }
    }

    // Read once per launch; re-read only when retrying a denied Keychain request.
    private func loadCredentials() throws {
        let apiKey = try Keychain.read("ai-api-key") ?? ""
        let googleKey = try Keychain.read("google-api-key") ?? ""
        let token = try Keychain.ensureSecret(account: "local-token")
        cachedAPIKey = apiKey
        cachedGoogleKey = googleKey
        localToken = token
        hasAPIKey = !apiKey.isEmpty
        hasGoogleKey = !googleKey.isEmpty
        credentialsError = nil
    }

    private func ensureCredentials() -> Bool {
        guard credentialsError != nil else { return true }
        do {
            try loadCredentials()
            return true
        } catch {
            banner = Banner(text: error.localizedDescription, kind: .error)
            return false
        }
    }

    var savedAPIKey: String { cachedAPIKey }
    var savedGoogleKey: String { cachedGoogleKey }

    var localBaseURL: String {
        "http://127.0.0.1:\(config.port)"
    }

    var menuBarIcon: String {
        switch server.state {
        case .running: return "captions.bubble.fill"
        case .starting: return "captions.bubble"
        case .failed: return "exclamationmark.triangle"
        case .stopped: return "captions.bubble"
        }
    }

    func startServer() {
        guard ensureCredentials() else { return }
        server.start(options: launchOptions())
        if !hasAPIKey {
            banner = Banner(text: "服务已启动，但还没有配置 API Key，生成字幕会失败", kind: .info)
        }
    }

    func stopServer() {
        server.stop()
        status = nil
    }

    func restartServer() {
        guard ensureCredentials() else { return }
        server.restart(options: launchOptions())
    }

    private func scheduleBannerDismiss() {
        bannerDismissTask?.cancel()
        guard let current = banner else { return }
        let seconds: UInt64 = current.kind == .error ? 8 : 4
        bannerDismissTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: seconds * 1_000_000_000)
            guard !Task.isCancelled, let self else { return }
            guard self.banner?.id == current.id else { return }
            withAnimation(.easeOut(duration: 0.25)) {
                self.banner = nil
            }
        }
    }

    func dismissBanner() {
        bannerDismissTask?.cancel()
        withAnimation(.easeOut(duration: 0.2)) {
            banner = nil
        }
    }

    private func launchOptions() -> ServerController.LaunchOptions {
        ServerController.LaunchOptions(
            config: config,
            apiKey: savedAPIKey,
            googleKey: savedGoogleKey,
            localToken: localToken
        )
    }

    // MARK: - AI settings

    func fetchModels() {
        let key = apiKeyDraft.isEmpty ? savedAPIKey : apiKeyDraft
        guard !key.isEmpty else {
            banner = Banner(text: "请先填写 API Key", kind: .error)
            return
        }
        guard server.isRunning else {
            banner = Banner(text: "服务未运行，先启动服务再获取模型", kind: .error)
            return
        }
        let baseUrl = useCustomEndpointDraft
            ? baseUrlDraft.trimmingCharacters(in: .whitespacesAndNewlines)
            : ""
        let provider = useCustomEndpointDraft ? customProtocolDraft : providerDraft
        if useCustomEndpointDraft && baseUrl.isEmpty {
            banner = Banner(text: "请先填写自定义 Base URL", kind: .error)
            return
        }
        if !baseUrl.isEmpty && !(baseUrl.lowercased().hasPrefix("http://") || baseUrl.lowercased().hasPrefix("https://")) {
            banner = Banner(text: "Base URL 需要以 http:// 或 https:// 开头", kind: .error)
            return
        }
        isLoadingModels = true
        Task {
            defer { isLoadingModels = false }
            do {
                let result = try await LocalAPI.models(
                    base: server.baseURL,
                    token: localToken,
                    provider: provider,
                    apiKey: key,
                    baseUrl: baseUrl
                )
                models = result
                if !result.isEmpty && !result.contains(modelDraft) {
                    modelDraft = result.first ?? modelDraft
                }
                banner = Banner(text: "已获取 \(result.count) 个可用模型", kind: .success)
            } catch {
                banner = Banner(text: "获取模型失败：\(error.localizedDescription)", kind: .error)
            }
        }
    }

    func saveAISettings(restart: Bool = true) {
        let key = apiKeyDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty || hasAPIKey else {
            banner = Banner(text: "API Key 不能为空", kind: .error)
            return
        }
        let model = modelDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        let baseUrl = baseUrlDraft
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "/+$", with: "", options: .regularExpression)

        if useCustomEndpointDraft {
            guard !baseUrl.isEmpty else {
                banner = Banner(text: "请填写自定义 Base URL", kind: .error)
                return
            }
            guard let url = URL(string: baseUrl),
                  ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
                  url.host?.isEmpty == false, url.user == nil, url.password == nil else {
                banner = Banner(text: "Base URL 需要以 http:// 或 https:// 开头", kind: .error)
                return
            }
            guard !model.isEmpty else {
                banner = Banner(text: "请填写自定义接口的模型名称", kind: .error)
                return
            }
        }

        if !key.isEmpty {
            do {
                try Keychain.write(key, account: "ai-api-key")
                cachedAPIKey = key
                hasAPIKey = true
                apiKeyDraft = ""
            } catch {
                banner = Banner(text: error.localizedDescription, kind: .error)
                return
            }
        }

        config.useCustomEndpoint = useCustomEndpointDraft
        config.customProtocol = customProtocolDraft
        config.baseUrl = useCustomEndpointDraft ? baseUrl : ""
        baseUrlDraft = config.baseUrl
        config.provider = providerDraft
        config.model = model.isEmpty
            ? (AppConfig.providers.first { $0.id == providerDraft }?.defaultModel ?? "")
            : model
        modelDraft = config.model
        AppPaths.saveConfig(config)

        banner = Banner(text: "已保存，正在应用新配置", kind: .success)
        if restart {
            isSaving = true
            Task {
                try? await Task.sleep(nanoseconds: 400_000_000)
                isSaving = false
                restartServer()
            }
        }
    }

    func clearAPIKey() {
        do {
            try Keychain.delete("ai-api-key")
        } catch {
            banner = Banner(text: error.localizedDescription, kind: .error)
            return
        }
        cachedAPIKey = ""
        hasAPIKey = false
        apiKeyDraft = ""
        stopServer()
        banner = Banner(text: "已清除 API Key", kind: .info)
    }

    func applyMachineTranslationProvider(_ provider: String) {
        if provider == "macos" {
            guard #available(macOS 26.0, *) else {
                banner = Banner(text: "本地系统翻译需要 macOS 26 或更新版本", kind: .error)
                return
            }
        }
        guard config.machineTranslationProvider != provider else { return }
        config.machineTranslationProvider = provider
        config.googleTranslationEnabled = provider == "google"
        mtProviderDraft = provider
        if provider == "google" && !hasGoogleKey {
            banner = Banner(text: "还需要填入 Google API Key 才能使用 Google 机翻", kind: .info)
        }
        AppPaths.saveConfig(config)
        restartForConfigChange()
    }

    private func restartForConfigChange() {
        guard server.isRunning else { return }
        if (status?.jobs.active ?? 0) > 0 {
            banner = Banner(text: "已保存；当前有任务在跑，重启 App 后生效", kind: .info)
            return
        }
        restartServer()
    }

    func saveGoogleKey() {
        let key = googleKeyDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            if key.isEmpty { try Keychain.delete("google-api-key") }
            else { try Keychain.write(key, account: "google-api-key") }
        } catch {
            banner = Banner(text: error.localizedDescription, kind: .error)
            return
        }
        cachedGoogleKey = key
        if key.isEmpty {
            hasGoogleKey = false
            config.googleTranslationEnabled = false
            if config.machineTranslationProvider == "google" {
                config.machineTranslationProvider = "off"
                mtProviderDraft = "off"
            }
        } else {
            hasGoogleKey = true
            config.googleTranslationEnabled = true
            config.machineTranslationProvider = "google"
            mtProviderDraft = "google"
        }
        googleKeyDraft = ""
        AppPaths.saveConfig(config)
        banner = Banner(text: "Google 翻译配置已保存", kind: .success)
        restartForConfigChange()
    }

    // MARK: - Server settings

    func applyPort() {
        guard let port = Int(portDraft), (1024...65535).contains(port) else {
            banner = Banner(text: "端口需在 1024 - 65535 之间", kind: .error)
            portDraft = String(config.port)
            return
        }
        config.port = port
        AppPaths.saveConfig(config)
        banner = Banner(text: "端口已改为 \(port)，服务正在重启", kind: .success)
        if server.isRunning {
            restartServer()
        }
    }

    func setLaunchAtLogin(_ enabled: Bool) {
        config.launchAtLogin = enabled
        AppPaths.saveConfig(config)
        do {
            try LaunchAtLogin.setEnabled(enabled)
            banner = Banner(text: enabled ? "已设置开机启动" : "已关闭开机启动", kind: .success)
        } catch {
            banner = Banner(text: "设置开机启动失败：\(error.localizedDescription)", kind: .error)
        }
    }

    // MARK: - Extension helpers

    func copyLocalBaseURL() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(localBaseURL, forType: .string)
        banner = Banner(text: "已复制本机连接地址", kind: .success)
    }

    func copyConnectionDiagnostics() {
        var lines = [
            "VidLingo 连接诊断",
            "服务状态：\(server.state.label)",
            "连接地址：\(localBaseURL)",
            "服务版本：\(modelVersion)",
            "系统版本：\(ProcessInfo.processInfo.operatingSystemVersionString)"
        ]
        if case let .failed(message) = server.state { lines.append("错误详情：\(message)") }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(lines.joined(separator: "\n"), forType: .string)
        banner = Banner(text: "已复制连接诊断信息", kind: .success)
    }

    private var modelVersion: String {
        status?.version ?? Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—"
    }

    func openChromeExtensions() {
        let chrome = URL(fileURLWithPath: "/Applications/Google Chrome.app")
        guard FileManager.default.fileExists(atPath: chrome.path) else {
            banner = Banner(text: "没有找到 Google Chrome，请手动打开扩展管理页", kind: .error)
            return
        }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        process.arguments = ["-a", "Google Chrome", "chrome://extensions/"]
        try? process.run()
    }

    func openBundledExtensionFolder() {
        guard let url = Bundle.main.resourceURL?.appendingPathComponent("extension", isDirectory: true),
              FileManager.default.fileExists(atPath: url.appendingPathComponent("manifest.json").path) else {
            banner = Banner(text: "应用内没有找到插件目录", kind: .error)
            return
        }
        // Open the folder itself: revealing a directory nested in an app bundle
        // can leave Finder at the enclosing package instead of its contents.
        guard NSWorkspace.shared.open(url) else {
            banner = Banner(text: "无法打开插件目录，请在 Finder 中打开应用包内的 Contents/Resources/extension", kind: .error)
            return
        }
    }

    func openDataFolder() {
        NSWorkspace.shared.open(AppPaths.dataDir)
    }

    func openLogFile() {
        NSWorkspace.shared.open(AppPaths.logFile)
    }

    // MARK: - Subtitle preferences

    var targetLanguages: [(id: String, name: String)] {
        [
            ("zh-Hans", "简体中文"),
            ("zh-Hant", "繁體中文"),
            ("en", "English"),
            ("ja", "日本語"),
            ("ko", "한국어"),
            ("es", "Español"),
            ("fr", "Français"),
            ("de", "Deutsch"),
            ("ru", "Русский"),
            ("pt", "Português"),
            ("it", "Italiano"),
            ("ar", "العربية")
        ]
    }

    func loadPreferences() {
        guard server.isRunning, !isLoadingPreferences, !preferencesLoaded else { return }
        isLoadingPreferences = true
        Task {
            defer { isLoadingPreferences = false }
            guard let prefs = try? await LocalAPI.preferences(base: server.baseURL, token: localToken) else { return }
            preferences = prefs
            targetLangDraft = prefs.targetLang
            preferencesLoaded = true
        }
    }

    func savePreferences() {
        guard server.isRunning else {
            banner = Banner(text: "服务未运行，先启动服务再保存", kind: .error)
            return
        }
        isSavingPreferences = true
        Task {
            defer { isSavingPreferences = false }
            do {
                let updated = try await LocalAPI.updatePreferences(
                    base: server.baseURL,
                    token: localToken,
                    targetLang: targetLangDraft
                )
                preferences = updated
                preferencesLoaded = true
                banner = Banner(text: "字幕设置已保存，插件下次打开视频时同步", kind: .success)
            } catch {
                banner = Banner(text: "保存失败：\(error.localizedDescription)", kind: .error)
            }
        }
    }

    func stopJob(_ job: JobSummary) {
        guard job.canStop, server.isRunning, !stoppingJobIDs.contains(job.id) else { return }
        stoppingJobIDs.insert(job.id)
        Task {
            defer { stoppingJobIDs.remove(job.id) }
            do {
                try await LocalAPI.stopJob(base: server.baseURL, token: localToken, jobId: job.id)
                if let index = jobs.firstIndex(where: { $0.id == job.id }) {
                    jobs[index].status = "cancelled"
                    jobs[index].machineTranslationState = "cancelled"
                }
                banner = Banner(text: "任务已停止，已生成的字幕已保留", kind: .success)
            } catch {
                banner = Banner(text: "停止失败：\(error.localizedDescription)", kind: .error)
            }
        }
    }

    func loadMoreHistory() {
        guard let cursor = historyCursor, !isLoadingHistory, server.isRunning else { return }
        isLoadingHistory = true
        Task {
            defer { isLoadingHistory = false }
            do {
                let page = try await LocalAPI.history(base: server.baseURL, token: localToken, cursor: cursor)
                let existing = Set(jobs.map(\.id))
                jobs.append(contentsOf: page.history.filter { !existing.contains($0.id) })
                historyCursor = page.nextCursor
                historyTotal = page.total
                loadedOlderHistory = true
            } catch {
                banner = Banner(text: "加载历史失败：\(error.localizedDescription)", kind: .error)
            }
        }
    }

    // MARK: - Polling

    private func startPolling() {
        pollingTask?.cancel()
        pollingTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                if self.server.isRunning {
                    if let fresh = try? await LocalAPI.status(base: self.server.baseURL, token: self.localToken) {
                        self.status = fresh
                    }
                    if !self.isLoadingHistory,
                       let page = try? await LocalAPI.history(base: self.server.baseURL, token: self.localToken) {
                        // Keep older loaded pages while refreshing recent task statuses.
                        let recentIDs = Set(page.history.map(\.id))
                        let older = self.loadedOlderHistory ? self.jobs.filter { !recentIDs.contains($0.id) } : []
                        self.jobs = page.history + older
                        self.historyTotal = page.total
                        if !self.loadedOlderHistory { self.historyCursor = page.nextCursor }
                    }
                    if !self.preferencesLoaded {
                        self.loadPreferences()
                    }
                } else {
                    self.status = nil
                }
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            }
        }
    }
}
