# OpenPet Plugin Community-Source Discovery Report

Generated: 2026-07-06T14:09:56.340Z
Status: compatible-source-not-found
Next action: find-or-invite-compatible-plugin-json-package

This discovery report records public-search observations before Phase 100 intake. It does not approve, install, run, sign, publish, or trust any plugin.

## Boundaries

- Discovery records search and candidate source observations only.
- Discovery does not prove OpenPet plugin compatibility.
- Discovery does not prove signing trust, catalog publication, runtime safety, or release readiness.
- Only compatible plugin.json package candidates should continue into Phase 100, Phase 103, and Phase 99.

## Search Results

- GitHub repository search: "openpet plugin"
  - Tool: gh search repos
  - Result count: 1
  - Notes: 2026-07-06 search found alvinunreal/openpets-plugin-starter as a public starter candidate for inspection.
- GitHub code search: filename:plugin.json "openpet"
  - Tool: gh search code
  - Result count: 0
  - Notes: No public current OpenPet plugin.json manifest hit found.
- Repository tree inspection: alvinunreal/openpets-plugin-starter
  - Tool: gh api repos/alvinunreal/openpets-plugin-starter/git/trees/main?recursive=1
  - Result count: 1
  - Notes: Tree contains openpets.plugin.json at the repository root, not the current OpenPet plugin.json package root.
- Repository tree inspection: alvinunreal/opencode-pets
  - Tool: gh api repos/alvinunreal/opencode-pets/git/trees/master?recursive=1
  - Result count: 0
  - Notes: Tree contains installer/template sources but no current OpenPet plugin.json package root.
- Repository tree inspection: Yarrow-Cai/hookcats
  - Tool: gh api repos/Yarrow-Cai/hookcats/git/trees/master?recursive=1
  - Result count: 0
  - Notes: No plugin.json or openpets.plugin.json manifest candidates discovered.

## Candidates

- https://github.com/alvinunreal/openpets
  - Submitter: alvinunreal/openpets
  - Status: incompatible-package-model
  - Reason: plugin-json-missing
  - Intake report: docs/release-evidence/plugin-community-source-intake-report/2026-06-18T23-30-00Z-openpets-official/
  - Phase 99 evidence: not recorded
  - Notes: Archived adjacent ecosystem source still uses openpets.plugin.json files, not the current OpenPet plugin.json package model.
- https://github.com/alvinunreal/openpets-plugin-starter
  - Submitter: alvinunreal/openpets-plugin-starter
  - Status: incompatible-package-model
  - Reason: plugin-json-missing
  - Intake report: docs/release-evidence/plugin-community-source-intake-report/2026-07-06T10-20-00Z-openpets-plugin-starter/
  - Phase 99 evidence: not recorded
  - Notes: Public starter repo uses openpets.plugin.json at the archive root rather than the current OpenPet plugin.json package model.
- https://github.com/alvinunreal/opencode-pets
  - Submitter: alvinunreal/opencode-pets
  - Status: incompatible-package-model
  - Reason: plugin-json-missing
  - Intake report: docs/release-evidence/plugin-community-source-intake-report/2026-07-06T10-30-00Z-opencode-pets/
  - Phase 99 evidence: not recorded
  - Notes: Public OpenCode-adjacent repo exposes installer/template sources but no current OpenPet plugin.json package root.
- https://github.com/Yarrow-Cai/hookcats
  - Submitter: Yarrow-Cai/hookcats
  - Status: not-found
  - Reason: plugin-json-not-discovered
  - Intake report: not recorded
  - Phase 99 evidence: not recorded
  - Notes: Repository description is OpenPet-adjacent, but tree inspection found no plugin.json or openpets.plugin.json candidate path.

## Candidate Counts

- Total: 4
- Ready for community evidence: 0
- Incompatible package model: 3
- Not found: 1
- Not inspected: 0
