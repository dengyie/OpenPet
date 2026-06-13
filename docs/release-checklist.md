# OpenPet Release Checklist

> Purpose: keep local test builds, signed releases, and public artifacts reproducible without exposing signing credentials.

## 1. Preflight

- Confirm `CHANGELOG.md` has an entry for the release tag.
- Confirm `npm test` passes.
- Confirm `npm run check:syntax` passes.
- Confirm `npm run pack` creates an unsigned directory package.
- Confirm the About page shows the expected app version and packaged state.
- Confirm local HTTP remains disabled by default after a fresh install.

## 2. Upgrade Compatibility

- Before testing an OpenPet build over an existing ibot install, back up the local `appData/ibot` directory.
- Launch OpenPet and confirm it still uses the legacy `appData/ibot` userData directory.
- Confirm existing `settings.json`, `secrets.json`, installed plugins, installed pet packs, and local HTTP logs remain available.
- Confirm no duplicate OpenPet-only userData directory becomes the active data source during the upgrade.

Latest local RC smoke test: PASS on 2026-06-13. A temporary HOME with seeded `Library/Application Support/ibot` data launched the packaged `release/mac-arm64/OpenPet.app`, stayed running after startup, preserved legacy settings/secrets/plugins/pet-packs, and did not create an active `Library/Application Support/OpenPet` data source.

## 3. macOS Signing Inputs

Release signing and notarization must only read credentials from environment variables or the runner keychain:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `CSC_LINK` or a locally installed Developer ID Application certificate
- `CSC_KEY_PASSWORD` when `CSC_LINK` is used

The app must continue to build unsigned local packages when these variables are absent.

## 4. Release Build

- Create a tag named `vX.Y.Z` or `vX.Y.Z-rc.N`.
- Let GitHub Actions run the release workflow from the tag.
- Download the generated DMG/ZIP artifacts.
- Verify the app launches and shows the pet window.
- Open Control Center and smoke test Pet, Actions, AI, Plugins, Service, and About.

Current RC target: `v1.0.1-rc.1`.

## 5. macOS Verification

Run these checks on the signed app or mounted DMG output:

```bash
codesign --verify --deep --strict --verbose=2 "release/mac/OpenPet.app"
spctl --assess --type execute --verbose=4 "release/mac/OpenPet.app"
```

## 6. Update Check

- Publish the GitHub Release for the tag.
- Open Control Center → About.
- Run Check Updates.
- Confirm the latest version, release URL, and DMG/ZIP asset names are displayed.

## 7. Rollback

- Unpublish or mark a bad release as draft if it should not be discovered by update checks.
- Keep the previous release artifact available.
- Rotate any exposed CI signing credentials immediately if a workflow log or artifact leaks them.
