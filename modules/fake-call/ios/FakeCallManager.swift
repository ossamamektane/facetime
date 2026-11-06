// The heart of the app: plans a call, then makes it ring on the real iPhone call screen (CallKit),
// so it looks and vibrates exactly like a real call, on the lock screen too.
// Ringtone: your own (a file or a link picked in the app, played by the app itself, so it also rings
// on silent) or the iPhone's own ringtone (follows the silent switch).
// When you answer, the voice recording plays; when it ends, the hang-up sound plays and the call ends.
// The app's own call screen (speaker / mute / keypad / end) talks to the call through here too.
import AudioToolbox
import AVFoundation
import CallKit
import Foundation
import UIKit
import UserNotifications

enum FakeCallError: Error {
  case badName
  case badData
}

public final class FakeCallManager: NSObject, @unchecked Sendable {
  public static let shared = FakeCallManager()

  /// Call events for the app's screen: scheduled / cancelled / ringing / answered / ended / missed / failed
  public var onEvent: (([String: Any]) -> Void)?

  private let store = UserDefaults.standard
  private let kPending = "fc.pending"
  private let kQuick = "fc.quick"
  private let kHistory = "fc.history"
  private let kRingFail = "fc.ringFail" // a ringtone iPhone wouldn't let the app play during a call
  private static let quietTone = "fc-quiet.caf" // silent, inside the app: iPhone rings with it while the app plays your ringtone
  private static let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-")

  private var provider: CXProvider?
  private var quietConfig = false
  private lazy var controller = CXCallController()

  // waiting for a planned call
  private var timer: DispatchSourceTimer?
  private var watchdog: Timer?
  private var waitTask: UIBackgroundTaskIdentifier = .invalid
  private var keepPlayer: AVAudioPlayer?
  private var keepAlive = false
  private var observing = false

  // the call itself
  private enum Phase {
    case idle, ringing, waiting, voice, hangup
  }
  private var phase: Phase = .idle
  private var callId: UUID?
  private var callInfo: [String: Any] = [:]
  private var answeredAt: Date?
  private var audioActive = false
  // Keep the requested route while CallKit activates or the route settles.
  private var pendingSpeaker: Bool?
  private var speakerRequest = 0
  private var onHold = false
  private var callTask: UIBackgroundTaskIdentifier = .invalid
  private var ringTimeout: DispatchWorkItem?
  private var voiceStart: DispatchWorkItem?
  private var hangFallback: DispatchWorkItem?
  private var voicePlayer: AVAudioPlayer?
  private var hangPlayer: AVAudioPlayer?
  private var ringPlayer: AVAudioPlayer?
  private var ringKey = ""
  private var ringRetry: DispatchWorkItem?
  private var muted = false

  private override init() {
    super.init()
    // Older versions could permanently block a valid sound after a brief interruption.
    if !store.bool(forKey: "fc.ringFailMigration1") {
      store.removeObject(forKey: kRingFail)
      store.set(true, forKey: "fc.ringFailMigration1")
    }
    UNUserNotificationCenter.current().delegate = self
  }

  // MARK: - Plan / cancel

  @discardableResult
  public func schedule(_ opts: [String: Any]) -> [String: Any] {
    forgetRingFail(opts)
    var info = clean(opts)
    let delay = clampDelay(opts["delay"])
    let id = UUID().uuidString
    let due = nowMs() + delay * 1000
    info["id"] = id
    info["due"] = due
    dropPending()
    if store.dictionary(forKey: kQuick) == nil {
      var quick = clean(opts)
      quick["delay"] = delay
      store.set(quick, forKey: kQuick)
    }
    let name = info["name"] as? String ?? ""
    if delay < 0.3 {
      fire(info)
    } else {
      store.set(info, forKey: kPending)
      scheduleMissedNotice(info, at: due + 6000)
      arm(info)
      emit(["type": "scheduled", "due": due, "name": name])
    }
    let result: [String: Any] = ["due": due, "id": id, "name": name]
    return result
  }

  @discardableResult
  public func cancel() -> Bool {
    let had = store.dictionary(forKey: kPending) != nil
    dropPending()
    stopKeepAlive()
    endWait()
    emit(["type": "cancelled"])
    return had
  }

  @discardableResult
  public func saveQuick(_ opts: [String: Any]) -> [String: Any] {
    forgetRingFail(opts)
    var quick = clean(opts)
    let delay = clampDelay(opts["delay"])
    quick["delay"] = delay
    store.set(quick, forKey: kQuick)
    let result: [String: Any] = ["name": quick["name"] as? String ?? "", "delay": delay]
    return result
  }

  // a ringtone you just picked gets a fresh try, even if iPhone stopped one before
  private func forgetRingFail(_ opts: [String: Any]) {
    if let fresh = opts["ringNew"] as? Bool, fresh {
      store.removeObject(forKey: kRingFail)
    }
  }

