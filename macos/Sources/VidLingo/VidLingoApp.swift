import AppKit
import SwiftUI

@main
struct VidLingoApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var model = AppModel()

    var body: some Scene {
        Window("VidLingo", id: "main") {
            RootView(appDelegate: appDelegate)
                .environmentObject(model)
                .frame(minWidth: 940, minHeight: 640)
                .onAppear {
                    appDelegate.model = model
                    NSApp.activate(ignoringOtherApps: true)
                }
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentMinSize)
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandMenu("服务") {
                Button("启动本机服务") { model.startServer() }
                    .keyboardShortcut("r", modifiers: [.command])
                Button("停止本机服务") { model.stopServer() }
                Divider()
                Button("连接诊断") {
                    model.section = .advanced
                    appDelegate.openMainWindow?()
                }
            }
        }

        MenuBarExtra {
            MenuBarContent()
                .environmentObject(model)
        } label: {
            if let icon = BrandAssets.menuBarIcon {
                Image(nsImage: icon)
            } else {
                Image(systemName: model.menuBarIcon)
                    .scaleEffect(0.9)
            }
        }
        .menuBarExtraStyle(.menu)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    weak var model: AppModel?
    weak var mainWindow: NSWindow?
    var openMainWindow: (() -> Void)?
    private var signalSource: DispatchSourceSignal?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // `killall` / logout sends SIGTERM. Without this, AppKit skips
        // applicationWillTerminate and the node child keeps the port forever.
        signal(SIGTERM, SIG_IGN)
        let source = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
        source.setEventHandler {
            NSApp.terminate(nil)
        }
        source.resume()
        signalSource = source
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        // A single Window scene reopens the closed window without creating duplicates.
        openMainWindow?()
        if let mainWindow {
            if mainWindow.isMiniaturized { mainWindow.deminiaturize(nil) }
            mainWindow.makeKeyAndOrderFront(nil)
        }
        sender.activate(ignoringOtherApps: true)
        return false
    }

    func applicationWillTerminate(_ notification: Notification) {
        MainActor.assumeIsolated {
            model?.server.stopAndWait()
        }
    }
}

struct MenuBarContent: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Text("VidLingo · \(model.server.state.label)")
        Divider()
        Button("打开主窗口") {
            NSApp.activate(ignoringOtherApps: true)
            openWindow(id: "main")
        }
        if model.server.isRunning {
            Button("重启本机服务") { model.restartServer() }
            Button("停止本机服务") { model.stopServer() }
        } else {
            Button("启动本机服务") { model.startServer() }
        }
        Divider()
        Button("退出 VidLingo") { NSApp.terminate(nil) }
            .keyboardShortcut("q")
    }
}
