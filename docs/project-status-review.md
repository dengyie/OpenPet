# OpenPet Project Status Review

> Last updated: 2026-07-03

This is the compact product and release snapshot. Use [`TODO.md`](./TODO.md) for the active queue and `docs/release-evidence/` for archived proof.

## Executive Summary

OpenPet already has the intended platform shape: desktop pet runtime, Control Center, pet packs, AI settings, local extensions, local HTTP/MCP, and release evidence tooling. The main remaining gap is not architecture. It is evidence, release proof, and ecosystem maturity.

## Release Truth

| Platform | Current truth | Public wording |
| --- | --- | --- |
| macOS | Local and tooling baseline is in place, but official signed evidence still needs final archive completion. | macOS-first release track |
| Windows | Tooling exists, but signed artifacts and real smoke archives are still missing. | Not release-ready |
| Linux | Not in current release scope. | No support claim |
| Mobile | Out of scope. | No support claim |

## Strongest Current Areas

- Clear service boundaries and a stable `PetService` ownership model.
- Control Center as the main user-facing configuration surface.
- Conservative handling of secrets and local extension permissions.
- Broad automated regression coverage plus release-evidence tooling.

## Main Remaining Gaps

1. Real signed macOS evidence must be archived through the release evidence flow.
2. Real signed Windows smoke evidence must exist before support claims move.
3. Packaged native picker evidence still needs real archived runs.
4. The extension ecosystem still needs a compatible third-party package path backed by evidence rather than intent.

## Reference Docs

- Maintainer snapshot: [`HANDOFF.md`](./HANDOFF.md)
- Active queue: [`TODO.md`](./TODO.md)
- Run/build workflow: [`development-workflow.md`](./development-workflow.md)
- Release gates: [`desktop-release-design.md`](./desktop-release-design.md), [`release-checklist.md`](./release-checklist.md)
