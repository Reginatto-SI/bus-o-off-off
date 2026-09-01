/**
 * Cria pedido PIX. Body: examples/requests/order-pix.json
 * PAGBANK_CONNECT_KEY=... node request.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONNECT_KEY = process.env.PAGBANK_CONNECT_KEY ?? (() => { throw new Error('Defina PAGBANK_CONNECT_KEY'); })();
const BASE_URL = 'https://ws.pbintegracoes.com/pspro/v7';

const body = JSON.parse(
  readFileSync(join(__dirname, '../../requests/order-pix.json'), 'utf8'),
);

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
// POST de pedido: sucesso esperado = HTTP 201
if (res.status !== 201) {
  console.warn('Aviso: esperado status 201, recebido', res.status);
}

console.log('Order ID:', data.id);
console.log('PIX text:', data.qr_codes?.[0]?.text?.slice(0, 80), '...');
