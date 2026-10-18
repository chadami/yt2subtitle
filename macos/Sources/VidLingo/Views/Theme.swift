import AppKit
import SwiftUI

extension Color {
    static func adaptive(light: NSColor, dark: NSColor) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
            return isDark ? dark : light
        })
    }
}

enum Theme {
    // Surfaces
    static let sidebar = Color.adaptive(
        light: NSColor(srgbRed: 0.969, green: 0.969, blue: 0.976, alpha: 1),
        dark: NSColor(srgbRed: 0.098, green: 0.098, blue: 0.106, alpha: 1)
    )
    static let canvas = Color.adaptive(light: .white, dark: NSColor(srgbRed: 0.125, green: 0.125, blue: 0.133, alpha: 1))
    static let card = Color.adaptive(light: .white, dark: NSColor(srgbRed: 0.145, green: 0.145, blue: 0.153, alpha: 1))
    static let field = Color.adaptive(
        light: NSColor(srgbRed: 0.976, green: 0.976, blue: 0.984, alpha: 1),
        dark: NSColor(srgbRed: 0.176, green: 0.176, blue: 0.188, alpha: 1)
    )
    static let fill = Color.adaptive(
        light: NSColor(srgbRed: 0.945, green: 0.945, blue: 0.953, alpha: 1),
        dark: NSColor(srgbRed: 0.196, green: 0.196, blue: 0.208, alpha: 1)
    )

    // Lines
    static let border = Color.adaptive(
        light: NSColor(white: 0, alpha: 0.075),
        dark: NSColor(white: 1, alpha: 0.11)
    )
    static let hairline = Color.adaptive(
        light: NSColor(white: 0, alpha: 0.06),
        dark: NSColor(white: 1, alpha: 0.09)
    )

    // Text
    static let ink = Color.primary
    static let secondary = Color(nsColor: .secondaryLabelColor)
    static let tertiary = Color(nsColor: .tertiaryLabelColor)

    // Data accents, used sparingly
    static let green = Color.adaptive(
        light: NSColor(srgbRed: 0.122, green: 0.639, blue: 0.357, alpha: 1),
        dark: NSColor(srgbRed: 0.243, green: 0.780, blue: 0.478, alpha: 1)
    )
    static let purple = Color.adaptive(
        light: NSColor(srgbRed: 0.424, green: 0.361, blue: 0.906, alpha: 1),
        dark: NSColor(srgbRed: 0.545, green: 0.494, blue: 0.953, alpha: 1)
    )
    static let teal = Color.adaptive(
        light: NSColor(srgbRed: 0.169, green: 0.796, blue: 0.729, alpha: 1),
        dark: NSColor(srgbRed: 0.259, green: 0.878, blue: 0.812, alpha: 1)
    )

    static let accent = purple
}

extension Font {
    /// Large data numerals: tight, semibold, tabular.
    static func metric(_ size: CGFloat) -> Font {
        .system(size: size, weight: .semibold, design: .default)
    }

    static let label = Font.system(size: 12)
    static let caption = Font.system(size: 11.5)
    static let rowTitle = Font.system(size: 12.5, weight: .medium)
}

struct Card<Content: View>: View {
    var padding: CGFloat = 18
    var radius: CGFloat = 13
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(Theme.card)
            )
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(Theme.border, lineWidth: 1)
            )
    }
}

struct Hairline: View {
    var vertical = false

    var body: some View {
        Rectangle()
            .fill(Theme.hairline)
            .frame(width: vertical ? 1 : nil, height: vertical ? nil : 1)
    }
}

struct SectionHeading: View {
    let title: String
    var detail: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.ink)
            if let detail {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(Theme.secondary)
            }
        }
    }
}

struct MetricCell: View {
    let label: String
    let value: String
    var unit: String?
    var detail: String?
    var valueColor: Color = Theme.ink

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 11.5))
                .foregroundStyle(Theme.secondary)

            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text(value)
                    .font(.metric(28))
                    .tracking(-0.6)
                    .monospacedDigit()
                    .foregroundStyle(valueColor)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let unit {
                    Text(unit)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.tertiary)
                }
            }

            if let detail {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(Theme.secondary)
                    .lineLimit(2)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct MetricTile: View {
    let title: String
    let value: String
    var detail: String?
    var icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                Image(systemName: icon)
                    .font(.system(size: 10.5, weight: .medium))
                Text(title)
                    .font(.system(size: 11.5))
            }
            .foregroundStyle(Theme.secondary)

            Text(value)
                .font(.system(size: 20, weight: .semibold))
                .tracking(-0.3)
                .lineLimit(1)

            if let detail {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(Theme.tertiary)
                    .lineLimit(1)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Theme.field)
        )
    }
}

