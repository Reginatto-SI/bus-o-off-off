# Validação final — taxa zero em empresa piloto e split Asaas

## 1. Diagnóstico final

**Recomendação:** aprovado com ressalva operacional.

A revisão confirmou que a correção da venda manual não ficou limitada à exibição do botão `Gerar taxa`: a criação da venda manual, o menu de ações, o badge de pendência, a tentativa de checkout da taxa e a transição para `pago` já usam a configuração da empresa (`companies.platform_fee_percent`) para tratar taxa zero como isenção válida.

Durante a validação do fluxo principal Asaas, foi encontrado um bug real: `create-asaas-payment` lia `platform_fee_percent`, mas continuava usando o motor progressivo por passageiro para montar o split mesmo quando a empresa estava configurada com `platform_fee_percent = 0`. Isso poderia gerar `split` indevido para plataforma/sócio/representante em cobranças online ou em qualquer cobrança principal criada pelo Asaas.

Foi aplicada correção mínima para que:

- empresa com `platform_fee_percent <= 0` continue criando a cobrança principal normalmente;
- a taxa progressiva efetiva da cobrança principal seja zerada antes da montagem do split;
- o payload enviado ao Asaas nasça com `split: []` quando não há taxa configurada;
- a tela pública de checkout não inclua linha de taxa progressiva repassada ao cliente quando a empresa é isenta, mantendo o snapshot local coerente com a validação do backend.

## 2. Arquivos revisados

### Backend / Edge Functions

- `supabase/functions/create-asaas-payment/index.ts`
  - Validação da configuração `platform_fee_percent` da empresa.
  - Cálculo do motor progressivo por passageiro.
  - Geração de percentuais de split.
  - Payload final enviado ao Asaas.
  - Snapshot financeiro gravado em `sales`.
- `supabase/functions/_shared/split-recipients-resolver.ts`
  - Inclusão condicional do recebedor da plataforma.
  - Consulta de sócio apenas quando existe percentual solicitado.
  - Resolução fail-open de representante/sócio.
- `supabase/functions/create-platform-fee-checkout/index.ts`
  - Normalização segura de taxa manual pendente/falha para empresas com taxa zero.
  - Aplicação do piso mínimo de R$ 5,00 apenas para empresas com taxa configurada maior que zero.

### Frontend administrativo

- `src/components/admin/NewSaleModal.tsx`
  - Cálculo da taxa manual por snapshots de passageiros.
  - Geração de `platform_fee_status` na venda manual.
  - Prévia de taxa no modal.
- `src/pages/admin/Sales.tsx`
  - Menu de ações.
  - Badge `Taxa pendente` / `Taxa falhou`.
  - Bloqueio frontend de `Marcar como Pago`.
  - Normalização de registro legado ao marcar como pago em empresa isenta.

### Frontend público

- `src/pages/public/Checkout.tsx`
  - Resumo visual do checkout.
  - Snapshot financeiro da venda antes de chamar `create-asaas-payment`.
  - Correção adicionada para não repassar taxa progressiva quando a empresa tem `platform_fee_percent = 0`.

### Utilitários de taxa

- `src/lib/platformFeeCheckout.ts`
  - Tratamento do retorno `waived` da Edge Function de taxa manual.
- `src/lib/feeCalculator.ts`
  - Motor progressivo oficial por passageiro usado por frontend.

### Banco / regras persistidas

- `supabase/migrations/20260313180000_fix_reserved_fee_transition_rule.sql`
- `supabase/migrations/20260314115028_e9799097-639e-4e16-b59d-c51094fa6771.sql`
  - Trigger `enforce_platform_fee_before_paid`, que permite transição para `pago` quando `platform_fee_status = 'not_applicable'`.

## 3. Confirmação — `create-asaas-payment` respeita taxa zero

**Status após ajuste: conforme.**

O fluxo principal agora diferencia explicitamente:

- `platform_fee_percent > 0`: mantém o motor progressivo por passageiro, calcula distribuição e envia split quando aplicável;
- `platform_fee_percent = 0`, `null`, vazio ou inválido não positivo: cria a cobrança principal pelo Asaas com taxa efetiva zero e sem comissão/split da plataforma.

Resultado técnico esperado quando `platform_fee_percent = 0`:

- `platformFeeEngine.totalFee = 0`;
- `feeTotalPercent = 0`;
- `platformWalletId = null`;
- `resolveAsaasSplitRecipients` recebe percentuais de distribuição zerados;
- `splitResolution.recipients = []`;
- `paymentPayload.split = []`;
- snapshots `split_snapshot_*` ficam zerados para taxa/plataforma/sócio/representante;
- a cobrança principal não é bloqueada por comissão zerada.

## 4. Confirmação — `split-recipients-resolver` respeita taxa zero

**Status: conforme.**

O resolvedor central já estava correto para percentuais zerados, desde que o chamador passe zero de fato:

