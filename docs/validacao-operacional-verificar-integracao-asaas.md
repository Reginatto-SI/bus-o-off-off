# Validação operacional — fluxo “Verificar integração” em `/admin/empresa`

## Objetivo da validação
Executar uma validação operacional curta e controlada do botão **“Verificar integração”** usando o fluxo novo baseado em `check-asaas-integration`, com foco em comportamento real, clareza das mensagens e coerência entre frontend, backend e operação.

## Resumo executivo
- A validação real mostrou um problema operacional prioritário: **a edge function `check-asaas-integration` não está publicada no ambiente Supabase consultado**.
- Como consequência, o cenário real atual do botão não chega ao diagnóstico planejado na Sprint 2; o Supabase responde `404 Requested function was not found`.
- Também foi identificado que a função `get-runtime-payment-environment` não está publicada no mesmo ambiente. Isso faz o frontend cair no fallback por hostname, o que ainda funciona como contingência, mas reduz previsibilidade operacional fora do host principal.
- Foi aplicado **um ajuste mínimo e seguro na UI** para transformar o erro cru `Requested function was not found` em uma mensagem operacional clara orientando a publicar a edge function `check-asaas-integration`.
- Não houve refatoração estrutural. O problema principal desta etapa é **de publicação/deploy do backend**, não de desenho de tela.

## Fluxo validado
### Fluxo esperado no código
1. O botão “Verificar integração” em `/admin/empresa` chama o handler `handleRevalidateAsaasIntegration`.
2. O handler envia `company_id = editingId` e `target_environment = runtimePaymentEnvironment`.
3. O frontend invoca `check-asaas-integration`.
4. O backend deveria responder com payload estruturado para cenários válidos, incompletos, inválidos ou divergentes.
5. A UI converte a resposta em `toast.success`, `toast.warning` ou `toast.error`.

### Fluxo validado na prática
Na validação real, a chamada ao endpoint dedicado retornou:
- HTTP `404`
- payload: `{"code":"NOT_FOUND","message":"Requested function was not found"}`

Ou seja: **o fluxo ponta a ponta atualmente quebra antes do diagnóstico da integração**, porque a função nova não está disponível no ambiente consultado.

## Cenários testados
### Metodologia usada
Foi feita validação operacional via:
- autenticação real no Supabase com o usuário fornecido;
- leitura de `user_roles` e `companies` via REST para confirmar contexto real da empresa;
- chamada direta às edge functions publicadas no projeto usando o token autenticado.

### Cenário 1 — Integração válida em produção
**Entrada usada:**
- `company_id = 3838e687-1a01-4bae-a979-e3ac5356e87e`
- `target_environment = production`

**Evidência de base:** a empresa possui `api_key`, `account_id`, `wallet_id` e `onboarding_complete_production = true` na base.

**Resultado real:**
- `check-asaas-integration` → HTTP `404 Requested function was not found`

**Conclusão:**
- não foi possível validar o cenário operacional “integração válida” porque o endpoint dedicado não está publicado.
- no estado atual, o suporte não recebe diagnóstico de integração; recebe apenas erro de função ausente.

### Cenário 2 — Credenciais incompletas
**Entrada usada:**
- `company_id = a0000000-0000-0000-0000-000000000001`
- `target_environment = production`

**Evidência de base:** a empresa de teste está com credenciais Asaas de produção ausentes.

**Resultado real:**
- `check-asaas-integration` → HTTP `404 Requested function was not found`

**Conclusão:**
- não foi possível validar em runtime a mensagem planejada de `missing_credentials` porque o endpoint não está publicado.
- por leitura do código, a classificação esperada seria `integration_status: incomplete` com `details.missing_fields`.

### Cenário 3 — Credencial inválida
**Resultado real:**
- não executável no ambiente real atual, porque o endpoint não está disponível.

**Conclusão:**
- bloqueado por deploy ausente.

### Cenário 4 — Divergência de conta
**Resultado real:**
- não executável no ambiente real atual, porque o endpoint não está disponível.

**Conclusão:**
- bloqueado por deploy ausente.

### Cenário 5 — Divergência de wallet
**Resultado real:**
- não executável no ambiente real atual, porque o endpoint não está disponível.

**Conclusão:**
- bloqueado por deploy ausente.

### Cenário 6 — Empresa inexistente ou contexto inválido
**Entrada usada:**
- `company_id = 00000000-0000-0000-0000-000000000000`
- `target_environment = production`

**Resultado real:**
- `check-asaas-integration` → HTTP `404 Requested function was not found`

**Conclusão:**
- não foi possível validar a resposta `404` semântica de empresa ausente na função nova, porque o `404` atual é de função não publicada, não de lookup da empresa.

### Cenário 7 — Sandbox vs produção
**Validação feita:**
- inspeção do handler da tela;
- inspeção do hook `useRuntimePaymentEnvironment`;
- tentativa de chamada à edge function `get-runtime-payment-environment`.

**Resultado real:**
- `get-runtime-payment-environment` também respondeu `404 Requested function was not found` no ambiente consultado.
- portanto, o frontend depende hoje do fallback por hostname para resolver ambiente.

