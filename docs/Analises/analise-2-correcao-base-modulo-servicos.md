# Análise 2 — Correção mínima da base do módulo Passeios & Serviços

## 1) Diagnóstico do problema corrigido

### Sintoma
- A auditoria inicial identificou que o componente da aba de serviços (`EventServicesTab`) existia no código, porém não aparecia na tela real de detalhe do evento.
- Também faltava integridade referencial explícita em `event_services` para `events` e `services`.

### Onde ocorria
- `src/pages/admin/EventDetail.tsx`: tabs renderizadas sem a aba `Serviços`.
- `supabase/migrations/*`: tabela `event_services` sem FKs explícitas para `events(id)` e `services(id)`.

### Evidência objetiva
- O `EventDetail` tinha somente as tabs `Viagens`, `Locais de Embarque` e `Vendas`.
- O componente `EventServicesTab` existia, mas sem import/render no `EventDetail`.
- A migration inicial de serviços criava `event_services` sem constraints FK para `event_id` e `service_id`.

### Causa provável
- Implementação parcial da fase inicial: componente pronto, mas sem conexão no fluxo principal de evento.
- Modelagem inicial privilegiou RLS e checks, sem concluir integridade referencial explícita.

---

## 2) Arquivos alterados

1. `src/pages/admin/EventDetail.tsx`
2. `supabase/migrations/20260426033000_add_event_services_foreign_keys.sql`
3. `src/pages/admin/Services.tsx`
4. `src/components/admin/EventServicesTab.tsx`

---

## 3) O que foi corrigido

### 3.1 Aba “Serviços” conectada no fluxo real do evento
- Importado `EventServicesTab` em `EventDetail`.
- Adicionado `TabsTrigger` com valor `services` seguindo o mesmo padrão das tabs existentes.
- Adicionado `TabsContent` com valor `services`, renderizando `EventServicesTab` com `eventId` e `companyId` do evento atual.

### 3.2 Integridade referencial explícita em `event_services`
- Nova migration adiciona, de forma idempotente (`IF NOT EXISTS`), as constraints:
  - `event_services_event_id_fkey` → `event_services.event_id` referencia `events(id)`.
  - `event_services_service_id_fkey` → `event_services.service_id` referencia `services(id)`.

### 3.3 Documentação de nomenclatura (PRD x técnico)
- Registrado em comentários de código:
  - PRD `tipo_controle` ↔ técnico `control_type`.
  - PRD `ativo/inativo` ↔ técnico `status` (em `services`) e `is_active` (em `event_services`).

---

## 4) O que continua fora de escopo (não implementado)

Mantido fora de escopo por regra da tarefa:
- venda de serviços;
- `/vendas/servicos`;
- checkout com serviços;
- QR Code e validação/consumo;
- relatórios de serviços;
- repasse/split;
- logística adicional (guias/horários/fornecedores/veículos específicos).

---

## 5) Checklist final de validação

- [x] Não criei entidade nova “agencia”.
- [x] Reutilizei `company/company_id` existente.
- [x] Não criei nova arquitetura.
- [x] Mantive `AdminLayout` e padrão visual atual.
- [x] Conectei a aba **Serviços** no `EventDetail` com o componente existente.
- [x] Mantive `EventServicesTab` com comportamento multiempresa já existente.
- [x] Adicionei FKs explícitas em `event_services` para `events` e `services`.
- [x] Documentei mapeamento de nomenclatura PRD ↔ técnico.
- [x] Não implementei venda/checkout/QR/validação.

