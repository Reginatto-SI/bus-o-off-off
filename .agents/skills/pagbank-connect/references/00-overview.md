# Visão geral

## PagBank Integrações

A [PagBank Integrações](https://pbintegracoes.com/?utm_source=github-agent-skills&utm_content=docs-overview&utm_medium=link) oferece integrações gratuitas com o PagBank para e-commerce e automação (Magento, WooCommerce, n8n, Wix, entre outras). Este repositório documenta a **API HTTP** usada por essas integrações.

## Base URL

```
https://ws.pbintegracoes.com/pspro/v7/
```

Todas as operações Connect do MVP usam caminhos como:

- `connect/connectInfo` — validar Connect Key
- `connect/ws/orders` — criar e consultar pedidos
- `connect/ws/public-keys` — chave para criptografia de cartão

## Autenticação

Todas as requisições Connect enviam:

```
Authorization: Bearer {connectKey}
```

A Connect Key é obtida em:

- **Produção:** [pbintegracoes.com/connect/autorizar](https://pbintegracoes.com/connect/autorizar/?utm_source=github-agent-skills&utm_content=docs-overview-connect-autorizar&utm_medium=link)
- **Sandbox:** [pbintegracoes.com/connect/sandbox](https://pbintegracoes.com/connect/sandbox/?utm_source=github-agent-skills&utm_content=docs-overview-connect-sandbox&utm_medium=link) (prefixo `CONSANDBOX`)

Requer conta PagBank **Vendedor** ou **Empresarial** (Seller/Enterprise).

A Connect Key é renovada automaticamente enquanto ativa. Detalhes: [01-connect-key.md](01-connect-key.md).

## Acesso aos pedidos

| Tópico | Regra |
|--------|-------|
| **Sandbox** | Pedidos com `CONSANDBOX` não aparecem em painéis do PagBank — só via API. Ver [02-sandbox.md](02-sandbox.md). |
| **Connect Key** | Cada pedido só pode ser consultado com a mesma Connect Key que o criou. |

## Códigos HTTP de sucesso

| Operação | Código esperado |
|----------|-----------------|
| `POST connect/ws/orders` (criar pedido) | **201** Created |
| `GET connect/connectInfo`, `GET connect/ws/orders/{id}` | **200** OK |

`201` ao criar pedido **não é erro**. Detalhes: [08-errors.md](08-errors.md).

## Convenções de payload

Estas regras aplicam-se ao **corpo JSON**, não a headers HTTP:

| Regra | Detalhe |
|-------|---------|
| Valores monetários | Sempre em **centavos** (inteiro). Ex.: R$ 59,00 → `5900` |
| Respostas | Valores também em centavos |
| `reference_id` | Identificador do seu sistema (pedido, carrinho, etc.) |
| Cliente internacional | PagBank pode exigir CPF/CNPJ; use `01234567890` apenas quando reconhecer cliente fora do Brasil |

## O que NÃO usar

- Chamada direta a `api.pagseguro.com` com Bearer da Connect Key

## v2 — endpoints adicionais

| Tópico | Documentação |
|--------|--------------|
| Credenciais (env, Snyk) | [09-security-credentials.md](09-security-credentials.md) |
| Payment link (checkout) | [10-checkout-payment-link.md](10-checkout-payment-link.md) |
| 3D Secure | [11-3ds.md](11-3ds.md) |
| Taxas / parcelas | [12-fees-calculate.md](12-fees-calculate.md) |
| Recorrência | [13-recurring.md](13-recurring.md) · integrações (opcional): [14-recurring-integrations.md](14-recurring-integrations.md) |
| Split (divisão de pagamento) | [15-split.md](15-split.md) |

Índice completo: [references/ws-endpoints.md](../references/ws-endpoints.md).

## Fora do escopo

- Liberação avançada de custódia além do básico (ver [15-split.md](15-split.md) + doc PagBank)
- Envio Fácil (`/ef/*`)
- Reembolsos

## Próximos passos

1. [Connect Key](01-connect-key.md) · [Segurança](09-security-credentials.md)
2. [Sandbox](02-sandbox.md)
3. [Headers HTTP](03-headers.md)

## Termos

[Termos de uso e privacidade](https://pbintegracoes.com/terms/?utm_source=github-agent-skills&utm_content=docs-overview-terms&utm_medium=link)
