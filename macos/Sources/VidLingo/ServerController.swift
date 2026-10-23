import Foundation

@MainActor
final class ServerController: ObservableObject {
    enum State: Equatable {
        case stopped
        case starting
        case running
        case failed(String)

        var label: String {
            switch self {
            case .stopped: return "已停止"
            case .starting: return "启动中"
            case .running: return "运行中"
            case .failed: return "异常"
            }
        }
    }

    struct LaunchOptions {
        var config: AppConfig
        var apiKey: String
        var googleKey: String
        var localToken: String
    }

    @Published private(set) var state: State = .stopped
    @Published private(set) var logs: [String] = []
    @Published private(set) var port: Int = 3000

    private var process: Process?
    private var healthTask: Task<Void, Never>?
    private var lastOptions: LaunchOptions?
    private var intentionalStop = false
    private var restartAttempts = 0
    private let maxLogLines = 800

    var baseURL: String { "http://127.0.0.1:\(port)" }

    var isRunning: Bool {
        if case .running = state { return true }
        return false
    }

    func start(options: LaunchOptions) {
        guard process == nil else { return }
        lastOptions = options
        intentionalStop = false
        port = options.config.port
        state = .starting
        append("[system] 正在启动本机服务 · 端口 \(options.config.port)", stream: "system")

        guard let resources = Bundle.main.resourceURL else {
            state = .failed("找不到应用资源目录")
            return
        }
        let runtime = resources.appendingPathComponent("runtime", isDirectory: true)
        let node = runtime.appendingPathComponent("node")
        let appDir = runtime.appendingPathComponent("app", isDirectory: true)
        let entry = appDir.appendingPathComponent("dist/start-local.js")

        guard FileManager.default.isExecutableFile(atPath: node.path),
              FileManager.default.fileExists(atPath: entry.path) else {
            state = .failed("运行时缺失，请重新构建应用（npm run build:mac）")
            append("[system] 缺少运行时：\(node.path)", stream: "system")
            return
        }

        let process = Process()
        process.executableURL = node
        process.arguments = [entry.path]
        process.currentDirectoryURL = appDir

        var environment = ProcessInfo.processInfo.environment
        environment["HOST"] = "127.0.0.1"
        environment["PORT"] = String(options.config.port)
        environment["NODE_ENV"] = "production"
        environment["DATA_DIR"] = AppPaths.dataDir.path
        environment["LOCAL_TOKEN"] = options.localToken
        environment["LOCAL_AI_PROVIDER"] = options.config.effectiveProvider
        environment["LOCAL_AI_API_KEY"] = options.apiKey
        environment["LOCAL_AI_MODEL"] = options.config.model
        environment["LOCAL_AI_BASE_URL"] = options.config.useCustomEndpoint
            ? options.config.baseUrl.trimmingCharacters(in: .whitespacesAndNewlines)
            : ""
        environment["LOCAL_MT_PROVIDER"] = options.config.machineTranslationProvider
        environment["LOCAL_TRANSLATE_HELPER"] = runtime
            .appendingPathComponent("bin/vidlingo-translate")
            .path
        environment["GOOGLE_CLOUD_TRANSLATION_API_KEY"] = options.config.googleTranslationEnabled ? options.googleKey : ""
        environment["EXTENSION_ORIGIN"] = "*"
        environment["WORKER_CONCURRENCY"] = "2"
        environment["APP_VERSION"] = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
        environment["PATH"] = "/usr/bin:/bin:/usr/sbin:/sbin"
        process.environment = environment

        let outputPipe = Pipe()
        let errorPipe = Pipe()
        process.standardOutput = outputPipe
        process.standardError = errorPipe
        attach(pipe: outputPipe, stream: "out")
        attach(pipe: errorPipe, stream: "err")

        process.terminationHandler = { [weak self] finished in
            Task { @MainActor in
                self?.handleTermination(exitCode: finished.terminationStatus)
            }
        }

        do {
            try process.run()
            self.process = process
        } catch {
            state = .failed("无法启动运行时：\(error.localizedDescription)")
            return
        }

        healthTask?.cancel()
        healthTask = Task { [weak self] in
            for _ in 0..<60 {
                if Task.isCancelled { return }
                try? await Task.sleep(nanoseconds: 500_000_000)
                guard let self else { return }
                if await LocalAPI.health(base: self.baseURL) {
                    if self.process != nil {
                        self.state = .running
                        self.restartAttempts = 0
                        self.append("[system] 服务已就绪 · \(self.baseURL)", stream: "system")
                    }
                    return
                }
                if self.process == nil { return }
            }
            guard let self, self.process != nil else { return }
            self.state = .failed("启动超时，请查看日志")
        }
    }

    func stop() {
        intentionalStop = true
        healthTask?.cancel()
        healthTask = nil
        guard let process else {
            state = .stopped
            return
        }
        append("[system] 正在停止服务", stream: "system")
        process.terminate()
        let pid = process.processIdentifier
        DispatchQueue.global().asyncAfter(deadline: .now() + 4) {
            if process.isRunning {
                kill(pid, SIGKILL)
            }
        }
    }

    /// Blocks until the child is gone. Used when the app itself is terminating,
    /// otherwise the old server can still hold port 3000 when the next launch starts.
    func stopAndWait(timeout: TimeInterval = 5) {
        stop()
        let deadline = Date().addingTimeInterval(timeout)
        while process != nil && Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        if let process, process.isRunning {
            kill(process.processIdentifier, SIGKILL)
            self.process = nil
        }
    }

    func restart(options: LaunchOptions) {
        stop()
        let deadline = Date().addingTimeInterval(5)
        Task { [weak self] in
            while let self, self.process != nil, Date() < deadline {
                try? await Task.sleep(nanoseconds: 150_000_000)
            }
            self?.start(options: options)
        }
    }

    func clearLogs() {
        logs.removeAll()
    }

    private func handleTermination(exitCode: Int32) {
        process = nil
        healthTask?.cancel()
        healthTask = nil

        if intentionalStop {
            state = .stopped
            return
        }

        if exitCode == 0 {
            state = .stopped
            return
        }

        append("[system] 服务退出，代码 \(exitCode)", stream: "system")
        if restartAttempts < 5, let options = lastOptions {
            restartAttempts += 1
            append("[system] 尝试自动重启（第 \(restartAttempts) 次）", stream: "system")
            state = .starting
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                self?.start(options: options)
            }
        } else {
            state = .failed("服务进程已退出（代码 \(exitCode)），请查看日志")
        }
    }

    private func attach(pipe: Pipe, stream: String) {
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            Task { @MainActor in
                self?.append(text, stream: stream)
            }
        }
    }

    private func append(_ text: String, stream: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let lines = trimmed.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        for line in lines where !line.isEmpty {
            logs.append(line)
        }
        if logs.count > maxLogLines {
            logs.removeFirst(logs.count - maxLogLines)
        }
        writeToFile(text)
    }

    private func writeToFile(_ text: String) {
        let url = AppPaths.logFile
        let data = Data(text.utf8)
        if let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
           let size = attributes[.size] as? Int, size > 4 * 1024 * 1024 {
            try? FileManager.default.removeItem(at: url)
        }
        if !FileManager.default.fileExists(atPath: url.path) {
            FileManager.default.createFile(atPath: url.path, contents: nil)
        }
        guard let handle = try? FileHandle(forWritingTo: url) else { return }
        defer { try? handle.close() }
        _ = try? handle.seekToEnd()
        try? handle.write(contentsOf: data)
    }
}
