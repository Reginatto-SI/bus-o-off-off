# Análise — Conta / credencial / empresa usada no Asaas em produção

## 1. Resumo executivo
Caso real analisado: venda `f8cff4b2-b36e-471f-a698-47428f02982a`, empresa `3838e687-1a01-4bae-a979-e3ac5356e87e` (BUSÃO OFF OFF), método `pix`, ambiente `production`.

Síntese objetiva:
- o fluxo do checkout público cria a venda com `company_id` e `payment_environment`, e depois chama `create-asaas-payment` com esses dados;
- no backend, a empresa é resolvida diretamente por `sale.company_id`, e o ambiente efetivo de cobrança é decidido por `sale` travada ou `request` explícito;
- para o caso informado (`production`), a regra de credencial seleciona **campo da empresa por ambiente de produção** (`asaas_api_key_production`), sem fallback para sandbox nessa trilha;
- o endpoint de cobrança é `https://api.asaas.com/v3/payments` quando ambiente resolvido é produção;
- o `walletId` informado no caso (`54b2bcad-4015-4824-b0af-fb330c86e6bd`) **não é wallet da empresa no payload principal**; no fluxo de create-payment, `walletId` só aparece no array `split` (plataforma e/ou sócio), não como destino principal da cobrança.

Hipótese mais forte sobre conta/credencial/configuração (com base no código + evidência de log fornecida):
- o fluxo está atingindo o endpoint de produção com credencial de produção da empresa resolvida pela venda, porém a conta Asaas associada a essa API key rejeitou `PIX` com `invalid_billingType` por indisponibilidade operacional de chave Pix.

Nível de confiança:
- **alto** para rastreio da rota de seleção (empresa/ambiente/campo de credencial/endpoint);
- **médio** para afirmar “qual conta Asaas exata” sem acesso direto ao painel/response completo de produção no momento desta análise.

## 2. Caso real analisado
Dados de referência obrigatórios (fornecidos no incidente):

- `sale_id`: `f8cff4b2-b36e-471f-a698-47428f02982a`
- `company_id`: `3838e687-1a01-4bae-a979-e3ac5356e87e`
- `company_name`: `BUSÃO OFF OFF`
- `payment_method`: `pix`
- `payment_environment`: `production`
- `walletId` observado: `54b2bcad-4015-4824-b0af-fb330c86e6bd`
- erro Asaas: `code = invalid_billingType`
- erro Asaas: `description = Não há nenhuma chave Pix disponível para receber cobranças.`

Observação de rastreabilidade:
- este relatório usa o caso real acima como referência operacional;
- neste ambiente local não houve leitura direta do banco de produção para abrir payload/log bruto dessa venda específica.

## 3. Fluxo real do caso
1. **Frontend (Checkout público)**
   - `handleSubmit` cria venda em `sales` com `company_id = event.company_id` e `payment_environment = runtimePaymentEnvironment`.
   - em seguida chama `supabase.functions.invoke("create-asaas-payment")` enviando `sale_id`, `payment_method`, `payment_environment`.

2. **Criação da venda e seleção da empresa**
   - a venda nasce já vinculada a uma empresa (`company_id`) definida pelo evento selecionado no checkout.
   - a edge function busca a venda por `sale_id`; em seguida busca `companies` com `.eq("id", sale.company_id)`.

3. **Seleção do ambiente**
   - `create-asaas-payment` normaliza `requestedPaymentEnvironment` (`production|sandbox`).
   - se a venda já está travada com cobrança (`sale.payment_environment` + `asaas_payment_id`), usa ambiente da venda;
   - senão usa o ambiente explícito enviado no request;
   - divergência entre ambiente travado e request gera `payment_environment_mismatch`.

4. **Resolução da credencial**
   - `resolvePaymentContext(mode: "create", ...)` usa configuração da empresa pelo ambiente resolvido;
   - em `production`, o campo alvo é `companies.asaas_api_key_production`;
   - em `sandbox`, seria `companies.asaas_api_key_sandbox`.

5. **Montagem de payload e envio ao Asaas**
   - para `pix`, define `billingType = "PIX"`;
   - monta payload com `customer`, `billingType`, `value`, `dueDate`, `description`, `externalReference = sale.id`, `split`;
   - envia para `POST {baseUrl}/payments`, onde `baseUrl` é `https://api.asaas.com/v3` em produção.

6. **Retorno do erro**
   - se o Asaas responder erro, a função retorna `paymentData.errors[0].description` no campo `error`;
   - o frontend exibe esse `error` ao usuário em toast.

## 4. Empresa efetiva usada
Como a empresa é identificada no fluxo:

- fonte primária no create-payment: `sale.company_id` (não há seleção por empresa ativa de sessão no backend da edge);
- consulta da empresa: `companies WHERE id = sale.company_id`;
- logo, para o caso real, a empresa efetiva pretendida pelo fluxo é a do `company_id` da venda (`3838e687-1a01-4bae-a979-e3ac5356e87e`).

