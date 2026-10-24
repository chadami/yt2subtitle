import AppKit
import SwiftUI

struct SubtitleSettingsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageHeader(
                    title: "字幕输出",
                    subtitle: "改完保存即可，Chrome 插件下次打开视频时自动同步"
                )

                SectionCard(title: "翻译语言", subtitle: "字幕会翻译成这个语言") {
                    HStack(spacing: 12) {
                        Picker("", selection: $model.targetLangDraft) {
                            ForEach(model.targetLanguages, id: \.id) { language in
                                Text(language.name).tag(language.id)
                            }
                        }
                        .labelsHidden()
                        .pickerStyle(.menu)
                        .frame(width: 220)
                        Spacer()
                    }
                }

                HStack(spacing: 10) {
                    Button {
                        model.savePreferences()
                    } label: {
                        if model.isSavingPreferences {
                            HStack(spacing: 6) {
                                ProgressView().controlSize(.small)
                                Text("保存中")
                            }
                        } else {
                            Text("保存并同步")
                        }
                    }
                    .flatButton(true)
                    .disabled(model.isSavingPreferences || !model.server.isRunning)

                    if !model.server.isRunning {
                        Text("服务未运行")
                            .font(.system(size: 11.5))
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                }

                SectionCard(title: "说明", subtitle: nil) {
                    VStack(alignment: .leading, spacing: 6) {
                        bullet("原文显示、原文和译文字号、位置、透明度在 YouTube 播放器面板里调整。")
                        bullet("自动翻译开关也在播放器面板里，属于单个视频的操作。")
                        bullet("翻译语言会被插件读取并同步。")
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

struct HistoryView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageHeader(
                    title: "历史记录",
                    subtitle: "共 \(model.historyTotal) 条，已加载 \(model.jobs.count) 条"
                )

                SectionCard {
                    if model.jobs.isEmpty {
                        HStack(spacing: 8) {
                            Image(systemName: "clock.arrow.circlepath")
                                .foregroundStyle(.tertiary)
                            Text("还没有记录。打开 YouTube 视频，用插件生成一次字幕试试。")
                                .font(.system(size: 12))
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                    } else {
                        VStack(spacing: 0) {
                            ForEach(model.jobs) { job in
                                HistoryRow(job: job)
                                if job.id != model.jobs.last?.id {
                                    Divider().opacity(0.35)
                                }
                            }
                        }
                    }
                }
                if model.historyCursor != nil {
                    Button(model.isLoadingHistory ? "加载中…" : "加载更多") {
                        model.loadMoreHistory()
                    }
                    .flatButton()
                    .disabled(model.isLoadingHistory || !model.server.isRunning)
                }
            }
            .padding(24)
        }
    }
}

struct HistoryRow: View {
    let job: JobSummary

    private var dateText: String {
        guard let createdAt = job.createdAt,
              let date = ISO8601DateFormatter().date(from: createdAt) else { return "" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_Hans_CN")
        formatter.dateFormat = "MM-dd HH:mm"
        return formatter.string(from: date)
    }

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 3) {
                Text(job.title?.isEmpty == false ? job.title! : "未命名视频")
                    .font(.system(size: 12.5, weight: .medium))
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(job.statusLabel)
                    Text("·")
                    Text("\(job.sourceLang ?? "?") → \(job.targetLang ?? "?")")
                    if let model = job.model, !model.isEmpty {
                        Text("·")
                        Text(model)
                    }
                    if !dateText.isEmpty {
                        Text("·")
                        Text(dateText)
                    }
                }
                .font(.system(size: 10.5))
                .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            StopJobButton(job: job)
            if let urlString = job.url, let url = URL(string: urlString) {
                Button {
                    NSWorkspace.shared.open(url)
                } label: {
                    Label("打开", systemImage: "arrow.up.right.square")
                        .labelStyle(.titleAndIcon)
                }
                .buttonStyle(.link)
                .font(.system(size: 11.5))
            }
        }
        .padding(.vertical, 9)
    }

    private var statusColor: Color {
        if job.isCompleted { return .green }
        if job.isSystemTranslating { return .orange }
        switch job.status {
        case "completed": return .green
        case "failed": return .red
        case "cancelled": return .gray
        default: return .orange
        }
    }
}
