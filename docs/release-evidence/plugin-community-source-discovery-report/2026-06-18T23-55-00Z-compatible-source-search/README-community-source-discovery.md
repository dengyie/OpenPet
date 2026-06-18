# OpenPet Plugin Community-Source Discovery Report

Generated: 2026-06-18T11:16:58.163Z
Status: compatible-source-not-found
Next action: find-or-invite-compatible-plugin-json-package

This discovery report records public-search observations before Phase 100 intake. It does not approve, install, run, sign, publish, or trust any plugin.

## Boundaries

- Discovery records search and candidate source observations only.
- Discovery does not prove OpenPet plugin compatibility.
- Discovery does not prove signing trust, catalog publication, runtime safety, or release readiness.
- Only compatible plugin.json package candidates should continue into Phase 100, Phase 103, and Phase 99.

## Search Results

- GitHub repository search: openpet desktop plugin
  - Tool: gh search repos
  - Result count: 0
  - Notes: 2026-06-18 rerun returned no direct repository-search hits from the current authenticated gh query.
- GitHub code search: "openpet.example.weather-status"
  - Tool: gh search code
  - Result count: 0
  - Notes: No public external copy of the current OpenPet example plugin id found.
- GitHub code search: "OpenPet" "plugin.json" "permissions"
  - Tool: gh search code
  - Result count: 0
  - Notes: No current OpenPet plugin.json manifest model hit found.
- GitHub code search: "openpet-plugin" "plugin.json"
  - Tool: gh search code
  - Result count: 0
  - Notes: No packaged OpenPet plugin manifest hit found.
- Repository tree inspection: alvinunreal/openpets
  - Tool: gh api repos/alvinunreal/openpets/git/trees/main?recursive=1
  - Result count: 9
  - Notes: Tree contains official plugin directories with openpets.plugin.json, not current OpenPet plugin.json package roots.
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
  - Notes: Phase 102 archived this adjacent ecosystem source; selected path contains openpets.plugin.json files, not current OpenPet plugin.json package roots.
- https://github.com/Yarrow-Cai/hookcats
  - Submitter: Yarrow-Cai/hookcats
  - Status: not-found
  - Reason: plugin-json-not-discovered
  - Intake report: not recorded
  - Phase 99 evidence: not recorded
  - Notes: Repository description is OpenPet-adjacent, but tree inspection found no plugin.json or openpets.plugin.json candidate path.
- https://github.com/alvinunreal/opencode-pets
  - Submitter: alvinunreal/opencode-pets
  - Status: not-inspected
  - Reason: opencode-installer-adjacent
  - Intake report: not recorded
  - Phase 99 evidence: not recorded
  - Notes: Repository targets OpenCode plugin installation for OpenPets status updates rather than a current OpenPet plugin.json package; reserve for future intake only if a candidate path is identified.

## Candidate Counts

- Total: 3
- Ready for community evidence: 0
- Incompatible package model: 1
- Not found: 1
- Not inspected: 1
