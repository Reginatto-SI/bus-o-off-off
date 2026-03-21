# Análise técnica — tela `/admin/diagnostico-vendas`

## Objetivo
Documentar, sem alterar a regra atual do sistema, por que a tela de diagnóstico de vendas hoje não é suficientemente confiável para tomada de decisão operacional, quais são as causas técnicas encontradas no código e qual é a correção mínima recomendada para um plano posterior.

## Resumo executivo

### Situação atual
A tela `/admin/diagnostico-vendas` é abastecida principalmente pela tabela `sales`, enriquecida no front com `events`, `companies`, contagem de `tickets`, leitura de `seat_locks` e trilhas de `sale_logs` / `sale_integration_logs`.

### Conclusão principal
O problema central **não é um único bug visual**. A inconsistência nasce de três pontos combinados:

1. A tela é **diagnóstica/read-only** e não reconcilia nem corrige o estado real da venda.
2. A classificação operacional da UI trata qualquer venda pendente acima de 15 minutos como `Problema`, mas **não explica causa, impacto e ação**.
3. O fluxo real de expiração automática **existe no backend**, porém depende de job agendado (`pg_cron` + `cleanup-expired-locks`) e a tela não diferencia claramente:
   - venda pendente ainda dentro da janela;
   - venda pendente já expirada, mas ainda não processada pelo cleanup;
   - venda manual sem lock esperado;
   - divergência real entre `sales.status` e Asaas.

## 1. Onde a tela busca os dados

### Rota e tela
- Rota: `/admin/diagnostico-vendas`
- Componente: `src/pages/admin/SalesDiagnostic.tsx`

### Origem primária
A listagem parte de `sales` com `select('*')`, além de joins com:
- `events(name, date)`
- `companies(name)`

Depois a tela busca separadamente:
- `tickets` para contar passagens geradas por `sale_id`
- `seat_locks` para inferir lock ativo/expirado/ausente
- `sale_logs` para linha do tempo funcional
- `sale_integration_logs` para webhook, payloads e status técnico do gateway

### Campos efetivamente usados na tela
A implementação utiliza, entre outros:
- `sales.status`
- `sales.created_at`
- `sales.updated_at`
- `sales.cancelled_at`
- `sales.cancel_reason`
- `sales.asaas_payment_id`
- `sales.asaas_payment_status`
- `sales.payment_environment`
- `sales.stripe_checkout_session_id`
- `sales.stripe_payment_intent_id`
- `sales.quantity`
- `sales.gross_amount`
- `sales.unit_price`
- `seat_locks.expires_at`
- `seat_locks.sale_id`

### Observação importante
A tela **não usa um campo dedicado `payment_status` em `sales`**. Na prática, ela deriva o “status de pagamento” usando:
- `sales.status`
- `sales.asaas_payment_status`
- presença de `asaas_payment_id` / Stripe IDs

Isso explica parte da confusão semântica entre “status da venda” e “status do pagamento”.

## 2. Regra de expiração dos 15 minutos

### O que existe hoje
No checkout público, o sistema:
1. cria `seat_locks` com `expires_at = now + 15 min`;
2. cria a venda com `status = pendente_pagamento`;
3. vincula os locks à venda;
4. só depois dispara `create-asaas-payment`.

### Onde a expiração automática deveria acontecer
A rotina de limpeza/cancelamento está implementada em:
- `supabase/functions/cleanup-expired-locks/index.ts`

Essa função:
- busca `seat_locks` expirados;
- identifica vendas candidatas sem lock ativo remanescente;
- atualiza `sales.status = cancelado` **somente** quando a venda ainda está em `pendente_pagamento`;
- registra log operacional;
- remove `sale_passengers`;
- remove os `seat_locks` expirados.

### Existe job automático?
**Sim, no repositório atual existe evidência de agendamento.**
A migration `supabase/migrations/20261016090000_schedule_cleanup_expired_locks.sql` agenda o job `cleanup-expired-locks-every-1-minute` usando `pg_cron` + `net.http_post`.

### Ponto crítico
A regra automática **não cancela vendas `reservado`**; cancela apenas `pendente_pagamento`.
Isso é coerente com o checkout online, mas cria uma zona cinzenta para vendas manuais ou fluxos que usem `reservado` sem cobrança concluída.

### Implicação para a tela
A UI atual marca `reservado` e `pendente_pagamento` como “pendentes” na mesma lógica operacional, mas o cleanup automático não trata os dois estados da mesma forma. Isso gera leitura ambígua e pode explicar casos de “Reservado + aguardando pagamento + 10.000 min”.

## 3. Integração com Asaas

### Campos de integração encontrados
Na tabela `sales` existem:
- `asaas_payment_id`
- `asaas_payment_status`
- `payment_environment`