- não tenta resolver wallet da plataforma quando `effectivePlatformPercent <= 0`;
- não consulta `socios_split` quando `requestedSocioPercent <= 0`;
- se houver representante na venda, a resolução pode consultar o representante, mas com `representativePercent = 0` ele é considerado não elegível por percentual inválido e não gera recebedor;
- não existe regra de piso mínimo de R$ 5,00 nesse resolvedor;
- ausência de recebedor interno não bloqueia a venda quando não há percentual a distribuir.

O bug estava no chamador `create-asaas-payment`, que passava percentual progressivo mesmo para empresa isenta. Esse ponto foi corrigido.

## 5. Resultado esperado para a empresa 7 FEST

Configuração informada:

- `platform_fee_percent = 0`;
- `socio_split_percent = 0`.

Resultado esperado após esta validação:

- venda manual em `/admin/vendas` nasce com `platform_fee_amount = 0` e `platform_fee_status = 'not_applicable'`;
- menu de ações não exibe `Gerar taxa`, `Consultar taxa`, `Ver taxa paga` ou `Reprocessar taxa`;
- badge `Taxa pendente` não aparece;
- `Marcar como Pago` fica disponível para venda `reservado`, sem bloqueio por taxa pendente;
- se existir venda legada com `platform_fee_status = 'pending'` ou `failed`, a tentativa de gerar taxa pela Edge Function normaliza para `not_applicable` e valor zero sem criar cobrança;
- no fluxo principal Asaas, a cobrança da passagem é criada normalmente, mas sem split para plataforma, sócio ou representante;
- se o evento estiver marcado para repassar taxa ao cliente, o checkout público não adiciona a linha de taxa progressiva para essa empresa isenta.

## 6. Resultado esperado para empresa com taxa maior que zero

**Status: preservado.**

Para empresas com `platform_fee_percent > 0`:

- a venda manual continua calculando taxa pelo motor progressivo por passageiro;
- a taxa mínima de R$ 5,00 continua ativa para venda manual;
- o botão `Gerar taxa` continua aparecendo quando `platform_fee_status = 'pending'` e não há cobrança vinculada;
- `Consultar taxa`, `Ver taxa paga` e `Reprocessar taxa` continuam condicionados aos status existentes;
- `Marcar como Pago` continua bloqueado até `platform_fee_status = 'paid'` ou `not_applicable`;
- o fluxo `create-platform-fee-checkout` continua criando/reutilizando cobrança da taxa manual;
- o split da cobrança principal Asaas continua usando o motor progressivo e a distribuição atual entre plataforma, sócio e representante quando houver taxa efetiva.

## 7. Riscos residuais

1. **Vendas legadas já criadas no checkout público antes desta correção:** se uma venda de empresa isenta nasceu com taxa progressiva embutida no `gross_amount`, a nova validação do backend pode apontar divergência de snapshot ao tentar criar cobrança. Não foi feito saneamento em massa por restrição do escopo.
2. **Bloco de detalhes da venda em `/admin/vendas`:** o bloco técnico de detalhes ainda pode exibir campos legados de `platform_fee_status` quando o registro antigo não foi normalizado. Isso não gera cobrança nem bloqueia o menu principal, mas pode causar ruído visual até a normalização por ação operacional.
3. **Dependência de configuração correta em `/admin/empresa`:** a isenção depende de `platform_fee_percent` estar persistido como `0`/não positivo. Valor positivo mantém a cobrança e o piso mínimo.
4. **Sem validação real contra Asaas nesta auditoria:** a revisão foi estática e por checks locais; não houve criação de cobrança real no gateway.

## 8. Divergência entre `platform_fee_percent` e motor progressivo

Existe uma divergência conceitual documentada no código atual:

- `/admin/empresa` exibe `platform_fee_percent` como configuração comercial/habilitadora da taxa;
- o cálculo operacional da taxa de vendas usa motor progressivo por passageiro (faixas de 6%, 5%, 4% e 3%, com teto de R$ 25 por passageiro);
- na venda manual, o valor de `platform_fee_percent` não define o percentual da cobrança, mas define se a empresa é isenta (`<= 0`) ou participante da regra progressiva (`> 0`).

Pela recorrência de comentários no código e documentos anteriores de PRD 07, isso parece ser regra oficial do projeto: `platform_fee_percent` funciona como chave de habilitação/isenção e o motor progressivo é a fonte operacional do valor. Ainda assim, o nome do campo pode induzir operadores a esperar uma taxa fixa exatamente igual ao percentual exibido em `/admin/empresa`.

**Risco de produto:** recomenda-se uma decisão futura para renomear/explicar o campo na UI, por exemplo “Taxa da plataforma habilitada (%) / parâmetro comercial”, ou criar texto de ajuda deixando claro que o cálculo operacional segue a tabela progressiva.

## 9. Recomendação final

**Aprovado com ressalva.**

A correção está aprovada para empresas piloto/isentas porque agora cobre tanto a venda manual quanto o fluxo principal de pagamento Asaas. A ressalva é manter atenção a vendas legadas já criadas antes da correção e à comunicação de produto sobre a diferença entre o campo `platform_fee_percent` e o motor progressivo por passageiro.
