#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PORT="${PORT:-3000}"
LAN_IPS="$(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" { print $2 }' || true)"
if [ -f "certs/dev-cert.pem" ] && [ -f "certs/dev-key.pem" ]; then
  PROTOCOL="https"
  CURL_TLS_FLAG="-k"
else
  PROTOCOL="http"
  CURL_TLS_FLAG=""
fi

echo "MiBomboChar frontend URLs"
echo
echo "Open this on the laptop:"
echo "  ${PROTOCOL}://localhost:${PORT}/host"
echo

if [ -n "${LAN_IPS}" ]; then
  echo "Open this on each phone connected to the same Wi-Fi/hotspot:"
  while IFS= read -r lan_ip; do
    [ -n "${lan_ip}" ] && echo "  ${PROTOCOL}://${lan_ip}:${PORT}/client"
  done <<< "${LAN_IPS}"
else
  echo "Could not auto-detect LAN IP. Use your laptop LAN IP instead:"
  echo "  ${PROTOCOL}://<your-laptop-lan-ip>:${PORT}/client"
fi

echo

if curl ${CURL_TLS_FLAG} -fsS "${PROTOCOL}://localhost:${PORT}/host" >/dev/null 2>&1; then
  echo "Backend is reachable."
else
  echo "Backend is not reachable yet."
  echo "Start it in another terminal with:"
  echo "  ./run-backend.sh"
fi
