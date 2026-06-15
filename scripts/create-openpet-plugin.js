const fs = require('fs')
const path = require('path')

const TEMPLATES = new Set(['minimal', 'network', 'storage'])
const DEFAULT_OUTPUT_DIR = 'openpet-plugin'

const usage = () => [
  'Usage: node scripts/create-openpet-plugin.js <name> [options]',
  '',
  'Options:',
  '  --template <minimal|network|storage>  Template to generate. Defaults to minimal.',
  '  --output-dir <dir>                    Parent directory for the generated plugin. Defaults to openpet-plugin.',
  '  --id <pluginId>                       Plugin id. Defaults to openpet.plugin.<safe-name>.',
  '  --force                              Overwrite an existing generated plugin directory.',
  '  --json                               Print machine-readable JSON.',
  '',
  'Creates a local OpenPet plugin scaffold that uses public config only. Plugin-scoped secrets are not supported yet.'
].join('\n')

const parseArgs = (argv) => {
  const options = {
    name: '',
    template: 'minimal',
    outputDir: DEFAULT_OUTPUT_DIR,
    id: '',
    force: false,
    json: false,
    help: false
  }

  const readValue = (index, flag) => {
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    return value
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--template') {
      options.template = readValue(index, arg)
      index += 1
    } else if (arg === '--output-dir') {
      options.outputDir = readValue(index, arg)
      index += 1
    } else if (arg === '--id') {
      options.id = readValue(index, arg)
      index += 1
    } else if (arg === '--force') {
      options.force = true
    } else if (arg === '--json') {
      options.json = true
    } else if (!options.name) {
      options.name = arg
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }

  if (!TEMPLATES.has(options.template)) throw new Error(`Unknown plugin template: ${options.template}`)
  return options
}

const safeNameSlug = (name) => {
  const slug = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'my-plugin'
}

const titleCaseName = (name) => String(name || 'My Plugin')
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
  .join(' ') || 'My Plugin'

const defaultPluginId = (name) => `openpet.plugin.${safeNameSlug(name)}`

const createManifest = ({ name, id, template }) => {
  const permissions = ['pet:say']
  if (template === 'network') permissions.push('network')
  if (template === 'storage') permissions.push('storage')
  return {
    id,
    name: titleCaseName(name),
    version: '0.1.0',
    description: `${titleCaseName(name)} OpenPet plugin.`,
    main: 'index.js',
    configSchema: 'config.schema.json',
    permissions,
    ...(template === 'network' ? { network: { allowlist: ['api.example.com'] } } : {}),
    commands: [
      {
        id: template === 'storage' ? 'increment' : 'run',
        title: template === 'storage' ? 'Increment counter' : 'Run'
      }
    ]
  }
}

const createConfigSchema = ({ name, template }) => {
  if (template === 'network') {
    return {
      title: `${titleCaseName(name)} Settings`,
      description: 'Public request settings. Do not store API keys, tokens, passwords, or private credentials here.',
      type: 'object',
      properties: {
        path: {
          type: 'string',
          title: 'Request path',
          description: 'Public path requested from the allowlisted host.',
          default: '/status'
        },
        announce: {
          type: 'boolean',
          title: 'Announce result',
          description: 'Ask the pet to announce that the request completed.',
          default: true
        }
      }
    }
  }

  if (template === 'storage') {
    return {
      title: `${titleCaseName(name)} Settings`,
      description: 'Public counter settings. Plugin storage is for non-secret state only.',
      type: 'object',
      properties: {
        label: {
          type: 'string',
          title: 'Counter label',
          description: 'Label included in the pet announcement.',
          default: 'Counter'
        },
        step: {
          type: 'number',
          title: 'Step',
          description: 'Amount added to the stored counter.',
          default: 1,
          enum: [1, 2, 5]
        }
      }
    }
  }

  return {
    title: `${titleCaseName(name)} Settings`,
    description: 'Public message settings. Do not store API keys, tokens, passwords, or private credentials here.',
    type: 'object',
    properties: {
      message: {
        type: 'string',
        title: 'Message',
        description: 'Message the pet will say.',
        default: 'Hello from OpenPet!'
      }
    }
  }
}

