#!/usr/bin/env bash
# Consulta parcelas — GET connect/ws/charges/fees/calculate
set -euo pipefail
CONNECT_KEY="${PAGBANK_CONNECT_KEY:-${CONNECT_KEY:?Defina PAGBANK_CONNECT_KEY}}"
BASE="https://ws.pbintegracoes.com/pspro/v7"

VALUE_CENTS="${VALUE_CENTS:-59000}"
BIN="${CREDIT_CARD_BIN:-411111}"
MAX="${MAX_INSTALLMENTS:-12}"
MAX_FREE="${MAX_INSTALLMENTS_NO_INTEREST:-3}"

curl -sS -G "${BASE}/connect/ws/charges/fees/calculate" \
  -H "Authorization: Bearer ${CONNECT_KEY}" \
  -H "Content-Type: application/json" \
  -H "Platform: AI" \
  --data-urlencode "payment_methods=CREDIT_CARD" \
  --data-urlencode "value=${VALUE_CENTS}" \
  --data-urlencode "credit_card_bin=${BIN}" \
  --data-urlencode "max_installments=${MAX}" \
  --data-urlencode "max_installments_no_interest=${MAX_FREE}"
