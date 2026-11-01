// What the app's screen (JavaScript) can ask the native part to do.
import ExpoModulesCore
import Foundation

public class FakeCallModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FakeCall")

    Events("onCallEvent")

    OnCreate {
      DispatchQueue.main.async {
        FakeCallManager.shared.onEvent = { [weak self] event in
          var body: [String: Any?] = [:]
          for (key, value) in event {
            body[key] = value
          }
          self?.sendEvent("onCallEvent", body)
        }
        FakeCallManager.shared.restore()
      }
    }

    // Plan a call: { name, handle, delay (seconds), cid, voice, hangup } -> { due, id, name }
    AsyncFunction("schedule") { (opts: [String: Any]) -> [String: Any] in
      return FakeCallManager.shared.schedule(opts)
    }.runOnQueue(.main)

    // Save the call that Back Tap / Shortcuts "Quick Call" plays
    AsyncFunction("saveQuick") { (opts: [String: Any]) -> [String: Any] in
      return FakeCallManager.shared.saveQuick(opts)
    }.runOnQueue(.main)

    AsyncFunction("cancel") { () -> Bool in
      return FakeCallManager.shared.cancel()
    }.runOnQueue(.main)

    AsyncFunction("status") { () -> [String: Any] in
      return FakeCallManager.shared.status()
    }.runOnQueue(.main)

    AsyncFunction("deleteHistory") { (at: Double) -> Bool in
      return FakeCallManager.shared.deleteHistory(at)
    }.runOnQueue(.main)

    // Microphone (needed for the call audio) + notifications (missed calls)
    AsyncFunction("requestPermissions") { (promise: Promise) in
      FakeCallManager.shared.requestPermissions { result in
        promise.resolve(result)
      }
    }.runOnQueue(.main)

    // Sound files sent over by the page, in pieces
    Function("fileSize") { (name: String) -> Double in
      return FakeCallManager.shared.fileSize(name)
    }

    AsyncFunction("writeChunk") { (name: String, data: String, append: Bool, last: Bool) throws -> Bool in
      return try FakeCallManager.shared.writeChunk(name, data, append, last)
    }
  }
}
