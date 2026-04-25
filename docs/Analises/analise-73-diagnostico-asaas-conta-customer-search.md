# 1. Resumo executivo

- Foi confirmada, no código vigente, a existência de um caminho explícito de falha na etapa **`GET /customers?cpfCnpj=...`** que retorna ao checkout a mensagem **"Resposta vazia ao buscar cliente no Asaas"** com `error_code=customer_search_empty_response` e HTTP 502, após até 2 tentativas. Isso é exatamente compatível com o sintoma reportado em produção para cartão.  
- A investigação não encontrou, neste repositório, um extrato bruto novo (por `sale_id`) da execução mais recente do incidente em cartão para a empresa `3838e687-1a01-4bae-a979-e3ac5356e87e`; portanto, não foi possível cravar causa raiz única com 100% de certeza.  
- Com as evidências disponíveis, a hipótese mais forte é **combinação**:  
  1) comportamento anômalo externo na busca de customer (resposta vazia/não parseável/rede), e  
  2) limitação do sistema em distinguir com maior granularidade (ex.: vazio real vs HTML inválido vs timeout upstream) na resposta final ao usuário.

**Nível de confiança:** médio.

---

# 2. Escopo da investigação

## O que foi analisado
- Fluxo frontend de checkout público até invocação da edge function de pagamento.  
- Fluxo backend da edge function `create-asaas-payment`, com foco em `customer search` e `customer create`.  
- Resolver de ambiente/credencial por empresa e ambiente (`production`/`sandbox`).  
- Estrutura de observabilidade (`sale_integration_logs`/`sale_logs`) e taxonomia de incidentes.  
- Evidências históricas de logs reais já documentadas no repositório (casos Asaas anteriores).  
- Validação de publicação/acessibilidade da edge function em ambiente publicado.

## Fontes usadas
- Código fonte (`Checkout.tsx`, `create-asaas-payment`, `payment-context-resolver`, `runtime-env`, `payment-observability`).
- Migrations de logs técnicos e campos de auditoria.
- Relatórios prévios versionados no repositório com extratos de produção/sandbox.
- Execução de checklist de deploy de edge function.

## Limites da análise
- Não houve, nesta execução, autenticação administrativa direta ao banco para extrair logs novos por `sale_id` do incidente atual.
- Sem esse extrato, não foi possível confirmar empiricamente (neste momento) o `http_status` real retornado pelo Asaas no caso atual de cartão.
- Não foi feito acesso ao painel Asaas da empresa (conta externa), então não há confirmação direta de bloqueio/limitação cadastral da conta no instante do erro.

---

# 3. Fluxo real identificado

1. No checkout público, após criar `sales` e `sale_passengers`, o frontend chama `supabase.functions.invoke("create-asaas-payment")` com `sale_id`, `payment_method` e `payment_environment`.  
2. A edge function `create-asaas-payment` valida venda/empresa/ambiente e resolve credencial por ambiente via `resolvePaymentContext`.  
3. Antes de criar cobrança, a função sempre executa busca de customer no Asaas por CPF/CNPJ (`GET /customers?cpfCnpj=...`).  
4. Se encontrar customer (`data[0].id`), reaproveita. Se não encontrar, tenta criar (`POST /customers`).  
5. A mensagem em investigação é disparada quando a busca de customer termina com `searchData == null` (body vazio, body não-JSON ou erro de rede sem recuperação), mesmo após retry conservador de 2 tentativas.  
6. Nesse cenário, a função retorna erro HTTP 502 com `error_code=customer_search_empty_response`, e o frontend exibe o `error` retornado ao usuário.

---

# 4. Evidências técnicas coletadas

## 4.1 Evidências de código (erro e condição exata)
- O frontend invoca `create-asaas-payment` e, em erro, exibe `errorBody.error` em toast sem mascarar mensagem; portanto, a mensagem exibida ao usuário vem do backend.  
- Em `create-asaas-payment`, a busca de customer roda antes da criação de cobrança (`/payments`).  
- O retry existe e só ocorre quando `safeJson` retorna `null` (vazio/não JSON) ou quando ocorre exceção de rede no `fetch`.  
- Após 2 tentativas, se continuar sem `searchData`, grava incidente `CUSTOMER_SEARCH_EMPTY_RESPONSE` em `sale_integration_logs` e retorna a mensagem observada no checkout.

