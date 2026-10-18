import Foundation
import SwiftUI
import Translation

/// Drives the system translation language-pack download.
/// The configuration is stored as `Any?` so the app can keep a macOS 13
/// deployment target while the feature itself requires macOS 26+.
@MainActor
final class LocalTranslationInstaller: ObservableObject {
    @Published private(set) var statusText = "未检查"
    @Published private(set) var isInstalled = false
    @Published private(set) var isUnsupported = false
    @Published private(set) var isInstalling = false
    @Published private(set) var errorText: String?
    @Published var configuration: Any?

    private var pendingSource = "en"
    private var pendingTarget = "zh-Hans"

    func refresh(source: String, target: String) {
        pendingSource = source
        pendingTarget = target
        errorText = nil

        guard #available(macOS 26.0, *) else {
            statusText = "需要 macOS 26 或更新版本"
            isUnsupported = true
            return
        }
        Task { await refreshStatus(source: source, target: target) }
    }

    @available(macOS 26.0, *)
    private func refreshStatus(source: String, target: String) async {
        let availability = LanguageAvailability()
        let status = await availability.status(
            from: Locale.Language(identifier: source),
            to: Locale.Language(identifier: target)
        )
        switch status {
        case .installed:
            isInstalled = true
            isUnsupported = false
            statusText = "已安装"
        case .supported:
            isInstalled = false
            isUnsupported = false
            statusText = "需要下载语言包"
        case .unsupported:
            isInstalled = false
            isUnsupported = true
            statusText = "系统不支持这组语言"
        @unknown default:
            isInstalled = false
            isUnsupported = true
            statusText = "未知状态"
        }
    }

    func requestInstall(source: String, target: String) {
        pendingSource = source
        pendingTarget = target
        guard #available(macOS 26.0, *) else { return }
        errorText = nil
        isInstalling = true
        configuration = TranslationSession.Configuration(
            source: Locale.Language(identifier: source),
            target: Locale.Language(identifier: target)
        )
    }

    @available(macOS 26.0, *)
    func handle(session: TranslationSession) async {
        do {
            try await session.prepareTranslation()
            isInstalling = false
            await refreshStatus(source: pendingSource, target: pendingTarget)
            configuration = nil
        } catch {
            isInstalling = false
            errorText = error.localizedDescription
            statusText = "安装未完成"
            configuration = nil
        }
    }
}

struct TranslationInstallHost: ViewModifier {
    @ObservedObject var installer: LocalTranslationInstaller

    func body(content: Content) -> some View {
        if #available(macOS 26.0, *) {
            content.translationTask(installer.configuration as? TranslationSession.Configuration) { session in
                await installer.handle(session: session)
            }
        } else {
            content
        }
    }
}
