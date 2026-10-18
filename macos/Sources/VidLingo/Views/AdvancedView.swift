import SwiftUI

struct AdvancedView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageHeader(title: "高级", subtitle: "端口、开机启动与运行日志")

                SectionCard(title: "服务", subtitle: nil) {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack(spacing: 10) {
                            Text("端口")
                                .font(.system(size: 12))
                                .frame(width: 76, alignment: .leading)
                            TextField("3000", text: $model.portDraft)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: 110)
                            Button("应用") {
                                model.applyPort()
                            }
                            .flatButton(true)
                            Text("修改后插件需要重新连接一次")
                                .font(.system(size: 11))
                                .foregroundStyle(.tertiary)
                        }

                        Toggle(isOn: Binding(
                            get: { model.config.launchAtLogin },
                            set: { model.setLaunchAtLogin($0) }
                        )) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("开机自动启动")
                                    .font(.system(size: 12))
                                Text("登录后在后台启动本机服务，插件随时可用")
                                    .font(.system(size: 11))
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .toggleStyle(.switch)
                        .controlSize(.small)

                        HStack(spacing: 10) {
                            Button {
                                model.openDataFolder()
                            } label: {
                                Label("打开数据目录", systemImage: "folder")
                            }
                            .flatButton()
                            Button {
                                model.openLogFile()
                            } label: {
                                Label("打开日志文件", systemImage: "doc.text")
                            }
                            .flatButton()
                            Spacer()
                        }

                        VStack(alignment: .leading, spacing: 5) {
                            KeyValueRow(label: "数据目录", value: AppPaths.dataDir.path)
                            KeyValueRow(label: "服务版本", value: model.status?.version ?? "—")
                            KeyValueRow(label: "运行模式", value: model.status?.mode == "local" ? "本机模式 (PGlite)" : "—")
                        }
                        .padding(.top, 2)
                    }
                }

                SectionCard(title: "运行日志", subtitle: "最近 800 行，包含插件请求与翻译任务进度") {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("\(model.server.logs.count) 行")
                                .font(.system(size: 11))
                                .foregroundStyle(.secondary)
                            Spacer()
                            Button("清空") {
                                model.server.clearLogs()
                            }
                            .controlSize(.small)
                        }
                        LogConsole(lines: model.server.logs)
                            .frame(height: 300)
                    }
                }
            }
            .padding(24)
        }
    }
}

struct LogConsole: View {
    let lines: [String]

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 1) {
                    if lines.isEmpty {
                        Text("暂无日志")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(.tertiary)
                            .padding(8)
                    }
                    ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                        Text(line)
                            .font(.system(size: 10.5, design: .monospaced))
                            .foregroundStyle(color(for: line))
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .id(index)
                    }
                }
                .padding(10)
            }
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Theme.field)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(Theme.border, lineWidth: 1)
            )
            .onChange(of: lines.count) { count in
                guard count > 0 else { return }
                withAnimation(.linear(duration: 0.1)) {
                    proxy.scrollTo(count - 1, anchor: .bottom)
                }
            }
        }
    }

    private func color(for line: String) -> Color {
        if line.contains("failed") || line.contains("Error") || line.contains("error") {
            return .orange
        }
        if line.hasPrefix("[system]") {
            return .secondary
        }
        return .primary
    }
}
