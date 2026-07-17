import AppKit
import CoreGraphics
import Darwin
import Foundation

private let backupPrefix = "com.openpet.systemcursor.backup."
private let activeCursorName = "com.openpet.systemcursor.active"
private let maximumCursorFrames: UInt = 24

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
    case privateApiUnavailable(String)
    case cursorOperationFailed(String, CGError)
    case cursorDataUnavailable(String)
    case restoreFailed([String])
    case watchdogFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidArguments(let message), .invalidConfig(let message), .watchdogFailed(let message):
            return message
        case .imageLoadFailed(let path):
            return "Unable to load cursor image at \(path)"
        case .privateApiUnavailable(let symbol):
            return "Required macOS cursor API is unavailable: \(symbol)"
        case .cursorOperationFailed(let operation, let error):
            return "\(operation) failed (CGError \(error.rawValue))"
        case .cursorDataUnavailable(let identifier):
            return "Cursor data is unavailable for \(identifier)"
        case .restoreFailed(let messages):
            return "Failed to restore the previous macOS cursor theme: \(messages.joined(separator: "; "))"
        }
    }
}

private func downsampleImages(_ images: CFArray, from sourceCount: UInt, to targetCount: UInt) throws -> CFArray {
    guard sourceCount > targetCount, targetCount > 1 else { return images }
    let sampledImages = NSMutableArray(capacity: CFArrayGetCount(images))

    for index in 0..<CFArrayGetCount(images) {
        guard let rawImage = CFArrayGetValueAtIndex(images, index) else {
            throw CursorHelperError.cursorDataUnavailable("cursor image representation \(index)")
        }
        let spriteSheet = Unmanaged<CGImage>.fromOpaque(rawImage).takeUnretainedValue()
        let width = spriteSheet.width
        let totalHeight = spriteSheet.height
        let frameHeight = sourceCount > 0 ? totalHeight / Int(sourceCount) : 0
        guard width > 0, frameHeight > 0 else {
            throw CursorHelperError.cursorDataUnavailable("cursor image representation \(index)")
        }

        let colorSpace = spriteSheet.colorSpace ?? CGColorSpaceCreateDeviceRGB()
        guard let context = CGContext(
            data: nil,
            width: width,
            height: frameHeight * Int(targetCount),
            bitsPerComponent: spriteSheet.bitsPerComponent,
            bytesPerRow: 0,
            space: colorSpace,
            bitmapInfo: spriteSheet.bitmapInfo.rawValue
        ) else {
            throw CursorHelperError.cursorDataUnavailable("downsampled cursor image representation \(index)")
        }

        let step = Double(sourceCount - 1) / Double(targetCount - 1)
        for frameIndex in 0..<Int(targetCount) {
            let sourceIndex = min(Int(sourceCount) - 1, Int(round(Double(frameIndex) * step)))
            let cropRect = CGRect(x: 0, y: sourceIndex * frameHeight, width: width, height: frameHeight)
            guard let frame = spriteSheet.cropping(to: cropRect) else { continue }
            let destinationRect = CGRect(x: 0, y: frameIndex * frameHeight, width: width, height: frameHeight)
            context.draw(frame, in: destinationRect)
        }

        guard let result = context.makeImage() else {
            throw CursorHelperError.cursorDataUnavailable("downsampled cursor image representation \(index)")
        }
        sampledImages.add(result)
    }

    guard sampledImages.count > 0 else {
        throw CursorHelperError.cursorDataUnavailable("downsampled cursor image representations")
    }
    return sampledImages as CFArray
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

private enum CursorTarget: Hashable {
    case named(String)
    case auxiliary(Int32)

    var identifier: String {
        switch self {
        case .named(let name):
            return name
        case .auxiliary(let identifier):
            return "com.apple.cursor.\(identifier)"
        }
    }

    var backupIdentifier: String {
        return "\(backupPrefix)\(identifier)"
    }
}

private struct CursorSnapshot {
    let images: CFArray
    let size: CGSize
    let hotspot: CGPoint
    let frameCount: UInt
    let frameDuration: CGFloat

    func registerable(maximumFrameCount: UInt = maximumCursorFrames) throws -> CursorSnapshot {
        guard frameCount > maximumFrameCount else { return self }
        let downsampledImages = try downsampleImages(images, from: frameCount, to: maximumFrameCount)
        return CursorSnapshot(
            images: downsampledImages,
            size: size,
            hotspot: hotspot,
            frameCount: maximumFrameCount,
            frameDuration: frameDuration * (CGFloat(frameCount) / CGFloat(maximumFrameCount))
        )
    }
}

private struct CursorReplacement {
    let snapshot: CursorSnapshot
    let version: String
}

private final class CursorPrivateAPI {
    private typealias MainConnectionFunction = @convention(c) () -> Int32
    private typealias RegisterCursorFunction = @convention(c) (
        Int32,
        UnsafeMutablePointer<CChar>,
        Bool,
        Bool,
        CGSize,
        CGPoint,
        UInt,
        CGFloat,
        CFArray,
        UnsafeMutablePointer<Int32>
    ) -> CGError
    private typealias RemoveCursorFunction = @convention(c) (
        Int32,
        UnsafeMutablePointer<CChar>,
        Bool
    ) -> CGError
    private typealias CopyRegisteredCursorFunction = @convention(c) (
        Int32,
        UnsafeMutablePointer<CChar>,
        UnsafeMutablePointer<CGSize>,
        UnsafeMutablePointer<CGPoint>,
        UnsafeMutablePointer<UInt>,
        UnsafeMutablePointer<CGFloat>,
        UnsafeMutablePointer<Unmanaged<CFArray>?>
    ) -> CGError
    private typealias RegisteredCursorDataSizeFunction = @convention(c) (
        Int32,
        UnsafeMutablePointer<CChar>,
        UnsafeMutablePointer<Int>
    ) -> CGError
    private typealias CursorNameFunction = @convention(c) (Int32) -> UnsafeMutablePointer<CChar>?
    private typealias CopyAuxiliaryCursorFunction = @convention(c) (
        Int32,
        Int32,
        UnsafeMutablePointer<Unmanaged<CFArray>?>,
        UnsafeMutablePointer<CGSize>,
        UnsafeMutablePointer<CGPoint>,
        UnsafeMutablePointer<UInt>,
        UnsafeMutablePointer<CGFloat>
    ) -> CGError
    private typealias SetRegisteredCursorFunction = @convention(c) (
        Int32,
        UnsafeMutablePointer<CChar>,
        UnsafeMutablePointer<Int32>
    ) -> CGError
    private typealias SetDockCursorOverrideFunction = @convention(c) (Int32, Bool) -> Void

    private let frameworkHandle: UnsafeMutableRawPointer
    private let mainConnection: MainConnectionFunction
    private let registerCursorFunction: RegisterCursorFunction
    private let removeCursorFunction: RemoveCursorFunction
    private let copyRegisteredCursorFunction: CopyRegisteredCursorFunction
    private let registeredCursorDataSizeFunction: RegisteredCursorDataSizeFunction
    private let cursorNameFunction: CursorNameFunction
    private let copyAuxiliaryCursorFunction: CopyAuxiliaryCursorFunction
    private let setRegisteredCursorFunction: SetRegisteredCursorFunction
    private let setDockCursorOverrideFunction: SetDockCursorOverrideFunction?

    init() throws {
        let frameworkPath = "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices"
        guard let handle = dlopen(frameworkPath, RTLD_LAZY | RTLD_LOCAL) else {
            throw CursorHelperError.privateApiUnavailable(frameworkPath)
        }
        frameworkHandle = handle

        func load<T>(_ symbol: String, as type: T.Type) throws -> T {
            guard let pointer = dlsym(handle, symbol) else {
                throw CursorHelperError.privateApiUnavailable(symbol)
            }
            return unsafeBitCast(pointer, to: type)
        }

        do {
            mainConnection = try load("CGSMainConnectionID", as: MainConnectionFunction.self)
            registerCursorFunction = try load("CGSRegisterCursorWithImages", as: RegisterCursorFunction.self)
            removeCursorFunction = try load("CGSRemoveRegisteredCursor", as: RemoveCursorFunction.self)
            copyRegisteredCursorFunction = try load("CGSCopyRegisteredCursorImages", as: CopyRegisteredCursorFunction.self)
            registeredCursorDataSizeFunction = try load("CGSGetRegisteredCursorDataSize", as: RegisteredCursorDataSizeFunction.self)
            cursorNameFunction = try load("CGSCursorNameForSystemCursor", as: CursorNameFunction.self)
            copyAuxiliaryCursorFunction = try load("CoreCursorCopyImages", as: CopyAuxiliaryCursorFunction.self)
            setRegisteredCursorFunction = try load("CGSSetRegisteredCursor", as: SetRegisteredCursorFunction.self)
            setDockCursorOverrideFunction = dlsym(handle, "CGSSetDockCursorOverride").map {
                unsafeBitCast($0, to: SetDockCursorOverrideFunction.self)
            }
        } catch {
            dlclose(handle)
            throw error
        }
    }

    deinit {
        dlclose(frameworkHandle)
    }

    private var connection: Int32 {
        return mainConnection()
    }

    func discoverTargets() -> [CursorTarget] {
        var targets: [CursorTarget] = []
        var names = Set<String>()

        for identifier in 0..<128 {
            guard let rawName = cursorNameFunction(Int32(identifier)) else { continue }
            let name = String(cString: rawName)
            guard !name.isEmpty, names.insert(name).inserted, isRegistered(name) else { continue }
            targets.append(.named(name))
        }

        let compatibilityNames = [
            "com.apple.coregraphics.Arrow",
            "com.apple.coregraphics.ArrowCtx",
            "com.apple.coregraphics.ArrowS",
            "com.apple.coregraphics.IBeam",
            "com.apple.coregraphics.IBeamXOR",
            "com.apple.coregraphics.IBeamS",
            "com.apple.coregraphics.Wait"
        ]
        for name in compatibilityNames where names.insert(name).inserted && isRegistered(name) {
            targets.append(.named(name))
        }

        for identifier in 2...43 where identifier != 6 {
            targets.append(.auxiliary(Int32(identifier)))
        }
        return targets
    }

    func isRegistered(_ identifier: String) -> Bool {
        var byteCount = 0
        let result = identifier.withCString { rawName in
            registeredCursorDataSizeFunction(
                connection,
                UnsafeMutablePointer(mutating: rawName),
                &byteCount
            )
        }
        return result == .success && byteCount > 0
    }

    func copySnapshot(for target: CursorTarget) throws -> CursorSnapshot {
        switch target {
        case .named(let name):
            return try copyRegisteredSnapshot(name)
        case .auxiliary(let identifier):
            return try copyAuxiliarySnapshot(identifier, name: target.identifier)
        }
    }

    func copyRegisteredSnapshot(_ identifier: String) throws -> CursorSnapshot {
        var size = CGSize.zero
        var hotspot = CGPoint.zero
        var frameCount: UInt = 0
        var frameDuration: CGFloat = 0
        var unmanagedImages: Unmanaged<CFArray>?
        let result = identifier.withCString { rawName in
            copyRegisteredCursorFunction(
                connection,
                UnsafeMutablePointer(mutating: rawName),
                &size,
                &hotspot,
                &frameCount,
                &frameDuration,
                &unmanagedImages
            )
        }
        guard result == .success else {
            throw CursorHelperError.cursorOperationFailed("Copy cursor \(identifier)", result)
        }
        guard let images = unmanagedImages?.takeRetainedValue(), CFArrayGetCount(images) > 0 else {
            throw CursorHelperError.cursorDataUnavailable(identifier)
        }
        return try validateSnapshot(CursorSnapshot(
            images: images,
            size: size,
            hotspot: hotspot,
            frameCount: frameCount,
            frameDuration: frameDuration
        ), identifier: identifier)
    }

    private func copyAuxiliarySnapshot(_ identifier: Int32, name: String) throws -> CursorSnapshot {
        var size = CGSize.zero
        var hotspot = CGPoint.zero
        var frameCount: UInt = 0
        var frameDuration: CGFloat = 0
        var unmanagedImages: Unmanaged<CFArray>?
        let result = copyAuxiliaryCursorFunction(
            connection,
            identifier,
            &unmanagedImages,
            &size,
            &hotspot,
            &frameCount,
            &frameDuration
        )
        guard result == .success else {
            throw CursorHelperError.cursorOperationFailed("Copy cursor \(name)", result)
        }
        guard let images = unmanagedImages?.takeRetainedValue(), CFArrayGetCount(images) > 0 else {
            throw CursorHelperError.cursorDataUnavailable(name)
        }
        return try validateSnapshot(CursorSnapshot(
            images: images,
            size: size,
            hotspot: hotspot,
            frameCount: frameCount,
            frameDuration: frameDuration
        ), identifier: name)
    }

    private func validateSnapshot(_ snapshot: CursorSnapshot, identifier: String) throws -> CursorSnapshot {
        guard snapshot.size.width.isFinite, snapshot.size.height.isFinite,
              snapshot.size.width > 0, snapshot.size.height > 0,
              snapshot.hotspot.x.isFinite, snapshot.hotspot.y.isFinite,
              snapshot.frameCount > 0 else {
            throw CursorHelperError.cursorDataUnavailable(identifier)
        }
        return snapshot
    }

    func register(_ snapshot: CursorSnapshot, as identifier: String, instantly: Bool) throws {
        let registerableSnapshot = try snapshot.registerable()
        var seed: Int32 = 0
        let result = identifier.withCString { rawName in
            registerCursorFunction(
                connection,
                UnsafeMutablePointer(mutating: rawName),
                true,
                instantly,
                registerableSnapshot.size,
                registerableSnapshot.hotspot,
                registerableSnapshot.frameCount,
                registerableSnapshot.frameDuration,
                registerableSnapshot.images,
                &seed
            )
        }
        guard result == .success else {
            throw CursorHelperError.cursorOperationFailed("Register cursor \(identifier)", result)
        }
    }

    func setCurrentCursor(_ identifier: String) throws {
        var seed: Int32 = 0
        let result = identifier.withCString { rawName in
            setRegisteredCursorFunction(
                connection,
                UnsafeMutablePointer(mutating: rawName),
                &seed
            )
        }
        guard result == .success else {
            throw CursorHelperError.cursorOperationFailed("Set cursor \(identifier)", result)
        }
    }

    func remove(_ identifier: String) throws {
        let result = identifier.withCString { rawName in
            removeCursorFunction(connection, UnsafeMutablePointer(mutating: rawName), false)
        }
        guard result == .success else {
            throw CursorHelperError.cursorOperationFailed("Remove cursor \(identifier)", result)
        }
    }

    func releaseDockCursorOverride() {
        setDockCursorOverrideFunction?(connection, false)
    }
}

private final class CursorRegistrationStore {
    private let api: CursorPrivateAPI
    let targets: [CursorTarget]

    init(api: CursorPrivateAPI) {
        self.api = api
        targets = api.discoverTargets()
    }

    func restoreStaleBackups() throws {
        var failures: [String] = []
        for target in targets where api.isRegistered(target.backupIdentifier) {
            do {
                let backup = try api.copyRegisteredSnapshot(target.backupIdentifier)
                try api.register(backup, as: target.identifier, instantly: true)
                try api.remove(target.backupIdentifier)
            } catch {
                failures.append("\(target.identifier): \(error.localizedDescription)")
            }
        }
        if api.isRegistered(activeCursorName) {
            do {
                try api.remove(activeCursorName)
            } catch {
                failures.append("\(activeCursorName): \(error.localizedDescription)")
            }
        }
        guard failures.isEmpty else { throw CursorHelperError.restoreFailed(failures) }
    }

    func createBackups() throws {
        try restoreStaleBackups()
        var created: [String] = []
        do {
            for target in targets {
                let snapshot = try api.copySnapshot(for: target)
                try api.register(snapshot, as: target.backupIdentifier, instantly: false)
                guard api.isRegistered(target.backupIdentifier) else {
                    throw CursorHelperError.cursorDataUnavailable(target.backupIdentifier)
                }
                created.append(target.backupIdentifier)
            }
        } catch {
            for identifier in created.reversed() {
                try? api.remove(identifier)
            }
            throw error
        }
    }

    func apply(_ replacement: CursorReplacement) throws {
        try api.register(replacement.snapshot, as: activeCursorName, instantly: false)
        for target in targets {
            try api.register(replacement.snapshot, as: target.identifier, instantly: true)
        }
        api.releaseDockCursorOverride()
        try api.setCurrentCursor(activeCursorName)
    }

    func restoreBackups() throws {
        try restoreStaleBackups()
    }
}

private func loadReplacement(from config: CursorConfig) throws -> CursorReplacement {
    guard let image = NSImage(contentsOfFile: config.imagePath) else {
        throw CursorHelperError.imageLoadFailed(config.imagePath)
    }
    var imageRect = NSRect(origin: .zero, size: image.size)
    guard let cursorImage = image.cgImage(forProposedRect: &imageRect, context: nil, hints: nil) else {
        throw CursorHelperError.imageLoadFailed(config.imagePath)
    }
    let snapshot = CursorSnapshot(
        images: [cursorImage] as CFArray,
        size: CGSize(width: config.width, height: config.height),
        hotspot: CGPoint(x: config.hotspotX, y: config.hotspotY),
        frameCount: 1,
        frameDuration: 0
    )
    return CursorReplacement(snapshot: snapshot, version: config.version)
}

private final class CursorRestoreWatchdog {
    private let parentPid: pid_t
    private let store: CursorRegistrationStore
    private var pollTimer: Timer?
    private var signalSources: [DispatchSourceSignal] = []
    private var shuttingDown = false

    init(parentPid: pid_t, store: CursorRegistrationStore) {
        self.parentPid = parentPid
        self.store = store
    }

    func run() -> Never {
        configureSignals()
        startParentPolling()
        emitProtocolEvent(["event": "watchdog-ready"])
        RunLoop.main.run()
        exit(0)
    }

    private func configureSignals() {
        for signalNumber in [SIGTERM, SIGINT] {
            signal(signalNumber, SIG_IGN)
            let source = DispatchSource.makeSignalSource(signal: signalNumber, queue: .main)
            source.setEventHandler { [weak self] in self?.restoreAndExit() }
            source.resume()
            signalSources.append(source)
        }
    }

    private func startParentPolling() {
        let timer = Timer(timeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self else { return }
            if self.parentPid <= 0 || getppid() != self.parentPid || (kill(self.parentPid, 0) != 0 && errno == ESRCH) {
                self.restoreAndExit()
            }
        }
        pollTimer = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    private func restoreAndExit() {
        guard !shuttingDown else { return }
        shuttingDown = true
        pollTimer?.invalidate()
        pollTimer = nil
        do {
            try store.restoreBackups()
            exit(0)
        } catch {
            emitProtocolEvent(["event": "error", "message": error.localizedDescription], to: .standardError)
            exit(4)
        }
    }
}

private final class CursorReplacementController: NSObject, NSApplicationDelegate {
    private let configPath: String
    private let parentPid: pid_t
    private var api: CursorPrivateAPI?
    private var store: CursorRegistrationStore?
    private var currentReplacement: CursorReplacement?
    private var watchdog: Process?
    private var pollTimer: Timer?
    private var signalSources: [DispatchSourceSignal] = []
    private var shuttingDown = false

    init(configPath: String, parentPid: pid_t) {
        self.configPath = configPath
        self.parentPid = parentPid
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        configureSignals()
        do {
            let api = try CursorPrivateAPI()
            let store = CursorRegistrationStore(api: api)
            guard !store.targets.isEmpty else {
                throw CursorHelperError.privateApiUnavailable("No macOS cursor identifiers were discovered")
            }
            self.api = api
            self.store = store
            try store.createBackups()
            try startWatchdog()
            let replacement = try loadCurrentReplacement()
            try store.apply(replacement)
            currentReplacement = replacement
            startPolling()
            emitProtocolEvent(["event": "ready", "version": replacement.version])
        } catch {
            emitProtocolEvent(["event": "error", "message": error.localizedDescription], to: .standardError)
            cleanup()
            NSApp.terminate(nil)
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        cleanup()
    }

    private func loadCurrentReplacement() throws -> CursorReplacement {
        let data = try Data(contentsOf: URL(fileURLWithPath: configPath))
        let config = try JSONDecoder().decode(CursorConfig.self, from: data).validated()
        return try loadReplacement(from: config)
    }

    private func startWatchdog() throws {
        let process = Process()
        let output = Pipe()
        let errorOutput = Pipe()
        process.executableURL = URL(fileURLWithPath: CommandLine.arguments[0])
        process.arguments = ["--restore-watchdog", "--parent-pid", String(getpid())]
        process.standardInput = FileHandle.nullDevice
        process.standardOutput = output
        process.standardError = errorOutput
        do {
            try process.run()
        } catch {
            throw CursorHelperError.watchdogFailed("Unable to start cursor restore watchdog: \(error.localizedDescription)")
        }
        let readyData = output.fileHandleForReading.availableData
        let readyLine = String(data: readyData, encoding: .utf8) ?? ""
        guard readyLine.contains("\"event\":\"watchdog-ready\"") else {
            let errorData = errorOutput.fileHandleForReading.readDataToEndOfFile()
            if process.isRunning {
                process.terminate()
                process.waitUntilExit()
            }
            let message = String(data: errorData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
            throw CursorHelperError.watchdogFailed(message?.isEmpty == false
                ? message!
                : "Cursor restore watchdog exited before becoming ready")
        }
        watchdog = process
    }

    private func stopWatchdog() {
        guard let process = watchdog else { return }
        watchdog = nil
        if process.isRunning {
            process.terminate()
            process.waitUntilExit()
        }
    }

    private func startPolling() {
        let timer = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in
            guard let self else { return }
            if self.parentPid > 0,
               getppid() != self.parentPid || (kill(self.parentPid, 0) != 0 && errno == ESRCH) {
                self.shutdown()
                return
            }
            if self.watchdog?.isRunning != true {
                emitProtocolEvent([
                    "event": "error",
                    "version": self.currentReplacement?.version ?? "",
                    "message": "Cursor restore watchdog exited unexpectedly"
                ])
                self.shutdown()
            }
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
        guard let store else { return }
        do {
            let replacement = try loadCurrentReplacement()
            do {
                try store.apply(replacement)
                currentReplacement = replacement
                emitProtocolEvent(["event": "updated", "version": replacement.version])
            } catch {
                if let currentReplacement {
                    do {
                        try store.apply(currentReplacement)
                    } catch let rollbackError {
                        emitProtocolEvent([
                            "event": "error",
                            "version": replacement.version,
                            "message": "Cursor update failed and rollback failed: \(rollbackError.localizedDescription)"
                        ])
                        shutdown()
                        return
                    }
                }
                throw error
            }
        } catch {
            let version = (try? loadCurrentReplacement().version) ?? ""
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
        if let store {
            do {
                try store.restoreBackups()
            } catch {
                emitProtocolEvent(["event": "error", "message": error.localizedDescription], to: .standardError)
            }
        }
        stopWatchdog()
        currentReplacement = nil
        store = nil
        api = nil
    }
}

private let arguments = Array(CommandLine.arguments.dropFirst())
private let app = NSApplication.shared
app.setActivationPolicy(.accessory)

if arguments.contains("--restore-watchdog") {
    let parentPid = argumentValue("--parent-pid", arguments: arguments).flatMap(Int32.init) ?? 0
    do {
        let api = try CursorPrivateAPI()
        let watchdog = CursorRestoreWatchdog(
            parentPid: parentPid,
            store: CursorRegistrationStore(api: api)
        )
        watchdog.run()
    } catch {
        emitProtocolEvent(["event": "error", "message": error.localizedDescription], to: .standardError)
        exit(3)
    }
}

if arguments.contains("--restore") {
    do {
        let api = try CursorPrivateAPI()
        try CursorRegistrationStore(api: api).restoreBackups()
        emitProtocolEvent(["event": "restored"])
        exit(0)
    } catch {
        emitProtocolEvent(["event": "error", "message": error.localizedDescription], to: .standardError)
        exit(4)
    }
}

guard let configPath = argumentValue("--config", arguments: arguments) else {
    emitProtocolEvent(["event": "error", "message": "--config is required"], to: .standardError)
    exit(2)
}
let parentPid = argumentValue("--parent-pid", arguments: arguments).flatMap(Int32.init) ?? 0

private let controller = CursorReplacementController(configPath: configPath, parentPid: parentPid)
app.delegate = controller
app.run()
