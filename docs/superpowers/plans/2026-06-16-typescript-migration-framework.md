# TypeScript Migration Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the TypeScript migration framework and migrate the first shared contract module.

**Architecture:** Add TypeScript in no-emit mode and keep JS/TS coexistence. Introduce shared IPC contracts as TypeScript source, compile them to CommonJS for the current main/preload runtime, and keep the existing `require('./src/shared/ipc-channels')` API stable.

**Tech Stack:** Electron, Node CommonJS, TypeScript, Vite, Node native test runner.

---

### Task 1: Add TypeScript Tooling

**Files:**
- Create: `tsconfig.json`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] Add `typescript` as a dev dependency.
- [ ] Add `typecheck` script: `tsc --noEmit`.
- [ ] Update `check:syntax` to run `npm run check:node && npm run typecheck && npm run build:control-center`.
- [ ] Add `tsconfig.json` with `allowJs: true`, `checkJs: false`, `noEmit: true`, `jsx: react-jsx`, `moduleResolution: node`, and strict core options.
- [ ] Run `npm run typecheck`; expected PASS.

### Task 2: Migrate Shared IPC Contract

**Files:**
- Create: `src/shared/ipc-channels.ts`
- Modify: `src/shared/ipc-channels.js`
- Test: `tests/shared/ipc-channels.test.js`

- [ ] Write a failing test that requires `src/shared/ipc-channels.js`, asserts `IPC.PET_PACKS_SET_ACTIVE === 'pet-packs:set-active'`, and asserts `Object.isFrozen(IPC)`.
- [ ] Run `node --test tests/shared/ipc-channels.test.js`; expected FAIL before freezing the exported contract.
- [ ] Implement `src/shared/ipc-channels.ts` with `export const IPC = Object.freeze({...} as const)`.
- [ ] Keep `src/shared/ipc-channels.js` as the CommonJS runtime bridge with the same frozen object until main/preload can consume compiled TS directly.
- [ ] Run `node --test tests/shared/ipc-channels.test.js`; expected PASS.
- [ ] Run `npm run typecheck`; expected PASS.

### Task 3: Document Phase 33

**Files:**
- Create: `docs/phases/phase-33-typescript-migration-framework.md`
- Create: `docs/reviews/phase-33-typescript-migration-framework-review.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/HANDOFF.md`
- Modify: `README.md`

- [ ] Document the migration rule: JS/TS coexist, no runtime TS loader yet, contracts first.
- [ ] Add Phase 33 links to README and handoff docs.
- [ ] Update the test baseline after verification.

### Task 4: Verification

**Files:**
- No source edits unless verification reveals a bug.

- [ ] Run `npm run typecheck`; expected PASS.
- [ ] Run `npm run check:syntax`; expected PASS.
- [ ] Run `npm test`; expected all Node tests pass.
- [ ] Run `npm run test:control-center`; expected 9/9 pass.
- [ ] Run `git diff --check`; expected PASS.

