# Step 1 — Validação da expiração automática de reservas pendentes

## 1. Objetivo
Garantir, de forma automática e auditável, que reservas criadas em vendas `pendente_pagamento` expirem corretamente após 15 minutos e liberem assentos sem intervenção manual.

## 2. Problema identificado antes da correção
- A função `cleanup-expired-locks` já existia, porém sem evidência confiável de agendamento automático real no repositório.
- Isso criava risco de assentos ficarem travados por locks expirados quando a rotina não fosse executada.

## 3. O que foi implementado
1. **Agendamento automático real** via migration SQL com `pg_cron` + `pg_net`, executando `cleanup-expired-locks` a cada 1 minuto.
2. **Blindagem da função de cleanup** para cancelar somente vendas pendentes sem lock ativo remanescente.
3. **Padronização da razão de cancelamento** para expiração operacional da reserva.
4. **Melhoria de rastreabilidade** no payload de resposta da função (`candidate_sales`, `cancellable_sales`) e comentários operacionais no código.

## 4. Como a expiração funciona agora
1. Checkout cria `seat_locks` com `expires_at = now + 15 min`.
2. Enquanto `expires_at > now`, o lock entra como ocupado no mapa público.
3. A cada 1 minuto, o cron chama `cleanup-expired-locks`.
4. A função:
   - localiza locks expirados;
   - identifica vendas candidatas;
   - cancela apenas vendas ainda `pendente_pagamento` e sem lock ativo restante;
   - remove `sale_passengers` dessas vendas canceladas;
   - remove locks expirados.
5. Com lock removido, o assento volta a aparecer como disponível no fluxo público.

## 5. Proteções aplicadas
- **Proteção de status:** update condicionado por `.eq("status", "pendente_pagamento")`.
- **Proteção de lock parcial:** a venda só entra para cancelamento se não houver lock ativo para ela.
- **Compatibilidade com webhook/verify:** pagamento confirmado atualiza para `pago` por fluxo existente; cleanup não cancela `pago`.
- **Idempotência do cron:** migration remove job anterior com o mesmo nome antes de reagendar.

## 6. Evidências técnicas
- `supabase/functions/cleanup-expired-locks/index.ts`
  - validação de locks ativos antes de cancelar venda;
  - motivo de cancelamento padronizado;
  - comentários operacionais e resposta com contadores de diagnóstico.
- `supabase/migrations/20261016090000_schedule_cleanup_expired_locks.sql`
  - agendamento real automático do cleanup (`*/1 * * * *`);
  - uso de `app.settings.supabase_url` com fallback determinístico para a URL do projeto;
  - remoção idempotente de job anterior.

## 7. Como validar manualmente
1. Abrir checkout público e iniciar compra sem concluir pagamento.
2. Confirmar no banco que a venda ficou `pendente_pagamento` e há `seat_locks` para o `sale_id`.
3. Aguardar 16–17 minutos.
4. Validar que:
   - venda mudou para `cancelado`;
   - `cancel_reason` contém mensagem de expiração automática;
   - `seat_locks` da venda foram removidos;
   - no mapa de assentos, a poltrona voltou a ficar disponível.
5. Cenário de controle:
   - concluir pagamento antes dos 15 minutos;
   - validar que a venda vai para `pago` e não é cancelada pelo cleanup.

## 8. Limitações ou pontos de atenção
- O agendamento passa a existir após aplicar a migration em cada ambiente (sandbox/produção).
- Se `app.settings.supabase_url` não existir no ambiente, a migration usa fallback para a URL do projeto e segue normalmente.

## 9. Conclusão
- **Step 1 concluído:** sim, no escopo operacional solicitado.
- **Seguro seguir para Step 2:** sim, após aplicar migration no ambiente alvo e validar o roteiro manual.
- **Pendência bloqueante:** somente não aplicar migration/deploy da função em ambiente real.