### Como sincroniza hoje
A sincronização ocorre por dois caminhos:
1. **Webhook**: `supabase/functions/asaas-webhook/index.ts`
2. **Verificação sob demanda**: `supabase/functions/verify-payment-status/index.ts`

### Comportamento do webhook
Quando o Asaas envia eventos de falha/cancelamento, o webhook pode:
- atualizar `asaas_payment_status`;
- cancelar a venda se ela ainda estiver em `pendente_pagamento` ou `reservado`;
- limpar `tickets`, `seat_locks` e `sale_passengers`.

Quando o pagamento é confirmado, a finalização centralizada (`_shared/payment-finalization.ts`) promove a venda para `pago`, gera passagens e limpa os locks.

### O que a tela faz hoje
A tela apenas **compara** `sales.status` com `sales.asaas_payment_status` e marca “Divergência gateway” quando:
- a venda ainda está pendente, mas o Asaas já consta como `RECEIVED` ou `CONFIRMED`;
- a venda está cancelada, mas o Asaas consta como pago.

### Limitação atual
A tela **não consulta o Asaas em tempo real**. Ela depende da persistência prévia do webhook/verify. Logo, ela é um painel de evidência local, não uma fonte direta de reconciliação online.

## 4. Conceito de “lock”

### Existe sistema de lock?
**Sim.** O lock de assento existe na tabela `seat_locks` e foi criado para reserva temporária durante o checkout.

### Onde é criado
No checkout público, antes da venda e antes da cobrança.

### Tempo do lock
- 15 minutos a partir da criação.

### Como a tela atual interpreta o lock
A tela calcula:
- `hasActiveLock`
- `hasExpiredLock`
- `hasMissingLock`
- `hasPartialLock`

A partir disso mostra:
- `✔️ Lock ativo`
- `❌ Lock expirado`
- `⚠️ Lock ausente`

### Problema real de UX
O termo “lock” está tecnicamente correto, mas é ruim para operação. O suporte/admin precisa ver algo como:
- “Assento bloqueado temporariamente”
- “Bloqueio expirado”
- “Venda sem bloqueio temporário”

### Problema real de regra
Nem toda venda deveria necessariamente ter lock visível naquele momento:
- venda manual pode não nascer do mesmo fluxo do checkout;
- venda paga já pode ter tido lock removido corretamente;
- venda antiga cancelada também não deveria depender do lock.

Portanto, a coluna atual expõe uma heurística técnica como se fosse regra universal.

## 5. Cálculo de tempo

### Como a tela calcula hoje
O cálculo é inteiramente client-side com `Date.now()`:
- `createdAgoLabel = now - created_at`
- `expirationLabel = 15 - elapsedMinutes`

### O que isso significa
A UI mostra textos como:
- `Criado há X min`
- `Expira em X min`
- `Expirado há X min`

### Problemas encontrados
1. **Não há teto/contexto**: uma venda com dias de idade vira milhares de minutos, o que polui a leitura.
2. **A UI assume que toda pendência vence em 15 minutos pela data de criação**, mas o backend usa o estado real dos `seat_locks.expires_at` para liberar o assento.
3. O texto de expiração mistura duas referências:
   - tempo desde `created_at`
   - estado real do lock mais recente (`latest_lock_expires_at`)

Hoje a tela usa `created_at` para a frase de expiração, embora o lock real tenha seu próprio `expires_at`. Isso pode produzir mensagens corretas por aproximação, mas não necessariamente fiéis ao dado operacional real.

## 6. Causa raiz mais provável para os casos reportados

### Sintoma reportado
- `Reservado`
- `Aguardando pagamento`
- `Problema`
- `Lock ausente`
- `Criado há 9.000+ min`
- `Expirado há 9.000+ min`

### Causa raiz provável
O cenário mais provável é uma combinação destes fatores:

1. **Venda manual ou venda fora do fluxo padrão de checkout**, ficando em `reservado` sem lock ativo e sem cancelamento automático.
2. A tela trata `reservado` igual a `pendente_pagamento` na classificação operacional.
3. O cancelamento automático do cleanup foi escrito para `pendente_pagamento`, não para qualquer `reservado`.
4. O cálculo de tempo usa `created_at` e exibe o valor bruto em minutos, sem interpretação humana.
5. O badge `Problema` não traduz a causa específica.

### Resultado
A tela acusa “problema”, mas sem diferenciar se é:
- bug de expiração real;
- venda manual antiga aguardando baixa/cancelamento;
- venda inconsistente sem lock;
- divergência com gateway;
- legado operacional.

## 7. Inconsistências encontradas

