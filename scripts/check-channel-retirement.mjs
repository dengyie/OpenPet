import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_CHANNELS = 158
// T40's hard ceiling is the 41 long-lived window/native channels from 02.
// The four later QQ/WeCom host-secret additions remain active, but are
// blocked:T44 until the secrets boundary is migrated; they are not counted
// as long-lived IPC keep rows.
const MAX_KEEP = 41
const LEDGER_RELATIVE_PATH = 'docs/refactor/15-channel-retirement.md'
const IPC_RELATIVE_PATH = 'src/shared/ipc-channels.ts'
const IPC_MIRROR_RELATIVE_PATH = 'src/shared/ipc-channels.js'
const REGISTRATION_RELATIVE_PATHS = ['src/main/ipc.js', 'src/main/ipc']
const PRODUCTION_ROOT_FILES = ['main.js', 'preload.js', 'renderer.js', 'control-center-preload.js']
const PRODUCTION_ROOT_DIRECTORIES = ['src/main']

const fail = (message) => {
  throw new Error(message)
}

const readFile = (filePath) => fs.readFileSync(filePath, 'utf8')

const parseIpcChannels = (source) => {
  const channels = []
  for (const match of source.matchAll(/^\s+([A-Z0-9_]+):\s*'([^']+)'/gm)) {
    channels.push({ key: match[1], channel: match[2] })
  }
  return channels
}

const parseIpcReferences = (source) => [...source.matchAll(/\bIPC\.([A-Z0-9_]+)/g)].map((match) => match[1])

const findDuplicateValues = (values) => {
  const counts = new Map()
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1)
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value)
}

const parseLedger = (source) => {
  const lines = source.split(/\r?\n/)
  const headerIndex = lines.findIndex((line) => /^\|\s*IPC channel\s*\|\s*Status\s*\|\s*HTTP route \/ blocker\s*\|\s*Source\s*\|\s*Reason\s*\|\s*Retired by\s*\|\s*$/.test(line))
  if (headerIndex < 0) fail('Ledger table header is missing')

  const rows = []
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.startsWith('|')) continue
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
    if (cells.length !== 6) continue
    const channelMatch = cells[0].match(/^`([^`]+)`$/)
    const statusMatch = cells[1].match(/^`([^`]+)`$/)
    if (!channelMatch || !statusMatch) fail(`Malformed ledger row: ${line}`)
    if (!cells[2] || cells[2] === '—' || !cells[3] || cells[3] === '—' || !cells[4] || cells[4] === '—' || !cells[5]) {
      fail(`Ledger row must include route/blocker and reason: ${channelMatch[1]}`)
    }
    rows.push({
      channel: channelMatch[1],
      status: statusMatch[1],
      routeOrBlocker: cells[2],
      source: cells[3],
      reason: cells[4],
      retiredBy: cells[5]
    })
  }
  return rows
}

const relativePath = (root, filePath) => path.relative(root, filePath).split(path.sep).join('/')

const readProductionSources = (root) => {
  const files = []
  for (const relativePath of PRODUCTION_ROOT_FILES) {
    const filePath = path.join(root, relativePath)
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) files.push(filePath)
  }
  for (const relativePath of PRODUCTION_ROOT_DIRECTORIES) {
    const directory = path.join(root, relativePath)
    if (!fs.existsSync(directory)) continue
    const walk = (current) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const filePath = path.join(current, entry.name)
        if (entry.isDirectory()) walk(filePath)
        else if (entry.isFile() && entry.name.endsWith('.js')) files.push(filePath)
      }
    }
    walk(directory)
  }
  return [...new Set(files)].sort()
}

const readRegistrationSources = (root) => {
  const files = []
  for (const relativePath of REGISTRATION_RELATIVE_PATHS) {
    const target = path.join(root, relativePath)
    if (!fs.existsSync(target)) continue
    if (fs.statSync(target).isFile()) files.push(target)
    else {
      for (const entry of fs.readdirSync(target).filter((name) => name.endsWith('.js'))) {
        files.push(path.join(target, entry))
      }
    }
  }
  return files
}

