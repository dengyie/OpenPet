const assert = require('node:assert')
const { test } = require('node:test')
const fs = require('fs')
const os = require('os')
const path = require('path')
const readline = require('readline')
const { spawn, execFileSync } = require('child_process')
const { setTimeout: delay } = require('timers/promises')
const sharp = require('sharp')

const { buildMacosSystemCursorHelper } = require('../../scripts/build-macos-system-cursor-helper')

const shouldRun = process.platform === 'darwin' && process.env.OPENPET_RUN_NATIVE_CURSOR_SMOKE === '1'

const waitForMessage = (messages, event, version, timeoutMs = 5000) => new Promise((resolve, reject) => {
  const deadline = Date.now() + timeoutMs
  const poll = () => {
    const match = messages.find((message) => message.event === event && message.version === version)
    if (match) return resolve(match)
    if (Date.now() >= deadline) return reject(new Error(`Timed out waiting for ${event}:${version}`))
    setTimeout(poll, 20)
  }
  poll()
})

const buildCursorRegistrationProbe = (root) => {
  const sourcePath = path.join(root, 'CursorRegistrationProbe.m')
  const outputPath = path.join(root, 'CursorRegistrationProbe')
  fs.writeFileSync(sourcePath, `
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>

typedef int CGSConnectionID;
extern CGSConnectionID CGSMainConnectionID(void);
extern CGError CGSCopyRegisteredCursorImages(CGSConnectionID, char *, CGSize *, CGPoint *, NSUInteger *, CGFloat *, CFArrayRef *);
extern CGError CoreCursorCopyImages(CGSConnectionID, int, CFArrayRef *, CGSize *, CGPoint *, NSUInteger *, CGFloat *);

int main(int argc, char **argv) {
    if (argc < 2) return 2;
    NSString *identifier = [NSString stringWithUTF8String:argv[1]];
    CGSize size = CGSizeZero;
    CGPoint hotspot = CGPointZero;
    NSUInteger frameCount = 0;
    CGFloat frameDuration = 0;
    CFArrayRef images = NULL;
    CGError error = kCGErrorFailure;

    if ([identifier hasPrefix:@"com.apple.cursor."]) {
        int cursorID = identifier.pathExtension.intValue;
        error = CoreCursorCopyImages(CGSMainConnectionID(), cursorID, &images, &size, &hotspot, &frameCount, &frameDuration);
    } else {
        error = CGSCopyRegisteredCursorImages(CGSMainConnectionID(), argv[1], &size, &hotspot, &frameCount, &frameDuration, &images);
    }

    if (error != kCGErrorSuccess || images == NULL || CFArrayGetCount(images) == 0) {
        fprintf(stderr, "inspect failed for %s: %d\\n", argv[1], error);
        if (images != NULL) CFRelease(images);
        return 3;
    }

    NSDictionary *payload = @{
        @"width": @(size.width),
        @"height": @(size.height),
        @"hotspotX": @(hotspot.x),
        @"hotspotY": @(hotspot.y),
        @"frameCount": @(frameCount),
        @"representations": @(CFArrayGetCount(images))
    };
    NSData *data = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
    fwrite(data.bytes, 1, data.length, stdout);
    fputc('\\n', stdout);
    CFRelease(images);
    return 0;
}
`)
  execFileSync('xcrun', [
    'clang',
    '-fobjc-arc',
    '-framework', 'AppKit',
    '-framework', 'ApplicationServices',
    sourcePath,
    '-o', outputPath
  ])
  return outputPath
}

const readCursorSnapshot = (probePath, identifier) => JSON.parse(
  execFileSync(probePath, [identifier], { encoding: 'utf-8' }).trim()
)

const readOptionalCursorSnapshot = (probePath, identifier) => {
  try {
    return readCursorSnapshot(probePath, identifier)
  } catch (_) {
    return null
  }
}

const waitForCursorSnapshot = async (probePath, identifier, predicate, timeoutMs = 4000) => {
  const deadline = Date.now() + timeoutMs
  let snapshot = readCursorSnapshot(probePath, identifier)
  while (!predicate(snapshot) && Date.now() < deadline) {
    await delay(40)
    snapshot = readCursorSnapshot(probePath, identifier)
  }
  assert.equal(predicate(snapshot), true, `Unexpected cursor snapshot for ${identifier}: ${JSON.stringify(snapshot)}`)
  return snapshot
}

const matchesReplacement = (snapshot, { width, height, hotspotX, hotspotY }) => (
  snapshot.width === width &&
  snapshot.height === height &&
  snapshot.hotspotX === hotspotX &&
  snapshot.hotspotY === hotspotY &&
  snapshot.frameCount === 1
)

