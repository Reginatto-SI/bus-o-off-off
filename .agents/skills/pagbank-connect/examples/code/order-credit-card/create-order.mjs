/**
 * Cria pedido cartão no servidor — requer ENCRYPTED_CARD do browser.
 * PAGBANK_CONNECT_KEY=... ENCRYPTED_CARD=... node create-order.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONNECT_KEY = process.env.PAGBANK_CONNECT_KEY ?? (() => { throw new Error('Defina PAGBANK_CONNECT_KEY'); })();
const ENCRYPTED_CARD = process.env.ENCRYPTED_CARD;
if (!ENCRYPTED_CARD) {
  console.error('Defina ENCRYPTED_CARD (token do PagSeguro.encryptCard)');
  process.exit(1);
}

const BASE_URL = 'https://ws.pbintegracoes.com/pspro/v7';
const body = JSON.parse(
  readFileSync(join(__dirname, '../../requests/order-credit-card.json'), 'utf8'),
);
body.charges[0].payment_method.card.encrypted = ENCRYPTED_CARD;

const res = await fetch(`${BASE_URL}/connect/ws/orders`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${CONNECT_KEY}`,
    'Content-Type': 'application/json',
    Platform: 'AI',
  },
  body: JSON.stringify(body),
});

const data = await res.json();
if (!res.ok) {
  console.error(data);
  process.exit(1);
}

console.log('Order ID:', data.id);
console.log('Charge status:', data.charges?.[0]?.status);
