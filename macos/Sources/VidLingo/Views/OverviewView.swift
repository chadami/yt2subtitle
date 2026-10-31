import SwiftUI

struct OverviewView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                PageHeader(title: "概览", subtitle: "本机服务负责翻译，Chrome 插件直接连到这里")

                metricsCard

                if !model.hasAPIKey {
                    Card(padding: 14) {
                        HStack(spacing: 10) {
                            Circle().fill(Theme.purple).frame(width: 6, height: 6)
                            Text("还没有配置 AI 模型，生成字幕会失败。")
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.secondary)
                            Spacer()
                            Button("去配置") {
                                model.section = .ai
                            }
                            .flatButton()
                        }
                    }
                }

                recentCard
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)
            .padding(.bottom, 28)
        }
    }

    // MARK: - Metrics

    private var metricsCard: some View {
        Card(padding: 0) {
            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    MetricCell(
                        label: "累计完成",
                        value: "\(model.status?.jobs.completed ?? 0)",
                        unit: "个任务",
                        detail: "本机数据库统计"
                    )
                    .frame(minHeight: 96, alignment: .topLeading)
                    Hairline(vertical: true)
                    MetricCell(
                        label: "进行中",
                        value: "\(model.status?.jobs.active ?? 0)",
                        unit: "个",
                        detail: queueDetail
                    )
                    .frame(minHeight: 96, alignment: .topLeading)
                }

                Hairline()

                HStack(spacing: 0) {
                    MetricCell(
                        label: "AI 引擎",
                        value: model.hasAPIKey ? model.config.providerName : "未配置",
                        detail: model.hasAPIKey ? "\(model.config.model)" : "在「AI 模型」里填写 Key",
                        valueColor: model.hasAPIKey ? Theme.ink : Theme.tertiary
                    )
                    .frame(minHeight: 96, alignment: .topLeading)
                    Hairline(vertical: true)
                    MetricCell(
                        label: "Chrome 插件",
                        value: model.server.isRunning ? "可连接" : "服务未运行",
                        detail: "在 Chrome 插件中查看当前连接状态",
                        valueColor: model.server.isRunning ? Theme.green : Theme.tertiary
                    )
                    .frame(minHeight: 96, alignment: .topLeading)
                }

                Hairline()

                successRow
            }
        }
    }

    private var successRow: some View {
        let total = model.jobs.filter { $0.status != "cancelled" }.count
        let completed = model.jobs.filter { $0.isCompleted }.count
        let ratio = total > 0 ? Double(completed) / Double(total) : 0
        let percent = total > 0 ? "\(Int((ratio * 100).rounded()))%" : "—"

        return HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("任务成功率")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.secondary)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(percent)
                        .font(.metric(28))
                        .tracking(-0.6)
                        .monospacedDigit()
                    Text(total > 0 ? "\(completed) / \(total) 个任务完成" : "还没有任务")
                        .font(.caption)
                        .foregroundStyle(Theme.tertiary)
                }
            }

            Spacer(minLength: 20)

            ZStack(alignment: .leading) {
                Capsule().fill(Theme.field).frame(width: 190, height: 4)
                Capsule().fill(Theme.green).frame(width: max(4, 190 * ratio), height: 4)
            }
        }
        .padding(16)
    }

    private var queueDetail: String {
        guard let status = model.status else { return "服务未运行" }
        return "运行 \(status.queue.running) · 等待 \(status.queue.pending)"
    }

    // MARK: - Recent

    private var recentCard: some View {
        Card(padding: 0) {
            VStack(spacing: 0) {
                HStack {
                    Text("最近任务")
                        .font(.system(size: 13, weight: .semibold))
                    Spacer()
                    Button("查看全部") {
                        model.section = .history
                    }
                    .buttonStyle(.plain)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.secondary)
                }
                .padding(.horizontal, 18)
                .padding(.top, 15)
                .padding(.bottom, 10)

                if model.jobs.isEmpty {
                    HStack(spacing: 8) {
                        Text("还没有任务。打开 YouTube 视频，用插件生成一次字幕试试。")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.secondary)
                        Spacer()
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 16)
                } else {
                    Hairline()
                    VStack(spacing: 0) {
                        ForEach(Array(model.jobs.prefix(6).enumerated()), id: \.element.id) { index, job in
                            JobRow(job: job)
                                .padding(.horizontal, 18)
                            if index < min(6, model.jobs.count) - 1 {
                                Hairline().padding(.leading, 34)
                            }
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

}
