#!/usr/bin/env bash
# Collects local plugin cleanup evidence for an OpenPet validation session.
# This helper does not mark cleanup checks as passed and does not prove cleanup readiness.
# Generated: 2026-06-18T06:43:44.713Z

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_PATH="${REPORT_PATH:-/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-cleanup-evidence/2026-06-18T14-30-00Z-darwin-arm64/plugin-cleanup-evidence-report.json}"
EVIDENCE_DIR="${EVIDENCE_DIR:-$SCRIPT_DIR/plugin-cleanup-evidence-collected}"
CONTROLLED_FIXTURE_DIR="$EVIDENCE_DIR/cleanup-controlled-fixture"

mkdir -p "$EVIDENCE_DIR"

{
  echo "CollectedAt: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "Hostname: $(hostname)"
  echo "Kernel: $(uname -a)"
  echo "Node: $(node -v)"
  echo "Npm: $(npm -v)"
  echo "ReportPath: $REPORT_PATH"
  echo "EvidenceDir: $EVIDENCE_DIR"
} > "$EVIDENCE_DIR/environment.txt"

npm run validate-plugin-cleanup-evidence-report -- "$REPORT_PATH" --allow-pending > "$EVIDENCE_DIR/report-structure-validation.txt" 2>&1

if npm run create-plugin-cleanup-evidence -- --output-dir "$CONTROLLED_FIXTURE_DIR" --json > "$EVIDENCE_DIR/cleanup-controlled-fixture-output.json" 2> "$EVIDENCE_DIR/cleanup-controlled-fixture-stderr.txt"; then
  echo "Controlled fixture evidence created under: $CONTROLLED_FIXTURE_DIR" > "$EVIDENCE_DIR/cleanup-controlled-fixture-status.txt"
else
  status=$?
  echo "Controlled fixture evidence command failed with exit code: $status" > "$EVIDENCE_DIR/cleanup-controlled-fixture-status.txt"
fi

cat > "$EVIDENCE_DIR/manual-checks.md" <<'OPENPET_PLUGIN_CLEANUP_MANUAL_CHECKS'
# OpenPet Plugin Cleanup Evidence Manual Checklist

This checklist is generated from the same required check matrix used by the cleanup evidence validator. Attach concrete evidence before marking any check as pass.

| Check ID | What To Prove | Evidence Guidance |
|----------|---------------|-------------------|
| `service-exit-confirmed-stop` | Service stop remains visible until child exit confirmation | Attach service logs or terminal output showing the service stayed in stopping state until child exit confirmation. |
| `service-process-group-cleanup` | Service stop attempts process-group cleanup | Attach logs or process listings showing service stop attempted process-group cleanup. |
| `service-tree-fallback-cleanup` | Service stop falls back to host-owned process-tree cleanup when process-group signalling fails | Attach process-tree evidence showing host-owned descendant cleanup was attempted when process-group cleanup failed. |
| `service-force-stop` | Stubborn service receives one bounded host-side force-stop attempt | Attach stubborn-service evidence showing exactly one bounded host-side force-stop attempt. |
| `setup-exit-confirmed-stop` | Setup stop remains visible until child exit confirmation | Attach setup runtime logs showing stop completion only after child exit confirmation. |
| `setup-tree-fallback-cleanup` | Setup cleanup tries host-owned process-tree cleanup before direct child kill | Attach setup cleanup logs or process listings showing tree fallback before direct child kill. |
| `command-exit-confirmed-stop` | Declaration command stop remains visible until child exit confirmation | Attach declaration-command logs showing stop completion only after child exit confirmation. |
| `command-tree-fallback-cleanup` | Declaration command cleanup tries host-owned process-tree cleanup before direct child kill | Attach declaration-command cleanup logs or process listings showing tree fallback before direct child kill. |
OPENPET_PLUGIN_CLEANUP_MANUAL_CHECKS

cat > "$EVIDENCE_DIR/update-report-commands.md" <<'OPENPET_PLUGIN_CLEANUP_UPDATE_COMMANDS'
# OpenPet Plugin Cleanup Evidence Update Commands

Run these from the repository root after reviewing the collected evidence. Replace placeholders with concrete file paths or transcript excerpts.

```bash
npm run update-plugin-cleanup-evidence-report -- '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-cleanup-evidence/2026-06-18T14-30-00Z-darwin-arm64/plugin-cleanup-evidence-report.json' --set-env machine="$(hostname)" --set-env runner="manual plugin cleanup validation" --set-env evidence="<evidence directory or transcript link>"
npm run validate-plugin-cleanup-evidence-report -- '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-cleanup-evidence/2026-06-18T14-30-00Z-darwin-arm64/plugin-cleanup-evidence-report.json' --allow-pending
```

Do not use these commands to mark checks as pass until the matching real-host cleanup evidence exists.
OPENPET_PLUGIN_CLEANUP_UPDATE_COMMANDS

echo "OpenPet plugin cleanup evidence collected in: $EVIDENCE_DIR"
echo "Review manual-checks.md and collected transcripts before marking any cleanup check as pass."
echo "This collector does not prove cleanup readiness."