const parseRegistrations = (root) => {
  const registrations = []
  for (const filePath of readRegistrationSources(root)) {
    const source = readFile(filePath)
    for (const match of source.matchAll(/ipcMainService\.(?:handle|on)\(IPC\.([A-Z0-9_]+)/g)) {
      registrations.push({ key: match[1], filePath: relativePath(root, filePath) })
    }
  }
  return registrations
}

const parseProductionReferences = (root) => {
  const references = []
  for (const filePath of readProductionSources(root)) {
    const source = readFile(filePath)
    for (const key of parseIpcReferences(source)) references.push({ key, filePath: relativePath(root, filePath) })
  }
  return references
}

const parseEventReferences = (root) => {
  const references = []
  for (const filePath of readProductionSources(root)) {
    const source = readFile(filePath)
    // Event-only channels are observable on either side of the window bridge:
    // listeners use ipcRenderer.on, while senders use webContents/sender/send
    // or the existing sendTo* helpers.  Keep this parser line-oriented so it
    // cannot mistake an invoke/handler registration for an event source.
    const lines = source.split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (!/(ipcRenderer\.on|\.webContents(?:\?\.)?\.send|\.send\?\.\(|sendTo(?:PetWindow|ControlCenterWindow)\s*\()/.test(line)) continue
      for (const key of parseIpcReferences(line)) references.push({ key, filePath: relativePath(root, filePath) })
    }
  }
  return references
}

const validateChannelRetirement = ({ ledger, ipcChannels, registrations = [], eventReferences = [], productionReferences = [], mirrorChannels = null }) => {
  if (ipcChannels.length > MAX_CHANNELS) fail(`IPC channel count ${ipcChannels.length} exceeds maximum ${MAX_CHANNELS}`)
  const sourceDuplicates = findDuplicateValues(ipcChannels.map(({ channel }) => channel))
  if (sourceDuplicates.length) fail(`IPC source contains duplicate channel values: ${sourceDuplicates.join(', ')}`)
  const keyDuplicates = findDuplicateValues(ipcChannels.map(({ key }) => key))
  if (keyDuplicates.length) fail(`IPC source contains duplicate constant keys: ${keyDuplicates.join(', ')}`)

  if (mirrorChannels) {
    const sourceByKey = new Map(ipcChannels.map(({ key, channel }) => [key, channel]))
    const mirrorByKey = new Map(mirrorChannels.map(({ key, channel }) => [key, channel]))
    const missing = [...sourceByKey.keys()].filter((key) => !mirrorByKey.has(key))
    const extra = [...mirrorByKey.keys()].filter((key) => !sourceByKey.has(key))
    const mismatched = [...sourceByKey.keys()].filter((key) => mirrorByKey.get(key) !== sourceByKey.get(key))
    if (missing.length || extra.length || mismatched.length) {
      fail(`IPC TS/JS source mismatch: missing=${missing.join(', ') || 'none'}, extra=${extra.join(', ') || 'none'}, mismatched=${mismatched.join(', ') || 'none'}`)
    }
  }

  const activeLedger = ledger.filter(({ status }) => status !== 'retired')
  const retiredLedger = ledger.filter(({ status }) => status === 'retired')
  const ledgerChannels = ledger.map(({ channel }) => channel)
  const ledgerDuplicates = findDuplicateValues(ledgerChannels)
  if (ledgerDuplicates.length) fail(`Ledger contains duplicate channels: ${ledgerDuplicates.join(', ')}`)

  const expected = new Set(ipcChannels.map(({ channel }) => channel))
  const actual = new Set(activeLedger.map(({ channel }) => channel))
  const missing = [...expected].filter((channel) => !actual.has(channel))
  const extra = [...actual].filter((channel) => !expected.has(channel))
  const retiredStillInSource = retiredLedger.filter(({ channel }) => expected.has(channel)).map(({ channel }) => channel)
  if (activeLedger.length !== ipcChannels.length || missing.length || extra.length || retiredStillInSource.length) {
    fail(`Ledger/IPC channel mismatch: active=${activeLedger.length}, IPC=${ipcChannels.length}, historical=${retiredLedger.length}, missing=${missing.join(', ') || 'none'}, extra=${extra.join(', ') || 'none'}, retired-in-source=${retiredStillInSource.join(', ') || 'none'}`)
  }

  const keyToChannel = new Map(ipcChannels.map(({ key, channel }) => [key, channel]))
  const unknownRegistrations = registrations.filter(({ key }) => !keyToChannel.has(key))
  if (unknownRegistrations.length) {
    fail(`IPC registration references unknown channel constants: ${unknownRegistrations.map(({ key }) => key).join(', ')}`)
  }
  const unknownProductionReferences = productionReferences.filter(({ key }) => !keyToChannel.has(key))
  if (unknownProductionReferences.length) {
    fail(`Production IPC references unknown channel constants: ${unknownProductionReferences.map(({ key, filePath }) => `${key} (${filePath})`).join(', ')}`)
  }
  const duplicateRegistrations = findDuplicateValues(registrations.map(({ key }) => key))
  if (duplicateRegistrations.length) fail(`IPC registration contains duplicate handlers: ${duplicateRegistrations.join(', ')}`)

  const registeredKeys = new Set(registrations.map(({ key }) => key))
  const eventKeys = new Set(eventReferences.map(({ key }) => key))
  const uncovered = ipcChannels.filter(({ key }) => !registeredKeys.has(key) && !eventKeys.has(key)).map(({ key }) => key)
  if (uncovered.length) fail(`IPC constants have no registration or event source: ${uncovered.join(', ')}`)
  const unknownEvents = eventReferences.filter(({ key }) => !keyToChannel.has(key))
  if (unknownEvents.length) fail(`IPC event references unknown channel constants: ${unknownEvents.map(({ key, filePath }) => `${key} (${filePath})`).join(', ')}`)

  const invalidStatus = ledger.filter(({ status }) => !/^(keep|dead|retired|cutover:[a-z0-9-]+|blocked:T\d+)$/.test(status))
  if (invalidStatus.length) fail(`Invalid ledger status: ${invalidStatus.map(({ channel, status }) => `${channel}=${status}`).join(', ')}`)
  for (const row of ledger) {
    if (row.status === 'retired') {
      if (!/^[0-9a-f]{7,40}$/i.test(row.retiredBy.trim())) fail(`Retired ledger row must include a commit SHA: ${row.channel}`)
    } else if (row.retiredBy.trim() !== '—') {
      fail(`Active ledger row must leave Retired by as —: ${row.channel}`)
    }
  }
  const keepCount = activeLedger.filter(({ status }) => status === 'keep').length
  const cutoverCount = activeLedger.filter(({ status }) => status.startsWith('cutover:')).length
  const blockedCount = activeLedger.filter(({ status }) => status.startsWith('blocked:')).length
  const deadCount = activeLedger.filter(({ status }) => status === 'dead').length
  if (keepCount > MAX_KEEP) fail(`keep count ${keepCount} exceeds maximum ${MAX_KEEP}`)
  if (cutoverCount === 0) fail('Ledger must contain at least one cutover:<domain> row')

  const sourceByChannel = new Map(ipcChannels.map(({ key, channel }) => [channel, key]))
  for (const row of activeLedger) {
    const key = sourceByChannel.get(row.channel)
    const validSources = new Set([
      ...registrations.filter((entry) => entry.key === key).map((entry) => entry.filePath),
      ...eventReferences.filter((entry) => entry.key === key).map((entry) => entry.filePath)
    ])
    const declaredSources = row.source.split(',').map((value) => value.trim().replace(/^`|`$/g, '')).filter(Boolean)
    if (!declaredSources.every((source) => validSources.has(source))) {
      fail(`Ledger source is not a real IPC reference for ${row.channel}: ${declaredSources.join(', ') || 'none'}`)
    }
  }

  return { ipcCount: ipcChannels.length, ledgerCount: ledger.length, activeCount: activeLedger.length, historicalCount: retiredLedger.length, keepCount, cutoverCount, blockedCount, deadCount, registrationCount: registrations.length, eventOnlyCount: ipcChannels.filter(({ key }) => !registeredKeys.has(key)).length }
}

const parseArgs = (argv) => {
  const options = { root: process.cwd(), help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--root') {
      const value = argv[++index]
      if (!value || value.startsWith('--')) fail('--root requires a value')
      options.root = path.resolve(value)
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      fail(`Unexpected argument: ${arg}`)
    }
  }
  return options
}

const run = ({ root }) => {
  const ledger = parseLedger(readFile(path.join(root, LEDGER_RELATIVE_PATH)))
  const ipcChannels = parseIpcChannels(readFile(path.join(root, IPC_RELATIVE_PATH)))
  const mirrorPath = path.join(root, IPC_MIRROR_RELATIVE_PATH)
  const mirrorChannels = fs.existsSync(mirrorPath) ? parseIpcChannels(readFile(mirrorPath)) : null
  const registrations = parseRegistrations(root)
  const eventReferences = parseEventReferences(root)
  const result = validateChannelRetirement({ ledger, ipcChannels, mirrorChannels, registrations, eventReferences, productionReferences: parseProductionReferences(root) })
  console.log(`ok channel-retirement current=${result.activeCount} historical=${result.historicalCount} registrations=${result.registrationCount} event-only=${result.eventOnlyCount} keep=${result.keepCount} cutover=${result.cutoverCount} blocked=${result.blockedCount} dead=${result.deadCount}`)
  return result
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
      console.log('Usage: node scripts/check-channel-retirement.mjs [--root <repo>]')
    } else {
      run(options)
    }
  } catch (error) {
    console.error(`channel-retirement: ${error.message || error}`)
    process.exitCode = 1
  }
}

export {
  MAX_CHANNELS,
  MAX_KEEP,
  parseIpcChannels,
  parseIpcReferences,
  parseLedger,
  parseRegistrations,
  parseProductionReferences,
  parseEventReferences,
  validateChannelRetirement
}