## 4.2 Evidências de logs reais disponíveis no repositório
- Há evidência real prévia (caso diferente) de `sale_integration_logs` e `sale_logs` com trilha temporal completa para Asaas, incluindo `http_status`, `incident_code`, repetição de tentativas e correlação por `sale_id/company_id`. Isso comprova que a estrutura de observabilidade existe e é usada operacionalmente.  
- Há evidência histórica para a **mesma empresa afetada** (`3838e687-...`) em produção com erro Asaas de negócio (`invalid_billingType` por Pix sem chave), indicando que já houve comportamento externo de conta/provedor impactando checkout no mesmo tenant (ainda que em método PIX, não cartão).

## 4.3 Evidência sobre versão em vigor/publicação
- O checklist de deploy executado em `2026-04-01` mostrou `create-asaas-payment` publicado e acessível, respondendo `HTTP 400` para probe vazio com `{"error":"sale_id is required"}`, o que indica rota ativa no ambiente publicado.  
- No histórico Git do arquivo, há commits no dia `2026-04-01` com ajustes de resiliência em customer search (retry/log estruturado/códigos de incidente), compatíveis com o ajuste mencionado no contexto.

## 4.4 Lacuna crítica
- Não foi localizado, nesta rodada, um registro novo de `sale_integration_logs` do incidente de cartão em produção com os campos `response_json.http_status`, `statusText`, `attempts` e `incident_code` para fechar causa com alta confiança.

---

# 5. Hipóteses avaliadas

## Hipótese A — Problema principal na conta Asaas da empresa
- **Descrição:** conta/credencial operacional da empresa está limitada, inconsistente ou parcialmente degradada para customer search.
- **A favor:** histórico da mesma empresa em produção já apresentou erro externo no gateway (caso Pix); fluxo usa API key da própria empresa por ambiente.
- **Contra:** para este incidente de cartão, falta extrato direto provando rejeição consistente (401/403/429/5xx) no `GET /customers`.
- **Status:** **parcialmente validada**.

## Hipótese B — Instabilidade/restrição do provedor (Asaas)
- **Descrição:** provedor respondeu vazio/não-JSON/intermitente na busca de customer.
- **A favor:** a condição de erro atual é exatamente essa classe técnica (`searchData == null`), com retry já implementado; mensagem voltou mesmo após ajuste.
- **Contra:** sem o log bruto mais recente, não há confirmação do tipo exato de anomalia (rede, body vazio, proxy HTML, timeout).
- **Status:** **parcialmente validada**.

## Hipótese C — Falha interna do sistema Smartbus (lógica)
- **Descrição:** bug interno estruturado causa o erro independentemente do Asaas.
- **A favor:** tratamento agrupa múltiplas anomalias em uma única mensagem, reduzindo precisão diagnóstica para suporte.
- **Contra:** fluxo base está coerente (busca -> reaproveita/cria customer -> segue para cobrança), e a mensagem é emitida apenas quando resposta não parseia/ausente.
- **Status:** **parcialmente validada (como fator de observabilidade, não necessariamente causa primária)**.

## Hipótese D — Combinação conta/provedor + tratamento interno
- **Descrição:** anomalia externa real na busca de customer, com limitação interna de classificação fina do erro final.
- **A favor:** encaixa no sintoma recorrente pós-ajuste e no desenho atual de fallback/erro.
- **Contra:** ausência de extrato novo impede fechar definitivamente.
- **Status:** **mais provável (inconclusiva forte)**.

---

# 6. Análise específica da conta da empresa

## O que indica possível problema na conta
- Para cobrança principal, em `production`, o sistema usa `companies.asaas_api_key_production`; se a chave estiver válida porém associada a conta com restrição operacional parcial, o fluxo pode falhar em etapas específicas (como já ocorreu em Pix para essa empresa em análise anterior).  
- A falha reapareceu após ajuste técnico mínimo, sugerindo fator externo persistente/reincidente.

## O que indica que a conta pode estar normal
- Não há, nesta investigação, prova direta de `401/403` de credencial inválida na chamada de customer search do caso atual.
- A função e o endpoint estão publicados e respondendo no ambiente; não há indício de "função fora do ar".

## O que ainda não foi possível provar
- Se a API key de produção da empresa estava revogada/desatualizada no exato momento do teste.
- Se houve bloqueio antifraude/rate limit/WAF na conta para `GET /customers`.
- Se o comportamento é por CPF específico, por tenant, ou indisponibilidade transitória do provedor.

---

# 7. Comparação com outros casos do sistema

