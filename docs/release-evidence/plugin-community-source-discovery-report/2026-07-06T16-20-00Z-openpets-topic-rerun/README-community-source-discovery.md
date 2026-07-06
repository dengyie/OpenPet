# OpenPet Plugin Community-Source Discovery Report

Generated: 2026-07-06T15:32:18.403Z
Status: compatible-source-not-found
Next action: find-or-invite-compatible-plugin-json-package

This discovery report records public-search observations before Phase 100 intake. It does not approve, install, run, sign, publish, or trust any plugin.

## Boundaries

- Discovery records search and candidate source observations only.
- Discovery does not prove OpenPet plugin compatibility.
- Discovery does not prove signing trust, catalog publication, runtime safety, or release readiness.
- Only compatible plugin.json package candidates should continue into Phase 100, Phase 103, and Phase 99.

## Search Results

- GitHub topic page: openpets
  - Tool: curl https://github.com/topics/openpets
  - Result count: 7
  - Notes: 2026-07-06 topic page lists 7 public openpets-tagged repositories: alvinunreal/openpets, alvinunreal/claude-pets, alterhq/awesome-codex-pets-projects, alvinunreal/opencode-pets, MisterBrookT/pethatch, MacSiem/openpets-bridge, and MacSiem/openpets.
- Repository tree inspection: MacSiem/openpets
  - Tool: curl https://api.github.com/repos/MacSiem/openpets/git/trees/main?recursive=1
  - Result count: 0
  - Notes: No plugin.json or openpets.plugin.json manifest candidates discovered in the current default branch tree.
- Repository tree inspection: MisterBrookT/pethatch
  - Tool: curl https://api.github.com/repos/MisterBrookT/pethatch/git/trees/main?recursive=1
  - Result count: 0
  - Notes: No plugin.json or openpets.plugin.json manifest candidates discovered in the current default branch tree.
- Repository tree inspection: alvinunreal/claude-pets
  - Tool: curl https://api.github.com/repos/alvinunreal/claude-pets/git/trees/master?recursive=1
  - Result count: 0
  - Notes: No plugin.json or openpets.plugin.json manifest candidates discovered in the current default branch tree.
- Repository tree inspection: alterhq/awesome-codex-pets-projects
  - Tool: curl https://api.github.com/repos/alterhq/awesome-codex-pets-projects/git/trees/main?recursive=1
  - Result count: 0
  - Notes: No plugin.json or openpets.plugin.json manifest candidates discovered in the current default branch tree.

## Candidates

- https://github.com/alvinunreal/openpets
  - Submitter: alvinunreal/openpets
  - Status: incompatible-package-model
  - Reason: plugin-json-missing
  - Intake report: docs/release-evidence/plugin-community-source-intake-report/2026-06-18T23-30-00Z-openpets-official/
  - Phase 99 evidence: not recorded
  - Notes: Adjacent ecosystem source still uses openpets.plugin.json files, not the current OpenPet plugin.json package model.
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
  - Notes: OpenCode plugin installer for OpenPets desktop pet status updates; archived intake still found no current OpenPet plugin.json package root.
- https://github.com/alvinunreal/claude-pets
  - Submitter: alvinunreal/claude-pets
  - Status: not-found
  - Reason: plugin-json-not-discovered
  - Intake report: not recorded
  - Phase 99 evidence: not recorded
  - Notes: Topic-listed integration repo for Claude Code desktop pet status updates, but current tree inspection found no plugin.json or openpets.plugin.json candidate path.
- https://github.com/alterhq/awesome-codex-pets-projects
  - Submitter: alterhq/awesome-codex-pets-projects
  - Status: not-found
  - Reason: plugin-json-not-discovered
  - Intake report: not recorded
  - Phase 99 evidence: not recorded
  - Notes: Topic-listed curated gallery/listing repo, not a current OpenPet plugin package source.
- https://github.com/MisterBrookT/pethatch
  - Submitter: MisterBrookT/pethatch
  - Status: not-found
  - Reason: plugin-json-not-discovered
  - Intake report: not recorded
  - Phase 99 evidence: not recorded
  - Notes: Topic-listed desktop pet pack market repo, but current tree inspection found no plugin.json or openpets.plugin.json candidate path.
- https://github.com/MacSiem/openpets-bridge
  - Submitter: MacSiem/openpets-bridge
  - Status: not-found
  - Reason: plugin-json-not-discovered
  - Intake report: not recorded
  - Phase 99 evidence: not recorded
  - Notes: Topic-listed archived bridge repo moved into MacSiem/openpets/bridge and does not present a current OpenPet plugin package root.
- https://github.com/MacSiem/openpets
  - Submitter: MacSiem/openpets
  - Status: not-found
  - Reason: plugin-json-not-discovered
  - Intake report: not recorded
  - Phase 99 evidence: not recorded
  - Notes: Topic-listed fork of alterhq/openpets with bridge additions; current tree inspection found no plugin.json or openpets.plugin.json candidate path.

## Candidate Counts

- Total: 8
- Ready for community evidence: 0
- Incompatible package model: 3
- Not found: 5
- Not inspected: 0