struct StatusPill: View {
    let state: ServerController.State
    let port: Int

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
            Text("\(state.label) · :\(port)")
                .font(.system(size: 11))
                .foregroundStyle(Theme.secondary)
                .monospacedDigit()
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 4)
        .background(
            Capsule().fill(Theme.field)
        )
        .overlay(
            Capsule().stroke(Theme.hairline, lineWidth: 1)
        )
    }

    private var color: Color {
        switch state {
        case .running: return Theme.green
        case .starting: return .orange
        case .failed: return .red
        case .stopped: return Theme.tertiary
        }
    }
}

struct StepRow: View {
    let index: Int
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 11) {
            Text("\(index)")
                .font(.system(size: 10.5, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Theme.ink)
                .frame(width: 18, height: 18)
                .background(Circle().fill(Theme.fill))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 12.5, weight: .medium))
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(Theme.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct KeyValueRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(.system(size: 11.5))
                .foregroundStyle(Theme.secondary)
                .frame(width: 70, alignment: .leading)
            Text(value)
                .font(.system(size: 11.5, design: .monospaced))
                .foregroundStyle(Theme.ink)
                .textSelection(.enabled)
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer(minLength: 0)
        }
    }
}

struct JobRow: View {
    let job: JobSummary

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
            VStack(alignment: .leading, spacing: 2) {
                Text(job.title?.isEmpty == false ? job.title! : "未命名视频")
                    .font(.system(size: 12))
                    .lineLimit(1)
                Text("\(job.sourceLang ?? "?") → \(job.targetLang ?? "?") · \(job.statusLabel)")
                    .font(.system(size: 10.5))
                    .foregroundStyle(Theme.secondary)
            }
            Spacer(minLength: 0)
            if let createdAt = job.createdAt, let date = ISO8601DateFormatter().date(from: createdAt) {
                Text(relative(date))
                    .font(.system(size: 10.5))
                    .foregroundStyle(Theme.tertiary)
                    .monospacedDigit()
            }
        }
        .padding(.vertical, 8)
    }

    private var color: Color {
        switch job.status {
        case "completed": return Theme.green
        case "failed": return .red
        case "cancelled": return Theme.tertiary
        default: return .orange
        }
    }

    private func relative(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: "zh_Hans_CN")
        formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

struct PillSegmented<Value: Hashable>: View {
    let items: [(value: Value, title: String)]
    var disabledValues: Set<Value> = []
    @Binding var selection: Value

    var body: some View {
        HStack(spacing: 2) {
            ForEach(items, id: \.value) { item in
                Button {
                    selection = item.value
                } label: {
                    Text(item.title)
                        .font(.system(size: 12, weight: selection == item.value ? .semibold : .regular))
                        .foregroundStyle(selection == item.value ? Theme.ink : Theme.secondary)
                        .padding(.horizontal, 12)
                        .frame(height: 26)
                        .background(
                            Group {
                                if selection == item.value {
                                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                                        .fill(Theme.card)
                                        .shadow(color: .black.opacity(0.06), radius: 2, y: 1)
                                }
                            }
                        )
                }
                .buttonStyle(.plain)
                .disabled(disabledValues.contains(item.value))
                .opacity(disabledValues.contains(item.value) ? 0.45 : 1)
            }
        }
        .padding(2)
        .background(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(Theme.fill)
        )
    }
}

struct FlatButtonStyle: ButtonStyle {
    var prominent = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(prominent ? Color.white : Theme.ink)
            .padding(.horizontal, 13)
            .frame(height: 30)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(prominent ? Theme.ink.opacity(configuration.isPressed ? 0.78 : 1) : Theme.card)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(prominent ? Color.clear : Theme.border, lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.9 : 1)
    }
}

extension View {
    @ViewBuilder
    func flatButton(_ prominent: Bool = false) -> some View {
        buttonStyle(FlatButtonStyle(prominent: prominent))
    }
}