  /// Back Tap / Shortcuts "Quick Call": plays the saved quick call.
  public func quickCall() {
    guard let quick = store.dictionary(forKey: kQuick) else { return }
    schedule(quick)
  }

  /// After a launch or a call: picks up a planned call again (or logs it as missed if it's too late).
  public func restore() {
    guard callId == nil, let pending = store.dictionary(forKey: kPending) else { return }
    let late = nowMs() - num(pending["due"])
    if late > 4000 {
      lateMiss(pending)
    } else if late >= -400 {
      fire(pending)
    } else if timer == nil {
      arm(pending)
    }
  }

  public func status() -> [String: Any] {
    var result: [String: Any] = [:]
    result["inCall"] = callId != nil
    result["lang"] = lang()
    result["h24"] = uses24h()
    if let pending = store.dictionary(forKey: kPending) {
      let p: [String: Any] = ["due": num(pending["due"]), "name": pending["name"] as? String ?? ""]
      result["pending"] = p
    }
    if let quick = store.dictionary(forKey: kQuick) {
      let q: [String: Any] = ["name": quick["name"] as? String ?? "", "delay": num(quick["delay"])]
      result["quick"] = q
    }
    result["history"] = history()
    if let call = callState() {
      result["call"] = call
    }
    result["ringFail"] = store.string(forKey: kRingFail) ?? ""
    return result
  }

  /// The call going on right now, for the app's own call screen.
  private func callState() -> [String: Any]? {
    guard callId != nil else { return nil }
    var c: [String: Any] = [:]
    c["name"] = callInfo["name"] as? String ?? ""
    c["handle"] = callInfo["handle"] as? String ?? ""
    c["state"] = phase == .ringing ? "ringing" : "active"
    if let at = answeredAt {
      c["answeredAt"] = at.timeIntervalSince1970 * 1000
    }
    c["muted"] = muted
    c["speaker"] = phase != .ringing ? (pendingSpeaker ?? (audioActive && speakerOn())) : false
    c["held"] = onHold
    return c
  }

  // MARK: - The app's own call screen: end / mute / speaker / keypad

  public func endCall(_ done: @escaping (Bool) -> Void) {
    guard let uuid = callId else {
      done(false)
      return
    }
    controller.request(CXTransaction(action: CXEndCallAction(call: uuid))) { [weak self] error in
      DispatchQueue.main.async {
        guard let self = self else { return }
        if error != nil, self.callId == uuid {
          self.getProvider().reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
          self.finishCall(missed: self.phase == .ringing, event: "ended")
        }
        done(true)
      }
    }
  }

  public func setMuted(_ on: Bool, _ done: @escaping (Bool) -> Void) {
    guard let uuid = callId, phase != .ringing else {
      done(false)
      return
    }
    controller.request(CXTransaction(action: CXSetMutedCallAction(call: uuid, muted: on))) { [weak self] error in
      DispatchQueue.main.async {
        guard let self = self else { return }
        if error != nil, self.callId == uuid {
          // iOS didn't take it: the app's screen still shows it (the voice is a recording anyway)
          self.muted = on
          self.emit(["type": "muted", "muted": on])
        }
        done(true)
      }
    }
  }

  @discardableResult
  public func setSpeaker(_ on: Bool) -> Bool {
    guard callId != nil, phase != .ringing else { return false }
    speakerRequest &+= 1
    pendingSpeaker = on
    // If the user taps before CallKit activates audio, apply it upon activation.
    guard audioActive else { return true }
    return applyPendingSpeaker()
  }

