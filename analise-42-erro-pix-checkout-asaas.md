# Análise — Erro Pix no checkout público Asaas

## 1. Resumo executivo
Foi investigado o erro exibido no checkout público ao selecionar Pix: **“Não há nenhuma chave Pix disponível para receber cobranças.”**.

Conclusão técnica principal:
- o erro acontece no fluxo público de checkout, **após a criação da venda** (`sales`) e após a tentativa de criar cobrança na edge function `create-asaas-payment`;
- a mensagem **não está hardcoded no frontend nem no backend** deste repositório;
- a edge function, quando recebe erro do Asaas ao criar pagamento, retorna diretamente `paymentData?.errors?.[0]?.description`; o frontend apenas exibe esse texto em `toast.error`;
- portanto, para esta mensagem específica, a origem mais provável é **resposta textual do próprio Asaas** (ou de camada gateway imediatamente anterior que preenche esse campo no padrão Asaas), e não validação local de chave Pix.

Hipótese mais forte (com confiança **alta**, mas não absoluta sem log de produção em tempo real):
- a chamada ao Asaas acontece e o endpoint `/payments` responde erro de regra de negócio da conta destino (ex.: conta sem chave Pix apta para cobrança naquele ambiente/conta).

## 2. Fluxo real mapeado
Fluxo real do clique até o erro:

1. Usuário conclui o formulário no checkout público (`src/pages/public/Checkout.tsx`) e executa `handleSubmit`.
2. O frontend cria lock de assentos (`seat_locks`).
3. O frontend cria a venda em `sales` com:
   - `company_id = event.company_id`;
   - `status = pendente_pagamento`;
   - `payment_method` (pix/cartão);
   - `payment_environment = runtimePaymentEnvironment`.
4. O frontend cria `sale_passengers`.
5. O frontend chama `supabase.functions.invoke("create-asaas-payment")` enviando:
   - `sale_id`;
   - `payment_method`;
   - `payment_environment`.
6. No backend (`supabase/functions/create-asaas-payment/index.ts`):
   - valida payload e busca `sale`;
   - busca `company` da venda;
   - resolve ambiente e credencial por ambiente;
   - busca/cria cliente no Asaas (`/customers`);
   - tenta criar cobrança no Asaas (`POST /payments`) com `billingType = PIX` quando `payment_method = pix`.
7. Se o Asaas retornar erro no `/payments`, a edge devolve `error = paymentData.errors[0].description`.
8. O frontend lê `errorBody?.error` e exibe em `toast.error(errorMessage || fallback)`.
9. Resultado: a mensagem visível ao usuário é exatamente a mensagem recebida da edge (que, nesse cenário, veio do erro retornado pelo Asaas).

## 3. Origem exata da mensagem
Origem exata desta mensagem no sistema:

- **Não existe ocorrência literal** de `“Não há nenhuma chave Pix disponível para receber cobranças.”` no código do repositório.
- A mensagem é propagada dinamicamente em duas etapas:

1. **Edge function** (`supabase/functions/create-asaas-payment/index.ts`)
   - contexto: tratamento de erro após `POST /payments` no Asaas;
   - quando `paymentRes.ok === false`, a função retorna:
     - `error: paymentData?.errors?.[0]?.description || "Erro ao criar cobrança no Asaas"`.
   - isto é, o texto de erro externo é repassado como payload de erro.

2. **Frontend** (`src/pages/public/Checkout.tsx`)
   - contexto: tratamento do retorno da invoke `create-asaas-payment`;
   - captura `errorMessage = errorBody?.error` e mostra `toast.error(errorMessage || "Erro ao iniciar pagamento. Tente novamente.")`.

Classificação:
- mensagem **não hardcoded**;
- mensagem **dinâmica**, proveniente do campo de erro recebido no backend;
- no cenário observado, a origem funcional é externa (Asaas) com repasse quase transparente.

## 4. Evidências técnicas encontradas
Evidências concretas:

1. Busca textual no repositório pela frase exata não encontrou resultados.
2. `billingType` é definido como `PIX` quando `payment_method = "pix"` na edge.
3. A edge realmente chama Asaas:
   - `/customers?cpfCnpj=...` (busca de cliente);
   - `POST /payments` (criação de cobrança).
