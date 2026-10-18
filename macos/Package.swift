// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "VidLingo",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "VidLingo", targets: ["VidLingo"]),
        .executable(name: "vidlingo-translate", targets: ["TranslateCLI"])
    ],
    targets: [
        .executableTarget(
            name: "VidLingo",
            path: "Sources/VidLingo",
            linkerSettings: [
                .unsafeFlags(["-weak_framework", "Translation"])
            ]
        ),
        .executableTarget(
            name: "TranslateCLI",
            path: "Sources/TranslateCLI",
            linkerSettings: [
                .unsafeFlags(["-weak_framework", "Translation"])
            ]
        )
    ],
    swiftLanguageVersions: [.v5]
)
