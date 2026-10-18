#!/usr/bin/env swift
import AppKit

let size: CGFloat = 1024
let outputPath = CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : "AppIcon-1024.png"

let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()

guard let context = NSGraphicsContext.current?.cgContext else {
    fatalError("No graphics context")
}

let rect = CGRect(x: 0, y: 0, width: size, height: size)
let radius = size * 0.225
let path = CGPath(roundedRect: rect.insetBy(dx: size * 0.06, dy: size * 0.06),
                  cornerWidth: radius,
                  cornerHeight: radius,
                  transform: nil)

context.saveGState()
context.addPath(path)
context.clip()

let colors = [
    NSColor(srgbRed: 0.16, green: 0.40, blue: 0.96, alpha: 1).cgColor,
    NSColor(srgbRed: 0.44, green: 0.22, blue: 0.92, alpha: 1).cgColor
] as CFArray
let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1])!
context.drawLinearGradient(gradient,
                           start: CGPoint(x: 0, y: size),
                           end: CGPoint(x: size, y: 0),
                           options: [])

let glow = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                      colors: [
                        NSColor(white: 1, alpha: 0.28).cgColor,
                        NSColor(white: 1, alpha: 0).cgColor
                      ] as CFArray,
                      locations: [0, 1])!
context.drawRadialGradient(glow,
                           startCenter: CGPoint(x: size * 0.28, y: size * 0.82),
                           startRadius: 0,
                           endCenter: CGPoint(x: size * 0.28, y: size * 0.82),
                           endRadius: size * 0.55,
                           options: [])
context.restoreGState()

let config = NSImage.SymbolConfiguration(pointSize: size * 0.44, weight: .semibold)
if let symbol = NSImage(systemSymbolName: "captions.bubble.fill", accessibilityDescription: nil)?
    .withSymbolConfiguration(config) {
    let symbolSize = symbol.size
    let origin = CGPoint(x: (size - symbolSize.width) / 2, y: (size - symbolSize.height) / 2)
    let tinted = NSImage(size: symbolSize)
    tinted.lockFocus()
    NSColor.white.set()
    NSRect(origin: .zero, size: symbolSize).fill()
    symbol.draw(at: .zero, from: .zero, operation: .destinationIn, fraction: 1)
    tinted.unlockFocus()
    tinted.draw(at: origin, from: .zero, operation: .sourceOver, fraction: 1)
}

image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Failed to render icon")
}
try png.write(to: URL(fileURLWithPath: outputPath))
print("Wrote \(outputPath)")
