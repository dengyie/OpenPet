# Imported Artifact Reconstruction Note

All runtime checks remain pending. This checklist is archived to preserve the expected review shape only.

# OpenPet Windows Smoke Manual Checklist

This checklist is generated from the same required check matrix used by the JSON validator. Attach concrete evidence before marking any check as pass.

| Check ID | What To Prove | Evidence Guidance |
|----------|---------------|-------------------|
| `install` | Install NSIS package on a clean Windows machine | Record the installer filename, install mode, target path, and whether Start Menu/Desktop shortcuts were created. |
| `launch` | Launch installed app and keep it running | Record the launch method, app version shown in About, and a short observation that the app stayed running. |
| `transparent-window` | Transparent pet window renders with alpha | Attach a screenshot or screen recording showing the pet window alpha background on the Windows desktop. |
| `drag-bounds` | Drag, bounds, always-on-top, and taskbar behavior | Record drag behavior, monitor bounds, always-on-top behavior, focus behavior, and taskbar visibility. |
| `control-center-tabs` | Control Center opens all tabs | Record that Pet, Actions, AI, Plugins, Catalog, Service, and About tabs open without renderer errors. |
| `pet-actions` | Built-in sprites and imported frame folders work | Record built-in action playback and one imported frame-folder action regenerated from Windows paths. |
| `pet-pack-import` | Pet pack import, enable, and delete works on Windows paths | Record inspect/import/activate/delete of a pet pack under the Windows userData directory. |
| `plugin-runner` | Plugin runner works on Windows paths with restricted permissions | Record an official plugin command and a local plugin command running with restricted permissions. |
| `local-http-default-off` | Local HTTP and MCP remain disabled by default | Record a fresh profile showing Local HTTP and MCP disabled before the user enables them. |
| `local-http-token-gated` | Local HTTP and MCP are loopback-only and token-gated | Record loopback binding, rejected unauthenticated mutation, accepted token-authenticated mutation, and MCP token/session behavior. |
| `api-key-isolation` | API keys are unavailable to renderer and ordinary plugins | Record that AI config can save a key while renderer/plugin-visible config never exposes plaintext secret values. |
| `about-update-assets` | About update check shows only Windows install assets | Record About update results showing Windows installers and hiding macOS assets/feed metadata. |
| `uninstall` | Uninstall preserves user data unless explicitly removed | Record uninstall result, relaunch absence, and preserved user data when uninstall is not asked to delete app data. |
