# Focus Timer Example Plugin

This directory is a minimal third-party plugin package for OpenPet. It is meant to be installed through Control Center -> Plugins -> Install plugin package, or inspected by `PluginInstallService` in tests.

## What It Demonstrates

- `plugin.json` manifest fields used by the current local plugin runtime.
- A separate `config.schema.json` file for Control Center generated settings.
- A local `index.js` command module executed by the isolated runner.
- Permission-gated SDK calls through `ctx.pet.say()` and `ctx.storage`.
- Private per-plugin storage for session counters.

## Manifest

The example asks for only two permissions:

- `pet:say` lets the plugin ask `PetService` to show pet speech.
- `storage` lets the plugin persist its own private JSON values.

It intentionally does not request `network`, `ai:chat`, `pet:action`, or `pet:event`.

## Commands

- `start`: announces a focus session and increments `sessionsCompleted` in plugin storage.
- `reset`: resets the session counter and clears the last session snapshot.

## Package Shape

```text
focus-timer/
├── plugin.json
├── config.schema.json
├── index.js
└── README.md
```

To distribute it as a local package, zip the contents of this directory so `plugin.json` is at the archive root, then name the archive with `.openpet-plugin.zip`.
