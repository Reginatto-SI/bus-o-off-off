/**
 * Cria pedido boleto. Body: examples/requests/order-boleto.json
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONNECT_KEY = process.env.PAGBANK_CONNECT_KEY ?? (() => { throw new Error('Defina PAGBANK_CONNECT_KEY'); })();
const BASE_URL = 'https://ws.pbintegracoes.com/pspro/v7';

const body = JSON.parse(
  readFileSync(join(__dirname, '../../requests/order-boleto.json'), 'utf8'),
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

const boleto = data.charges?.[0]?.payment_method?.boleto;
console.log('Order ID:', data.id);
console.log('Barcode:', boleto?.formatted_barcode);
