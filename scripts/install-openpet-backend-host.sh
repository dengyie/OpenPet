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

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
snapshot_dir=/var/backups/openpet/${timestamp}
mkdir -p "$snapshot_dir"
for path in "$APP_ROOT" "$NODE_ROOT" "$DATA_ROOT" "/etc/systemd/system/$SERVICE_NAME"; do
  if [[ -e "$path" ]]; then cp -a "$path" "$snapshot_dir/"; fi
done

install -d -m 0755 "$(dirname "$APP_ROOT")" "$NODE_ROOT" "$DATA_ROOT"
if ! id -u openpet >/dev/null 2>&1; then useradd --system --home-dir "$DATA_ROOT" --shell /sbin/nologin openpet; fi
install -d -o openpet -g openpet -m 0700 "$DATA_ROOT"

node_tar=/tmp/openpet-node-${NODE_VERSION}-${NODE_ARCH}.tar.xz
export PATH="$NODE_ROOT/bin:$PATH"
if [[ ! -x "$NODE_ROOT/bin/node" || "$("$NODE_ROOT/bin/node" --version 2>/dev/null || true)" != "$NODE_VERSION" ]]; then
  curl --fail --location --retry 3 "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${NODE_ARCH}.tar.xz" -o "$node_tar"
  rm -rf "$NODE_ROOT.new"; mkdir -p "$NODE_ROOT.new"
  tar -xJf "$node_tar" -C "$NODE_ROOT.new" --strip-components=1
  rm -rf "$NODE_ROOT"; mv "$NODE_ROOT.new" "$NODE_ROOT"
fi

rm -rf "$APP_ROOT.new"; install -d -m 0755 "$APP_ROOT.new"
tar -xzf "$RELEASE_ARCHIVE" -C "$APP_ROOT.new" --strip-components=1
chown -R root:root "$APP_ROOT.new" "$NODE_ROOT"; chmod -R a=rX,u+w "$APP_ROOT.new"
cd "$APP_ROOT.new"
"$NODE_ROOT/bin/npm" ci --ignore-scripts --no-audit --no-fund
"$NODE_ROOT/bin/npm" --workspace @openpet/contracts run build

previous_app="${APP_ROOT}.previous.${timestamp}"
if [[ -e "$APP_ROOT" ]]; then mv "$APP_ROOT" "$previous_app"; fi
if ! mv "$APP_ROOT.new" "$APP_ROOT"; then
  if [[ -e "$previous_app" ]]; then mv "$previous_app" "$APP_ROOT"; fi
  exit 1
fi
chown -R openpet:openpet "$DATA_ROOT"

install -m 0644 deploy/openpet-backend-host.service "/etc/systemd/system/$SERVICE_NAME"
if ! systemctl daemon-reload || ! systemctl enable "$SERVICE_NAME" || ! systemctl restart "$SERVICE_NAME" || ! systemctl is-active --quiet "$SERVICE_NAME"; then
  if [[ -e "$previous_app" ]]; then
    failed_app="${APP_ROOT}.failed.${timestamp}"
    mv "$APP_ROOT" "$failed_app"
    mv "$previous_app" "$APP_ROOT"
    systemctl daemon-reload || true
    systemctl restart "$SERVICE_NAME" || true
    rm -rf "$failed_app"
  fi
  exit 1
fi
rm -rf "$previous_app"
systemctl --no-pager --full status "$SERVICE_NAME"
echo "snapshot=$snapshot_dir"
