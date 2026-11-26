#!/usr/bin/env bash
set -euo pipefail

case "${1:-1}" in
  1|a) phase=1; host=a.localhost ;;
  2|b) phase=2; host=b.localhost ;;
  3|c) phase=3; host=c.localhost ;;
  *) echo "Usage: $0 [1|2|3]" >&2; exit 2 ;;
esac

test_dir="$(cd "$(dirname "$0")" && pwd)"
cert_path="$test_dir/cert.pem"
if [[ ! -f "$cert_path" ]]; then
  echo "Create cert.pem first; see README.md." >&2
  exit 1
fi

spki_hash="$(openssl x509 -in "$cert_path" -pubkey -noout \
  | openssl pkey -pubin -outform DER \
  | openssl dgst -sha256 -binary \
  | openssl base64 -A)"
profile_dir="${DBSC_TEST_PROFILE:-$test_dir/.brave-profile}"
browser_binary="${BRAVE_BINARY:-/Applications/Brave Browser.app/Contents/MacOS/Brave Browser}"
port="${DBSC_TEST_PORT:-8001}"
mkdir -p "$profile_dir"

exec "$browser_binary" \
  "--user-data-dir=$profile_dir" \
  '--host-resolver-rules=MAP a.localhost 127.0.0.1, MAP b.localhost 127.0.0.1, MAP c.localhost 127.0.0.1, MAP t.localhost 127.0.0.1' \
  "--ignore-certificate-errors-spki-list=$spki_hash" \
  --no-first-run \
  --no-default-browser-check \
  "https://$host:$port/?step=$phase"
