import AppKit

enum BrandAssets {
    /// Menu bar mark: two-triangle glyph, rendered as a template so macOS
    /// tints it for light/dark menu bars.
    static let menuBarIcon: NSImage? = {
        guard let url = Bundle.main.url(forResource: "MenuBarIcon", withExtension: "svg"),
              let image = NSImage(contentsOf: url) else { return nil }
        let height: CGFloat = 17 * 0.9
        let aspect = image.size.width / max(image.size.height, 1)
        image.size = NSSize(width: height * aspect, height: height)
        image.isTemplate = true
        return image
    }()

    /// Small brand mark used in the sidebar. Generated from the app icon at build time.
    static let appMark: NSImage? = {
        if let url = Bundle.main.url(forResource: "AppMark", withExtension: "png"),
           let image = NSImage(contentsOf: url) {
            return image
        }
        return NSImage(named: NSImage.applicationIconName)
    }()
}
