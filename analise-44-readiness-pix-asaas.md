# Análise — Readiness Pix automático no Asaas

## 1. Resumo executivo
- **Problema atacado:** empresas chegavam ao checkout público com integração Asaas aparentemente válida, mas sem chave Pix operacional; o erro só aparecia para o comprador no momento de gerar cobrança.
- **Solução implementada:** readiness Pix automático por ambiente (produção/sandbox), com:
  - consulta de chaves Pix (`GET /pix/addressKeys`);
  - tentativa idempotente de criação de chave EVP (`POST /pix/addressKeys`) quando necessário;
  - persistência de estado de readiness na empresa por ambiente;
  - logs técnicos reutilizando trilha existente (`sale_integration_logs` com `sale_id = null`);
  - exposição do status no admin e bloqueio preventivo de Pix no checkout.
- **Impacto esperado:** redução de falha `invalid_billingType` por ausência de chave Pix, melhoria de conversão e menor suporte manual.

## 2. Fluxo anterior
- O admin conectava/revalidava Asaas sem checagem explícita de chave Pix ativa.
- O checkout público permitia selecionar Pix sem considerar readiness operacional da conta.
- O `create-asaas-payment` tentava criar cobrança PIX diretamente; quando o Asaas rejeitava, o usuário final recebia erro no fim da jornada.

## 3. Fluxo novo
- **Quando consulta chaves:**
  - após conexão/criação/revalidação em `create-asaas-account` (opção C);
  - durante `check-asaas-integration` (verificação manual no admin).
- **Quando cria EVP:**
  - se `GET /pix/addressKeys` não retorna chave operacional ativa;
  - executa `POST /pix/addressKeys` com `{ "type": "EVP" }` e reconsulta para confirmar.
- **Como decide readiness:**
  - `ready=true` quando existe pelo menos uma chave Pix operacional ativa;
  - persiste por ambiente em `companies`:
    - `asaas_pix_ready_<env>`
    - `asaas_pix_last_checked_at_<env>`
    - `asaas_pix_last_error_<env>`
- **Como isso aparece no admin:**
  - na tela `/admin/empresa`, card de integração exibe “Readiness Pix: Pix pronto / Pix pendente de configuração” + último erro quando houver.
- **Como isso impacta o checkout:**
  - opção Pix é desabilitada quando a empresa não está pronta no ambiente atual;
  - submit também bloqueia Pix preventivamente;
  - backend `create-asaas-payment` reforça bloqueio com `error_code = pix_not_ready` quando flag local está falsa.

## 4. Decisão de arquitetura
- **Escolha adotada:** **Opção C com idempotência**.
  - pós-criação/conexão/revalidação em `create-asaas-account`;
  - verificação manual em `check-asaas-integration` também tenta garantir readiness.
- **Por que C:**
  - menor risco de regressão no fluxo existente;
  - maior previsibilidade operacional (estado atualizado em mais de um ponto seguro);
  - melhor UX (admin recebe status explícito; checkout previne erro tardio).
- **Por que descartar A isolada:** poderia deixar contas antigas sem readiness até nova conexão.
- **Por que descartar B isolada:** dependeria de ação manual para resolver readiness recém-criada.

## 5. Arquivos alterados
- `supabase/functions/_shared/asaas-pix-readiness.ts`
  - helper reutilizável de readiness Pix (query + auto create EVP + recheck + retorno estruturado).
- `supabase/functions/create-asaas-account/index.ts`
  - integra readiness Pix nos fluxos `revalidate`, `link_existing`, `link_existing_partial`, `create_subaccount`;
  - persiste status por ambiente na `companies`;
  - registra observabilidade técnica de readiness.
- `supabase/functions/check-asaas-integration/index.ts`
  - inclui readiness Pix na verificação manual;
  - persiste status por ambiente;
  - retorna dados de readiness no payload de diagnóstico.