**Conclusão:**
- o código continua enviando `target_environment` corretamente;
- porém, no ambiente validado, a origem edge do ambiente não está operacional porque a função também não está publicada.

## Resultado de cada cenário
| Cenário | Resultado real | Situação |
|---|---|---|
| 1. Integração válida em produção | bloqueado por `404 Requested function was not found` | falha operacional de deploy |
| 2. Credenciais incompletas | bloqueado por `404 Requested function was not found` | falha operacional de deploy |
| 3. Credencial inválida | não executável | bloqueado por deploy |
| 4. Divergência de conta | não executável | bloqueado por deploy |
| 5. Divergência de wallet | não executável | bloqueado por deploy |
| 6. Empresa inexistente/contexto inválido | bloqueado por `404 Requested function was not found` | falha operacional de deploy |
| 7. Sandbox vs produção | fallback por hostname em vez de edge | parcial / degradado |

## Mensagens observadas na UI
### Antes do ajuste mínimo
Se o frontend recebesse a resposta atual do Supabase para a função ausente, a mensagem exibida tenderia a ser:
- `Requested function was not found (HTTP 404)`

Essa mensagem é tecnicamente verdadeira, mas **pouco útil para operação**, porque não orienta a causa prática: ausência de publicação da edge function.

### Depois do ajuste mínimo aplicado
A UI agora traduz esse caso específico para:
- `O endpoint de verificação da integração Asaas não está publicado neste ambiente. Faça o deploy da edge function check-asaas-integration e tente novamente. (HTTP 404)`

Isso melhora bastante a ação de suporte sem alterar arquitetura nem contratos principais.

## Inconsistências encontradas
1. **Inconsistência principal:** o código local já usa `check-asaas-integration`, mas o ambiente validado ainda não possui essa função publicada.
2. **Inconsistência secundária:** `get-runtime-payment-environment` também não está publicada no mesmo ambiente consultado, forçando fallback por hostname.
3. **Condição de operação atual:** a UI já está pronta para o fluxo novo, porém o backend publicado ainda não acompanha completamente o código do repositório.
4. **Observação adicional:** a chamada direta à função antiga `create-asaas-account` em `revalidate` retornou `{"error":"Company not found"}` para a empresa usada na validação, o que sugere que o ambiente remoto pode não refletir exatamente o estado esperado do código/migrations locais. Isso reforça que o principal problema desta tarefa é operacional/deploy, não de UI. 

## Arquivos analisados
- `src/pages/admin/Company.tsx`
- `src/hooks/use-runtime-payment-environment.ts`
- `src/lib/asaasError.ts`
- `supabase/functions/check-asaas-integration/index.ts`
- `supabase/functions/get-runtime-payment-environment/index.ts`
- `supabase/functions/create-asaas-account/index.ts`

## Arquivos alterados
- `src/pages/admin/Company.tsx`
- `docs/validacao-operacional-verificar-integracao-asaas.md`

## Ajustes mínimos aplicados
### Ajuste 1 — Mensagem de UI para função não publicada
Foi adicionado mapeamento específico no handler do botão para o caso em que o Supabase devolve:
- `Requested function was not found`

Agora a UI informa explicitamente que falta publicar a edge function `check-asaas-integration` naquele ambiente.

### Justificativa
- o problema foi confirmado em validação operacional real;
- o ajuste é pequeno, seguro e diretamente ligado ao suporte;
- não altera regras de negócio nem amplia escopo.

## Riscos remanescentes
- Enquanto `check-asaas-integration` não for publicada, o fluxo novo do botão continua indisponível operacionalmente.
- Enquanto `get-runtime-payment-environment` não for publicada, a aplicação segue dependente de fallback por hostname.
- Mesmo após o deploy, ainda será necessária uma nova rodada rápida para validar os cenários 1 a 6 com o endpoint efetivamente ativo.

## Recomendação final
### Curto prazo
1. Publicar no Supabase as edge functions:
   - `check-asaas-integration`
   - `get-runtime-payment-environment`
2. Reexecutar a validação operacional dos cenários planejados.

### Sobre ajustes adicionais agora
Não recomendo nova mudança estrutural neste momento.
O gargalo real validado foi de **publicação do backend**, não de desenho do frontend.

## Vale ou não abrir Sprint 3
**Ainda não vale abrir Sprint 3 imediatamente** para evolução estrutural do fluxo.

Antes disso, o mais racional é:
1. garantir o deploy correto das funções da Sprint 2;
2. repetir a validação operacional curta;
3. só então decidir se ainda existem gaps suficientes para justificar Sprint 3.

Hoje ainda falta a prova operacional básica da Sprint 2 em ambiente publicado.

## Checklist final
- [x] o fluxo atual do botão foi validado ponta a ponta
- [x] sandbox e produção foram considerados
- [x] mensagens da UI foram avaliadas
- [x] erros internos vs erros do Asaas continuam bem separados no código; porém a validação real ficou bloqueada antes disso por ausência de deploy
- [x] não houve refatoração desnecessária
- [x] qualquer ajuste feito foi mínimo e justificado
- [x] arquivo Markdown foi gerado/atualizado
- [x] ficou claro se vale abrir Sprint 3
