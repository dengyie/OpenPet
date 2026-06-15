# OpenPet Plugin Development

OpenPet plugins are local JavaScript packages installed through the Control Center. They run in a short-lived isolated Node runner and can only reach the app through a permission-gated SDK.

For a complete tested package, start with [`examples/plugins/focus-timer`](../examples/plugins/focus-timer/).

## Package Layout

```text
my-plugin/
├── plugin.json
├── config.schema.json
└── index.js
```

`plugin.json` must be at the root of the plugin directory or zip archive. Optional files must stay inside the package; absolute paths, path traversal, unsafe zip entries, and symlinks are rejected before install.

## Manifest

```json
{
  "id": "com.example.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "A sample plugin",
  "main": "index.js",
  "configSchema": "config.schema.json",
  "permissions": ["pet:say", "storage"],
  "network": {
    "allowlist": []
  },
  "commands": [
    {
      "id": "greet",
      "title": "Greet"
    }
  ]
}
```

Important fields:

- `id`: safe id using letters, numbers, `_`, `.`, or `-`.
- `main`: safe relative path to a JavaScript file.
- `configSchema`: optional safe relative path to an object JSON schema.
- `permissions`: explicit capabilities requested from the SDK.
- `network.allowlist`: HTTPS public DNS hosts only, such as `api.example.com`.
- `commands`: command ids and titles shown in Control Center.

Allowed permissions are `pet:say`, `pet:action`, `pet:event`, `ai:chat`, `storage`, `network`, and `commands`.

## Entry Point

The main file must export an `activate(ctx)` function. It can return command handlers or register them through `ctx.commands.register()`.

```js
module.exports = function activate(ctx) {
  return {
    greet: async () => {
      const message = ctx.config.get('message') || 'Hello!'
      await ctx.pet.say(message)
      return { ok: true }
    }
  }
}
```

ES module style `export default function activate(ctx) {}` is also accepted by the local runner.

## Configuration Schema

OpenPet supports object schemas with `string`, `number`, and `boolean` properties. `enum`, `default`, `title`, `description`, and `required` are supported.

```json
{
  "title": "My Plugin Settings",
  "type": "object",
  "properties": {
    "message": {
      "type": "string",
      "title": "Message",
      "default": "Hello!"
    },
    "rounds": {
      "type": "number",
      "title": "Rounds",
      "default": 1,
      "enum": [1, 3, 5]
    },
    "enabled": {
      "type": "boolean",
      "title": "Enabled",
      "default": true
    }
  }
}
```

Plugins can read normalized values with `ctx.config.get()` or `ctx.config.get(key)`. Configuration is saved by the app, not by plugin code.

## SDK

```js
const config = ctx.config.get()
const message = ctx.config.get('message')

await ctx.pet.say('Hello')
await ctx.pet.playAction('working')
await ctx.pet.setEvent({ type: 'status', message: 'Busy' })

const count = await ctx.storage.get('count', 0)
await ctx.storage.set('count', count + 1)
await ctx.storage.remove('count')
await ctx.storage.clear()

const ai = await ctx.ai.chat({ message: 'Encourage me', conversationId: 'focus' })
const response = await ctx.network.fetch('https://api.example.com/status')

ctx.commands.register({
  id: 'start',
  handler: async () => ({ ok: true })
})
```

SDK calls are permission checked in the main process:

- `ctx.pet.say()` requires `pet:say`.
- `ctx.pet.playAction()` requires `pet:action`.
- `ctx.pet.setEvent()` requires `pet:event`.
- `ctx.storage.*` requires `storage` and is limited to 64KB per plugin and 16KB per value.
- `ctx.ai.chat()` requires `ai:chat`; API keys never enter the plugin runner.
- `ctx.network.fetch()` requires `network`; requests are limited to HTTPS hosts in `network.allowlist` and sensitive headers are rejected.

## Install And Review Flow

Third-party plugins should be installed through Control Center -> Plugins -> Install plugin package.

The app inspects the package before install:

- Validates `plugin.json`, `main`, optional `configSchema`, permissions, network allowlist, paths, and symlinks.
- Computes file hashes and package hash.
- Reviews optional `signature.json` hash metadata.
- Shows permission and network allowlist diffs for updates.
- Installs or updates the plugin disabled by default.

Users must manually enable installed plugins before commands can run.

## Packaging

To create a local distributable archive, zip the contents of the plugin directory so `plugin.json` is at the archive root, then name it with `.openpet-plugin.zip`.

```bash
cd examples/plugins/focus-timer
zip -qr focus-timer.openpet-plugin.zip .
```

Do not zip the parent directory unless `plugin.json` still lands at the archive root.

## Testing

Use the service tests as the source of truth for current runtime behavior:

- `tests/examples/focus-timer-plugin.test.js` covers the example plugin install and run path.
- `tests/services/plugin-install-service.test.js` covers package review, install, update, uninstall, signatures, zip safety, and symlink rejection.
- `tests/services/plugin-service.test.js` covers runner isolation, SDK permissions, config, storage, AI, network, and logs.

Before submitting a plugin-related change, run:

```bash
npm test
npm run check:syntax
```
