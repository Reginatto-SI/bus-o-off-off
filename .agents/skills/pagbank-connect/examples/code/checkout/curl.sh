#!/usr/bin/env bash
# Cria payment link (checkout) — POST connect/ws/checkouts
set -euo pipefail
CONNECT_KEY="${PAGBANK_CONNECT_KEY:-${CONNECT_KEY:?Defina PAGBANK_CONNECT_KEY}}"
BASE="https://ws.pbintegracoes.com/pspro/v7"
BODY="${1:-examples/requests/checkout.json}"

curl -sS -X POST "${BASE}/connect/ws/checkouts" \
  -H "Authorization: Bearer ${CONNECT_KEY}" \
  -H "Content-Type: application/json" \
  -H "Platform: AI" \
  -d @"${BODY}"
