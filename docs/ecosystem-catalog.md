# OpenPet Ecosystem Catalog

`catalog/openpet-catalog.json` is the first productized catalog format for plugins and pet packs. It is a static JSON file bundled with the app. Future marketplace backends should emit the same shape so the Control Center and `CatalogService` do not need a new trust model.

## Rules

- Catalog entries are metadata only. They never execute code.
- Downloadable entries must include both `packageUrl` and `sha256`.
- `packageUrl` must use HTTPS.
- Downloaded bytes must match `sha256` before inspection or installation starts.
- Plugins still go through `PluginInstallService` review before install/update.
- Pet packs still go through `PetPackService.inspectPackDirectory()` before import.
- Local blocklist entries are stored in `settings.ecosystem.blocklist` and can be managed in Control Center → Catalog.

## Shape

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-06-12T00:00:00.000Z",
  "feedbackUrl": "https://github.com/dengyie/openpet/issues/new",
  "blocklist": {
    "pluginIds": [],
    "packIds": [],
    "sha256": []
  },
  "plugins": [
    {
      "id": "focus-timer",
      "name": "Focus Timer",
      "version": "1.0.0",
      "description": "Short focus sessions with pet reminders.",
      "author": "openpet-labs",
      "openpetApiVersion": "1.x",
      "permissions": ["pet:say", "storage"],
      "networkAllowlist": [],
      "packageUrl": "https://example.com/focus-timer.openpet-plugin.zip",
      "sha256": "64 lowercase hex characters",
      "reportUrl": "https://github.com/dengyie/openpet/issues/new"
    }
  ],
  "petPacks": [
    {
      "id": "pixel-cat",
      "displayName": "Pixel Cat",
      "version": "1.0.0",
      "description": "A compact pixel-art cat pack.",
      "author": "openpet-labs",
      "petPackSchemaVersion": 1,
      "actionCount": 6,
      "previewImage": "https://example.com/pixel-cat.png",
      "packageUrl": "https://example.com/pixel-cat.openpet-pet.zip",
      "sha256": "64 lowercase hex characters",
      "reportUrl": "https://github.com/dengyie/openpet/issues/new"
    }
  ]
}
```

## Blocklist

Blocklist checks are applied in four places:

- catalog prepare/install for plugins and pet packs
- manual plugin install/update
- plugin enable/run
- pet pack import/activate

`sha256` may match either the downloaded package hash or the installed content hash, depending on how the item entered the system.

`openpetApiVersion` is the preferred compatibility field for plugin catalog entries. Existing `ibotApiVersion` metadata is still normalized by `CatalogService` for legacy catalog compatibility.
