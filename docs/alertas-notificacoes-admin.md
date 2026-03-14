# Sistema de Alertas/Notificações Administrativas (MVP)

## Objetivo
Implementar uma primeira versão funcional e segura de alertas administrativos no sino do header do admin, substituindo o mock local por dados persistentes e multiempresa.

## Escopo do MVP
### Entrou no MVP
- Persistência de notificações administrativas em tabela dedicada `admin_notifications`.
- Badge de não lidas no sino com leitura real por empresa ativa.
- Dropdown com:
  - título, mensagem, severidade visual e tempo relativo;
  - ação de navegação quando houver `action_link`;
  - ação de marcar individual como lida;
  - ação de marcar todas como lidas.
- Gatilhos automáticos para:
  - `event_created` (evento criado);
  - `sale_confirmed` (venda mudou para `pago`);
  - `capacity_warning` (>=85% de lotação);
  - `capacity_full` (>=100% de lotação);
  - `event_starting_soon` (evento inicia em até 6h, gerado por RPC em polling do header);
  - `payment_failed` com base segura em `sales.platform_fee_status = 'failed'`.

### Fora do MVP
- Centro de notificações separado.
- Realtime dedicado por canal customizado.
- Alertas financeiros adicionais fora da base de status já persistida no schema.

## Diagnóstico inicial
- O sino já existia em `src/components/layout/AdminHeader.tsx`, mas usando `mockNotifications` em estado local, sem persistência.
- O dropdown visual já estava pronto e foi reaproveitado (Popover + Button + badge).
- O projeto já possuía:
  - contexto de empresa ativa em `AuthContext`;
  - RLS por `company_id` via `user_belongs_to_company`;
  - status de venda confiável (`sales.status`) e campos de pagamento/taxa (`platform_fee_status`).
- Não havia tabela de notificações administrativas no schema atual.

## Modelagem adotada
Foi criada a tabela `public.admin_notifications` com foco em MVP:

- `id` (UUID)
- `company_id` (FK companies)
- `type` (`event_created`, `sale_confirmed`, `capacity_warning`, `capacity_full`, `event_starting_soon`, `payment_failed`)
- `severity` (`info`, `success`, `warning`, `critical`)
- `title`, `message`
- `action_link`
- `related_entity_type`, `related_entity_id`
- `dedupe_key` (deduplicação)
- `is_read`, `read_at`
- `created_at`, `updated_at`

### Índices e deduplicação
- Índice por empresa + data (`company_id, created_at desc`) para o dropdown.
- Índice por empresa + não lidas (`company_id, is_read`) para badge.
- Índice único parcial `(company_id, type, dedupe_key)` quando `dedupe_key` não é nulo para evitar repetição.

## Tipos de alerta
- `event_created`: novo evento criado.
- `sale_confirmed`: venda promovida para `pago`.
- `capacity_warning`: viagem em 85%+.
- `capacity_full`: viagem em 100%.
- `event_starting_soon`: evento inicia em breve (até 6h no MVP).
- `payment_failed`: falha confiável de pagamento de taxa/plataforma (`platform_fee_status = failed`).

## Severidades
- `info`: evento informativo (ex.: criação de evento).
- `success`: confirmação positiva (ex.: venda confirmada).
- `warning`: atenção operacional (capacidade alta / evento próximo).
- `critical`: ação prioritária (capacidade lotada / falha de pagamento).

No UI do dropdown, cada severidade recebe ícone e cor discreta seguindo o padrão do admin.

## Gatilhos implementados
### 1) Novo evento criado
Trigger `AFTER INSERT` em `events`.

### 2) Venda confirmada
Trigger `AFTER UPDATE` em `sales`, quando `NEW.status = 'pago'` e `OLD.status <> 'pago'`.

### 3) Capacidade alta
Trigger `AFTER INSERT` em `tickets`, calculando ocupação por `trip_id` com base em `trips.capacity` e contagem real de tickets.
Dispara ao atingir `>= 85%`.

### 4) Capacidade lotada
Mesmo trigger de capacidade, disparando em `>= 100%` com severidade `critical`.

### 5) Evento iniciando em breve
RPC `generate_event_starting_soon_notifications(company_id, window_hours=6)`.
No frontend, o hook chama a RPC no carregamento/polling do header para gerar somente quando necessário.

### 6) Falha de pagamento
Implementado usando base confiável já existente:
- transição `sales.platform_fee_status` para `failed`.

## Regra de deduplicação
- Infraestrutura: `dedupe_key` + índice único parcial por `(company_id, type, dedupe_key)`.
- Estratégias usadas:
  - evento criado: dedupe por `event_id`;
  - venda confirmada: dedupe por `sale_id`;
  - falha pagamento: dedupe por `sale_id:platform_fee_failed`;
  - capacidade alta: dedupe por `trip_id:capacity_warning`;
  - capacidade lotada: dedupe por `trip_id:capacity_full`;
  - evento iniciando: dedupe por `event_id:starting_soon`.

Isso evita spam em thresholds recorrentes.

## Regras de visibilidade
- A tabela usa RLS com filtro por `user_belongs_to_company(auth.uid(), company_id)`.
- Leitura: usuários autenticados somente da empresa correta.
- Marcação como lida: apenas perfis administrativos (`is_admin`) da empresa correta.
- No frontend, o sino funcional está habilitado para `gerente`, `operador` e `developer` no admin.

## Comportamento do sino
- Exibe badge com quantidade de não lidas.
- Recarrega notificações em polling simples (`60s`) para estabilidade de MVP.
- Também força geração “just in time” de alertas de evento próximo via RPC antes da busca.

## Comportamento do dropdown
- Ordenação: mais recentes primeiro.
- Cada item exibe:
  - ícone de severidade,
  - título,
  - mensagem,
  - tempo relativo,
  - link de ação quando disponível.
- Clique no item marca individualmente como lida.
- Botão no topo marca todas como lidas.

## Limitações atuais
- Sem realtime websocket dedicado (MVP usa polling).
- Sem preferências por usuário (silenciar tipos, etc.).
- `payment_failed` cobre a base confiável de falha da taxa/plataforma; outras origens de falha podem ser adicionadas depois com regra validada.

## Próximos passos recomendados
- Migrar de polling para realtime seletivo da tabela.
- Adicionar filtros no dropdown (não lidas, por severidade, por tipo).
- Adicionar expiração/limpeza de notificações antigas.
- Criar jobs/scheduler para geração periódica server-side de `event_starting_soon`.

## Checklist de validação
### Técnico
- [ ] Migration aplicada sem erro.
- [ ] RLS ativa e policies válidas.
- [ ] Triggers criadas para events/sales/tickets.
- [ ] RPC `generate_event_starting_soon_notifications` disponível.

### Funcional
- [ ] Criar evento gera `event_created` no sino da empresa.
- [ ] Marcar venda como paga gera `sale_confirmed`.
- [ ] Inserção de tickets até 85% gera `capacity_warning` uma única vez por viagem.
- [ ] Inserção de tickets até 100% gera `capacity_full` uma única vez por viagem.
- [ ] Evento dentro da janela de 6h gera `event_starting_soon` sem duplicar.
- [ ] `platform_fee_status -> failed` gera `payment_failed`.
- [ ] Badge reflete número de não lidas.
- [ ] Marcar item como lida funciona.
- [ ] Marcar todas como lidas funciona.
- [ ] Não há vazamento entre empresas no dropdown.
- [ ] Dropdown não quebra o layout do header admin.
