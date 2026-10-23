import SwiftUI

struct StopJobButton: View {
    @EnvironmentObject private var model: AppModel
    let job: JobSummary

    var body: some View {
        if job.canStop {
            Button(model.stoppingJobIDs.contains(job.id) ? "停止中…" : "停止任务", systemImage: "stop.circle") {
                model.stopJob(job)
            }
            .buttonStyle(.borderless)
            .controlSize(.small)
            .disabled(model.stoppingJobIDs.contains(job.id) || !model.server.isRunning)
            .help("停止翻译，保留已生成的字幕")
        }
    }
}
