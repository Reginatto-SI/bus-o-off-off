# Diagnóstico técnico — Cancelamento, reembolso e taxa da plataforma (Smartbus BR)

## 1. Resumo executivo

- O sistema **já possui cancelamento de venda** em múltiplos pontos (admin e automações por expiração/falha de pagamento), com atualização de status para `cancelado`, motivo e data.
- O sistema **não possui fluxo de refund ativo** (não há edge function dedicada para solicitar estorno ao gateway; não há tabela/campos de controle de refund_amount/refund_status/refund_id).
- Existe base técnica forte para comissão/taxa da plataforma (split Asaas, campos financeiros, status da taxa), porém **não existe hoje regra explícita e persistida** afirmando que a taxa da plataforma é não reembolsável em caso de cancelamento.
- Há aceites relevantes:
  - aceite do organizador sobre cobrança da taxa da plataforma no evento;
  - aceite do passageiro sobre intermediação/responsabilidade no checkout.
  Mesmo assim, o texto atual **não cobre de forma direta** a regra comercial específica de “empresa pode reembolsar passageiro sem devolução da taxa da plataforma”.

## 2. O que já existe hoje

### 2.1 Cancelamento de venda/passagem

- Cancelamento manual no admin (`/admin/vendas`) com:
  - modal de confirmação;
  - motivo obrigatório;
  - gravação de `status='cancelado'`, `cancel_reason`, `cancelled_at`, `cancelled_by`;
  - remoção de tickets e log em `sale_logs`.
- Cancelamento automático por seat lock expirado (`cleanup-expired-locks`), para vendas pendentes.
- Cancelamento por webhook de pagamento (Asaas e Stripe) em eventos de falha/expiração/deleção/refund do pagamento.
- Bloqueio operacional de uso da passagem cancelada em validação de QR (retorno `sale_cancelled`).

### 2.2 Estrutura financeira da venda

- Há campos financeiros na venda:
  - `gross_amount`
  - `platform_fee_total`
  - `partner_fee_amount`
  - `platform_net_amount`
  - além de `platform_fee_amount`, `platform_fee_status`, `platform_fee_payment_id`, `platform_fee_paid_at` para controle da taxa.
- Há configuração por empresa para `platform_fee_percent` e `partner_split_percent`.
- Há split no Asaas na criação da cobrança online:
  - plataforma recebe percentual da taxa;
  - sócio recebe percentual configurado (quando aplicável);
  - empresa recebe o restante automaticamente.

### 2.3 Aceites e textos existentes

- No cadastro/edição de evento (aba Passagens) existe checkbox obrigatório de aceite da taxa da plataforma, com persistência em:
  - `events.platform_fee_terms_accepted`
  - `events.platform_fee_terms_accepted_at`
- Publicação do evento é bloqueada sem esse aceite.
- No checkout público existe aceite obrigatório do passageiro sobre intermediação/responsabilidade, persistido em:
  - `sales.intermediation_responsibility_accepted`
  - `sales.intermediation_responsibility_accepted_at`
- Existe página pública de política de intermediação, com textos sobre responsabilidade da organizadora por cancelamentos/reembolsos.

## 3. O que não existe hoje

- Não foi encontrado fluxo de **reembolso ativo** (solicitação de estorno) no Asaas/Stripe a partir do sistema.
- Não foi encontrada entidade/tabela para rastrear refund (ex.: `refunds`, `refund_amount`, `refunded_at`, `refund_reason`, `refund_status`, `gateway_refund_id`).
- Não foi encontrado texto explícito no aceite da empresa dizendo:
  - que em caso de cancelamento/reembolso ao passageiro,
  - a taxa da plataforma não é devolvida à empresa.
- Não foi encontrado versionamento jurídico do aceite (ex.: versão de termo, hash do texto aceito, IP/origem do aceite, usuário que aceitou).

## 4. Evidências localizadas

### 4.1 Banco de dados e tipos