## Caso saudável comparável
- Há caso real documentado com criação de cobrança Asaas bem-sucedida e trilha completa em logs (`requested` -> `success`), demonstrando que o fluxo geral e observabilidade funcionam em cenário saudável (ainda que em sandbox/outro tenant).

## Caso falho comparável
- Há caso real documentado da empresa `3838e687-...` em produção com erro externo do Asaas (Pix indisponível), evidenciando que falhas de conta/provedor já ocorreram no mesmo contexto multiempresa.

## Principais diferenças observadas
- Caso saudável: resposta parseável e progressão normal da etapa Asaas.
- Caso falho (atual): falha antes da criação da cobrança, na busca de customer (`GET /customers`), com mensagem de resposta vazia.
- Diferença de método de pagamento entre históricos (Pix vs cartão) impede extrapolação direta, mas reforça risco de instabilidade/restrição externa por conta.

---

# 8. Conclusão técnica

## Causa confirmada
- **Confirmado:** o erro atual é emitido exclusivamente no ponto de `customer search` quando o retorno não é parseável/ausente após retry, antes de qualquer criação de cobrança.

## Causa mais provável
- **Mais provável:** combinação de comportamento externo (conta/provedor) na etapa `GET /customers` com limitação de classificação interna da falha para o usuário final.

## Grau de confiança
- **Médio**.

## Em aberto
- Tipo exato de resposta externa no incidente atual (status/body/timing/tentativas por `sale_id`).
- Confirmação operacional da conta Asaas da empresa no mesmo instante do erro.

---

# 9. Risco operacional

- **Para a empresa afetada:** alto (bloqueia checkout em cartão em etapa crítica de customer antes da cobrança).
- **Para outras empresas:** moderado (o caminho de erro é global; se houver resposta vazia/não JSON em outros tenants, impacto potencial é similar).
- **Gravidade:** alta para conversão e receita no canal público.

---

# 10. Próximo passo recomendado

Ação única, mínima e segura (sem implementação nesta etapa):

1. Extrair imediatamente do banco de produção os `sale_integration_logs` e `sale_logs` do(s) `sale_id` do teste manual que exibiu a mensagem, filtrando por:
   - `company_id = 3838e687-1a01-4bae-a979-e3ac5356e87e`
   - `event_type = create_payment`
   - `incident_code IN ('CUSTOMER_SEARCH_EMPTY_RESPONSE','CUSTOMER_SEARCH_HTTP_ERROR','CUSTOMER_CREATE_EMPTY_RESPONSE','CUSTOMER_CREATE_HTTP_ERROR')`
2. Confirmar, nesses registros, `response_json.http_status`, `http_status_text`, `attempts`, `duration_ms`, e timestamp exato.
3. Em paralelo, validar no Asaas da empresa (produção) o estado operacional da conta/chave no mesmo período.

Sem esse passo, qualquer correção estrutural continuará baseada em inferência parcial.

---

# 11. Perguntas pendentes

1. Qual foi o `sale_id` exato do último teste manual com erro em cartão?  
2. Nos logs desse `sale_id`, qual `http_status` retornou no `GET /customers`?  
3. O `response_json` veio vazio, não-JSON, HTML, ou houve exceção de rede?  
4. O retry de 2 tentativas foi registrado (campos `attempts`/`duration_ms`)?  
5. A falha ocorreu com um único CPF ou com CPFs distintos?  
6. Outras empresas em produção tiveram `incident_code=CUSTOMER_SEARCH_EMPTY_RESPONSE` no mesmo intervalo?  
7. A API key de produção da empresa passou por rotação/revogação recente?  
8. Há indício de rate limit/bloqueio temporário no Asaas para essa conta?  
9. O ambiente da venda estava persistido como `production` no registro da própria sale?  
10. Existe correlação temporal com incidentes de rede do provedor (latência/timeouts)?

---

## Comandos executados nesta investigação

- `rg --files -g 'AGENTS.md'`
- `rg --files | head -n 200`
- `rg -n "Resposta vazia ao buscar cliente no Asaas|buscar cliente no Asaas|customers\?cpfCnpj|asaas" supabase src | head -n 200`
- `sed -n '1160,1370p' src/pages/public/Checkout.tsx`
- `sed -n '620,980p' supabase/functions/create-asaas-payment/index.ts`
- `git log --oneline -- supabase/functions/create-asaas-payment/index.ts | head -n 20`
- `git show a254c7f -- supabase/functions/create-asaas-payment/index.ts | sed -n '1,320p'`
- `node scripts/check-edge-function-deploy.mjs --report /tmp/check-edge-report.md`

