import SwiftUI

struct ExtensionView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageHeader(title: "连接 Chrome 插件", subtitle: "插件通过本机 HTTP 接口把视频字幕交给 App 翻译，不需要登录、不需要 Docker")

                SectionCard(title: "三步完成连接", subtitle: "只需要做一次，之后每次打开视频直接生成字幕") {
                    VStack(alignment: .leading, spacing: 14) {
                        StepRow(index: 1, title: "加载插件", detail: "打开 Chrome 扩展管理页，开启右上角「开发者模式」，点「加载已解压的扩展程序」，选择应用内置的插件目录。")
                        Divider().opacity(0.4)
                        StepRow(index: 2, title: "连接本机 App", detail: "打开插件设置页（更多设置），在账户区域点「使用本机应用」，它会自动填入地址并完成本机登录。")
                        Divider().opacity(0.4)
                        StepRow(index: 3, title: "开始使用", detail: "打开任意 YouTube 视频，点播放器里的 VidLingo 按钮生成 AI 字幕。任务进度会实时同步到本页。")

                        HStack(spacing: 10) {
                            Button {
                                model.openBundledExtensionFolder()
                            } label: {
                                Label("打开内置插件目录", systemImage: "folder")
                            }
                            Button {
                                model.openChromeExtensions()
                            } label: {
                                Label("打开 Chrome 扩展页", systemImage: "safari")
                            }
                            .flatButton(true)
                        }
                        .padding(.top, 2)
                    }
                }

                SectionCard(title: "本机地址", subtitle: "如果自动检测失败，可以在插件设置页手动填入这个地址") {
                    HStack(spacing: 10) {
                        Text(model.localBaseURL)
                            .font(.system(size: 12.5, design: .monospaced))
                            .textSelection(.enabled)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                            .background(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .fill(Theme.field)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .stroke(Theme.border, lineWidth: 1)
                            )
                        Button {
                            model.copyLocalBaseURL()
                        } label: {
                            Label("复制地址", systemImage: "doc.on.doc")
                        }
                        Spacer()
                        StatusPill(state: model.server.state, port: model.config.port)
                    }
                }

                SectionCard(title: "连接状态", subtitle: "插件第一次提交任务后，这里会变成「已连通」") {
                    HStack(spacing: 12) {
                        Image(systemName: connected ? "checkmark.circle.fill" : "circle.dashed")
                            .font(.system(size: 18))
                            .foregroundStyle(connected ? .green : .secondary)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(connected ? "插件已经和本机 App 通信过" : "还没有收到插件请求")
                                .font(.system(size: 12.5, weight: .medium))
                            Text(connected
                                 ? "最近任务：\(model.jobs.first?.title ?? "—")"
                                 : "如果插件报「Cannot reach backend API」，先确认本机服务处于运行中，再检查插件里的地址。")
                                .font(.system(size: 11.5))
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if model.jobs.isEmpty {
                            Button("查看服务日志") {
                                model.section = .advanced
                            }
                            .buttonStyle(.link)
                        }
                    }
                }

                SectionCard(title: "说明", subtitle: nil) {
                    VStack(alignment: .leading, spacing: 6) {
                        bullet("插件与 App 的所有通信都走 127.0.0.1，不会离开这台电脑。")
                        bullet("App 关闭后插件无法工作，需要保持 App 在运行（可设置开机启动）。")
                        bullet("修改端口后，在插件设置页重新点一次「使用本机应用」即可。")
                        bullet("想让插件回到云端服务：在插件设置页把地址改回 https://api.vidlingo.online。")
                    }
                }
            }
            .padding(24)
        }
    }

    private var connected: Bool {
        model.server.isRunning && !model.jobs.isEmpty
    }

    private func bullet(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 7) {
            Text("·")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(.tertiary)
            Text(text)
                .font(.system(size: 11.5))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