4. Em erro no `POST /payments`, edge retorna descrição do Asaas (`errors[0].description`) sem mapeamento semântico interno específico para chave Pix.
5. No frontend, a mensagem da edge é mostrada diretamente em toast.
6. Não foi encontrada validação local de “Pix key/addressKeys/chave Pix disponível” no fluxo `create-asaas-payment`.
7. O fluxo usa `sale.company_id` para carregar `companies` e escolhe credenciais por `payment_environment` (produção/sandbox).

Limitação explícita desta análise:
- não houve acesso a log runtime de produção neste diagnóstico local; portanto, a conclusão sobre “mensagem veio do Asaas” está ancorada em fluxo de código + formato da mensagem exibida + ausência de hardcode interno.

## 5. A chamada ao Asaas ocorre ou não?
**Resposta objetiva: depende do ponto em que falha, mas para a mensagem analisada o cenário é “sim, ocorre”.**

Base técnica:
- para o usuário receber essa frase específica no toast, o backend precisa ter retornado `error` com esse texto;
- esse `error` no backend, nesse ponto do fluxo, vem de `paymentData.errors[0].description` após tentativa de `POST /payments`;
- portanto, no caso desta mensagem, há forte evidência de que a chamada ao Asaas de criação de cobrança **foi feita** e retornou erro de negócio.

Quando não ocorreria chamada ao Asaas:
- falhas anteriores (venda inexistente, ambiente não resolvido, ausência de API key etc.) retornam outras mensagens/códigos internos e não esta frase.

## 6. Dependências e configurações envolvidas
Itens que influenciam o fluxo Pix:

- **Venda (`sales`)**
  - `id`, `company_id`, `status`, `payment_method`, `payment_environment`, `asaas_payment_id`, `asaas_payment_status`.
- **Empresa (`companies`)**
  - `asaas_api_key_production`, `asaas_api_key_sandbox` (credencial mandatória para create);
  - `asaas_wallet_id_production`, `asaas_wallet_id_sandbox` (trilha/diagnóstico, não bloqueio principal no create atual);
  - `asaas_onboarding_complete_production`, `asaas_onboarding_complete_sandbox` (lidos no contexto).
- **Ambiente operacional**
  - definido no checkout por `useRuntimePaymentEnvironment` (build > edge > fallback hostname);
  - enviado no payload e persistido na venda;
  - usado para selecionar `baseUrl` (`api.asaas.com` vs `sandbox.asaas.com`) e campos da empresa por ambiente.
- **Integração Asaas**
  - customer lookup/create;
  - payment create com `billingType: "PIX"`.
- **Observabilidade**
  - `sale_integration_logs` e `sale_operational_logs` registram eventos de request/sucesso/falha, inclusive `payment_environment`.

## 7. Hipóteses avaliadas
| Hipótese | Evidência a favor | Evidência contra | Status |
|---|---|---|---|
| Mensagem é hardcoded no frontend | Nenhuma | Busca textual sem ocorrência; frontend só exibe `errorBody.error` | **Descartada** |
| Mensagem é hardcoded na edge `create-asaas-payment` | Nenhuma | Busca textual sem ocorrência; edge repassa `errors[0].description` | **Descartada** |
| Erro nasce antes da chamada Asaas | Possível para outros erros | Para esta frase específica, caminho aponta para erro retornado no `/payments` | **Descartada (para este caso)** |
| Erro vem do Asaas no create de cobrança Pix | Edge usa `paymentData.errors[0].description`; sem mapeamento local para essa frase | Sem log de produção anexado nesta tarefa para comprovação transacional | **Provável forte** |
| Conta/ambiente utilizado está incorreto (API key de outra conta/ambiente) | Fluxo depende de `payment_environment` + campos da empresa por ambiente; divergência pode levar a conta errada | Não há prova direta do caso real sem dados de venda/empresa em produção | **Inconclusiva** |
| Empresa realmente sem chave Pix no ambiente usado | Mensagem semântica compatível | Não há validação local que prove isso; pode ser conta errada, onboarding/permite cobrança, ou política externa | **Provável (não confirmada)** |
| Onboarding pendente local bloqueia create | Campos existem | `create-asaas-payment` atual bloqueia principalmente por API key; não há bloqueio explícito por onboarding nesse trecho | **Descartada como causa primária direta** |