Risco de mistura multiempresa:
- **baixo no create-payment**, porque a busca de `companies` é estrita por `sale.company_id`.
- risco residual existe apenas se a própria venda tiver sido criada com `company_id` errado antes dessa etapa (ou se houver mutação indevida fora do fluxo), não por seleção paralela dentro da edge.

## 5. Ambiente efetivo usado
Rastreamento de ambiente:

- frontend calcula ambiente via `useRuntimePaymentEnvironment` (ordem: build explícito > edge `get-runtime-payment-environment` > fallback hostname) e envia em payload;
- venda já recebe `payment_environment` no insert;
- backend resolve o ambiente por regra determinística:
  - venda travada com cobrança existente prevalece;
  - primeira cobrança usa request explícito;
  - se ambos divergirem, falha.

Para o caso informado (`production`):
- se request = production e venda não está travada em outro ambiente, backend usa production;
- endpoint final coerente esperado: `https://api.asaas.com/v3/payments`.

Coerência entre pontos:
- arquitetura é de fluxo único com variação por ambiente via dado;
- não foi encontrada trilha paralela específica “Pix produção” separada da sandbox.

## 6. Credencial efetiva usada
Precisão de seleção de credencial:

- função: `resolvePaymentContext` em `supabase/functions/_shared/payment-context-resolver.ts`;
- modo: `create` (fluxo do checkout público);
- dono da cobrança no fluxo principal: `ownerType = company`;
- regra: `apiKey = companyEnvConfig.apiKey`;
- `companyEnvConfig` em produção lê `companies.asaas_api_key_production`.

Fallback/risco de desvio:
- não há fallback automático para `asaas_api_key_sandbox` quando ambiente resolvido é produção;
- também não há fallback para API key global da plataforma no fluxo principal de venda (`ownerType=company`);
- risco de “credencial errada” permanece possível se o valor salvo em `asaas_api_key_production` da própria empresa estiver incorreto (ex.: chave de outra conta Asaas), cenário que o código sozinho não invalida.

O que é possível provar e o que não é:
- **provável com alta confiança**: campo selecionado foi `asaas_api_key_production` no caso `payment_environment=production`;
- **não provável só pelo código local**: valor secreto exato da chave usada em produção e a identidade formal da conta Asaas por trás dela.

## 7. Wallet / split efetivo usado
Origem de `walletId` no fluxo:

- payload principal de cobrança não inclui `walletId` da empresa como destino explícito;
- no create-payment, `walletId` aparece no `split`:
  1. wallet da plataforma (segredo de ambiente `ASAAS_WALLET_ID` em produção);
  2. wallet do sócio ativo (`socios_split`) resolvida por ambiente (`asaas_wallet_id_production`/`sandbox`).

Sobre o `walletId = 54b2bcad-4015-4824-b0af-fb330c86e6bd` do caso:
- fato: esse ID foi observado nos logs do incidente;
- pelo desenho do código, ele **tende** a ser wallet de split (plataforma ou sócio), não necessariamente wallet da conta principal da empresa;
- sem o payload bruto persistido (`sale_integration_logs.payload_json`) da venda específica, não é possível cravar aqui se esse `walletId` era da plataforma ou de sócio.

Compatibilidade com empresa/ambiente:
- split é montado no backend já com `sale.company_id` e `payment_environment` resolvido;
- se sócio estiver ativo, a carteira vem de `socios_split` filtrado por `company_id`.

## 8. Evidências técnicas concretas
1. `Checkout.tsx` insere venda com `company_id` e `payment_environment` e chama edge com esses dados.
2. `create-asaas-payment`:
   - valida `payment_method` e define `billingType` (PIX/cartão);
   - busca venda por `sale_id`;
   - busca empresa por `sale.company_id`;
   - resolve contexto de ambiente/credencial;
   - chama Asaas `/customers` e `/payments`;
   - registra logs operacionais/técnicos com `company_id`, `payment_environment`, `asaas_base_url`, `api_key_source`.
3. `payment-context-resolver`:
   - em `production`, lê `asaas_api_key_production`;
   - em `sandbox`, lê `asaas_api_key_sandbox`;
   - não faz fallback cruzado production↔sandbox.
4. `runtime-env`:
   - define `baseUrl` de produção/sandbox explicitamente.
5. `payment-observability` + migrations:
   - `sale_integration_logs` suporta `payment_environment`, `environment_decision_source`, `payload_json`, `response_json`, etc., úteis para auditoria do caso.

