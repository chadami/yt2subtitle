import SwiftUI

struct PageHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 20, weight: .semibold))
                .tracking(-0.3)
                .foregroundStyle(Theme.ink)
            Text(subtitle)
                .font(.caption)
                .foregroundStyle(Theme.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct SectionCard<Content: View>: View {
    var title: String?
    var subtitle: String?
    var padding: CGFloat = 18
    @ViewBuilder var content: () -> Content

    var body: some View {
        Card(padding: padding) {
            VStack(alignment: .leading, spacing: 14) {
                if title != nil || subtitle != nil {
                    SectionHeading(title: title ?? "", detail: subtitle)
                }
                content()
            }
        }
    }
}