const createIndexJs = ({ template }) => {
  if (template === 'network') {
    return [
      'module.exports = function activate(ctx) {',
      '  return {',
      '    run: async () => {',
      "      const path = ctx.config.get('path') || '/status'",
      "      const normalizedPath = path.startsWith('/') ? path : `/${path}`",
      "      const response = await ctx.network.fetch(`https://api.example.com${normalizedPath}`, {",
      "        headers: { accept: 'application/json' }",
      '      })',
      "      if (ctx.config.get('announce')) {",
      "        await ctx.pet.say(`Network request completed with status ${response.status}`)",
      '      }',
      '      return { ok: response.ok, status: response.status }',
      '    }',
      '  }',
      '}',
      ''
    ].join('\n')
  }

  if (template === 'storage') {
    return [
      'module.exports = function activate(ctx) {',
      '  return {',
      '    increment: async () => {',
      "      const label = ctx.config.get('label') || 'Counter'",
      "      const step = ctx.config.get('step') || 1",
      "      const current = await ctx.storage.get('count', 0)",
      '      const next = current + step',
      "      await ctx.storage.set('count', next)",
      '      await ctx.pet.say(`${label}: ${next}`)',
      '      return { ok: true, count: next }',
      '    }',
      '  }',
      '}',
      ''
    ].join('\n')
  }

  return [
    'module.exports = function activate(ctx) {',
    '  return {',
    '    run: async () => {',
    "      const message = ctx.config.get('message') || 'Hello from OpenPet!'",
    '      await ctx.pet.say(message)',
    '      return { ok: true }',
    '    }',
    '  }',
    '}',
    ''
  ].join('\n')
}

const createReadme = ({ name, id, template }) => [
  `# ${titleCaseName(name)}`,
  '',
  `Template: ${template}`,
  `Plugin id: \`${id}\``,
  '',
  'This scaffold uses public configuration only. OpenPet does not support plugin-scoped secrets yet; do not add API keys, tokens, passwords, cookies, or private credentials to `config.schema.json`, plugin storage, or network headers.',
  '',
  '## Validate',
  '',
  '```bash',
  'npm run validate:plugin -- path/to/this-plugin',
  '```',
  ''
].join('\n')

const writeJson = (filePath, value, fsImpl = fs) => {
  fsImpl.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const createOpenPetPlugin = ({
  name,
  template = 'minimal',
  outputDir = DEFAULT_OUTPUT_DIR,
  id = '',
  force = false,
  now = () => new Date(),
  fsImpl = fs
} = {}) => {
  if (!name) throw new Error('Plugin name is required')
  if (!TEMPLATES.has(template)) throw new Error(`Unknown plugin template: ${template}`)
  const pluginId = id || defaultPluginId(name)
  const pluginDir = path.resolve(outputDir, safeNameSlug(pluginId))
  if (fsImpl.existsSync(pluginDir) && !force) throw new Error(`Plugin directory already exists: ${pluginDir}`)
  fsImpl.rmSync(pluginDir, { recursive: true, force: true })
  fsImpl.mkdirSync(pluginDir, { recursive: true })

  const manifest = createManifest({ name, id: pluginId, template })
  const configSchema = createConfigSchema({ name, template })
  writeJson(path.join(pluginDir, 'plugin.json'), manifest, fsImpl)
  writeJson(path.join(pluginDir, 'config.schema.json'), configSchema, fsImpl)
  fsImpl.writeFileSync(path.join(pluginDir, 'index.js'), createIndexJs({ template }))
  fsImpl.writeFileSync(path.join(pluginDir, 'README.md'), createReadme({ name, id: pluginId, template }))

  return {
    generatedAt: now().toISOString(),
    template,
    pluginDir,
    plugin: manifest
  }
}

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const result = createOpenPetPlugin(options)
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`OpenPet plugin scaffold created: ${result.pluginDir}`)
    console.log(`Plugin: ${result.plugin.id}`)
    console.log(`Template: ${result.template}`)
    console.log('Next: npm run validate:plugin -- <plugin-dir>')
  }
}

if (require.main === module) {
  try {
    main()
  } catch (err) {
    console.error(err.message || err)
    process.exit(1)
  }
}

module.exports = {
  TEMPLATES,
  createOpenPetPlugin,
  defaultPluginId,
  parseArgs
}
