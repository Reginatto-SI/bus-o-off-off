# Criptografia de cartão (referência)

O PagBank exige `card.encrypted` no pedido. Este diretório resume **onde** implementar, sem duplicar o código do node n8n.

## Caminho preferido (web / menor escopo PCI)

- SDK browser: `https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js`
- `PagSeguro.encryptCard({ publicKey, holder, number, expMonth, expYear, securityCode })`
- Apps nativos: **WebView** com página que carrega o SDK, ou **iframe**/checkout — o app principal não deve ler PAN/CVV em texto claro

Ver [docs/05-order-credit-card.md](../../docs/05-order-credit-card.md).

## Caminho server-side / automação (referência open source)

Implementação mantida e usada em produção no node **n8n PagBank Connect**:

| Recurso | Link |
|---------|------|
| Repositório | [github.com/r-martins/PagBank-n8n](https://github.com/r-martins/PagBank-n8n) |
| Função `encryptCard` | [lib/pagbank/pagseguro-n8n-compatible.js](https://github.com/r-martins/PagBank-n8n/blob/master/lib/pagbank/pagseguro-n8n-compatible.js) |
| Wrapper | [lib/pagbank/PagBankEncryption.ts](https://github.com/r-martins/PagBank-n8n/blob/master/lib/pagbank/PagBankEncryption.ts) |

Contrato em alto nível:

1. `POST connect/ws/public-keys` com `{"type":"card"}`
2. Montar string `numero;cvv;mes;ano;portador;timestamp` (regras de normalização no repo acima)
3. RSA PKCS#1 v1.5 com a `public_key` → Base64
4. `POST connect/ws/orders` com `charges[].payment_method.card.encrypted`

Portar para C#, Java, etc.: use o repo n8n como especificação; valide em sandbox com Connect Key `CONSANDBOX`.

## PCI

Criptografar no servidor ou no desktop **antes** do POST não elimina obrigações PCI se o aplicativo coleta PAN/CVV. Para produção com usuário final, priorize browser/WebView/iframe. Para backends internos ou automação (n8n), avalie risco e política da sua empresa.
