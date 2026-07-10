import AppKit
import CoreGraphics
import Darwin
import Foundation

private struct CursorConfig: Codable {
    let version: String
    let imagePath: String
    let width: Double
    let height: Double
    let hotspotX: Double
    let hotspotY: Double

    func validated() throws -> CursorConfig {
        guard !version.isEmpty else { throw CursorHelperError.invalidConfig("version is required") }
        guard !imagePath.isEmpty else { throw CursorHelperError.invalidConfig("imagePath is required") }
        guard width.isFinite, height.isFinite, width > 0, height > 0 else {
            throw CursorHelperError.invalidConfig("cursor dimensions must be positive")
        }
        guard hotspotX.isFinite, hotspotY.isFinite,
              hotspotX >= 0, hotspotY >= 0,
              hotspotX <= width, hotspotY <= height else {
            throw CursorHelperError.invalidConfig("cursor hotspot is outside the image bounds")
        }
        guard FileManager.default.fileExists(atPath: imagePath) else {
            throw CursorHelperError.invalidConfig("cursor image does not exist")
        }
        return self
    }
}

private enum CursorHelperError: LocalizedError {
    case invalidArguments(String)
    case invalidConfig(String)
    case imageLoadFailed(String)
    case cursorHideFailed(CGError)

    var errorDescription: String? {
        switch self {
        case .invalidArguments(let message), .invalidConfig(let message):
            return message
        case .imageLoadFailed(let path):
            return "Unable to load cursor image at \(path)"
        case .cursorHideFailed(let error):
            return "Unable to hide the macOS cursor (CGError \(error.rawValue))"
        }
    }
}

private func emitProtocolEvent(_ payload: [String: Any], to handle: FileHandle = .standardOutput) {
    guard JSONSerialization.isValidJSONObject(payload),
          let data = try? JSONSerialization.data(withJSONObject: payload),
          var line = String(data: data, encoding: .utf8) else { return }
    line.append("\n")
    handle.write(Data(line.utf8))
}

private func argumentValue(_ name: String, arguments: [String]) -> String? {
    guard let index = arguments.firstIndex(of: name), arguments.indices.contains(index + 1) else { return nil }
    return arguments[index + 1]
}

private final class CursorOverlayController: NSObject, NSApplicationDelegate {
    private let configPath: String
    private let parentPid: pid_t
    private var currentConfig: CursorConfig?
    private var panel: NSPanel?
    private var imageView: NSImageView?
    private var pollTimer: Timer?
    private var signalSources: [DispatchSourceSignal] = []
    private var cursorHidden = false
    private var shuttingDown = false

    init(configPath: String, parentPid: pid_t) {
        self.configPath = configPath
        self.parentPid = parentPid
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        configureSignals()
        do {
            let config = try loadConfig()
            try apply(config: config)
            let hideResult = CGDisplayHideCursor(CGMainDisplayID())
            guard hideResult == .success else { throw CursorHelperError.cursorHideFailed(hideResult) }
            cursorHidden = true
            startPolling()
            emitProtocolEvent(["event": "ready", "version": config.version])
        } catch {
            emitProtocolEvent([
                "event": "error",
                "message": error.localizedDescription
            ], to: .standardError)
            cleanup()
            NSApp.terminate(nil)
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        cleanup()
    }

    private func loadConfig() throws -> CursorConfig {
        let data = try Data(contentsOf: URL(fileURLWithPath: configPath))
        return try JSONDecoder().decode(CursorConfig.self, from: data).validated()
    }

    private func createPanelIfNeeded() -> NSPanel {
        if let panel { return panel }
        let panel = NSPanel(
            contentRect: .zero,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.ignoresMouseEvents = true
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.animationBehavior = .none
        panel.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.cursorWindow)))
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]

        let imageView = NSImageView(frame: .zero)
        imageView.imageScaling = .scaleAxesIndependently
        imageView.imageAlignment = .alignCenter
        panel.contentView = imageView
        self.panel = panel
        self.imageView = imageView
        return panel
    }

    private func apply(config: CursorConfig) throws {
        guard let image = NSImage(contentsOfFile: config.imagePath) else {
            throw CursorHelperError.imageLoadFailed(config.imagePath)
        }
        let panel = createPanelIfNeeded()
        let size = NSSize(width: config.width, height: config.height)
        imageView?.image = image
        imageView?.frame = NSRect(origin: .zero, size: size)
        panel.setContentSize(size)
        currentConfig = config
        positionPanel()
        panel.orderFrontRegardless()
    }

    private func positionPanel() {
        guard let config = currentConfig, let panel else { return }
        let mouseLocation = NSEvent.mouseLocation
        let origin = NSPoint(
            x: mouseLocation.x - config.hotspotX,
            y: mouseLocation.y - config.height + config.hotspotY
        )
        panel.setFrameOrigin(origin)
        if !panel.isVisible { panel.orderFrontRegardless() }
    }

    private func startPolling() {
        let timer = Timer(timeInterval: 1.0 / 120.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            if self.parentPid > 0, getppid() != self.parentPid || (kill(self.parentPid, 0) != 0 && errno == ESRCH) {
                self.shutdown()
                return
            }
            self.positionPanel()
        }
        pollTimer = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    private func configureSignals() {
        signal(SIGHUP, SIG_IGN)
        let reloadSource = DispatchSource.makeSignalSource(signal: SIGHUP, queue: .main)
        reloadSource.setEventHandler { [weak self] in self?.reloadConfig() }
        reloadSource.resume()
        signalSources.append(reloadSource)

        for signalNumber in [SIGTERM, SIGINT] {
            signal(signalNumber, SIG_IGN)
            let source = DispatchSource.makeSignalSource(signal: signalNumber, queue: .main)
            source.setEventHandler { [weak self] in self?.shutdown() }
            source.resume()
            signalSources.append(source)
        }
    }

    private func reloadConfig() {
        do {
            let config = try loadConfig()
            try apply(config: config)
            emitProtocolEvent(["event": "updated", "version": config.version])
        } catch {
            let version = (try? loadConfig().version) ?? ""
            emitProtocolEvent([
                "event": "error",
                "version": version,
                "message": error.localizedDescription
            ])
        }
    }

    private func shutdown() {
        guard !shuttingDown else { return }
        shuttingDown = true
        cleanup()
        NSApp.terminate(nil)
    }

    private func cleanup() {
        pollTimer?.invalidate()
        pollTimer = nil
        panel?.orderOut(nil)
        if cursorHidden {
            CGDisplayShowCursor(CGMainDisplayID())
            cursorHidden = false
        }
    }
}

private let arguments = Array(CommandLine.arguments.dropFirst())
guard let configPath = argumentValue("--config", arguments: arguments) else {
    emitProtocolEvent(["event": "error", "message": "--config is required"], to: .standardError)
    exit(2)
}
let parentPid = argumentValue("--parent-pid", arguments: arguments).flatMap(Int32.init) ?? 0

private let app = NSApplication.shared
private let controller = CursorOverlayController(configPath: configPath, parentPid: parentPid)
app.setActivationPolicy(.accessory)
app.delegate = controller
app.run()
