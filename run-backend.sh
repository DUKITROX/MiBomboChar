#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PORT="${PORT:-3000}"
LAN_IPS="$(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" { print $2 }' || true)"
if [ -f "certs/dev-cert.pem" ] && [ -f "certs/dev-key.pem" ]; then
  PROTOCOL="https"
else
  PROTOCOL="http"
fi
SERVER_PID=""

cleanup() {
  if [ -n "${SERVER_PID}" ] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    echo
    echo "Stopping MiBomboChar server..."
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port ${PORT} is already in use."
  echo
  lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN || true
  echo
  echo "Either stop that process, or run this server on another port:"
  echo "  PORT=3001 ./run-backend.sh"
  echo
  echo "If you use another port, open:"
  echo "  http://localhost:3001/host"
  echo "  http://<laptop-lan-ip>:3001/client"
  exit 1
fi

echo "Starting MiBomboChar backend/static server on port ${PORT}..."
echo
echo "Laptop host URL:"
echo "  ${PROTOCOL}://localhost:${PORT}/host"
echo

if [ -n "${LAN_IPS}" ]; then
  echo "Computer LAN IP address(es):"
  while IFS= read -r lan_ip; do
    [ -n "${lan_ip}" ] && echo "  ${lan_ip}"
  done <<< "${LAN_IPS}"
  echo
  echo "Phone client URL(s) for devices on the same Wi-Fi/hotspot:"
  while IFS= read -r lan_ip; do
    [ -n "${lan_ip}" ] && echo "  ${PROTOCOL}://${lan_ip}:${PORT}/client"
  done <<< "${LAN_IPS}"
  echo
else
  echo "Could not auto-detect LAN IP. On macOS, try:"
  echo "  ifconfig | grep 'inet '"
  echo
fi

if [ "${PROTOCOL}" = "http" ]; then
  echo "Note: phone camera access requires HTTPS. Generate a local cert with:"
  echo "  ./generate-dev-cert.sh"
else
  echo "HTTPS cert detected. If the phone blocks camera access, trust certs/dev-cert.pem on the phone."
fi
echo

PORT="${PORT}" npm run dev &
SERVER_PID="$!"
wait "${SERVER_PID}"
