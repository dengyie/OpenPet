#!/usr/bin/env bash
set -euo pipefail

# Run as root on gz-cvm after deploying the OpenPet application.
# This script does not create public DNS records. It installs the mesh-only
# Nginx site and leaves certificate issuance to the operator's DNS-01 flow.

DOMAIN=${OPENPET_DOMAIN:-}
MESH_IP=${OPENPET_MESH_IP:-10.144.144.8}
PASSWORD_FILE=/etc/openpet/web-control.env
TLS_CERT_FILE=${OPENPET_TLS_CERT_FILE:-/etc/openpet/tls/fullchain.pem}
TLS_KEY_FILE=${OPENPET_TLS_KEY_FILE:-/etc/openpet/tls/privkey.pem}
APP_ROOT=/opt/openpet/app

if [[ "$(id -u)" != 0 ]]; then echo "run as root" >&2; exit 1; fi
if [[ -z "$DOMAIN" || ! "$DOMAIN" =~ ^[A-Za-z0-9][A-Za-z0-9.-]+$ ]]; then echo "OPENPET_DOMAIN is required" >&2; exit 1; fi
if [[ "$MESH_IP" != 10.144.144.* ]]; then echo "OPENPET_MESH_IP must be an EasyTier 10.144.144.x address" >&2; exit 1; fi
if ! ip -o addr show | awk '{ split($4, address, "/"); print address[1] }' | grep -Fxq "$MESH_IP"; then
  echo "OPENPET_MESH_IP is not assigned to this host" >&2
  exit 1
fi
install -d -m 0750 /etc/openpet /etc/nginx/conf.d
if [[ ! -s "$PASSWORD_FILE" ]]; then
  umask 077
  printf 'OPENPET_WEB_CONTROL_PASSWORD=%s\n' "$(openssl rand -hex 32)" > "$PASSWORD_FILE"
fi
if ! grep -Eq '^OPENPET_WEB_CONTROL_PASSWORD=[^[:space:]]{32,}$' "$PASSWORD_FILE"; then
  echo "OPENPET_WEB_CONTROL_PASSWORD must be a non-placeholder value with at least 32 non-space characters" >&2
  exit 1
fi
chown root:root "$PASSWORD_FILE"
chmod 0600 "$PASSWORD_FILE"

if [[ ! -s "$TLS_CERT_FILE" || ! -s "$TLS_KEY_FILE" ]]; then
  echo "trusted TLS certificate files are required; issue a DNS-01 certificate first" >&2
  echo "expected certificate: $TLS_CERT_FILE" >&2
  echo "expected private key: $TLS_KEY_FILE" >&2
  exit 1
fi
if ! openssl x509 -in "$TLS_CERT_FILE" -noout -subject -ext subjectAltName >/dev/null 2>&1; then
  echo "TLS certificate is not a readable X.509 certificate" >&2
  exit 1
fi
if ! openssl pkey -in "$TLS_KEY_FILE" -noout >/dev/null 2>&1; then
  echo "TLS private key is not readable" >&2
  exit 1
fi
if ! openssl x509 -in "$TLS_CERT_FILE" -noout -checkhost "$DOMAIN" >/dev/null 2>&1; then
  echo "TLS certificate does not cover $DOMAIN" >&2
  exit 1
fi
if ! openssl x509 -in "$TLS_CERT_FILE" -noout -checkend 0 >/dev/null 2>&1; then
  echo "TLS certificate has expired" >&2
  exit 1
fi
CA_BUNDLE=
for candidate in /etc/ssl/cert.pem /etc/ssl/certs/ca-bundle.crt /etc/pki/tls/certs/ca-bundle.crt; do
  if [[ -s "$candidate" ]]; then CA_BUNDLE=$candidate; break; fi
done
if [[ -z "$CA_BUNDLE" ]]; then
  echo "system CA bundle not found; cannot verify that the TLS certificate is publicly trusted" >&2
  exit 1
fi
leaf_cert=$(mktemp)
chain_certs=$(mktemp)
trap 'rm -f "$leaf_cert" "$chain_certs"' EXIT
awk 'BEGIN { n = 0 } /-----BEGIN CERTIFICATE-----/ { n++ } n == 1 { print > leaf } n > 1 { print > chain }' \
  leaf="$leaf_cert" chain="$chain_certs" "$TLS_CERT_FILE"
if [[ -s "$chain_certs" ]]; then
  openssl verify -CAfile "$CA_BUNDLE" -untrusted "$chain_certs" "$leaf_cert" >/dev/null
else
  openssl verify -CAfile "$CA_BUNDLE" "$leaf_cert" >/dev/null
fi
chmod 0600 "$TLS_KEY_FILE"
chmod 0644 "$TLS_CERT_FILE"

if ! command -v nginx >/dev/null 2>&1; then
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y nginx
  elif command -v yum >/dev/null 2>&1; then
    yum install -y nginx
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y nginx
  else
    echo "no supported package manager found to install Nginx" >&2
    exit 1
  fi
fi

# The TencentOS package uses conf.d, and its stock default site would listen on
# wildcard interfaces. Preserve that package file, but keep it out of Nginx's
# *.conf include so the only web listeners are the explicit mesh addresses.
if [[ -f /etc/nginx/conf.d/default.conf ]]; then
  mv /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf.openpet-disabled
fi

sed -e "s|OPENPET_DOMAIN|$DOMAIN|g" -e "s|MESH_IP|$MESH_IP|g" \
  -e "s|/etc/openpet/tls/fullchain.pem|$TLS_CERT_FILE|g" \
  -e "s|/etc/openpet/tls/privkey.pem|$TLS_KEY_FILE|g" \
  "$APP_ROOT/deploy/openpet-web-control.nginx.conf" > /etc/nginx/conf.d/openpet-web-control.conf
nginx -t
systemctl enable nginx
if systemctl is-active --quiet nginx; then
  systemctl reload nginx
else
  systemctl start nginx
fi
systemctl restart openpet-backend-host.service
systemctl is-active --quiet openpet-backend-host.service
listeners=$(ss -H -ltn | awk '$4 ~ /:(80|443)$/ { print $4 }')
if [[ -z "$listeners" ]]; then
  echo "Nginx did not open the expected mesh web listeners" >&2
  exit 1
fi
while IFS= read -r listener; do
  [[ "$listener" == "$MESH_IP:80" || "$listener" == "$MESH_IP:443" ]] || {
    echo "unexpected Nginx listener outside the mesh bind: $listener" >&2
    systemctl stop nginx
    exit 1
  }
done <<< "$listeners"
grep -Fxq "$MESH_IP:80" <<< "$listeners"
grep -Fxq "$MESH_IP:443" <<< "$listeners"
echo "OpenPet web control installed for $DOMAIN on $MESH_IP"