  @discardableResult
  private func applyPendingSpeaker() -> Bool {
    guard audioActive, let desired = pendingSpeaker, let uuid = callId else { return false }
    let request = speakerRequest
    do {
      try AVAudioSession.sharedInstance().overrideOutputAudioPort(desired ? .speaker : .none)
    } catch {
      pendingSpeaker = nil
      emit(["type": "route", "speaker": speakerOn()])
      return false
    }
    // The route notification may arrive before currentRoute has settled.
    // Show the actual route after a short delay, not an old intermediate route.
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
      guard let self = self, self.callId == uuid, self.speakerRequest == request,
        self.pendingSpeaker != nil, self.audioActive else { return }
      self.pendingSpeaker = nil
      self.emit(["type": "route", "speaker": self.speakerOn()])
    }
    return true
  }

  /// The keypad's key tones (same ones as the iPhone's call keypad).
  public func playDigit(_ key: String) {
    let tones: [String: UInt32] = [
      "0": 1200, "1": 1201, "2": 1202, "3": 1203, "4": 1204, "5": 1205,
      "6": 1206, "7": 1207, "8": 1208, "9": 1209, "*": 1210, "#": 1211,
    ]
    guard let id = tones[key] else { return }
    AudioServicesPlaySystemSound(SystemSoundID(id))
  }

  private func speakerOn() -> Bool {
    return AVAudioSession.sharedInstance().currentRoute.outputs.contains { $0.portType == .builtInSpeaker }
  }

  @discardableResult
  public func deleteHistory(_ at: Double) -> Bool {
    let list = history()
    let kept = list.filter { abs(num($0["at"]) - at) > 0.5 }
    store.set(kept, forKey: kHistory)
    return kept.count != list.count
  }

  public func requestPermissions(_ done: @escaping ([String: Any]) -> Void) {
    let askNotifications: (Bool) -> Void = { mic in
      UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { ok, _ in
        DispatchQueue.main.async {
          done(["mic": mic, "notifications": ok])
        }
      }
    }
    if #available(iOS 17.0, *) {
      AVAudioApplication.requestRecordPermission { ok in
        DispatchQueue.main.async { askNotifications(ok) }
      }
    } else {
      AVAudioSession.sharedInstance().requestRecordPermission { ok in
        DispatchQueue.main.async { askNotifications(ok) }
      }
    }
  }

  // MARK: - Sound files

  public func fileSize(_ name: String) -> Double {
    let n = safeName(name)
    if n.isEmpty { return -1 }
    guard let url = soundDir()?.appendingPathComponent(n),
      let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
      let size = attrs[.size] as? NSNumber
    else { return -1 }
    return size.doubleValue
  }

  public func writeChunk(_ name: String, _ base64: String, _ append: Bool, _ last: Bool) throws -> Bool {
    let n = safeName(name)
    if n.isEmpty { throw FakeCallError.badName }
    guard let data = Data(base64Encoded: base64, options: [.ignoreUnknownCharacters]) else { throw FakeCallError.badData }
    guard let dir = soundDir() else { throw FakeCallError.badName }
    let fm = FileManager.default
    let part = dir.appendingPathComponent(n + ".part")
    if !append || !fm.fileExists(atPath: part.path) {
      try? fm.removeItem(at: part)
      try data.write(to: part)
    } else {
      let handle = try FileHandle(forWritingTo: part)
      defer { try? handle.close() }
      _ = try handle.seekToEnd()
      try handle.write(contentsOf: data)
    }
    if last {
      let dest = dir.appendingPathComponent(n)
      try? fm.removeItem(at: dest)
      try fm.moveItem(at: part, to: dest)
    }
    return true
  }

  private func soundDir() -> URL? {
    let fm = FileManager.default
    guard let base = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
    let dir = base.appendingPathComponent("FakeCallSounds", isDirectory: true)
    if !fm.fileExists(atPath: dir.path) {
      try? fm.createDirectory(at: dir, withIntermediateDirectories: true, attributes: nil)
    }
    return dir
  }

  private func soundURL(_ name: String) -> URL? {
    let n = safeName(name)
    if n.isEmpty { return nil }
    guard let url = soundDir()?.appendingPathComponent(n) else { return nil }
    return FileManager.default.fileExists(atPath: url.path) ? url : nil
  }

  // MARK: - Waiting for the planned time

  private func arm(_ info: [String: Any]) {
    disarm()
    let wait = max(0, (num(info["due"]) - nowMs()) / 1000)
    let t = DispatchSource.makeTimerSource(queue: DispatchQueue.main)
    t.schedule(wallDeadline: .now() + wait, leeway: .milliseconds(20))
    t.setEventHandler { [weak self] in
      self?.check()
    }
    t.resume()
    timer = t
    let w = Timer(timeInterval: 2, repeats: true) { [weak self] _ in
      self?.check()
    }
    RunLoop.main.add(w, forMode: .common)
    watchdog = w
    beginWait()
    startKeepAlive()
  }

  private func disarm() {
    timer?.cancel()
    timer = nil
    watchdog?.invalidate()
    watchdog = nil
  }

  private func check() {
    guard let pending = store.dictionary(forKey: kPending) else {
      disarm()
      return
    }
    let late = nowMs() - num(pending["due"])
    if late < -400 { return }
    if late <= 4000 {
      fire(pending)
    } else {
      lateMiss(pending)
    }
  }

  private func dropPending() {
    if let pending = store.dictionary(forKey: kPending), let id = pending["id"] as? String {
      UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["fc.missed." + id])
    }
    store.removeObject(forKey: kPending)
    disarm()
  }

  /// The phone kept the app asleep past the planned time: it counts as a missed call
  /// (the "Missed Call" notice planned with it shows up by itself).
  private func lateMiss(_ pending: [String: Any]) {
    store.removeObject(forKey: kPending)
    disarm()
    addHistory(pending, dur: 0, missed: true)
    stopKeepAlive()
    endWait()
    emit(["type": "missed", "name": pending["name"] as? String ?? ""])
  }

  private func beginWait() {
    guard waitTask == .invalid else { return }
    waitTask = UIApplication.shared.beginBackgroundTask(withName: "fc.wait") { [weak self] in
      self?.endWait()
    }
  }

  private func endWait() {
    guard waitTask != .invalid else { return }
    let task = waitTask
    waitTask = .invalid
    UIApplication.shared.endBackgroundTask(task)
  }

  private func beginCallTask() {
    guard callTask == .invalid else { return }
    callTask = UIApplication.shared.beginBackgroundTask(withName: "fc.call") { [weak self] in
      self?.endCallTask()
    }
  }

  private func endCallTask() {
    guard callTask != .invalid else { return }
    let task = callTask
    callTask = .invalid
    UIApplication.shared.endBackgroundTask(task)
  }

  // Keeps the app awake in the background until the call time: silent audio, mixed with your music.
  private func startKeepAlive() {
    guard callId == nil else { return }
    observeAudio()
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
      try session.setActive(true, options: [])
    } catch {}
    if keepPlayer == nil, let player = try? AVAudioPlayer(data: FakeCallManager.silence()) {
      player.numberOfLoops = -1
      player.volume = 0.01
      player.prepareToPlay()
      keepPlayer = player
    }
    keepPlayer?.play()
    keepAlive = true
  }

  private func stopKeepAlive() {
    let was = keepAlive || keepPlayer != nil
    keepAlive = false
    keepPlayer?.stop()
    keepPlayer = nil
    if was && callId == nil {
      try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }
  }

  private func observeAudio() {
    if observing { return }
    observing = true
    let nc = NotificationCenter.default
    nc.addObserver(self, selector: #selector(audioInterrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
    nc.addObserver(self, selector: #selector(mediaReset(_:)), name: AVAudioSession.mediaServicesWereResetNotification, object: nil)
    nc.addObserver(self, selector: #selector(routeChanged(_:)), name: AVAudioSession.routeChangeNotification, object: nil)
  }

  // speaker / AirPods switched (from the app's screen, the iPhone call screen or Control Center)
  @objc private func routeChanged(_ note: Notification) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self, self.callId != nil, self.phase != .ringing,
        self.audioActive, self.pendingSpeaker == nil else { return }
      self.emit(["type": "route", "speaker": self.speakerOn()])
    }
  }

  @objc private func audioInterrupted(_ note: Notification) {
    let raw = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? NSNumber)?.uintValue ?? 0
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      if self.ringPlayer != nil && self.phase == .ringing {
        self.ringInterrupted(began: raw == AVAudioSession.InterruptionType.began.rawValue)
        return
      }
      guard self.keepAlive, self.callId == nil else { return }
      if raw == AVAudioSession.InterruptionType.ended.rawValue {
        self.keepPlayer?.stop()
        self.keepPlayer = nil
        self.startKeepAlive()
      }
    }
  }

  @objc private func mediaReset(_ note: Notification) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      if self.ringPlayer != nil {
        self.ringPlayer = nil
        self.ringRetry?.cancel()
        self.ringRetry = nil
        if self.phase == .ringing, let uuid = self.callId,
          !self.ringKey.isEmpty, let url = self.soundURL(self.ringKey) {
          // Recreate players invalidated by the audio service reset.
          if !self.startRing(url) {
            let work = DispatchWorkItem { [weak self] in
              guard let self = self, self.callId == uuid, self.phase == .ringing,
                self.ringPlayer == nil else { return }
              self.ringRetry = nil
              _ = self.startRing(url)
            }
            self.ringRetry = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: work)
          }
        }
      }
      guard self.keepAlive, self.callId == nil else { return }
      self.keepPlayer = nil
      self.startKeepAlive()
    }
  }

  // 1 second of silence (8 kHz, 16-bit mono WAV)
  private static func silence() -> Data {
    let rate: UInt32 = 8000
    let bytes: UInt32 = rate * 2
    var d = Data()
    func u32(_ v: UInt32) {
      var x = v.littleEndian
      withUnsafeBytes(of: &x) { d.append(contentsOf: $0) }
    }
    func u16(_ v: UInt16) {
      var x = v.littleEndian
      withUnsafeBytes(of: &x) { d.append(contentsOf: $0) }
    }
    d.append(contentsOf: Array("RIFF".utf8))
    u32(36 + bytes)
    d.append(contentsOf: Array("WAVE".utf8))
    d.append(contentsOf: Array("fmt ".utf8))
    u32(16)
    u16(1)
    u16(1)
    u32(rate)
    u32(rate * 2)
    u16(2)
    u16(16)
    d.append(contentsOf: Array("data".utf8))
    u32(bytes)
    d.append(Data(count: Int(bytes)))
    return d
  }

  // MARK: - The call

  private func getProvider() -> CXProvider {
    if let p = provider { return p }
    let p = CXProvider(configuration: makeConfig(quiet: false))
    p.setDelegate(self, queue: nil)
    provider = p
    quietConfig = false
    return p
  }

  // quiet = iPhone rings with a silent sound (the app plays your own ringtone);
  // otherwise it rings with the iPhone's own ringtone
  private func makeConfig(quiet: Bool) -> CXProviderConfiguration {
    let config = CXProviderConfiguration()
    config.supportsVideo = false
    config.maximumCallGroups = 1
    config.maximumCallsPerCallGroup = 1
    config.supportedHandleTypes = [.phoneNumber, .emailAddress, .generic]
    config.includesCallsInRecents = true
    config.iconTemplateImageData = FakeCallManager.templateIcon()
    if quiet {
      config.ringtoneSound = FakeCallManager.quietTone
    }
    return config
  }

  private func useQuietRing(_ quiet: Bool) {
    let p = getProvider()
    if quietConfig == quiet { return }
    p.configuration = makeConfig(quiet: quiet)
    quietConfig = quiet
  }

  private static func hasQuietTone() -> Bool {
    return Bundle.main.url(forResource: "fc-quiet", withExtension: "caf") != nil
  }

  // MARK: - Your own ringtone

  private func startRing(_ url: URL) -> Bool {
    observeAudio()
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
      try session.setActive(true, options: [])
    } catch {
      return false
    }
    guard let player = try? AVAudioPlayer(contentsOf: url) else { return false }
    player.numberOfLoops = -1
    player.volume = 1
    player.prepareToPlay()
    guard player.play() else { return false }
    ringPlayer = player
    return true
  }

  /// release: hand the sound back (only when the call itself isn't using it).
  /// false = the sound was still busy and couldn't be handed back yet
  @discardableResult
  private func stopRing(release: Bool, notify: Bool) -> Bool {
    ringRetry?.cancel()
    ringRetry = nil
    guard let player = ringPlayer else { return true }
    ringPlayer = nil
    player.stop()
    if release && !audioActive {
      do {
        try AVAudioSession.sharedInstance().setActive(false, options: notify ? [.notifyOthersOnDeactivation] : [])
      } catch {
        return false
      }
    }
    return true
  }

  // A temporary interruption is not evidence that the sound file is bad.
  // Resume only after the interruption ends and only for the same ringing call.
  private func ringInterrupted(began: Bool) {
    guard let uuid = callId, let player = ringPlayer else { return }
    ringRetry?.cancel()
    ringRetry = nil
    guard !began else { return }
    if resumeRing(player) { return }
    let work = DispatchWorkItem { [weak self] in
      guard let self = self, self.callId == uuid, self.phase == .ringing,
        let p = self.ringPlayer, p === player else { return }
      self.ringRetry = nil
      _ = self.resumeRing(p)
    }
    ringRetry = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: work)
  }

  private func resumeRing(_ player: AVAudioPlayer) -> Bool {
    do {
      try AVAudioSession.sharedInstance().setActive(true, options: [])
    } catch {
      return false
    }
    return player.isPlaying || player.play()
  }

  private func ringBlocked(_ key: String) {
    if !key.isEmpty {
      store.set(key, forKey: kRingFail)
    }
    emit(["type": "ringBlocked"])
  }

  // the little camera (same as the app icon) shown on the call screen's app button
  private static func templateIcon() -> Data? {
    let conf = UIImage.SymbolConfiguration(pointSize: 26, weight: .regular)
    guard let symbol = UIImage(systemName: "video.fill", withConfiguration: conf)?
      .withTintColor(.black, renderingMode: .alwaysOriginal)
    else { return nil }
    let size = CGSize(width: 40, height: 40)
    let image = UIGraphicsImageRenderer(size: size).image { _ in
      let s = symbol.size
      symbol.draw(in: CGRect(x: (size.width - s.width) / 2, y: (size.height - s.height) / 2, width: s.width, height: s.height))
    }
    return image.pngData()
  }

  private func handle(for info: [String: Any]) -> CXHandle {
    let raw = (info["handle"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if raw.contains("@") && raw.count >= 3 {
      return CXHandle(type: .emailAddress, value: raw.lowercased())
    }
    var digits = ""
    for ch in raw where ch.isASCII && ch.isNumber {
      digits.append(ch)
    }
    if digits.count >= 3 {
      if raw.hasPrefix("+") { return CXHandle(type: .phoneNumber, value: "+" + digits) }
      if digits.hasPrefix("00") { return CXHandle(type: .phoneNumber, value: "+" + String(digits.dropFirst(2))) }
      return CXHandle(type: .phoneNumber, value: digits)
    }
    let name = info["name"] as? String ?? ""
    return CXHandle(type: .generic, value: name.isEmpty ? "Unknown" : name)
  }

  private func fire(_ info: [String: Any]) {
    disarm()
    store.removeObject(forKey: kPending)
    if let id = info["id"] as? String {
      UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["fc.missed." + id])
    }
    if callId != nil { // already in a call
      addHistory(info, dur: 0, missed: true)
      endWait()
      return
    }
    beginCallTask()
    endWait()
    // your own ringtone (played by the app; iPhone rings with a silent sound meanwhile)
    let ring = info["ring"] as? String ?? ""
    var ringURL: URL? = nil
    if !ring.isEmpty && ring != (store.string(forKey: kRingFail) ?? "") {
      if FakeCallManager.hasQuietTone(), let url = soundURL(ring),
        let probe = try? AVAudioPlayer(contentsOf: url), probe.duration.isFinite, probe.duration > 0 {
        ringURL = url
      } else {
        // An unreadable sound or missing bundle resource must not make CallKit ring silently.
        ringBlocked(ring)
      }
    }
    if ringURL == nil {
      stopKeepAlive() // iPhone's own ringtone: the app hands the sound back first
    }
    observeAudio()
    useQuietRing(ringURL != nil)
    let uuid = UUID()
    callId = uuid
    callInfo = info
    phase = .ringing
    answeredAt = nil
    onHold = false
    muted = false
    ringKey = ringURL != nil ? ring : ""
    let name = info["name"] as? String ?? ""
    let update = CXCallUpdate()
    update.remoteHandle = handle(for: info)
    update.localizedCallerName = name.isEmpty ? nil : name
    update.hasVideo = false
    update.supportsHolding = true
    update.supportsDTMF = true
    update.supportsGrouping = false
    update.supportsUngrouping = false
    getProvider().reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
      let code = error.map { ($0 as NSError).code }
      DispatchQueue.main.async {
        guard let self = self else { return }
        if let code = code {
          // 3 = Focus / Do Not Disturb, 4 = blocked number
          if self.callId == uuid {
            self.callId = nil
            self.callInfo = [:]
            self.phase = .idle
            self.ringKey = ""
          }
          self.addHistory(info, dur: 0, missed: true)
          if code != 4 { self.postMissed(info) }
          self.keepAlive = false
          self.keepPlayer?.stop()
          self.keepPlayer = nil
          if ringURL != nil {
            try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
          }
          self.emit(["type": "failed", "code": code, "name": name])
          self.endCallTask()
          self.restore()
          return
        }
        let live = self.callId == uuid && self.phase == .ringing
        if let url = ringURL {
          let ok = live && self.startRing(url)
          self.keepAlive = false
          self.keepPlayer?.stop()
          self.keepPlayer = nil
          if !ok && !self.audioActive {
            try? AVAudioSession.sharedInstance().setActive(false, options: live ? [] : [.notifyOthersOnDeactivation])
          }
          if live && !ok {
            self.ringKey = ""
            self.ringBlocked(ring)
          }
        }
        guard live else { return }
        var ev: [String: Any] = ["type": "ringing", "name": name]
        if let call = self.callState() { ev["call"] = call }
        self.emit(ev)
        self.startRingTimeout(uuid)
      }
    }
  }

  private func startRingTimeout(_ uuid: UUID) {
    ringTimeout?.cancel()
    let work = DispatchWorkItem { [weak self] in
      guard let self = self, self.callId == uuid, self.phase == .ringing else { return }
      self.getProvider().reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
      self.postMissed(self.callInfo)
      self.finishCall(missed: true, event: "missed")
    }
    ringTimeout = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 30, execute: work)
  }

  private func configureCallAudio() {
    let session = AVAudioSession.sharedInstance()
    do {
      // 0x4 = allow Bluetooth headsets (AirPods) for calls
      // AVAudioPlayer does not use voice-processing I/O. Apple documents lower
      // output with voiceChat in that configuration; keep the normal call route.
      try session.setCategory(.playAndRecord, mode: .default, options: AVAudioSession.CategoryOptions(rawValue: 0x4))
    } catch {
      try? session.setCategory(.playAndRecord, mode: .default, options: [])
    }
  }

  private func startVoice(after delay: Double) {
    voiceStart?.cancel()
    guard let uuid = callId else { return }
    let work = DispatchWorkItem { [weak self] in
      guard let self = self, self.callId == uuid, self.phase == .waiting else { return }
      self.voiceStart = nil
      self.playVoice()
    }
    voiceStart = work
    DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
  }

  private func playVoice() {
    phase = .voice
    // no recording: the line just stays open until you hang up
    guard let name = callInfo["voice"] as? String, let url = soundURL(name) else { return }
    guard let player = try? AVAudioPlayer(contentsOf: url) else { return }
    player.delegate = self
    player.volume = 1
    player.prepareToPlay()
    voicePlayer = player
    if !onHold && audioActive { player.play() }
  }

  private func playHangup() {
    phase = .hangup
    voicePlayer = nil
    hangFallback?.cancel()
    var wait = 0.25
    if let name = callInfo["hangup"] as? String, let url = soundURL(name), let player = try? AVAudioPlayer(contentsOf: url) {
      player.delegate = self
      player.prepareToPlay()
      hangPlayer = player
      if !onHold { player.play() }
      wait = min(10, max(0.3, player.duration)) + 0.8
    }
    guard let uuid = callId else { return }
    let work = DispatchWorkItem { [weak self] in
      guard let self = self, self.callId == uuid else { return }
      self.endRemote()
    }
    hangFallback = work
    DispatchQueue.main.asyncAfter(deadline: .now() + wait, execute: work)
  }

  private func playerDone(_ player: AVAudioPlayer) {
    if player === voicePlayer && phase == .voice {
      playHangup()
    } else if player === hangPlayer && phase == .hangup {
      endRemote()
    }
  }

  /// The other side "hangs up".
  private func endRemote() {
    guard let uuid = callId else { return }
    getProvider().reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
    finishCall(missed: false, event: "ended")
  }

  private func finishCall(missed: Bool, event: String) {
    guard callId != nil else { return }
    ringTimeout?.cancel()
    ringTimeout = nil
    voiceStart?.cancel()
    voiceStart = nil
    hangFallback?.cancel()
    hangFallback = nil
    voicePlayer?.stop()
    voicePlayer = nil
    hangPlayer?.stop()
    hangPlayer = nil
    stopRing(release: true, notify: true)
    let dur = answeredAt.map { Date().timeIntervalSince($0) } ?? 0
    addHistory(callInfo, dur: missed ? 0 : dur, missed: missed)
    let name = callInfo["name"] as? String ?? ""
    callId = nil
    callInfo = [:]
    phase = .idle
    pendingSpeaker = nil
    speakerRequest &+= 1
    answeredAt = nil
    onHold = false
    muted = false
    ringKey = ""
    emit(["type": event, "name": name])
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
      self?.restore()
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
      guard let self = self, self.callId == nil else { return }
      self.endCallTask()
    }
  }

  // MARK: - Missed-call notices

  // Same wording as the iPhone's own missed-call notice; the app's name and icon show above it.
  private func missedTitle() -> String {
    switch lang() {
    case "fr": return "Appel manqué"
    case "ar": return "مكالمة فائتة"
    default: return "Missed Call"
    }
  }

  private func missedContent(_ info: [String: Any]) -> UNMutableNotificationContent {
    let content = UNMutableNotificationContent()
    content.title = missedTitle()
    let name = info["name"] as? String ?? ""
    content.body = name.isEmpty ? (info["handle"] as? String ?? "") : name
    content.sound = nil
    content.threadIdentifier = "fc.missed"
    return content
  }

  private func scheduleMissedNotice(_ info: [String: Any], at ms: Double) {
    guard let id = info["id"] as? String else { return }
    let wait = max(1, (ms - nowMs()) / 1000)
    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: wait, repeats: false)
    let request = UNNotificationRequest(identifier: "fc.missed." + id, content: missedContent(info), trigger: trigger)
    UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
  }

  private func postMissed(_ info: [String: Any]) {
    let request = UNNotificationRequest(identifier: "fc.miss." + UUID().uuidString, content: missedContent(info), trigger: nil)
    UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
  }

  // MARK: - Recent calls (shown on the app's cover screen)

  private func history() -> [[String: Any]] {
    return (store.array(forKey: kHistory) as? [[String: Any]]) ?? []
  }

  private func addHistory(_ info: [String: Any], dur: Double, missed: Bool) {
    var list = history()
    let entry: [String: Any] = [
      "name": info["name"] as? String ?? "",
      "handle": info["handle"] as? String ?? "",
      "at": nowMs(),
      "dur": dur.isFinite ? dur.rounded() : 0,
      "missed": missed,
    ]
    list.insert(entry, at: 0)
    if list.count > 40 { list = Array(list.prefix(40)) }
    store.set(list, forKey: kHistory)
  }

  // MARK: - Helpers

  private func emit(_ event: [String: Any]) {
    onEvent?(event)
  }

  private func nowMs() -> Double {
    return Date().timeIntervalSince1970 * 1000
  }

  private func clean(_ o: [String: Any]) -> [String: Any] {
    var r: [String: Any] = [:]
    r["name"] = text(o["name"], 80)
    r["handle"] = text(o["handle"], 80)
    r["cid"] = text(o["cid"], 80)
    let voice = safeName(text(o["voice"], 120))
    if !voice.isEmpty { r["voice"] = voice }
    let hangup = safeName(text(o["hangup"], 120))
    if !hangup.isEmpty { r["hangup"] = hangup }
    let ring = safeName(text(o["ring"], 120))
    if !ring.isEmpty { r["ring"] = ring }
    return r
  }

  private func text(_ v: Any?, _ maxLength: Int) -> String {
    var s = ""
    if let x = v as? String {
      s = x
    } else if let n = v as? NSNumber {
      s = n.stringValue
    }
    s = s.trimmingCharacters(in: .whitespacesAndNewlines)
    return String(s.prefix(maxLength))
  }

  private func num(_ v: Any?) -> Double {
    var d = 0.0
    if let n = v as? NSNumber {
      d = n.doubleValue
    } else if let s = v as? String {
      d = Double(s) ?? 0
    }
    return d.isFinite ? d : 0
  }

  private func clampDelay(_ v: Any?) -> Double {
    return min(86400, max(0, num(v)))
  }

  private func safeName(_ s: String) -> String {
    if s.isEmpty || s.count > 120 || s.hasPrefix(".") { return "" }
    for scalar in s.unicodeScalars where !FakeCallManager.allowed.contains(scalar) {
      return ""
    }
    return s
  }

  private func lang() -> String {
    let l = (Locale.preferredLanguages.first ?? "en").lowercased()
    if l.hasPrefix("fr") { return "fr" }
    if l.hasPrefix("ar") { return "ar" }
    return "en"
  }

  private func uses24h() -> Bool {
    let format = DateFormatter.dateFormat(fromTemplate: "j", options: 0, locale: Locale.current) ?? ""
    return !format.contains("a")
  }
}

