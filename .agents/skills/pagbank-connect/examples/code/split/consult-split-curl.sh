#!/usr/bin/env bash
# Consulta split em produção via PagBank Integrações.
# Sandbox: use GET direto em internal.sandbox.api.pagseguro.com (sem auth) — ver docs/15-split.md
set -euo pipefail

: "${PAGBANK_CONNECT_KEY:?Defina PAGBANK_CONNECT_KEY}"
: "${SPLIT_ID:?Defina SPLIT_ID (ex.: SPLI_...) }"

BASE_URL="${PAGBANK_BASE_URL:-https://ws.pbintegracoes.com/pspro/v7}"

curl -sS -X GET "${BASE_URL}/connect/ws/splits/${SPLIT_ID}" \
  -H "Authorization: Bearer ${PAGBANK_CONNECT_KEY}" \
  -H "Accept: application/json"