- `sales` nasceu com status e dados básicos; depois recebeu colunas de cancelamento (`cancel_reason`, `cancelled_at`, `cancelled_by`) e `sale_logs`.
- Eventos ganharam campos de aceite de taxa (`platform_fee_terms_accepted`, `platform_fee_terms_accepted_at`) e repasse de taxa ao cliente (`pass_platform_fee_to_customer`).
- Vendas ganharam campos de aceite de intermediação (`intermediation_responsibility_accepted`, `intermediation_responsibility_accepted_at`).
- Tipos Supabase incluem `platform_fee_status` e campos financeiros na tabela `sales`.

### 4.2 Fluxo admin de cancelamento

- Em `src/pages/admin/Sales.tsx`, `handleCancelSale`:
  - impede cancelar se houver passageiro embarcado;
  - atualiza status e metadados de cancelamento;
  - remove tickets;
  - grava log.
- Modal reforça ação irreversível de cancelamento e exige motivo.

### 4.3 Fluxo webhook/pagamento

- `supabase/functions/asaas-webhook/index.ts`:
  - trata `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` para pagamento;
  - trata `PAYMENT_OVERDUE`/`PAYMENT_DELETED`/`PAYMENT_REFUNDED` cancelando venda e liberando assentos;
  - não executa chamada de refund para gateway (apenas reage a evento recebido).
- `supabase/functions/cleanup-expired-locks/index.ts` cancela automaticamente vendas pendentes quando lock expira.
- `supabase/functions/verify-payment-status/index.ts` sincroniza status de pagamento, mas não cria reembolso.

### 4.4 Fluxo de taxa/comissão

- `supabase/functions/create-asaas-payment/index.ts` cria cobrança com split dinâmico (empresa/plataforma/sócio).
- `src/pages/admin/Company.tsx` exibe comissão total retida na venda online.
- `src/components/admin/NewSaleModal.tsx` define taxa da plataforma em vendas manuais e `platform_fee_status` para controlar transição até `pago`.

### 4.5 Textos jurídicos/comerciais

- `src/pages/admin/Events.tsx` possui modal “Termos da Taxa da Plataforma” e checkbox de aceite obrigatório para publicar.
- `src/lib/intermediationPolicy.ts` + `src/pages/public/IntermediationPolicy.tsx` deixam claro que cancelamentos/reembolsos são responsabilidade da organizadora.
- Não há texto explícito sobre **não devolução da taxa da plataforma para a empresa** em caso de cancelamento/reembolso.

## 5. Diagnóstico de risco

### 5.1 Risco jurídico/comercial

- Há risco de interpretação ambígua: o sistema informa responsabilidade da organizadora por cancelamentos/reembolsos, mas não explicita a cláusula comercial de retenção da taxa da plataforma em caso de reembolso ao passageiro.
- O aceite atual da empresa cobre “cobrança da taxa”, porém não descreve claramente cenário de cancelamento pós-venda e retenção da taxa.

### 5.2 Risco operacional/financeiro

- Ausência de fluxo formal de refund no sistema pode gerar processo manual externo e baixa rastreabilidade.
- Falta de campos dedicados para refund dificulta auditoria e conciliação futura (quem recebeu, quanto, quando, por qual motivo e em qual gateway).

### 5.3 Risco de experiência

- Na ação de cancelamento no admin, não há aviso explícito sobre impacto financeiro da taxa da plataforma.
- Isso pode induzir usuário interno a concluir que “cancelar” automaticamente resolve toda a parte financeira para todos os envolvidos.

## 6. Viabilidade de implementação futura

Classificação: **média (médio esforço, sem grande refatoração estrutural)**.

Motivos:
- A base já tem:
  - status e metadados de cancelamento;
  - campos financeiros da venda;
  - status da taxa da plataforma;
  - aceites persistidos (evento e checkout);
  - integrações Asaas com webhook e split.
- O que falta é principalmente:
  - camada explícita de política comercial (texto + aceite robusto);
  - rastreio específico de refund;
  - regra operacional clara no fluxo de cancelamento.

## 7. Melhor ponto do sistema para informar isso à empresa

