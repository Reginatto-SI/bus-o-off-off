# Segurança — Connect Key e credenciais

Este guia reduz risco de vazamento de credenciais em código gerado por IAs, scripts e logs. O [audit Snyk no skills.sh](https://skills.sh/pbintegracoes/pagbank-agent-skills/pagbank-connect/security/snyk) alerta quando instruções parecem incentivar colar a Connect Key em arquivos ou snippets.

## Regras para agentes e desenvolvedores

| Regra | Detalhe |
|-------|---------|
| **Nunca commitar** | Connect Key em repositório, `.env` versionado, README, issues ou PRs |
| **Nunca colar em chat** | Não envie a key completa para LLMs, Slack ou tickets |
| **Variável de ambiente** | Carregue em runtime: `PAGBANK_CONNECT_KEY` (ou secret do CI) |
| **Não logar** | Não imprima headers `Authorization` nem corpos com tokens |
| **Placeholders** | Em exemplos use só `$PAGBANK_CONNECT_KEY` — não use strings que pareçam keys reais (`CON...`, `CONSANDBOX...`) |
| **Rotação** | Se vazou, revogue/regenere em [pbintegracoes.com](https://pbintegracoes.com/connect/autorizar/?utm_source=github-agent-skills&utm_content=security&utm_medium=link) |

## Padrão de autenticação (runtime)

O header continua sendo Bearer, mas a **origem** da key é sempre externa ao código-fonte:

```http
Authorization: Bearer <valor de PAGBANK_CONNECT_KEY>
Content-Type: application/json
```

### Bash

```bash
export PAGBANK_CONNECT_KEY='obtenha em pbintegracoes.com — não commite'
curl -sS -H "Authorization: Bearer ${PAGBANK_CONNECT_KEY}" ...
```

### Python

```python
import os
connect_key = os.environ["PAGBANK_CONNECT_KEY"]
headers = {"Authorization": f"Bearer {connect_key}"}
```

### Node

```javascript
const connectKey = process.env.PAGBANK_CONNECT_KEY;
headers: { Authorization: `Bearer ${connectKey}` }
```

## O que os exemplos deste repo fazem

- Scripts em [`examples/code/`](../examples/code/) leem `CONNECT_KEY` ou `PAGBANK_CONNECT_KEY` do ambiente.
- JSON em [`examples/requests/`](../examples/requests/) **não** contêm credenciais.
- Documentação usa `$PAGBANK_CONNECT_KEY` em vez de exemplos com prefixo `CON`.

## Sobre o alerta W007 (skills.sh / Snyk)

PagBank Integrações **exige** Bearer com Connect Key em cada chamada — não há OAuth alternativo no MVP. O risco apontado é **como** a key é tratada (hardcode, chat, logs), não o uso do header em si.

**Mitigações deste repositório:**

1. Guia dedicado (este arquivo) referenciado no skill.
2. Exemplos só com variáveis de ambiente.
3. Proibição explícita de colar keys em código gerado.

O alerta **W009** (acesso a pagamentos) é esperado: o skill documenta integração financeira.

## PCI e dados de cartão

- PAN/CVV: criptografar no browser (SDK) ou fluxo server-side documentado — ver [05-order-credit-card.md](05-order-credit-card.md).
- Não armazene PAN em texto claro.
- 3DS: sessão e desafio no browser — ver [10-3ds.md](10-3ds.md).
