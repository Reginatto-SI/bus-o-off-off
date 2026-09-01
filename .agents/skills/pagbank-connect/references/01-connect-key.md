# Connect Key

A **Connect Key** é um token de 40 caracteres que identifica sua integração e autoriza chamadas à API PagBank Integrações.

## Formato

- Produção: prefixo `CON` + identificador do app + hash (ex.: `CONPS30DIAS...`)
- Sandbox: prefixo `CONSANDBOX...`

## Obter uma Connect Key

| Ambiente | URL |
|----------|-----|
| Produção | [pbintegracoes.com/connect/autorizar](https://pbintegracoes.com/connect/autorizar/?utm_source=github-agent-skills&utm_content=docs-connect-key-autorizar&utm_medium=link) |
| Sandbox | [pbintegracoes.com/connect/sandbox](https://pbintegracoes.com/connect/sandbox/?utm_source=github-agent-skills&utm_content=docs-connect-key-sandbox&utm_medium=link) |

## Validar a Connect Key

**Endpoint:** `GET connect/connectInfo`

**Headers:** veja [03-headers.md](03-headers.md)

### Resposta — campo `status`

| Status | Significado |
|--------|-------------|
| `VALID` | Conta seller/business; key ativa |
| `INVALID` | Conta pessoal (buyer) — não pode processar pagamentos |
| `UNKNOWN` | Falha ao consultar PagBank (timeout, indisponibilidade) |
| `UNAUTHORIZED` | Connect Key inválida ou ausente |

### Exemplo de resposta (válida)

```json
{
  "isSandbox": false,
  "authorizerEmail": "v****@exemplo.test",
  "expiresAt": "2026-07-23 07:10:11",
  "reference": "CON626460",
  "status": "VALID",
  "connectKey": "CONPS30DIAS..."
}
```

### Erro — key inválida

```json
{
  "error_messages": [
    {
      "code": "UNAUTHORIZED",
      "description": "Connect Key inválida. Verifique header de autorização."
    }
  ]
}
```

Ver [examples/errors/unauthorized.json](../examples/errors/unauthorized.json).

## Renovação automática

A Connect Key é **renovada automaticamente** enquanto a autorização estiver ativa. Não é necessário trocar a key periodicamente por expiração — salve-a com segurança no seu ambiente (variável de ambiente, cofre de secrets).

## Pedidos vinculados à Connect Key

Cada pedido fica associado à Connect Key usada na criação. **Não é possível consultar um pedido com outra Connect Key** — mesmo que seja da mesma conta PagBank ou de outra instalação sua.

Ao consultar (`GET connect/ws/orders/{id}`) ou reconciliar webhooks, use sempre a mesma key que criou o pedido.

## Exemplos de código

- [examples/code/connect-info/](../examples/code/connect-info/)

## Referência

- Payload oficial PagBank: não se aplica (endpoint específico PB Integrações)
- [developer.pagbank.com.br](https://developer.pagbank.com.br) — documentação geral da API Orders para pedidos