- `supabase/functions/create-asaas-payment/index.ts`
  - bloqueio defensivo de PIX quando empresa não está pronta localmente (`pix_not_ready`).
- `src/pages/admin/Company.tsx`
  - exibição de status de readiness Pix no card de integração Asaas.
- `src/pages/public/Checkout.tsx`
  - desabilita Pix quando empresa não está pronta no ambiente atual;
  - evita descoberta tardia no submit.
- `supabase/migrations/20261101090000_add_company_pix_readiness_fields.sql`
  - adiciona colunas de readiness Pix por ambiente na tabela `companies`.
- `src/types/database.ts`
  - tipagem local da entidade `Company` com novos campos de readiness.
- `src/integrations/supabase/types.ts`
  - tipagens geradas de `companies` atualizadas com novos campos.

## 6. Logs/observabilidade adicionados
- Evento técnico reutilizado em `sale_integration_logs`:
  - `eventType = company_pix_readiness`;
  - campos de contexto: `company_id`, `payment_environment`, ação (`already_ready`, `evp_created`, `evp_creation_failed`, etc.), contagem de chaves ativas, `error_code`, `error_message`.
- Persistência em `companies` do último check/erro por ambiente para leitura rápida no admin/checkout.

## 7. Regras de negócio aplicadas
- **Readiness Pix:** conta só é considerada pronta quando há chave Pix operacional ativa no ambiente.
- **Idempotência:**
  - se já há chave ativa, não cria nova;
  - tentativa EVP ocorre apenas quando necessário.
- **Bloqueio/ocultação no checkout:**
  - Pix desabilitado visualmente quando `pix_ready=false` no ambiente atual;
  - submit bloqueado com mensagem clara antes da cobrança.
- **Tratamento de falhas:**
  - falha de query/criação não quebra toda integração, mas mantém `pix_ready=false` com motivo rastreável.

## 8. Riscos e limitações
- Dependência de políticas externas do Asaas (KYC/aprovação da conta).
- Mesmo com tentativa automática, o Asaas pode recusar criação de chave por restrição operacional.
- Persistência local pode ficar desatualizada se houver mudança manual no Asaas sem nova verificação (mitigado por verificação manual e fluxos de conexão/revalidação).

## 9. Como testar
1. **Conta já com chave Pix**
   - conectar/revalidar integração;
   - validar `pix_ready=true` e ação `already_ready`.
2. **Conta sem chave Pix**
   - conectar/revalidar integração;
   - validar tentativa de criação EVP e atualização para `pix_ready=true` quando sucesso.
3. **Conta com falha na criação**
   - simular resposta de erro do Asaas;
   - validar `pix_ready=false`, `pix_last_error` preenchido e logs técnicos.
4. **Produção e sandbox**
   - repetir cenários por ambiente e confirmar isolamento de colunas/credenciais/endpoints.
5. **Verificação no admin**
   - conferir card da empresa com status de readiness e último erro.
6. **Tentativa no checkout**
   - com `pix_ready=false`, Pix deve aparecer desabilitado e submit deve bloquear seleção Pix;
   - com `pix_ready=true`, Pix deve permanecer disponível.

## 10. Próximos passos recomendados
- adicionar ação administrativa explícita “Revalidar readiness Pix” dedicada (botão atual de verificação já ajuda, mas pode ser mais explícito).
- futuramente, separar no admin status de conexão Asaas vs status operacional Pix em badges próprios.
- opcional: criar alerta proativo para empresas com `pix_ready=false` e vendas públicas ativas.

---

## Checklist final obrigatório
- [x] implementou consulta de chaves Pix da conta
- [x] implementou tentativa automática de criação de chave EVP
- [x] garantiu idempotência
- [x] respeitou multiempresa
- [x] respeitou produção vs sandbox
- [x] expôs status de readiness Pix no admin
- [x] evitou que o cliente final descubra isso só no fim do checkout
- [x] registrou logs suficientes
- [x] gerou o arquivo Markdown no padrão solicitado
