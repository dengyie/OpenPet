#!/usr/bin/env bash
set -euo pipefail

for name in APP_ROOT NODE_ROOT DATA_ROOT SERVICE_NAME NODE_VERSION NODE_ARCH; do
  if [[ ${!name+x} ]]; then
    echo "deployment paths are fixed; $name cannot be overridden" >&2
    exit 1
  fi
done

APP_ROOT=${APP_ROOT:-/opt/openpet/app}
NODE_ROOT=${NODE_ROOT:-/opt/openpet/node}
DATA_ROOT=${DATA_ROOT:-/var/lib/openpet}
SERVICE_NAME=${SERVICE_NAME:-openpet-backend-host.service}
NODE_VERSION=${NODE_VERSION:-v24.11.1}
NODE_ARCH=${NODE_ARCH:-linux-x64}
RELEASE_ARCHIVE=${RELEASE_ARCHIVE:-}

if [[ "$(id -u)" != 0 ]]; then echo "installer must run as root" >&2; exit 1; fi
if [[ -z "$RELEASE_ARCHIVE" || ! -f "$RELEASE_ARCHIVE" ]]; then echo "RELEASE_ARCHIVE must point to a reviewed OpenPet tar archive" >&2; exit 1; fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
snapshot_dir=/var/backups/openpet/${timestamp}
mkdir -p "$snapshot_dir"
for path in "$APP_ROOT" "$NODE_ROOT" "$DATA_ROOT" "/etc/systemd/system/$SERVICE_NAME"; do
  if [[ -e "$path" ]]; then cp -a "$path" "$snapshot_dir/"; fi
done

install -d -m 0755 "$(dirname "$APP_ROOT")" "$NODE_ROOT" "$DATA_ROOT"
if ! id -u openpet >/dev/null 2>&1; then useradd --system --home-dir "$DATA_ROOT" --shell /sbin/nologin openpet; fi
install -d -o openpet -g openpet -m 0700 "$DATA_ROOT"

work_dir=$(mktemp -d /tmp/openpet-install.XXXXXXXXXX)
chmod 0700 "$work_dir"
rollback_enabled=0
deployment_committed=0
cleanup_install() {
  local exit_status=$?
  trap - EXIT
  if [[ "$rollback_enabled" == 1 && "$deployment_committed" == 0 ]] && ! rollback_deployment; then
    echo "deployment rollback was incomplete; snapshot=$snapshot_dir" >&2
  fi
  rm -rf -- "$work_dir" "${APP_ROOT}.new" "${NODE_ROOT}.new"
  exit "$exit_status"
}
trap cleanup_install EXIT
node_tar="$work_dir/node.tar.xz"
node_stage="${NODE_ROOT}.new"
node_candidate="$NODE_ROOT"
if [[ ! -x "$NODE_ROOT/bin/node" || "$("$NODE_ROOT/bin/node" --version 2>/dev/null || true)" != "$NODE_VERSION" ]]; then
  curl --fail --location --retry 3 "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${NODE_ARCH}.tar.xz" -o "$node_tar"
  rm -rf "$node_stage"; mkdir -p "$node_stage"
  tar -xJf "$node_tar" -C "$node_stage" --strip-components=1
  if [[ ! -x "$node_stage/bin/node" || "$("$node_stage/bin/node" --version)" != "$NODE_VERSION" ]]; then
    echo "downloaded Node.js archive failed version validation" >&2
    exit 1
  fi
  node_candidate="$node_stage"
fi
export PATH="$node_candidate/bin:$PATH"

app_stage="${APP_ROOT}.new"
rm -rf "$app_stage"; install -d -m 0755 "$app_stage"
tar -xzf "$RELEASE_ARCHIVE" -C "$app_stage" --strip-components=1
# macOS source archives can contain AppleDouble metadata beside real files.
# Never let those metadata files enter the runtime tree or migration scanner.
find "$app_stage" -type f \( -name '._*' -o -name '.DS_Store' \) -delete
chown -R root:root "$app_stage"; chmod -R a=rX,u+w "$app_stage"
cd "$app_stage"
"$node_candidate/bin/npm" ci --ignore-scripts --no-audit --no-fund
"$node_candidate/bin/npm" --workspace @openpet/contracts run build
"$node_candidate/bin/npm" run build:web-control

