import Foundation

enum LaunchAtLogin {
    private static let label = "com.vidlingo.desktop"

    private static var plistURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/LaunchAgents/\(label).plist")
    }

    static func setEnabled(_ enabled: Bool) throws {
        if !enabled {
            try? FileManager.default.removeItem(at: plistURL)
            return
        }

        let bundlePath = Bundle.main.bundlePath
        guard bundlePath.hasSuffix(".app") else {
            throw NSError(domain: label, code: 1, userInfo: [
                NSLocalizedDescriptionKey: "应用尚未打包为 .app，暂不支持开机启动"
            ])
        }

        let contents: [String: Any] = [
            "Label": label,
            "ProgramArguments": ["/usr/bin/open", "-a", bundlePath],
            "RunAtLoad": true,
            "KeepAlive": false,
            "ProcessType": "Interactive"
        ]

        let directory = plistURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let data = try PropertyListSerialization.data(fromPropertyList: contents, format: .xml, options: 0)
        try data.write(to: plistURL, options: .atomic)
    }
}
