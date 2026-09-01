#!/usr/bin/env python3
"""Cria pedido PIX. Body: examples/requests/order-pix.json"""
import json
import os
from pathlib import Path

import requests

CONNECT_KEY = os.environ["PAGBANK_CONNECT_KEY"]
BASE_URL = "https://ws.pbintegracoes.com/pspro/v7"
ROOT = Path(__file__).resolve().parents[2]
body = json.loads((ROOT / "requests" / "order-pix.json").read_text())

response = requests.post(
    f"{BASE_URL}/connect/ws/orders",
    headers={
        "Authorization": f"Bearer {CONNECT_KEY}",
        "Content-Type": "application/json",
        "Platform": "AI",
    },
    json=body,
    timeout=60,
)
# POST de pedido: sucesso = HTTP 201 (requests trata 2xx como ok)
if not response.ok:
    print(response.status_code, response.text)
    response.raise_for_status()
assert response.status_code == 201, f"esperado 201, veio {response.status_code}"
data = response.json()
print("Order ID:", data.get("id"))
qr = (data.get("qr_codes") or [{}])[0]
print("PIX copy-paste:", qr.get("text", "")[:80], "...")
