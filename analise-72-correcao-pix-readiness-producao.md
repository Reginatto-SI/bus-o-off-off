# Análise 72 — Correção Pix readiness em produção (sem impacto no cartão)

## Causa raiz resumida
A divergência ocorria porque o readiness Pix local podia ficar otimista demais:

1. o helper aceitava status de chave Pix de forma permissiva (quase tudo era tratado como operacional);
2. a cobrança real em `POST /payments` valida no Asaas em tempo real e pode reprovar Pix sem chave ativa;
3. o admin em estado conectado usava texto que podia sugerir prontidão de Pix acima do que estava validado.

## Arquivos alterados

1. `supabase/functions/_shared/asaas-pix-readiness.ts`
2. `supabase/functions/create-asaas-payment/index.ts`
3. `src/pages/admin/Company.tsx`

## O que foi mudado em cada arquivo

### 1) `supabase/functions/_shared/asaas-pix-readiness.ts`
- Endurecida a regra de prontidão Pix:
  - antes: status não-string/inesperado podia contar como operacional;
  - agora: **somente status `ACTIVE`** conta como chave apta.
- Status desconhecido/ausente passa a ser tratado como não pronto.
- Adicionado `console.warn` técnico quando houver status inesperado para auditoria.
- Comentário explícito no código: ajuste é pontual e somente para Pix, evitando falso positivo.

### 2) `supabase/functions/create-asaas-payment/index.ts`
- Adicionada observabilidade específica para Pix quando o Asaas retorna ausência de chave Pix na criação da cobrança:
  - log com `company_id`, `sale_id`, ambiente, `company_pix_ready` persistido e erro retornado pelo gateway.
- O log entra apenas quando `billingType === "PIX"` + assinatura de erro compatível com chave Pix indisponível.
- Nenhuma alteração de payload/fluxo de cartão.

### 3) `src/pages/admin/Company.tsx`
- Ajuste pontual de mensagem do card conectado:
  - remove sugestão ampla de “pronto via Pix e Cartão”
  - deixa explícito que Pix depende de chave ativa validada no ambiente operacional.
- Sem redesign, sem mudança de layout/componente.

## Por que isso não afeta cartão
- Nenhum arquivo de UI/validação de cartão foi alterado.
- Nenhuma condição de seleção de cartão foi alterada.
- Nenhum payload de cartão foi alterado.
- Nenhuma mensagem de cartão foi alterada.
- A mudança em `create-asaas-payment` é **guardada por `billingType === "PIX"`** apenas para log de observabilidade.
- O endurecimento de readiness foi aplicado no helper de **Pix address keys**, sem tocar regras de cartão.

## Checklist objetivo de validação

### Pix
- [ ] Conta sem chave Pix `ACTIVE` não pode ser tratada como Pix pronto.
- [ ] Status de chave desconhecido/ausente deve manter `pix_ready=false`.
- [ ] Mensagem do admin não deve sugerir prontidão de Pix sem chave ativa.
- [ ] Se Asaas retornar erro de chave Pix ausente no `POST /payments`, log deve registrar contexto mínimo (empresa, ambiente, readiness persistido e erro).
- [ ] Produção e sandbox seguem a mesma regra de status `ACTIVE`.

### Cartão
- [ ] Seleção de cartão continua igual.
- [ ] Criação de cobrança com cartão continua igual.
- [ ] Nenhuma mensagem de cartão foi alterada.
- [ ] Nenhuma validação de cartão foi alterada.
- [ ] Nenhum trecho compartilhado alterou comportamento do cartão.
- [ ] Nenhuma regressão visual/funcional foi introduzida no cartão.

## Riscos residuais
- Pode existir variação futura de status no Asaas; com a regra conservadora, status novos não mapeados ficarão como não prontos (falha segura), exigindo ajuste explícito posterior.
- Se a conta perder chave ativa após uma validação prévia, ainda pode haver janela de desatualização do campo persistido; o novo log de divergência em `create-asaas-payment` melhora auditoria nesses casos.