Recomendação principal (mais forte):
1. **Criação/Edição do evento (aba Passagens / antes de publicar)**:
   - já existe aceite obrigatório + bloqueio de publicação;
   - é o ponto com maior força contratual-operacional.

Reforços recomendados:
2. **Modal de confirmação de cancelamento em /admin/vendas**:
   - aviso explícito do efeito financeiro (reembolso ao passageiro não implica devolução da taxa da plataforma à empresa).
3. **Página de termos institucional da plataforma (empresa)**:
   - centralização jurídica com versionamento do termo.

## 8. Recomendações de próximo passo

### Caminho mais seguro e enxuto (ordem)

1. **Texto + aceite + persistência melhorada** (prioridade alta)
   - Ajustar termo existente do evento com cláusula explícita de não devolução da taxa da plataforma em cancelamentos/reembolsos.
   - Persistir metadados mais fortes de aceite (quem aceitou, versão do termo).

2. **Texto + aceite + regra operacional no cancelamento**
   - Incluir confirmação explícita no modal de cancelamento de venda no admin.

3. **Texto + aceite + política por evento (opcional, se negócio exigir flexibilidade)**
   - Definir política por evento sem expor regras internas sigilosas.

4. **Camada técnica de refund (fase posterior)**
   - Se houver objetivo de refund automatizado pelo sistema: adicionar trilha de refund e reconciliação.

## 9. Dúvidas ou ambiguidades encontradas

1. O evento `PAYMENT_REFUNDED` no webhook é tratado como cancelamento de venda, mas não ficou claro se o estorno é sempre iniciado fora da plataforma (painel Asaas/manual).
2. Não ficou evidente no código se existe algum processo operacional externo (não versionado no repositório) para devolver valores ao passageiro em todos os cenários.
3. O texto de termos da taxa no evento usa taxa exemplificada (7,5%), mas a configuração da empresa pode variar; isso pode gerar discrepância de comunicação.
4. Em `src/types/database.ts`, alguns campos novos de `sales` (ex.: `platform_fee_status`) não aparecem tipados como no `src/integrations/supabase/types.ts`, sugerindo possível defasagem entre tipos internos.

## Respostas objetivas às 10 perguntas obrigatórias

1. **Hoje já existe cancelamento de venda ou passagem no sistema?**
   - Sim. Existe cancelamento manual no admin e cancelamentos automáticos por expiração/falha de pagamento.

2. **Hoje já existe reembolso real integrado ou apenas cancelamento interno?**
   - Pelo código analisado, há cancelamento interno e reação a eventos de pagamento (incluindo `PAYMENT_REFUNDED`), mas não fluxo ativo de solicitação de refund.

3. **Hoje já existe alguma regra técnica ou textual dizendo que a taxa da plataforma não é devolvida?**
   - Não foi encontrada regra explícita com essa redação.

4. **Hoje já existe algum aceite da empresa organizadora sobre isso?**
   - Existe aceite sobre cobrança da taxa da plataforma, mas não especificamente sobre não devolução em cancelamento/reembolso.

5. **Se existe, onde está e quão forte/visível ele é?**
   - Aceite de taxa no evento é visível e obrigatório para publicar; porém a cláusula específica solicitada não está explícita.

6. **Se não existe, qual é a lacuna exata?**
   - Falta cláusula textual inequívoca + persistência jurídica mais robusta + reforço operacional no ponto de cancelamento.

7. **A estrutura atual de banco e código já suporta implementar essa regra sem grande refatoração?**
   - Sim, com esforço médio e sem grande refatoração.

8. **Em quais pontos do sistema seria mais correto deixar isso explícito para a empresa usuária?**
   - Principalmente na criação/publicação do evento (aceite obrigatório), com reforço no cancelamento em vendas/admin e termos institucionais.

9. **Existe risco de o sistema hoje induzir a empresa a achar que a taxa da plataforma seria devolvida?**
   - Sim, por ausência de texto explícito no ponto de cancelamento e no aceite atual da taxa.

10. **Qual seria o melhor caminho de implementação futura?**
   - **Texto + aceite + persistência de aceite + regra operacional/bloqueio no cancelamento** (mais seguro).
