#!/usr/bin/env bash
# Sessão 3DS — POST connect/ws-sdk/checkout-sdk/sessions
set -euo pipefail
CONNECT_KEY="${PAGBANK_CONNECT_KEY:-${CONNECT_KEY:?Defina PAGBANK_CONNECT_KEY}}"
BASE="https://ws.pbintegracoes.com/pspro/v7"

curl -sS -X POST "${BASE}/connect/ws-sdk/checkout-sdk/sessions" \
  -H "Authorization: Bearer ${CONNECT_KEY}" \
  -H "Content-Type: application/json" \
  -H "Platform: AI" \
  -d '{}'