previous_app="${APP_ROOT}.previous.${timestamp}"
previous_node="${NODE_ROOT}.previous.${timestamp}"
failed_app="${APP_ROOT}.failed.${timestamp}"
failed_node="${NODE_ROOT}.failed.${timestamp}"
node_backup_moved=0
node_candidate_activated=0

restore_application_and_node() {
  local failed=0
  if [[ -e "$APP_ROOT" ]] && ! mv "$APP_ROOT" "$failed_app"; then failed=1; fi
  if [[ -e "$previous_app" ]]; then
    if [[ -e "$APP_ROOT" ]] || ! mv "$previous_app" "$APP_ROOT"; then failed=1; fi
  fi
  if [[ "$failed" == 0 ]]; then rm -rf "$failed_app" || failed=1; fi

  if [[ "$node_candidate_activated" == 1 && -e "$NODE_ROOT" ]] && ! mv "$NODE_ROOT" "$failed_node"; then failed=1; fi
  if [[ "$node_backup_moved" == 1 && -e "$previous_node" ]]; then
    if [[ -e "$NODE_ROOT" ]] || ! mv "$previous_node" "$NODE_ROOT"; then failed=1; fi
  fi
  if [[ "$failed" == 0 ]]; then rm -rf "$failed_node" || failed=1; fi
  return "$failed"
}

unit_path="/etc/systemd/system/$SERVICE_NAME"
snapshot_unit="$snapshot_dir/$(basename "$SERVICE_NAME")"
previous_unit_state=$(systemctl is-enabled "$SERVICE_NAME" 2>/dev/null || true)
restore_service_unit() {
  local failed=0
  if [[ -e "$snapshot_unit" ]]; then
    rm -f "$unit_path" || failed=1
    cp -a "$snapshot_unit" "$unit_path" || failed=1
  else
    systemctl disable --now "$SERVICE_NAME" || true
    rm -f "$unit_path" || failed=1
  fi
  systemctl daemon-reload || failed=1
  if [[ -e "$snapshot_unit" ]]; then
    if [[ "$previous_unit_state" == "enabled" ]]; then systemctl enable "$SERVICE_NAME" || failed=1
    else systemctl disable "$SERVICE_NAME" || failed=1
    fi
    systemctl restart "$SERVICE_NAME" || failed=1
  fi
  return "$failed"
}

rollback_deployment() {
  local failed=0
  systemctl stop "$SERVICE_NAME" || true
  restore_application_and_node || failed=1
  restore_service_unit || failed=1
  return "$failed"
}

rollback_enabled=1
if [[ "$node_candidate" == "$node_stage" ]]; then
  if [[ -e "$NODE_ROOT" ]]; then
    mv "$NODE_ROOT" "$previous_node"
    node_backup_moved=1
  fi
  if ! mv "$node_stage" "$NODE_ROOT"; then
    exit 1
  fi
  node_candidate_activated=1
fi
chown -R root:root "$NODE_ROOT"

if [[ -e "$APP_ROOT" ]]; then mv "$APP_ROOT" "$previous_app"; fi
if ! mv "$app_stage" "$APP_ROOT"; then
  exit 1
fi
chown -R openpet:openpet "$DATA_ROOT"

if ! install -m 0644 deploy/openpet-backend-host.service "$unit_path" \
  || ! systemctl daemon-reload \
  || ! systemctl enable "$SERVICE_NAME" \
  || ! systemctl restart "$SERVICE_NAME" \
  || ! systemctl is-active --quiet "$SERVICE_NAME"; then
  exit 1
fi
deployment_committed=1
rollback_enabled=0
rm -rf "$previous_app" "$previous_node"
systemctl --no-pager --full status "$SERVICE_NAME"
echo "snapshot=$snapshot_dir"
