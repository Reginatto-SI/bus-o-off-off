#!/usr/bin/env bash
# Defina ENCRYPTED_CARD com o token retornado por PagSeguro.encryptCard
CONNECT_KEY="${PAGBANK_CONNECT_KEY:-${CONNECT_KEY:?Defina PAGBANK_CONNECT_KEY}}"
ENCRYPTED_CARD="${ENCRYPTED_CARD:?Defina ENCRYPTED_CARD}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

BODY=$(sed "s/SUBSTITUA_PELO_TOKEN_DO_ENCRYPT_CARD/${ENCRYPTED_CARD}/" \
  "${SCRIPT_DIR}/../../requests/order-credit-card.json")

curl -sS -X POST \
  "https://ws.pbintegracoes.com/pspro/v7/connect/ws/orders" \
  -H "Authorization: Bearer ${CONNECT_KEY}" \
  -H "Content-Type: application/json" \
  -H "Platform: AI" \
  -d "${BODY}"
