/**
 * Valida Connect Key via connect/connectInfo.
 * Node 18+ (fetch nativo). Uso: PAGBANK_CONNECT_KEY=... node request.mjs
 */
const CONNECT_KEY = process.env.PAGBANK_CONNECT_KEY ?? (() => { throw new Error('Defina PAGBANK_CONNECT_KEY'); })();
const BASE_URL = 'https://ws.pbintegracoes.com/pspro/v7';

const res = await fetch(`${BASE_URL}/connect/connectInfo`, {
  headers: {
    Authorization: `Bearer ${CONNECT_KEY}`,
    'Content-Type': 'application/json',
    Platform: 'AI',
  },
});

if (!res.ok) {
  console.error(await res.text());
  process.exit(1);
}

console.log(await res.json());
