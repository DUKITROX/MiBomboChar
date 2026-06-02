#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

LAN_IPS="$(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" { print $2 }' || true)"
PRIMARY_IP="$(printf '%s\n' "${LAN_IPS}" | awk 'NF { print; exit }')"

if [ -z "${PRIMARY_IP}" ]; then
  echo "Could not detect a LAN IP address."
  echo "Connect to Wi-Fi/hotspot and try again."
  exit 1
fi

mkdir -p certs

SAN_ENTRIES="DNS:localhost,IP:127.0.0.1"
while IFS= read -r lan_ip; do
  [ -n "${lan_ip}" ] && SAN_ENTRIES="${SAN_ENTRIES},IP:${lan_ip}"
done <<< "${LAN_IPS}"

cat > certs/dev-cert.conf <<EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
CN = localhost

[v3_req]
subjectAltName = ${SAN_ENTRIES}
EOF

openssl req \
  -x509 \
  -nodes \
  -days 365 \
  -newkey rsa:2048 \
  -keyout certs/dev-key.pem \
  -out certs/dev-cert.pem \
  -config certs/dev-cert.conf

echo
echo "Created:"
echo "  certs/dev-cert.pem"
echo "  certs/dev-key.pem"
echo
echo "Restart the backend:"
echo "  ./run-backend.sh"
echo
echo "Then use HTTPS:"
echo "  https://localhost:3000/host"
echo "  https://${PRIMARY_IP}:3000/client"
echo
echo "On iPhone/Android, you may need to trust certs/dev-cert.pem before camera access works."
