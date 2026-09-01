#!/usr/bin/env python3
"""Cria pedido boleto. Body: examples/requests/order-boleto.json"""
import json
import os
from pathlib import Path

import requests

CONNECT_KEY = os.environ["PAGBANK_CONNECT_KEY"]
BASE_URL = "https://ws.pbintegracoes.com/pspro/v7"
ROOT = Path(__file__).resolve().parents[2]
body = json.loads((ROOT / "requests" / "order-boleto.json").read_text())

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
if not response.ok:
    print(response.status_code, response.text)
    response.raise_for_status()
data = response.json()
charge = (data.get("charges") or [{}])[0]
boleto = charge.get("payment_method", {}).get("boleto", {})
print("Order ID:", data.get("id"))
print("Barcode:", boleto.get("formatted_barcode"))
