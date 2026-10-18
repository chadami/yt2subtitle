import SwiftUI

struct ExtensionView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageHeader(title: "连接 Chrome 插件", subtitle: "连接后即可在 YouTube 中生成字幕，翻译由本机应用处理")

                SectionCard(title: "三步完成连接", subtitle: "只需要做一次，之后每次打开视频直接生成字幕") {
                    VStack(alignment: .leading, spacing: 14) {
                        StepRow(index: 1, title: "加载插件", detail: "打开 Chrome 扩展管理页，开启右上角「开发者模式」，点「加载已解压的扩展程序」，选择应用内置的插件目录。")
                        Divider().opacity(0.4)
                        StepRow(index: 2, title: "连接本机 App", detail: "打开插件设置页，点击「连接本机应用」，看到「已连接」即可。")
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

                SectionCard(title: "连接帮助", subtitle: "当前连接状态可在 Chrome 插件中查看") {
                    HStack(spacing: 12) {
                        Image(systemName: model.server.isRunning ? "checkmark.circle.fill" : "circle.dashed")
                            .font(.system(size: 18))
                            .foregroundStyle(model.server.isRunning ? .green : .secondary)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(model.server.isRunning ? "服务已就绪，可以连接插件" : "请先启动本机服务")
                                .font(.system(size: 12.5, weight: .medium))
                            Text("如果插件未连接，请保持 VidLingo 打开，并在插件设置中点击「重新连接」。")
                                .font(.system(size: 11.5))
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("连接诊断") {
                                model.section = .advanced
                            }
                            .buttonStyle(.link)
                    }
                }

                SectionCard(title: "说明", subtitle: nil) {
                    VStack(alignment: .leading, spacing: 6) {
                        bullet("插件在这台电脑上连接 VidLingo，翻译请求由应用发送给你配置的服务商。")
                        bullet("App 关闭后插件无法工作，需要保持 App 在运行（可设置开机启动）。")
                        bullet("遇到连接问题时，可到「高级 → 连接诊断」查看详情。")
                    }
                }
            }
            .padding(24)
        }
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