// MARK: - iOS call screen events

extension FakeCallManager: CXProviderDelegate {
  public func providerDidReset(_ provider: CXProvider) {
    stopRing(release: true, notify: true)
    audioActive = false
    if callId != nil {
      finishCall(missed: phase == .ringing, event: "ended")
    }
  }

  public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    guard action.callUUID == callId, phase == .ringing else {
      action.fail()
      return
    }
    ringTimeout?.cancel()
    ringTimeout = nil
    // your ringtone stops and the sound goes back to iOS, which opens it for the call
    let freed = stopRing(release: true, notify: false)
    phase = .waiting
    answeredAt = Date()
    if freed {
      configureCallAudio()
      action.fulfill()
    } else {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
        try? AVAudioSession.sharedInstance().setActive(false, options: [])
        self?.configureCallAudio()
        action.fulfill()
      }
    }
    var ev: [String: Any] = ["type": "answered", "name": callInfo["name"] as? String ?? ""]
    if let call = callState() { ev["call"] = call }
    emit(ev)
    if audioActive { startVoice(after: 0.7) }
  }

  public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    guard action.callUUID == callId else {
      action.fulfill()
      return
    }
    let missed = phase == .ringing
    action.fulfill()
    finishCall(missed: missed, event: "ended")
  }

  public func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
    onHold = action.isOnHold
    if onHold {
      voicePlayer?.pause()
      hangPlayer?.pause()
    } else if audioActive {
      if phase == .voice { voicePlayer?.play() }
      if phase == .hangup { hangPlayer?.play() }
    }
    action.fulfill()
  }

  public func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
    if action.callUUID == callId {
      muted = action.isMuted
      emit(["type": "muted", "muted": muted])
    }
    action.fulfill()
  }

  public func provider(_ provider: CXProvider, perform action: CXPlayDTMFCallAction) {
    action.fulfill()
  }

  public func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
    action.fulfill()
  }

  public func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    stopRing(release: false, notify: false)
    audioActive = true
    if callId != nil && phase != .ringing {
      if pendingSpeaker != nil {
        _ = applyPendingSpeaker()
      } else {
        emit(["type": "route", "speaker": speakerOn()])
      }
    }
    switch phase {
    case .waiting:
      if voiceStart == nil { startVoice(after: 0.7) }
    case .voice:
      if !onHold { voicePlayer?.play() }
    case .hangup:
      if !onHold { hangPlayer?.play() }
    default:
      break
    }
  }

  public func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
    audioActive = false
    voicePlayer?.pause()
    hangPlayer?.pause()
  }
}

// MARK: - Voice / hang-up sound finished

extension FakeCallManager: AVAudioPlayerDelegate {
  public func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    DispatchQueue.main.async { [weak self] in
      self?.playerDone(player)
    }
  }

  public func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
    DispatchQueue.main.async { [weak self] in
      self?.playerDone(player)
    }
  }
}

// MARK: - Show the missed-call notice even while the app is open

extension FakeCallManager: UNUserNotificationCenterDelegate {
  public func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .list])
  }

  public func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    completionHandler()
  }
}