const spawnHelper = ({ helperPath, configPath, messages, stderr }) => {
  const child = spawn(helperPath, ['--config', configPath, '--parent-pid', String(process.pid)], {
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const output = readline.createInterface({ input: child.stdout })
  output.on('line', (line) => messages.push(JSON.parse(line)))
  child.stderr.on('data', (chunk) => stderr.push(String(chunk)))
  const exitPromise = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })))
  return { child, exitPromise }
}

test('macOS cursor helper replaces, updates, and restores WindowServer cursors', { skip: !shouldRun }, async (t) => {
  const projectRoot = path.resolve(__dirname, '..', '..')
  const build = buildMacosSystemCursorHelper({ projectRoot })
  assert.ok(build.outputPath)

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-system-cursor-native-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const probePath = buildCursorRegistrationProbe(root)
  const firstImagePath = path.join(root, 'cursor-first.png')
  const secondImagePath = path.join(root, 'cursor-second.png')
  const configPath = path.join(root, 'config.json')
  const representativeIdentifiers = [
    'com.apple.coregraphics.ArrowS',
    'com.apple.cursor.13',
    'com.apple.coregraphics.Wait'
  ].filter((identifier) => readOptionalCursorSnapshot(probePath, identifier))
  assert.ok(representativeIdentifiers.length > 0, 'Expected at least one readable macOS cursor registration')
  const originalSnapshots = Object.fromEntries(
    representativeIdentifiers.map((identifier) => [identifier, readCursorSnapshot(probePath, identifier)])
  )
  const crashRepresentativeIdentifier = representativeIdentifiers.includes('com.apple.cursor.13')
    ? 'com.apple.cursor.13'
    : representativeIdentifiers[0]

  await sharp({
    create: {
      width: 37,
      height: 41,
      channels: 4,
      background: { r: 225, g: 45, b: 50, alpha: 1 }
    }
  }).png().toFile(firstImagePath)
  await sharp({
    create: {
      width: 29,
      height: 31,
      channels: 4,
      background: { r: 30, g: 190, b: 120, alpha: 1 }
    }
  }).png().toFile(secondImagePath)

  const firstConfig = {
    version: 'smoke-1',
    imagePath: firstImagePath,
    width: 37,
    height: 41,
    hotspotX: 3,
    hotspotY: 5
  }
  const secondConfig = {
    version: 'smoke-2',
    imagePath: secondImagePath,
    width: 29,
    height: 31,
    hotspotX: 7,
    hotspotY: 9
  }
  fs.writeFileSync(configPath, JSON.stringify(firstConfig))

  let activeChild = null
  t.after(async () => {
    if (activeChild?.exitCode === null) activeChild.kill('SIGKILL')
    try {
      execFileSync(build.outputPath, ['--restore'], { stdio: 'ignore' })
    } catch (_) {
      // The assertions retain the primary failure; cleanup remains best effort.
    }
  })

  const messages = []
  const stderr = []
  let running = spawnHelper({ helperPath: build.outputPath, configPath, messages, stderr })
  activeChild = running.child

  await waitForMessage(messages, 'ready', firstConfig.version)
  for (const identifier of representativeIdentifiers) {
    await waitForCursorSnapshot(
      probePath,
      identifier,
      (snapshot) => matchesReplacement(snapshot, firstConfig)
    )
  }

  fs.writeFileSync(configPath, JSON.stringify(secondConfig))
  assert.equal(running.child.kill('SIGHUP'), true)
  await waitForMessage(messages, 'updated', secondConfig.version)
  for (const identifier of representativeIdentifiers) {
    await waitForCursorSnapshot(
      probePath,
      identifier,
      (snapshot) => matchesReplacement(snapshot, secondConfig)
    )
  }

  running.child.kill('SIGTERM')
  assert.deepEqual(await running.exitPromise, { code: 0, signal: null })
  activeChild = null
  for (const identifier of representativeIdentifiers) {
    await waitForCursorSnapshot(
      probePath,
      identifier,
      (snapshot) => JSON.stringify(snapshot) === JSON.stringify(originalSnapshots[identifier])
    )
  }

  fs.writeFileSync(configPath, JSON.stringify(firstConfig))
  messages.length = 0
  running = spawnHelper({ helperPath: build.outputPath, configPath, messages, stderr })
  activeChild = running.child
  await waitForMessage(messages, 'ready', firstConfig.version)
  await waitForCursorSnapshot(
    probePath,
    crashRepresentativeIdentifier,
    (snapshot) => matchesReplacement(snapshot, firstConfig)
  )

  running.child.kill('SIGKILL')
  assert.deepEqual(await running.exitPromise, { code: null, signal: 'SIGKILL' })
  activeChild = null
  for (const identifier of representativeIdentifiers) {
    await waitForCursorSnapshot(
      probePath,
      identifier,
      (snapshot) => JSON.stringify(snapshot) === JSON.stringify(originalSnapshots[identifier])
    )
  }
  assert.deepEqual(stderr, [])
})
