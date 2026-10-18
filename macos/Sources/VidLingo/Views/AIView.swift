import SwiftUI

struct AIView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageHeader(title: "AI 模型", subtitle: "API Key 存在 macOS 钥匙串，只在发请求时由本机服务使用")

                SectionCard(title: "翻译引擎", subtitle: "先选用预设服务商还是自定义地址，再填 Key 和模型") {
                    VStack(alignment: .leading, spacing: 16) {
                        PillSegmented(
                            items: [(false, "预设服务商"), (true, "自定义地址")],
                            selection: $model.useCustomEndpointDraft
                        )
                        .onChange(of: model.useCustomEndpointDraft) { _ in
                            model.models = []
                        }

                        if model.useCustomEndpointDraft {
                            HStack(alignment: .bottom, spacing: 12) {
                                VStack(alignment: .leading, spacing: 5) {
                                    Text("接口协议")
                                        .font(.system(size: 11.5))
                                        .foregroundStyle(.secondary)
                                    Picker("", selection: $model.customProtocolDraft) {
                                        ForEach(AppConfig.customProtocols, id: \.id) { item in
                                            Text(item.name).tag(item.id)
                                        }
                                    }
                                    .labelsHidden()
                                    .pickerStyle(.menu)
                                    .frame(width: 150)
                                }

                                VStack(alignment: .leading, spacing: 5) {
                                    Text("Base URL")
                                        .font(.system(size: 11.5))
                                        .foregroundStyle(.secondary)
                                    TextField("https://api.example.com/v1", text: $model.baseUrlDraft)
                                        .textFieldStyle(.roundedBorder)
                                        .font(.system(size: 12, design: .monospaced))
                                        .frame(width: 380)
                                }
                                Spacer(minLength: 0)
                            }

                            Text("代理、自建网关或第三方中转都填这里；OpenAI 兼容地址通常以 /v1 结尾。")
                                .font(.system(size: 11))
                                .foregroundStyle(.tertiary)
                        } else {
                            VStack(alignment: .leading, spacing: 5) {
                                Text("服务商")
                                    .font(.system(size: 11.5))
                                    .foregroundStyle(.secondary)
                                Picker("", selection: $model.providerDraft) {
                                    ForEach(AppConfig.providers, id: \.id) { provider in
                                        Text(provider.name).tag(provider.id)
                                    }
                                }
                                .labelsHidden()
                                .pickerStyle(.menu)
                                .frame(width: 210)
                                .onChange(of: model.providerDraft) { newValue in
                                    if let entry = AppConfig.providers.first(where: { $0.id == newValue }),
                                       model.modelDraft.isEmpty {
                                        model.modelDraft = entry.defaultModel
                                    }
                                }
                            }
                        }

                        VStack(alignment: .leading, spacing: 5) {
                            Text("模型名称")
                                .font(.system(size: 11.5))
                                .foregroundStyle(.secondary)
                            HStack(spacing: 8) {
                                TextField("例如 deepseek-chat", text: $model.modelDraft)
                                    .textFieldStyle(.roundedBorder)
                                    .frame(width: 280)
                                Button {
                                    model.fetchModels()
                                } label: {
                                    if model.isLoadingModels {
                                        ProgressView().controlSize(.small)
                                    } else {
                                        Text("获取模型")
                                    }
                                }
                                .flatButton()
                                .disabled(model.isLoadingModels)
                            }
                        }

                        if !model.models.isEmpty {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("可用模型")
                                    .font(.system(size: 11.5))
                                    .foregroundStyle(.secondary)
                                FlowChips(items: model.models) { item in
                                    model.modelDraft = item
                                }
                            }
                        }

                        VStack(alignment: .leading, spacing: 5) {
                            Text("API Key")
                                .font(.system(size: 11.5))
                                .foregroundStyle(.secondary)
                            SecureField(
                                model.hasAPIKey ? "已保存，留空表示不修改" : "sk-...",
                                text: $model.apiKeyDraft
                            )
                            .textFieldStyle(.roundedBorder)
                            .frame(maxWidth: 520)
                        }

                        HStack(spacing: 10) {
                            Button {
                                model.saveAISettings()
                            } label: {
                                if model.isSaving {
                                    HStack(spacing: 6) {
                                        ProgressView().controlSize(.small)
                                        Text("应用中")
                                    }
                                } else {
                                    Text("保存并应用")
                                }
                            }
                            .flatButton(true)
                            .disabled(model.isSaving)

                            if model.hasAPIKey {
                                Button("清除 API Key", role: .destructive) {
                                    model.clearAPIKey()
                                }
                            }

                            Spacer()

                            HStack(spacing: 6) {
                                Image(systemName: model.hasAPIKey ? "checkmark.seal.fill" : "exclamationmark.triangle.fill")
                                    .foregroundStyle(model.hasAPIKey ? .green : .orange)
                                Text(configSummary)
                                    .font(.system(size: 11.5))
                                    .foregroundStyle(.secondary)
                            }
                        }

                        Text("预设服务商走各自的官方接口；自定义地址用于代理、自建网关或第三方兼容服务，费用都由你的账号承担。")
                            .font(.system(size: 11))
                            .foregroundStyle(.tertiary)
                    }
                }

                SectionCard(
                    title: "机器翻译（可选）",
                    subtitle: "AI 字幕生成过程中先给一版机翻预览，插件里能更快看到内容"
                ) {
                    VStack(alignment: .leading, spacing: 13) {
                        PillSegmented(
                            items: [
                                ("off", "关闭"),
                                ("macos", "本地（macOS）"),
                                ("google", "Google")
                            ],
                            disabledValues: supportsSystemTranslation ? [] : ["macos"],
                            selection: Binding(
                                get: { model.config.machineTranslationProvider },
                                set: { model.applyMachineTranslationProvider($0) }
                            )
                        )

                        if !supportsSystemTranslation {
                            Text("本地系统翻译需要 macOS 26 或更新版本")
                                .font(.system(size: 11))
                                .foregroundStyle(.secondary)
                        }
                        switch model.config.machineTranslationProvider {
                        case "macos":
                            HStack(spacing: 8) {
                                Circle()
                                    .fill(packColor)
                                    .frame(width: 6, height: 6)
                                Text("英语 → \(targetLanguageName) · \(model.translationInstaller.statusText)")
                                    .font(.system(size: 12))
                                    .foregroundStyle(Theme.secondary)
                                Spacer()
                                if !model.translationInstaller.isInstalled && !model.translationInstaller.isUnsupported {
                                    Button("下载语言包") {
                                        model.translationInstaller.requestInstall(source: "en", target: model.targetLangDraft)
                                    }
                                    .flatButton()
                                    .disabled(model.translationInstaller.isInstalling)
                                }
                            }
                            Text("调用 macOS 系统翻译，翻译在本机完成。首次使用需要由系统下载语言包，下载界面由 Apple 提供。")
                                .font(.system(size: 11))
                                .foregroundStyle(Theme.tertiary)
                            if let error = model.translationInstaller.errorText {
                                Text(error)
                                    .font(.system(size: 11))
                                    .foregroundStyle(.orange)
                            }
                        case "google":
                            HStack(spacing: 8) {
                                SecureField(
                                    model.hasGoogleKey ? "已保存，留空表示清除" : "Google Cloud Translation API Key",
                                    text: $model.googleKeyDraft
                                )
                                .textFieldStyle(.roundedBorder)
                                .frame(maxWidth: 420)
                                Button("保存") {
                                    model.saveGoogleKey()
                                }
                                .flatButton()
                            }
                            Text("走 Google Cloud Translation，按字符计费，需要自己的 API Key。")
                                .font(.system(size: 11))
                                .foregroundStyle(Theme.tertiary)
                        default:
                            Text("关闭后不显示机翻预览，等 AI 翻译完成后直接出字幕。")
                                .font(.system(size: 11))
                                .foregroundStyle(Theme.tertiary)
                        }
                    }
                }
            }
            .padding(24)
            .onAppear {
                model.translationInstaller.refresh(source: "en", target: model.targetLangDraft)
            }
            .onChange(of: model.targetLangDraft) { value in
                model.translationInstaller.refresh(source: "en", target: value)
            }
        }
    }

    private var targetLanguageName: String {
        model.targetLanguages.first { $0.id == model.targetLangDraft }?.name ?? model.targetLangDraft
    }

    private var supportsSystemTranslation: Bool {
        if #available(macOS 26.0, *) { return true }
        return false
    }

    private var packColor: Color {
        let installer = model.translationInstaller
        if installer.isInstalled { return Theme.green }
        if installer.isUnsupported { return .red }
        return .orange
    }

    private var configSummary: String {
        guard model.hasAPIKey else { return "尚未配置" }
        var text = "已配置 \(model.config.providerName) · \(model.config.model)"
        if model.config.useCustomEndpoint, let host = URL(string: model.config.baseUrl)?.host {
            text += " · \(host)"
        }
        return text
    }
}

struct FlowChips: View {
    let items: [String]
    let onSelect: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(items.prefix(24), id: \.self) { item in
                    Button {
                        onSelect(item)
                    } label: {
                        Text(item)
                            .font(.system(size: 11, design: .monospaced))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(
                                Capsule().fill(Theme.hairline)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