## 9. Hipóteses avaliadas
| Hipótese | Evidência a favor | Evidência contra | Status |
|---|---|---|---|
| Credencial de produção correta da empresa foi usada | Regra de seleção em `mode=create` + `payment_environment=production` aponta para `asaas_api_key_production` da `sale.company_id` | Não há exibição do segredo em log/painel local | **Provável forte** |
| Credencial de outra conta Asaas está salva em `asaas_api_key_production` da empresa | Mensagem de erro de negócio pode ocorrer com conta “válida porém inadequada” | Sem acesso ao valor da chave e ao painel Asaas da conta, não comprova | **Inconclusiva** |
| Ambiente correto (production) mas conta sem Pix habilitado/chave ativa | Caso real reporta `invalid_billingType` + descrição de ausência de chave Pix | Falta prova externa no painel Asaas da conta efetiva | **Provável** |
| Wallet do log pertence à empresa principal | Pode existir wallet associada à empresa na configuração geral | No payload create-payment, `walletId` observável fica no `split`, não no destino principal | **Inconclusiva / improvável como wallet principal** |
| Wallet observada pertence à plataforma ou sócio de split | Código monta `split` com wallet da plataforma e possivelmente sócio | Sem payload bruto da venda específica, não crava qual das duas | **Provável** |
| Divergência entre venda e contexto resolvido causou este erro | Existe proteção para mismatch e persistência de ambiente | Mismatch geraria erro interno específico (`payment_environment_mismatch`), não `invalid_billingType` do Asaas | **Descartada para este caso** |

## 10. O que ainda não pode ser provado só pelo código/log atual
Itens pendentes para certeza total:

1. qual valor exato de `companies.asaas_api_key_production` foi usado na execução do caso (se corresponde à conta Asaas esperada);
2. qual payload completo de `split` foi persistido em `sale_integration_logs` para a venda específica;
3. qual conta Asaas (identidade no painel) responde por essa API key naquele momento;
4. se a conta em produção tinha chave Pix apta a receber cobrança na data do incidente.

Dados externos necessários:
- consulta ao registro real da venda e logs técnicos (`sale_integration_logs`/`sale_logs`) em produção;
- validação no painel Asaas da conta vinculada à API key de produção da empresa BUSÃO OFF OFF.

## 11. Risco operacional encontrado
- **Risco de conta errada por credencial cadastrada incorretamente**: moderado (o código respeita empresa, mas depende da qualidade da API key gravada no cadastro da empresa).
- **Risco de empresa errada receber no fluxo principal**: baixo no backend create-payment (lookup por `sale.company_id`).
- **Risco de inconsistência produção vs sandbox**: baixo a moderado (regras separadas por campo; risco existe se dados estiverem cruzados no cadastro).
- **Risco de suporte manual recorrente**: alto enquanto não houver confirmação operacional rápida de “Pix-ready” da conta em produção.
- **Risco de perda de conversão**: alto para pagamentos Pix quando a conta de produção não está apta.

## 12. Próximo passo recomendado
Recomendação única de próximo passo (sem correção de fluxo ainda):

1. executar auditoria operacional do caso real por `sale_id` em produção:
   - recuperar `sale` (`company_id`, `payment_environment`, `asaas_payment_id`);
   - recuperar `sale_integration_logs` dessa venda (payload/response do `create_payment`);
   - confirmar `environment_decision_source`, `asaas_base_url`, `api_key_source`;
2. com esse extrato, validar no Asaas da empresa (produção) se a conta da API key possui chave Pix habilitada;
3. só então decidir correção (mensageria, pré-validação de readiness, ou saneamento de credencial).

## 13. Arquivos analisados
- `src/pages/public/Checkout.tsx` — origem de `company_id`/`payment_environment` e invoke da edge.
- `src/hooks/use-runtime-payment-environment.ts` — regra de decisão de ambiente no frontend.
- `supabase/functions/get-runtime-payment-environment/index.ts` — resolução auxiliar de ambiente via host.
- `supabase/functions/create-asaas-payment/index.ts` — núcleo de criação de cobrança, split e propagação de erro.
- `supabase/functions/_shared/payment-context-resolver.ts` — seleção de ambiente/credencial por empresa.
- `supabase/functions/_shared/runtime-env.ts` — base URLs e nomes de segredos por ambiente.
- `supabase/functions/_shared/payment-observability.ts` — persistência de logs operacionais/técnicos.
- `supabase/migrations/20261001120000_harden_payment_environment_and_logs.sql` — rastreabilidade por ambiente em logs.
- `supabase/migrations/20261017090000_stage3_payment_observability_dedup.sql` — taxonomia de logs e auditoria.

---

## Checklist final obrigatório
- [x] rastreou a empresa usada no caso real
- [x] rastreou o ambiente usado no caso real
- [x] rastreou qual campo de credencial foi selecionado
- [x] auditou a origem do `walletId`
- [x] avaliou risco de mistura multiempresa
- [x] avaliou risco de divergência produção vs sandbox
- [x] separou fato, hipótese e incerteza
- [x] gerou o arquivo Markdown no padrão solicitado
