# Checklist automático de deploy e verificação de ambiente para edge functions

## Objetivo
Fornecer uma checagem simples, auditável e segura para comparar edge functions existentes no código local com o ambiente publicado, reduzindo o risco de frontend depender de funções ainda não refletidas no ambiente publicado do projeto.

## Problema que motivou esta implementação
- Houve divergência entre o código local e o ambiente publicado consumido pela aplicação (incluindo cenários gerenciados pelo Lovable Cloud).
- O frontend passou a depender de funções como `check-asaas-integration` e `get-runtime-payment-environment`, mas o ambiente validado retornou `404 Requested function was not found`.
- Faltava uma verificação rápida e repetível antes de validar o ambiente publicado.

## Estratégia adotada
- Criar um script único em `scripts/check-edge-function-deploy.mjs`.
- Reutilizar `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` do `.env`.
- Executar probes seguros (`OPTIONS` + request vazio) que não alteram estado do sistema.
- Gerar um resumo em Markdown com status por função.

## Arquivos criados
- `scripts/check-edge-function-deploy.mjs`
- `docs/checklist-deploy-verificacao-ambiente-edge-functions.md`

## Arquivos alterados
- `package.json`

## Como executar o checklist
```bash
npm run check:edge-deploy
```

Opcionalmente, para gerar o relatório em outro caminho:
```bash
node scripts/check-edge-function-deploy.mjs --report docs/meu-relatorio.md
```

## O que ele valida
- existência da função no código local (`supabase/functions/<nome>`);
- acessibilidade/publicação da rota no ambiente publicado consultado;
- resposta inicial coerente (`ok`, `auth_error`, `request_error`, `missing_deploy`, `needs_review`, `unknown`);
- dependência textual do frontend/código em relação à função.

## O que ele não valida
- lógica interna completa da edge function;
- integrações reais com gateway de pagamento;
- webhooks com payload válido;
- fluxo completo de autenticação do usuário final.

## Estrutura dos status
- `ok`: função publicada e resposta inicial coerente para o probe seguro;
- `missing_deploy`: rota ausente ou `NOT_FOUND` no ambiente;
- `auth_error`: função publicada, mas exige autenticação/autorização;
- `request_error`: função publicada, mas o request vazio falhou por contrato;
- `needs_review`: resposta inesperada ou erro 5xx;
- `unknown`: não foi possível classificar com confiança.

## Resultado da execução atual
- Gerado em: 2026-03-30T19:30:28.125Z
- Ambiente consultado: https://cdrcyjrvurrphnceromd.supabase.co
- Total de edge functions locais detectadas: 16
- Resumo por status: auth_error=2, ok=1, request_error=3

| Função | Existe no código local | Referências no código/frontend | Publicada/acessível | Resultado do teste | Status final | Observação |
|---|---|---:|---|---|---|---|
| check-asaas-integration | sim | 2 | sim | HTTP 401 | auth_error | Função publicada e acessível, exigindo autenticação/autorização. |
| get-runtime-payment-environment | sim | 1 | sim | OK | ok | Ambiente resolvido como sandbox. |
| create-asaas-account | sim | 3 | sim | HTTP 401 | auth_error | Função publicada e acessível, exigindo autenticação/autorização. |
| create-asaas-payment | sim | 1 | sim | HTTP 400 | request_error | Função publicada e acessível, mas o probe vazio falhou por contrato/request. |
| asaas-webhook | sim | 0 | sim | HTTP 400 | request_error | Função publicada e acessível, mas o probe vazio falhou por contrato/request. |
| verify-payment-status | sim | 3 | sim | HTTP 400 | request_error | Função publicada e acessível, mas o probe vazio falhou por contrato/request. |

## Detalhes resumidos dos probes
### check-asaas-integration
- Probe OPTIONS: HTTP 200
- Probe principal: HTTP 401 — {"error":"Unauthorized"}
- Dependência textual detectada: 2 arquivo(s).

### get-runtime-payment-environment
- Probe OPTIONS: HTTP 200
- Probe principal: HTTP 200 — {"payment_environment":"sandbox","host_detected":"unknown"}
- Dependência textual detectada: 1 arquivo(s).

### create-asaas-account
- Probe OPTIONS: HTTP 200
- Probe principal: HTTP 401 — {"error":"Unauthorized"}
- Dependência textual detectada: 3 arquivo(s).

### create-asaas-payment
- Probe OPTIONS: HTTP 200
- Probe principal: HTTP 400 — {"error":"sale_id is required"}
- Dependência textual detectada: 1 arquivo(s).

### asaas-webhook
- Probe OPTIONS: HTTP 200
- Probe principal: HTTP 400 — {"error":"Sale environment unresolved","external_reference":null}
- Dependência textual detectada: 0 arquivo(s).

### verify-payment-status
- Probe OPTIONS: HTTP 200
- Probe principal: HTTP 400 — {"error":"sale_id is required"}
- Dependência textual detectada: 3 arquivo(s).

## Riscos e limitações
- Um `auth_error` ou `request_error` confirma presença/deploy, mas não prova corretude da lógica interna.
- Algumas funções sensíveis são testadas apenas com payload vazio para evitar efeito colateral.
- O checklist depende do `.env` local para descobrir a URL publicada e a chave publicável usadas pelo projeto no ambiente atual.

## Próximos usos recomendados
- executar antes de validar o ambiente publicado;
- executar após publicar novas edge functions;
- anexar o relatório em auditorias rápidas de ambiente.

## Conclusão
O checklist fornece uma camada prática e previsível para detectar divergência entre código local e ambiente publicado efetivamente consumido pela aplicação antes que isso apareça para o usuário final.

## Checklist final
- [x] foi criada uma forma automatizada de verificar deploy/disponibilidade de edge functions
- [x] o checklist cobre as funções críticas do projeto
- [x] a solução não altera estado do sistema
- [x] há comentários úteis no código criado
- [x] existe comando claro para execução
- [x] foi gerado arquivo Markdown no repositório
- [x] ficaram documentadas limitações e riscos
