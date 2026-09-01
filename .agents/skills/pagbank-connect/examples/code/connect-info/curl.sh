#!/usr/bin/env bash
# Valida Connect Key — substitua pela sua key sandbox ou produção
CONNECT_KEY="${PAGBANK_CONNECT_KEY:-${CONNECT_KEY:?Defina PAGBANK_CONNECT_KEY}}"

curl -sS -X GET \
  "https://ws.pbintegracoes.com/pspro/v7/connect/connectInfo" \
  -H "Authorization: Bearer ${CONNECT_KEY}" \
  -H "Content-Type: application/json" \
  -H "Platform: AI"
