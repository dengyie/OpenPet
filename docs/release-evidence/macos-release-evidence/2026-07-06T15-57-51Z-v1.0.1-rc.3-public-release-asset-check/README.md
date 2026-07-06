# OpenPet macOS Public Release Asset Check

Generated from public `v1.0.1-rc.3` GitHub Release assets without launching the app.

## What Was Checked

- Public ZIP asset: `OpenPet-1.0.1-rc.3-mac-arm64.zip`
- Public DMG asset: `OpenPet-1.0.1-rc.3-mac-arm64.dmg`
- Release page: `https://github.com/dengyie/OpenPet/releases/tag/v1.0.1-rc.3`
- Successful release workflow run metadata: `https://github.com/dengyie/OpenPet/actions/runs/28060966745`

## Observed Result

Both the public ZIP and the mounted DMG copy of `OpenPet.app` failed local `codesign --verify --deep --strict --verbose=2` and `spctl --assess --type execute --verbose=4` with the same message:

```text
code has no resources but signature indicates they must be present
```

That means this archive is real negative evidence for the currently published macOS assets. It does not prove signed release readiness.

## Artifact Access Note

GitHub Actions metadata for run `28060966745` shows a non-expired artifact named `openpet-macos-release-evidence-v1.0.1-rc.3`, but its `archive_download_url` returned HTTP 401 in this environment. So this archive could validate the public release assets and release workflow metadata, but it could not directly import the uploaded workflow evidence artifact contents.
