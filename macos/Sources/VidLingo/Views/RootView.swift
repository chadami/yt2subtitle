import AppKit
import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.openWindow) private var openWindow
    let appDelegate: AppDelegate

    var body: some View {
        HStack(spacing: 0) {
            sidebar
            VStack(spacing: 0) {
                topBar
                ZStack(alignment: .top) {
                    detail
                    if let banner = model.banner {
                        BannerView(banner: banner) {
                            model.dismissBanner()
                        }
                        .padding(.top, 12)
                        .padding(.horizontal, 24)
                        .transition(.move(edge: .top).combined(with: .opacity))
                    }
                }
                .animation(.easeInOut(duration: 0.22), value: model.banner?.id)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.canvas)
        }
        .frame(minWidth: 940, minHeight: 640)
        // The custom header already replaces the title bar. Extend into its
        // safe area so macOS does not add a second empty strip above it.
        .ignoresSafeArea(.container, edges: .top)
        .background(Theme.sidebar)
        .background(WindowConfigurator(onWindowAvailable: { appDelegate.mainWindow = $0 }))
        .modifier(TranslationInstallHost(installer: model.translationInstaller))
        .onAppear {
            let action = openWindow
            appDelegate.openMainWindow = { action(id: "main") }
        }
    }

    // MARK: - Sidebar

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                AppMark(size: 22)
                Text("VidLingo")
                    .font(.system(size: 13.5, weight: .semibold))
                    .tracking(-0.2)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 36)
            .padding(.bottom, 12)

            group("使用") {
                navRow(.overview)
                navRow(.history)
            }
            group("配置") {
                navRow(.subtitles)
                navRow(.ai)
            }
            group("扩展") {
                navRow(.extensionBridge)
            }
            group("系统") {
                navRow(.advanced)
            }

            Spacer(minLength: 12)

            Hairline()
                .padding(.horizontal, 12)

            Button {
                model.section = .advanced
            } label: {
                HStack(spacing: 7) {
                    Circle()
                        .fill(statusColor)
                        .frame(width: 6, height: 6)
                    Text(model.server.isRunning ? "服务运行中" : model.server.state.label)
                        .font(.system(size: 11.5))
                        .foregroundStyle(Theme.secondary)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .frame(width: 232)
        .frame(maxHeight: .infinity)
        .background(Theme.sidebar)
    }

    @ViewBuilder
    private func group<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 10.5, weight: .medium))
                .foregroundStyle(Theme.tertiary)
                .padding(.horizontal, 16)
                .padding(.top, 14)
                .padding(.bottom, 5)
            content()
        }
    }

    private func navRow(_ section: AppSection) -> some View {
        let selected = model.section == section
        return Button {
            model.section = section
        } label: {
            HStack(spacing: 8) {
                Image(systemName: section.icon)
                    .font(.system(size: 11.5, weight: .medium))
                    .frame(width: 15)
                Text(section.title)
                    .font(.system(size: 12.5, weight: selected ? .medium : .regular))
                Spacer(minLength: 0)
            }
            .foregroundStyle(selected ? Theme.ink : Theme.secondary)
            .padding(.horizontal, 10)
            .frame(height: 29)
            .background(
                Group {
                    if selected {
                        RoundedRectangle(cornerRadius: 7, style: .continuous)
                            .fill(Theme.card)
                            .shadow(color: .black.opacity(0.055), radius: 2, y: 1)
                    }
                }
            )
            .padding(.horizontal, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var statusColor: Color {
        switch model.server.state {
        case .running: return Theme.green
        case .starting: return .orange
        case .failed: return .red
        case .stopped: return Theme.tertiary
        }
    }

    // MARK: - Content

    private var topBar: some View {
        HStack(spacing: 8) {
            Text("VidLingo")
                .foregroundStyle(Theme.tertiary)
            Text("/")
                .foregroundStyle(Theme.tertiary)
            Text(model.section.title)
                .foregroundStyle(Theme.secondary)
            Spacer()
            StatusPill(state: model.server.state)
        }
        .font(.system(size: 11.5))
        .padding(.horizontal, 24)
        .frame(height: 44)
        .background(Theme.canvas)
        .overlay(alignment: .bottom) {
            Hairline()
        }
    }

    @ViewBuilder
    private var detail: some View {
        switch model.section {
        case .overview:
            OverviewView()
        case .subtitles:
            SubtitleSettingsView()
        case .ai:
            AIView()
        case .extensionBridge:
            ExtensionView()
        case .history:
            HistoryView()
        case .advanced:
            AdvancedView()
        }
    }
}

struct AppMark: View {
    var size: CGFloat = 28

    var body: some View {
        if let icon = BrandAssets.appMark {
            Image(nsImage: icon)
                .resizable()
                .interpolation(.high)
                .frame(width: size, height: size)
        } else {
            ZStack {
                RoundedRectangle(cornerRadius: size * 0.26, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [Color(red: 0.20, green: 0.44, blue: 0.96), Color(red: 0.45, green: 0.24, blue: 0.92)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                Image(systemName: "captions.bubble.fill")
                    .font(.system(size: size * 0.46, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .frame(width: size, height: size)
        }
    }
}

struct BannerView: View {
    let banner: Banner
    var onClose: () -> Void = {}

    var body: some View {
        HStack(spacing: 9) {
            Circle()
                .fill(tint)
                .frame(width: 6, height: 6)
            Text(banner.text)
                .font(.system(size: 12))
                .foregroundStyle(Theme.ink)
                .lineLimit(2)
            Spacer(minLength: 8)
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(Theme.tertiary)
                    .frame(width: 18, height: 18)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("关闭")
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Theme.card)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.06), radius: 10, y: 3)
    }

    private var tint: Color {
        switch banner.kind {
        case .info: return Theme.purple
        case .success: return Theme.green
        case .error: return .orange
        }
    }
}

struct WindowConfigurator: NSViewRepresentable {
    var onWindowAvailable: (NSWindow) -> Void

    func makeNSView(context: Context) -> NSView {
        let probe = WindowProbe()
        probe.onWindowAvailable = onWindowAvailable
        return probe
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

private final class WindowProbe: NSView {
    var onWindowAvailable: ((NSWindow) -> Void)?

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        guard let window else { return }
        onWindowAvailable?(window)
        window.isMovableByWindowBackground = true
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
    }
}
