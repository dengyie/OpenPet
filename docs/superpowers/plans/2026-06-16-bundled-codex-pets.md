# Bundled Codex Pets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add selected codex-pets.net assets as bundled built-in OpenPet pet packs.

**Architecture:** Keep user-installed pet packs under `userData`; add read-only bundled packs under `assets/pet-packs`; load them through the same pet pack loader and summary path as existing packs.

**Tech Stack:** Electron, Node native test runner, existing Codex pet adapter.

---

### Task 1: Failing Tests

**Files:**
- Modify: `tests/services/pet-pack-service.test.js`
- Add: `tests/pet-pack/bundled-assets.test.js`

- [x] Write tests for listing, activating, and protecting bundled packs.
- [x] Write tests that load checked-in bundled assets.
- [x] Run tests and confirm they fail before implementation/assets are present.

### Task 2: Bundled Pack Service Support

**Files:**
- Modify: `src/main/services/pet-pack-service.js`
- Modify: `package.json`

- [x] Add bundled directory scanning.
- [x] Treat bundled pack ids as built-in and not removable.
- [x] Include `assets/pet-packs/**/*` in packaged app files.

### Task 3: Assets and Verification

**Files:**
- Add: `assets/pet-packs/doro/pet.json`
- Add: `assets/pet-packs/doro/spritesheet.webp`
- Add: `assets/pet-packs/duodong/pet.json`
- Add: `assets/pet-packs/duodong/spritesheet.webp`
- Add: `assets/pet-packs/chispa/pet.json`
- Add: `assets/pet-packs/chispa/spritesheet.webp`
- Add: `docs/phases/phase-32-bundled-codex-pets.md`
- Add: `docs/reviews/phase-32-bundled-codex-pets-review.md`

- [x] Copy selected downloaded assets into the repo.
- [x] Run targeted tests.
- [x] Run full verification.
- [x] Launch local app and smoke-test active pack behavior.

**Completed:** bundled packs landed as read-only built-in pet packs, the renderer URL issue was fixed in a follow-up commit, and `duodong` was manually verified visible in the desktop pet window.
