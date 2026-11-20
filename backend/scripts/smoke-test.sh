#!/usr/bin/env bash
# Smoke test for a deployed backend. Pass the URL via CI env var:
#   BACKEND_URL=https://api.example.com ./scripts/smoke-test.sh
set -euo pipefail

BASE_URL="${BACKEND_URL:?BACKEND_URL env var is required}"
BASE_URL="${BASE_URL%/}"

fail=0

check() {
  local path="$1"
  local expect="$2" # expected HTTP status code
  local url="${BASE_URL}${path}"
  local status
  status=$(curl -sS -o /tmp/smoke-body -w '%{http_code}' --max-time 20 "$url" || echo "000")
  if [ "$status" = "$expect" ]; then
    echo "PASS  $status  $url"
  else
    echo "FAIL  $status (expected $expect)  $url"
    head -c 500 /tmp/smoke-body; echo
    fail=1
  fi
}

echo "Testing backend at: $BASE_URL"
check "/" 200

# Swagger only mounts when NODE_ENV=development — informational only
docs_status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${BASE_URL}/docs" || echo "000")
echo "INFO  $docs_status  ${BASE_URL}/docs (only 200 in development)"

if [ "$fail" -ne 0 ]; then
  echo "Smoke test FAILED"
  exit 1
fi
echo "Smoke test PASSED"