1. **Semântica misturada entre status da venda e status do pagamento**.
2. **Classificação operacional genérica demais** (`Problema`, `Atenção`, `Saudável`) sem causa explícita.
3. **Coluna lock técnica demais** para usuário administrativo.
4. **Tempo em minutos sem normalização** para vendas antigas.
5. **Regra operacional da UI usa `created_at`, mas a verdade da reserva está em `seat_locks.expires_at`**.
6. **`reservado` entra como pendente crítico na UI, mas não recebe o mesmo tratamento automático do cleanup**.
7. **A tela diagnostica divergência com Asaas, mas não garante reconciliação online**.
8. **Tela é somente leitura**, então ela evidencia o problema, mas não impede que dados velhos permaneçam enganando o operador.

## 8. Correção mínima proposta para fase de implementação

> Esta seção é propositalmente de proposta. Não é para executar agora sem alinhamento.

### 8.1 Tornar o diagnóstico explicativo
Substituir o badge genérico por estrutura com:
- situação resumida;
- causa do problema;
- impacto operacional;
- ação recomendada.

Exemplos:
- `Venda expirada não cancelada automaticamente`
- `Venda manual reservada sem pagamento confirmado`
- `Pagamento confirmado no gateway, mas venda não conciliada`
- `Bloqueio temporário expirado sem limpeza visível`

### 8.2 Separar causa operacional em coluna própria
Adicionar uma coluna textual “Causa do problema” baseada em regras mutuamente exclusivas, por exemplo:
- Expiração não processada
- Divergência com gateway
- Venda sem bloqueio temporário
- Cobrança expirada no gateway
- Aguardando pagamento dentro do prazo

### 8.3 Trocar heurística de expiração da UI
Para pendências com lock, a referência principal deveria ser:
- `seat_locks.latest_lock_expires_at`

E não apenas `created_at`.

### 8.4 Tratar `reservado` com regra própria
Antes de qualquer mudança automática, validar a regra de negócio real:
- `reservado` também deve expirar automaticamente após 15 min?
- ou é um status manual que exige ação humana?

Sem essa decisão, cancelar `reservado` automaticamente pode quebrar fluxo manual legítimo.

### 8.5 Traduzir ou remover a coluna lock
Se a coluna continuar, traduzir para linguagem operacional. Se não ajudar decisão, remover.

## 9. Riscos da correção futura

1. **Cancelar `reservado` automaticamente sem alinhamento de negócio** pode apagar vendas manuais legítimas.
2. **Forçar reconciliação em tela** pode aumentar custo e lentidão se cada linha consultar o gateway.
3. **Mudar semântica de status** sem revisar relatórios pode gerar divergência histórica.

## 10. Checklist de validação para próxima etapa

- [ ] Confirmar se `reservado` deve ou não expirar automaticamente.
- [ ] Validar em banco exemplos reais de vendas antigas em `reservado`.
- [ ] Verificar se o job `cleanup-expired-locks-every-1-minute` está ativo no ambiente produtivo e não apenas na migration.
- [ ] Confirmar se os casos reportados são manuais, checkout online ou legado.
- [ ] Revisar se `latest_lock_expires_at` está presente para todas as vendas online pendentes.
- [ ] Garantir que a UI diferencie claramente banco x gateway x bloqueio temporário.
- [ ] Não publicar diagnóstico operacional sem causa, impacto e ação.

## 11. Diagnóstico final

### Sintoma
A tela `/admin/diagnostico-vendas` mostra linhas com status, tempo e badges que sugerem falha operacional, mas sem explicar a causa específica nem refletir com precisão todas as regras do backend.

### Onde ocorre
- Rota/tela: `/admin/diagnostico-vendas`
- Componente: `src/pages/admin/SalesDiagnostic.tsx`

### Evidência
A própria implementação da tela:
- calcula expiração usando `created_at`;
- agrupa `reservado` e `pendente_pagamento` como pendência operacional;
- deriva lock por heurística de `seat_locks`;
- usa badge genérico `Problema`;
- não faz reconciliação ativa com Asaas.

### Causa provável
A tela foi construída como painel técnico de triagem, mas está sendo interpretada como fonte operacional definitiva. Ela mostra sinais úteis, porém ainda não traduz esses sinais em diagnóstico acionável e mistura regras que não são idênticas entre checkout online, venda manual, expiração automática e sincronização com o gateway.

## 12. Recomendação prática

Se a tela for usada para decisão operacional, a prioridade deve ser:
1. esclarecer a regra de `reservado`;
2. tornar a causa explícita por linha;
3. basear expiração no dado mais fiel (`expires_at` do lock quando existir);
4. separar claramente “inconsistência visual” de “inconsistência real de negócio”.

Sem isso, a tela continua útil como investigação técnica, mas **não confiável como painel decisório**.
