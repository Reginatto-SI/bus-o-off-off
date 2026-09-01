/**
 * Referência: executar no BROWSER após carregar pagseguro.min.js
 * e obter public_key via POST connect/ws/public-keys
 *
 * <script src="https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js"></script>
 */
// eslint-disable-next-line no-undef
const result = PagSeguro.encryptCard({
  publicKey: 'SUA_PUBLIC_KEY_AQUI',
  holder: 'NOME NO CARTAO',
  number: '4111111111111111',
  expMonth: '12',
  expYear: '2030',
  securityCode: '123',
});

console.log(result.encryptedCard);
// Envie result.encryptedCard no POST connect/ws/orders
