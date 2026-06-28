const fs = require('fs')
const path = require('path')

const parsePluginProcessCommand = (command, { platform = process.platform } = {}) => {
  const input = String(command || '').trim()
  if (!input) throw new Error('Plugin service command is required')
  const parts = []
  let current = ''
  let quote = ''
  let escaping = false
  const allowBackslashEscapes = platform !== 'win32'

  for (const char of input) {
    if (escaping) {
      if (quote) {
        if (char === quote || char === '\\') current += char
        else current += `\\${char}`
      } else if (/\s/.test(char) || char === '"' || char === "'" || char === '\\') {
        current += char
      } else {
        current += `\\${char}`
      }
      escaping = false
      continue
    }
    if (allowBackslashEscapes && char === '\\') {
      escaping = true
      continue
    }
    if (quote) {
      if (char === quote) quote = ''
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        parts.push(current)
        current = ''
      }
      continue
    }
    current += char
  }

  if (escaping) current += '\\'
  if (quote) throw new Error('Plugin service command has an unterminated quote')
  if (current) parts.push(current)
  if (!parts.length) throw new Error('Plugin service command is required')
  const [file, ...args] = parts
  return { file, args }
}

const createPluginProcessEnv = ({ env = process.env, platform = process.platform } = {}) => {
  const nextEnv = {}
  if (env.PATH) nextEnv.PATH = env.PATH
  if (platform === 'win32') {
    if (env.SystemRoot) nextEnv.SystemRoot = env.SystemRoot
    if (env.WINDIR) nextEnv.WINDIR = env.WINDIR
  }
  return nextEnv
}

const createPluginEntryCwdResolver = ({
  existsSync = fs.existsSync,
  realpathSync = fs.realpathSync,
  resolvePath = path.resolve
} = {}) => {
  return (manifest, cwd, label) => {
    if (!manifest.basePath) throw new Error('Plugin services require a local plugin directory')
    const basePath = resolvePath(manifest.basePath)
    const targetPath = resolvePath(basePath, cwd || '.')
    if (targetPath !== basePath && !targetPath.startsWith(`${basePath}${path.sep}`)) {
      throw new Error(`Plugin ${label} cwd must stay inside the plugin directory`)
    }
    if (!existsSync(targetPath)) throw new Error(`Plugin ${label} cwd does not exist`)
    const realTargetPath = realpathSync(targetPath)
    const realBasePath = realpathSync(basePath)
    if (realTargetPath !== realBasePath && !realTargetPath.startsWith(`${realBasePath}${path.sep}`)) {
      throw new Error(`Plugin ${label} cwd must stay inside the plugin directory`)
    }
    return realTargetPath
  }
}

module.exports = {
  createPluginEntryCwdResolver,
  createPluginProcessEnv,
  parsePluginProcessCommand
}
