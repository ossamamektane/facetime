// "Quick Call" action for the Shortcuts app (and Back Tap): rings the quick call saved in the app,
// without opening it.
import AppIntents
internal import FakeCall

@available(iOS 16.0, *)
struct QuickCallIntent: AppIntent {
  static let title: LocalizedStringResource = "Quick Call"
  static let openAppWhenRun: Bool = false

  @MainActor
  func perform() async throws -> some IntentResult {
    FakeCallManager.shared.quickCall()
    return .result()
  }
}
