#!/usr/bin/env bash
CONNECT_KEY="${PAGBANK_CONNECT_KEY:-${CONNECT_KEY:?Defina PAGBANK_CONNECT_KEY}}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

curl -sS -X POST \
  "https://ws.pbintegracoes.com/pspro/v7/connect/ws/orders" \
  -H "Authorization: Bearer ${CONNECT_KEY}" \
  -H "Content-Type: application/json" \
  -H "Platform: AI" \
  -d @"${SCRIPT_DIR}/../../requests/order-boleto.json"
