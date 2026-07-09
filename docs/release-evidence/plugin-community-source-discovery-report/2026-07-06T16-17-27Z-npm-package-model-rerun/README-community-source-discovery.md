# OpenPet Plugin Community-Source Discovery Report

Generated: 2026-07-06T16:17:27.000Z
Status: compatible-source-not-found
Next action: find-or-invite-compatible-plugin-json-package

This discovery report records public-search observations before Phase 100 intake. It does not approve, install, run, sign, publish, or trust any plugin.

## Boundaries

- Discovery records search and candidate source observations only.
- Discovery does not prove OpenPet plugin compatibility.
- Discovery does not prove signing trust, catalog publication, runtime safety, or release readiness.
- Only compatible plugin.json package candidates should continue into Phase 100, Phase 103, and Phase 99.

## Search Results

- npm search openpets --json
  - Tool: npm search openpets --json
  - Result count: 19
  - Notes: 2026-07-06 registry search surfaced a broader published OpenPets ecosystem, including 13 @openpets/* plugin-like packages worth inspecting for current OpenPet plugin.json compatibility.
- npm pack tarball inspection for 13 @openpets/* packages
  - Tool: npm pack <package> --pack-destination <tmp> && tar -tf <tgz>
  - Result count: 13
  - Notes: All inspected tarballs lacked both a root plugin.json and a root openpets.plugin.json, indicating a package.json-based adjacent plugin model rather than the current OpenPet plugin.json package root.

## Candidates

- https://www.npmjs.com/package/@openpets/bluesky
  - Submitter: @openpets/bluesky
  - Status: incompatible-package-model
  - Reason: plugin-json-missing
  - Intake report: not recorded
  - Phase 99 evidence: not recorded
  - Notes: Template plugin tarball contains package.json + commands.json but no root plugin.json or openpets.plugin.json.
- https://www.npmjs.com/package/@openpets/quo
  - Submitter: @openpets/quo
  - Status: incompatible-package-model
  - Reason: plugin-json-missing
  - Intake report: not recorded
  - Phase 99 evidence: not recorded
  - Notes: Published API plugin tarball contains package.json-based layout without root plugin.json.
- https://www.npmjs.com/package/@openpets/turbopuffer
  - Submitter: @openpets/turbopuffer
  - Status: incompatible-package-model
  - Reason: plugin-json-missing
  - Intake report: not recorded
  - Phase 99 evidence: not recorded
  - Notes: Published tarball contains package.json + commands.json but no root plugin.json.
- https://www.npmjs.com/package/@openpets/openai
  - Submitter: @openpets/openai
  - Status: incompatible-package-model
  - Reason: plugin-json-missing
  - Intake report: not recorded
  - Phase 99 evidence: not recorded
  - Notes: Published tarball contains package.json + commands.json + source files but no root plugin.json.
- https://www.npmjs.com/package/@openpets/quickfile
  - Submitter: @openpets/quickfile
  - Status: incompatible-package-model
  - Reason: plugin-json-missing
  - Intake report: not recorded
  - Phase 99 evidence: not recorded
  - Notes: Published tarball contains package.json + source files but no root plugin.json.
- https://www.npmjs.com/package/@openpets/raggle
  - Submitter: @openpets/raggle
  - Status: incompatible-package-model
  - Reason: plugin-json-missing
  - Intake report: not recorded
  - Phase 99 evidence: not recorded
  - Notes: Published tarball contains package.json + commands.json but no root plugin.json.
- https://www.npmjs.com/package/@openpets/x-twitter
  - Submitter: @openpets/x-twitter
  - Status: incompatible-package-model
  - Reason: plugin-json-missing
  - Intake report: not recorded
  - Phase 99 evidence: not recorded
  - Notes: Published tarball contains package.json + commands.json but no root plugin.json.
- https://www.npmjs.com/package/@openpets/webflow
  - Submitter: @openpets/webflow
  - Status: incompatible-package-model
  - Reason: plugin-json-missing
  - Intake report: not recorded
  - Phase 99 evidence: not recorded
  - Notes: Published tarball contains package.json + source files but no root plugin.json.
- https://www.npmjs.com/package/@openpets/medplum
  - Submitter: @openpets/medplum
  - Status: incompatible-package-model
  - Reason: plugin-json-missing
  - Intake report: not recorded
  - Phase 99 evidence: not recorded
  - Notes: Published tarball contains package.json + source files but no root plugin.json.
- https://www.npmjs.com/package/@openpets/athenahealth
  - Submitter: @openpets/athenahealth
  - Status: incompatible-package-model
  - Reason: plugin-json-missing
  - Intake report: not recorded
  - Phase 99 evidence: not recorded
  - Notes: Published tarball contains package.json + source files but no root plugin.json.
- https://www.npmjs.com/package/@openpets/redox
  - Submitter: @openpets/redox
  - Status: incompatible-package-model
  - Reason: plugin-json-missing
  - Intake report: not recorded
  - Phase 99 evidence: not recorded
  - Notes: Published tarball contains package.json + source files but no root plugin.json.
- https://www.npmjs.com/package/@openpets/openstreetmap
  - Submitter: @openpets/openstreetmap
  - Status: incompatible-package-model
  - Reason: plugin-json-missing
  - Intake report: not recorded
  - Phase 99 evidence: not recorded
  - Notes: Published tarball contains package.json + source files but no root plugin.json.
- https://www.npmjs.com/package/@openpets/gojiberry
  - Submitter: @openpets/gojiberry
  - Status: incompatible-package-model
  - Reason: plugin-json-missing
  - Intake report: not recorded
  - Phase 99 evidence: not recorded
  - Notes: Published tarball contains only package.json and no root plugin.json.

## Candidate Counts

- Total: 13
- Ready for community evidence: 0
- Incompatible package model: 13
- Not found: 0
- Not inspected: 0
