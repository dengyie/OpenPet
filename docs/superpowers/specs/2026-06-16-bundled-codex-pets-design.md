# Bundled Codex Pets Design

**Goal:** Ship a small set of cute non-Codex-like Codex pet assets as built-in OpenPet pet packs.

**Selection:** Bundle three downloaded codex-pets.net assets:
- `doro`: tiny white chibi pet with pink hair.
- `duodong`: cute beagle-style pet.
- `chispa`: tiny retro helper robot.

Excluded from the first bundle:
- `clawd` and `clippit`, because they overlap with Codex/assistant-like identity.
- political/personality caricatures and high-risk obvious IP/celebrity assets.
- `guga`, because it is cute but carries a `celeb` tag in the source metadata.

**Architecture:** Store expanded pet packs under `assets/pet-packs/<id>/pet.json` and `spritesheet.webp`. `PetPackService` scans that directory at startup, validates each bundled pack through the existing loader and file validation path, and exposes them as `source = "built-in"` alongside `legacy-cat`. Built-in packs are selectable but not removable, and the active pack setting can point directly at a bundled pack id.

**Packaging:** Add `assets/pet-packs/**/*` to the Electron builder file list so packaged apps include these assets.

**Testing:** Add service tests for bundled pack listing, activation, action-service loading, and removal protection. Add a real asset test that validates the checked-in bundled packs load through the production loader.