## 8. Causa raiz mais provável
Causa raiz mais provável:
- a cobrança Pix está sendo tentada com sucesso até o `POST /payments`, porém o Asaas rejeita a criação e devolve a descrição **“Não há nenhuma chave Pix disponível para receber cobranças.”**, que é repassada sem transformação substancial ao usuário.

Nível de confiança:
- **alto** para a origem técnica do texto (repasse de `errors[0].description`);
- **médio** para a causa de negócio específica (“não há chave Pix de fato”), pois ainda pode ser sintoma de:
  - credencial da conta errada;
  - ambiente errado (produção vs sandbox);
  - conta parcialmente vinculada;
  - restrição operacional da conta no Asaas.

## 9. Riscos de negócio/UX
- **Bloqueio direto de conversão** no método Pix (método de maior adoção no mercado BR).
- **Perda de confiança**: usuário avança até o fim e recebe erro terminal.
- **Aumento de suporte manual** para confirmação de conta/ambiente/chave.
- **Inconsistência entre empresas**: algumas podem cobrar Pix normalmente e outras não, dependendo da configuração por ambiente.
- **Risco operacional**: sem enriquecimento contextual da mensagem (empresa/ambiente/etapa), triagem fica mais lenta.

## 10. O que precisa ser decidido antes da correção
Antes de corrigir, recomenda-se decidir:

1. Política de mensagem ao usuário final:
   - repassar mensagem bruta do gateway ou mapear para mensagem de produto + código técnico?
2. Política operacional:
   - bloquear preventivamente checkout Pix quando integração da empresa não estiver “Pix-ready” (pré-check), ou manter tentativa e tratar erro?
3. Observabilidade obrigatória:
   - padronizar log com `sale_id`, `company_id`, `payment_environment`, `asaas_base_url`, `api_key_source`, `billingType`, `errors[0].code/description` para toda falha de pagamento.
4. Regra de governança multiambiente:
   - confirmar regra oficial de publicação/config para impedir uso cruzado de credenciais entre produção e sandbox.

## 11. Arquivos analisados
- `src/pages/public/Checkout.tsx`
  - fluxo público de submit, criação de venda e exibição do erro.
- `supabase/functions/create-asaas-payment/index.ts`
  - criação de cobrança, chamada ao Asaas e propagação de erro.
- `supabase/functions/_shared/payment-context-resolver.ts`
  - resolução de ambiente e credenciais por empresa/ambiente.
- `supabase/functions/_shared/runtime-env.ts`
  - base URL e resolução de ambiente por host (fallback utilitário).
- `src/hooks/use-runtime-payment-environment.ts`
  - origem do `payment_environment` enviado pelo checkout.
- `supabase/functions/get-runtime-payment-environment/index.ts`
  - edge auxiliar usada para resolver ambiente no frontend.
- `supabase/migrations/20260815090000_add_asaas_environment_configuration.sql`
  - campos por ambiente em `companies`.
- `supabase/migrations/20261001120000_harden_payment_environment_and_logs.sql`
  - hardening de `payment_environment` e logs de integração.

## 12. Próximo passo recomendado
Recomendação objetiva:
- **há evidência suficiente para abrir correção**, mas com uma etapa rápida de confirmação operacional antes de codar:
  1. capturar um caso real em produção por `sale_id`;
  2. confirmar no log técnico o `payment_environment` e a conta/credencial efetiva usada;
  3. validar no Asaas dessa conta se o recebimento Pix está habilitado e com chave apta.

Se essa confirmação operacional não for possível de imediato, ainda assim a correção pode seguir em trilha de robustez observável (mensageria + telemetria), mantendo o fluxo único.

---

## Checklist final obrigatório
- [x] localizou a origem exata da mensagem
- [x] verificou se a chamada ao Asaas acontece ou não
- [x] identificou o ponto exato do fluxo em que o erro nasce
- [x] mapeou quais campos/configurações da empresa influenciam o Pix
- [x] avaliou se há diferença indevida entre produção e sandbox
- [x] separou fato, hipótese e incerteza
- [x] gerou o arquivo Markdown no padrão solicitado
