import Foundation
import Translation

struct HelperInput: Decodable {
    let source: String
    let target: String
    let texts: [String]?
    let stream: Bool?
}

struct HelperOutput: Encodable {
    let ok: Bool
    var status: String?
    var translations: [String]?
    var error: String?
    var index: Int?
    var done: Bool?
}

@main
struct TranslateHelper {
    static func main() async {
        let output = await run()
        emit(output)
    }

    static func emit(_ output: HelperOutput) {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.withoutEscapingSlashes]
        let data = (try? encoder.encode(output)) ?? Data(#"{"ok":false,"error":"encode_failed"}"#.utf8)
        FileHandle.standardOutput.write(data + Data([10]))
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
        if input.stream == true {
            for (index, text) in texts.enumerated() {
                do {
                    // One system request at a time; reuse the session rather
                    // than repeatedly launching/loading it for every cue.
                    let response = try await session.translate(text)
                    guard !response.targetText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                        return HelperOutput(ok: false, status: statusText, error: "incomplete_response")
                    }
                    emit(HelperOutput(ok: true, status: statusText, translations: [response.targetText], index: index))
                    // Keep an idle period even at helper batch boundaries.
                    try await Task.sleep(nanoseconds: 1_000_000_000)
                } catch {
                    return HelperOutput(ok: false, status: statusText, error: describeError(error))
                }
            }
            return HelperOutput(ok: true, status: statusText, done: true)
        }
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
                    guard let text = byIndex[offset], !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                        return HelperOutput(ok: false, status: statusText, error: "incomplete_response")
                    }
                    translated.append(text)
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
