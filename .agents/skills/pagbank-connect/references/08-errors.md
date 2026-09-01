# Erros da API

## Formato padrão

Erros retornam JSON com array `error_messages`:

```json
{
  "error_messages": [
    {
      "code": "40002",
      "description": "must be a valid CPF or CNPJ",
      "parameter_name": "customer.tax_id"
    }
  ]
}
```

| Campo | Descrição |
|-------|-----------|
| `code` | Código do erro |
| `description` | Mensagem legível |
| `parameter_name` | Campo do body relacionado (quando aplicável) |

## Códigos frequentes

| Código | Significado típico |
|--------|-------------------|
| `UNAUTHORIZED` | Problema de autenticação — veja seção abaixo |
| `40001` | Campo obrigatório nulo |
| `40002` | Valor inválido (formato, tamanho, data) |
| `40003` | Valor de pagamento inválido |

## Erro `UNAUTHORIZED` — causas comuns

A Connect Key **é renovada automaticamente** enquanto estiver ativa. Este erro raramente significa “key expirada” — na prática, costuma ser uso incorreto do header `Authorization`:

| Erro comum | O que foi enviado | O correto |
|------------|-------------------|-----------|
| Connect Key ausente | Header vazio ou sem `Bearer` | `Authorization: Bearer CON...` (40 caracteres) |
| Token PagBank no lugar da Connect Key | Token de conta/API PagBank | Connect Key obtida em [pbintegracoes.com/connect/autorizar](https://pbintegracoes.com/connect/autorizar/?utm_source=github-agent-skills&utm_content=docs-errors-connect-autorizar&utm_medium=link) |
| Public Key antiga | Chave `PUB...` da integração legada | Connect Key `CON...` ou `CONSANDBOX...` |

A Connect Key começa com **`CON`** (produção) ou **`CONSANDBOX`** (sandbox). Chaves **`PUB`** são public keys para criptografia de cartão — não servem como autenticação.

Ver [examples/errors/unauthorized.json](../examples/errors/unauthorized.json).

Se a integração foi desautorizada pelo lojista, gere uma nova Connect Key em [pbintegracoes.com/connect/autorizar](https://pbintegracoes.com/connect/autorizar/?utm_source=github-agent-skills&utm_content=docs-errors-connect-autorizar&utm_medium=link).

## Validação de CPF/CNPJ

Ver [examples/errors/validation-tax-id.json](../examples/errors/validation-tax-id.json).

## E-mail do comprador igual ao do vendedor

```json
{
  "error_messages": [
    {
      "code": "40002",
      "description": "buyer email must not be equals to merchant email",
      "parameter_name": "customer.email"
    }
  ]
}
```

Use e-mail de teste diferente do e-mail da conta PagBank em sandbox.

## Tratamento recomendado

1. Ler `error_messages[0]`
2. Exibir `description` ao usuário
3. Se houver `parameter_name`, destacar o campo no formulário

## Códigos HTTP de sucesso (não são erro)

| Código | Quando | Significado |
|--------|--------|-------------|
| **200** | `GET connect/connectInfo`, `GET connect/ws/orders/{id}` | Consulta OK |
| **201** | `POST connect/ws/orders` (PIX, boleto, cartão) | **Pedido criado com sucesso** |

**Importante:** `201 Created` é a resposta **esperada** ao criar um pedido. Não é falha de rede nem “erro HTTP”. Muitos clientes tratam qualquer `2xx` como sucesso (`response.ok` no fetch, `raise_for_status()` no Python `requests`).

**Evite** checar apenas `status === 200` após `POST` de pedido — isso faz o código tratar `201` como falha por engano.

```javascript
// Correto: aceita 200 e 201
if (!res.ok) { /* erro */ }

// Incorreto para POST de pedido:
if (res.status !== 200) { /* trata 201 como erro */ }
```

## Código HTTP e corpo da resposta (erros)

Quando algo dá errado, a API devolve um código **4xx** ou **5xx** e, em geral, um JSON com `error_messages`.

**Leia sempre o body JSON** em respostas de erro para obter `description` e `parameter_name` — não confie só no número HTTP.

Exemplo (fetch):

```javascript
const res = await fetch(url, options);
const data = await res.json();
if (!res.ok) {
  const msg = data.error_messages?.[0]?.description ?? res.statusText;
  throw new Error(msg);
}
// POST de pedido: res.status === 201 aqui é sucesso
```
