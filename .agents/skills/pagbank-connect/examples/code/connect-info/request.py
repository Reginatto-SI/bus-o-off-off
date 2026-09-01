#!/usr/bin/env python3
"""Valida Connect Key via connect/connectInfo."""
import os
import requests

CONNECT_KEY = os.environ["PAGBANK_CONNECT_KEY"]
BASE_URL = "https://ws.pbintegracoes.com/pspro/v7"

response = requests.get(
    f"{BASE_URL}/connect/connectInfo",
    headers={
        "Authorization": f"Bearer {CONNECT_KEY}",
        "Content-Type": "application/json",
        "Platform": "AI",
    },
    timeout=30,
)
response.raise_for_status()
print(response.json())
