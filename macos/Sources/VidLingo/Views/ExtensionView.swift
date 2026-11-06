import SwiftUI

struct ExtensionView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageHeader(title: "连接 Chrome 插件", subtitle: "连接后即可在 YouTube 中生成字幕，翻译由本机应用处理")

                SectionCard(title: "三步完成连接", subtitle: "只需要做一次，之后每次打开视频直接生成字幕") {
                    VStack(alignment: .leading, spacing: 14) {
                        StepRow(index: 1, title: "安装插件", detail: installDetail)
                        Divider().opacity(0.4)
                        StepRow(index: 2, title: "连接本机 App", detail: "打开插件设置页，点击「连接本机应用」，看到「已连接」即可。")
                        Divider().opacity(0.4)
                        StepRow(index: 3, title: "开始使用", detail: "打开任意 YouTube 视频，点播放器里的 VidLingo 按钮生成 AI 字幕。任务进度会实时同步到本页。")

                        HStack(spacing: 10) {
                            if model.extensionLastSeenDescription == nil {
                                Button {
                                    model.openChromeWebStore()
                                } label: {
                                    Label("前往 Chrome 应用商店", systemImage: "arrow.up.right.square")
                                }
                                .flatButton(true)
                            }
                            Button {
                                model.openChromeExtensions()
                            } label: {
                                Label("打开 Chrome 扩展页", systemImage: "puzzlepiece.extension")
                            }
                            .flatButton()
                        }
                        .padding(.top, 2)
                    }
                }

                SectionCard(title: "说明", subtitle: nil) {
                    VStack(alignment: .leading, spacing: 6) {
                        bullet("插件在这台电脑上连接 VidLingo，翻译请求由应用发送给你配置的服务商。")
                        bullet("App 关闭后插件无法工作，需要保持 App 在运行（可设置开机启动）。")
                        bullet("遇到连接问题时，可到「高级 → 连接诊断」查看详情。")
                        bullet("打不开 Chrome 应用商店时，可以在扩展页开启「开发者模式」，再点「加载已解压的扩展程序」，选择内置插件目录。这种方式不会自动更新。")
                        Button("打开内置插件目录") {
                            model.openBundledExtensionFolder()
                        }
                        .buttonStyle(.link)
                        .font(.system(size: 11.5))
                        .padding(.leading, 13)
                    }
                }
            }
            .padding(24)
        }
    }

    private var installDetail: String {
        switch model.extensionConnection {
        case .online:
            return "插件已连接。"
        case .offline:
            return "插件现在未连接。请确认 Chrome 已打开，并在扩展页中启用了 VidLingo。"
        case .never:
            return "还没有检测到插件连接，请从 Chrome 应用商店添加 VidLingo。已经装好的话，打开插件设置页连接一次。"
        case .seen, nil:
            if let lastSeen = model.extensionLastSeenDescription { return "插件上次连接：\(lastSeen)。" }
            return "从 Chrome 应用商店添加 VidLingo。"
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
