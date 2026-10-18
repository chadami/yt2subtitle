import Foundation
import Translation

struct HelperInput: Decodable {
    let source: String
    let target: String
    let texts: [String]?
}

struct HelperOutput: Encodable {
    let ok: Bool
    var status: String?
    var translations: [String]?
    var error: String?
}

@main
struct TranslateHelper {
    static func main() async {
        let output = await run()
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.withoutEscapingSlashes]
        if let data = try? encoder.encode(output), let text = String(data: data, encoding: .utf8) {
            print(text)
        } else {
            print(#"{"ok":false,"error":"encode_failed"}"#)
        }
    }

    static func run() async -> HelperOutput {
        let data = FileHandle.standardInput.readDataToEndOfFile()
        guard let input = try? JSONDecoder().decode(HelperInput.self, from: data) else {
            return HelperOutput(ok: false, error: "invalid_input")
        }

        guard #available(macOS 26.0, *) else {
            return HelperOutput(ok: false, status: "unsupported", error: "macos_version")
        }

        let source = Locale.Language(identifier: input.source)
        let target = Locale.Language(identifier: input.target)
        let availability = LanguageAvailability()
        let status = await availability.status(from: source, to: target)
        let statusText = describe(status)

        guard statusText != "unsupported" else {
            return HelperOutput(ok: false, status: statusText, error: "unsupported")
        }
        guard statusText == "installed" else {
            return HelperOutput(ok: false, status: statusText, error: "not_installed")
        }
        guard let texts = input.texts, !texts.isEmpty else {
            return HelperOutput(ok: true, status: statusText, translations: [])
        }

        let session = TranslationSession(installedSource: source, target: target)
        var translated: [String] = []
        translated.reserveCapacity(texts.count)

        // The framework works best with modest batches; keep order stable via clientIdentifier.
        let chunkSize = 40
        var index = 0
        while index < texts.count {
            let end = min(index + chunkSize, texts.count)
            let chunk = Array(texts[index..<end])
            let requests = chunk.enumerated().map { offset, text in
                TranslationSession.Request(sourceText: text, clientIdentifier: String(offset))
            }
            do {
                let responses = try await session.translations(from: requests)
                var byIndex: [Int: String] = [:]
                for response in responses {
                    guard let id = response.clientIdentifier, let position = Int(id) else { continue }
                    byIndex[position] = response.targetText
                }
                for offset in 0..<chunk.count {
                    translated.append(byIndex[offset] ?? chunk[offset])
                }
            } catch {
                return HelperOutput(ok: false, status: statusText, error: describeError(error))
            }
            index = end
        }

        return HelperOutput(ok: true, status: statusText, translations: translated)
    }

    @available(macOS 26.0, *)
    static func describe(_ status: LanguageAvailability.Status) -> String {
        switch status {
        case .installed: return "installed"
        case .supported: return "supported"
        case .unsupported: return "unsupported"
        @unknown default: return "unsupported"
        }
    }

    static func describeError(_ error: Error) -> String {
        let text = String(describing: error)
        if text.contains("notInstalled") { return "not_installed" }
        return text
    }
}
