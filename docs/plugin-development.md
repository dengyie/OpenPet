# OpenPet Plugin Development

OpenPet plugins are local JavaScript packages installed through the Control Center. They run in a short-lived isolated Node runner and can only reach the app through a permission-gated SDK.

For complete tested packages, start with [`examples/plugins/focus-timer`](../examples/plugins/focus-timer/) for storage and pet speech, [`examples/plugins/weather-status`](../examples/plugins/weather-status/) for JSON network allowlist usage, or [`examples/plugins/rss-reader`](../examples/plugins/rss-reader/) for public feed fetching and cached announcements.

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

### Network Example

Use `network.allowlist` for public HTTPS hosts, then keep requests narrow and free of credentials:

```json
{
  "permissions": ["network", "pet:say", "storage"],
  "network": {
    "allowlist": ["api.weather.example.com"]
  }
}
```

```js
const response = await ctx.network.fetch('https://api.weather.example.com/v1/current?location=Tokyo', {
  headers: {
    accept: 'application/json'
  }
})
```

The runtime rejects non-HTTPS URLs, hosts outside the allowlist, unsupported methods, sensitive headers such as `authorization` or `cookie`, oversized request bodies, oversized responses, and redirects to non-allowlisted hosts. See [`examples/plugins/weather-status`](../examples/plugins/weather-status/) for a complete package.

### RSS/Feed Example

For public XML feeds, keep the host fixed in `network.allowlist`, request only feed content, and cache normalized items in private storage:

```json
{
  "permissions": ["network", "pet:say", "storage"],
  "network": {
    "allowlist": ["feeds.example.com"]
  }
}
```

```js
const response = await ctx.network.fetch('https://feeds.example.com/openpet.xml', {
  headers: {
    accept: 'application/rss+xml, application/xml, text/xml'
  }
})
```

See [`examples/plugins/rss-reader`](../examples/plugins/rss-reader/) for a complete package that fetches RSS/Atom XML, stores the latest feed snapshot, and announces the newest item without live network dependency in tests.

## Install And Review Flow

Third-party plugins should be installed through Control Center -> Plugins -> Install plugin package.

The app inspects the package before install:

- Validates `plugin.json`, `main`, optional `configSchema`, permissions, network allowlist, paths, and symlinks.
- Computes file hashes and package hash.
- Reviews optional `signature.json` hash metadata.
- Shows permission and network allowlist diffs for updates.
- Installs or updates the plugin disabled by default.

Users must manually enable installed plugins before commands can run.

## Submission Validation

Before sharing a plugin package or opening a catalog PR, run the same package review logic used by the app:

```bash
npm run validate:plugin -- examples/plugins/focus-timer
npm run validate:plugin -- path/to/my-plugin.openpet-plugin.zip
```

The command validates the package through `PluginInstallService` without installing or running plugin code. It prints the plugin id, version, permissions, network allowlist, signature status, package hash, file count, and review risk.

Unsigned local plugins can pass structural validation with warnings. For stricter catalog or release preflight, require verified hash metadata:

```bash
npm run validate:plugin -- path/to/my-plugin.openpet-plugin.zip --require-signature
```

`--require-signature` only checks the current `signature.json` hash metadata status; it is not a public-key trust chain.

## Submission Report

To prepare a reviewer-facing packet for a third-party plugin submission, generate a report after validation:

```bash
npm run create-plugin-submission-report -- path/to/my-plugin.openpet-plugin.zip --output plugin-submission-report.md
```

The report reuses `validate:plugin`, then writes a Markdown or JSON packet with the plugin identity, requested permissions, network allowlist, command list, signature metadata status, package hash, validation warnings/errors, and reviewer checklist.

For strict catalog or release preflight, keep the signature requirement enabled:

```bash
npm run create-plugin-submission-report -- path/to/my-plugin.openpet-plugin.zip --require-signature --output plugin-submission-report.md
```

This report is evidence for human review, not an approval. It does not install, enable, or run plugin code; it also does not establish public-key signing trust or replace catalog policy.

## Packaging

To create a local distributable archive, zip the contents of the plugin directory so `plugin.json` is at the archive root, then name it with `.openpet-plugin.zip`.

```bash
cd examples/plugins/focus-timer
zip -qr focus-timer.openpet-plugin.zip .
```

Do not zip the parent directory unless `plugin.json` still lands at the archive root.

## Testing

Use the service tests as the source of truth for current runtime behavior:

- `tests/examples/focus-timer-plugin.test.js` covers the storage-oriented example plugin install and run path.
- `tests/examples/weather-status-plugin.test.js` covers the network allowlist example plugin install and run path with an injected fake fetch implementation.
- `tests/examples/rss-reader-plugin.test.js` covers the public feed example plugin install and run path with an injected fake fetch implementation.
- `tests/services/plugin-install-service.test.js` covers package review, install, update, uninstall, signatures, zip safety, and symlink rejection.
- `tests/services/plugin-service.test.js` covers runner isolation, SDK permissions, config, storage, AI, network, and logs.

Before submitting a plugin-related change, run:

```bash
npm run validate:plugin -- <plugin-dir-or-zip>
npm run create-plugin-submission-report -- <plugin-dir-or-zip> --output plugin-submission-report.md
npm test
npm run check:syntax
```
