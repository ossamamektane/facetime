// Small hooks into the app's start-up:
// - a call planned before the app was closed is checked again when the app starts
// - tapping one of these calls in the Phone app's Recents calls that person with Apple's FaceTime
import ExpoModulesCore
import Intents
import UIKit

public class FakeCallAppDelegate: ExpoAppDelegateSubscriber {
  private static var pendingURL: URL?
  private static var observing = false

  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    DispatchQueue.main.async {
      FakeCallManager.shared.restore()
      FakeCallAppDelegate.observeActive()
    }
    return true
  }

  public func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    guard let url = FakeCallAppDelegate.callURL(userActivity) else { return false }
    FakeCallAppDelegate.pendingURL = url
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
      FakeCallAppDelegate.openPending()
    }
    return true
  }

  static func observeActive() {
    if observing { return }
    observing = true
    _ = NotificationCenter.default.addObserver(
      forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
    ) { _ in
      FakeCallAppDelegate.openPending()
      FakeCallManager.shared.restore()
    }
  }

  static func openPending() {
    guard let url = pendingURL, UIApplication.shared.applicationState == .active else { return }
    pendingURL = nil
    UIApplication.shared.open(url, options: [:], completionHandler: nil)
  }

  static func callURL(_ activity: NSUserActivity) -> URL? {
    guard let intent = activity.interaction?.intent as? INStartCallIntent,
      let value = intent.contacts?.first?.personHandle?.value
    else { return nil }
    var handle = ""
    if value.contains("@") {
      handle = value.trimmingCharacters(in: .whitespacesAndNewlines)
    } else {
      for ch in value where ch.isASCII && (ch.isNumber || ch == "+") {
        handle.append(ch)
      }
    }
    if handle.count < 3 { return nil }
    let encoded = handle.addingPercentEncoding(withAllowedCharacters: .urlUserAllowed) ?? handle
    return URL(string: "facetime-audio://" + encoded)
  }
}
