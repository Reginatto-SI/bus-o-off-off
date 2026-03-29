# Diagnóstico — role de apoio no fluxo `/motorista/validar`

**Data/hora (UTC):** 2026-03-29 12:04  
**Escopo:** análise objetiva do fluxo de leitura/validação QR para usuário de apoio ao motorista.

## Resumo executivo

- **Causa raiz principal identificada:** o fluxo do scanner tinha **tratamento silencioso de erro** na etapa de leitura (`BarcodeDetector.detect`), sem aviso ao operador quando a leitura falhava repetidamente ou quando havia câmera ativa sem reconhecimento por tempo relevante. Isso explica o comportamento “mudo” observado.  
- **Sobre a role nova:** no código atual, o “apoio/auxiliar” foi implementado como **`operational_role='auxiliar_embarque'`**, mantendo a **role técnica `motorista`** em `user_roles.role`. Portanto, a autorização de tela e de validação não depende de criar uma nova role técnica no enum `user_role`; depende de manter role `motorista` e vínculo correto por `company_id` (e opcionalmente `driver_id` para auditoria/escopo de viagens).  
- **RLS/RPC:** não foi encontrada regra de RLS barrando especificamente auxiliar de embarque. A RPC `validate_ticket_scan` valida por pertencimento à empresa (`user_belongs_to_company`) e registra auditoria com `driver_id` quando existir, sem exigir role textual `motorista` no fluxo da validação.  
- **Correção mínima aplicada:** adição de feedback operacional explícito no scanner para evitar silêncio (erros repetidos de leitura, timeout sem reconhecimento e ausência de suporte de leitura automática), além de mensagens mais humanas por `reason_code`.

## Fluxo atual encontrado (mapa)

1. **Acesso ao portal motorista**: guard no front baseado em `userRole` (`motorista`, `operador`, `gerente`, `developer`).  
2. **Tela de validação QR** (`/motorista/validar`): inicializa câmera + `BarcodeDetector`, loop de detecção e chamada da RPC `validate_ticket_scan`.  
3. **RPC de validação** (`validate_ticket_scan`): resolve ticket por token, aplica bloqueios de negócio/multiempresa e grava `ticket_validations`.  
4. **Feedback visual**: overlay de sucesso/bloqueio quando há payload da RPC; antes da correção, falhas no detector podiam não gerar nenhum feedback.

## Causa raiz

### 1) Falha silenciosa no callback de leitura (confirmada)
No loop de scan, exceções do `detector.detect(...)` eram capturadas com `catch` vazio, sem mensagem ao usuário. Quando isso ocorria repetidamente em campo, a UX ficava “muda” mesmo com câmera ativa.  

### 2) Role de apoio é operacional, não role técnica nova (confirmada)
O projeto define apoio como `operational_role='auxiliar_embarque'` em `user_roles`/`drivers`, mantendo permissões no RBAC pela role técnica `motorista`. Assim, o esperado é comportamento equivalente ao motorista no app de embarque.

## Evidências técnicas

- **Role operacional (apoio) mapeada como campo complementar**:
  - `user_roles.operational_role` com check `('motorista','auxiliar_embarque')`.  
  - Comentário explícito: não substitui role técnica.  
- **Tela `/motorista/validar`**:
  - Fluxo de validação via RPC `validate_ticket_scan`.  
  - Antes da correção: `catch` silencioso no loop de leitura.  
- **RLS/RPC**:
  - RPC valida multiempresa por `user_belongs_to_company` e não por string de role “auxiliar/motorista”.

## Arquivos analisados

- `src/pages/driver/DriverValidate.tsx`
- `src/pages/driver/DriverHome.tsx`
- `src/pages/driver/DriverBoarding.tsx`
- `src/lib/driverPhaseConfig.ts`
- `src/types/database.ts`
- `src/contexts/AuthContext.tsx`
- `supabase/migrations/20260326090000_add_boarding_assistant_fields_to_drivers.sql`
- `supabase/migrations/20260327010000_add_user_roles_operational_role.sql`
- `supabase/migrations/20260308201847_1ed61242-a9a5-4058-be54-0c34c7c43216.sql`
- `supabase/migrations/20260403000000_add_driver_qr_validation_flow.sql`

## Impacto

- **Afeta principalmente operação mobile** quando há falha de reconhecimento/leitura do detector: usuário fica sem direção clara do que está acontecendo.  
- Pode afetar tanto motorista quanto auxiliar (não exclusivo da role de apoio), mas foi percebido no contexto do novo perfil.  
- Risco operacional: filas e reprocessos por ausência de feedback.

## Correção mínima proposta (aplicada)

1. **Feedback anti-silêncio no scanner**:
   - Aviso após erros repetidos de processamento da leitura.
   - Aviso quando câmera fica ativa por tempo relevante sem reconhecer QR.
   - Aviso quando dispositivo não suporta leitura automática.
2. **Mensagens de `reason_code` mais claras e humanas** no overlay (QR inválido, outra empresa, comunicação, etc.).

## Riscos

- **Baixo risco**: mudança localizada na camada de feedback do front (`DriverValidate` + mensagens).  
- Não altera arquitetura, não cria fluxo paralelo, não mexe em RLS e preserva multiempresa por `company_id`.

## Checklist obrigatório da investigação

- [x] Nome exato da “nova role”: **não há role técnica nova no enum**; o novo perfil é `operational_role='auxiliar_embarque'` (role técnica permanece `motorista`).
- [x] Onde foi criada: migrations de `drivers.operational_role` e `user_roles.operational_role`.
- [x] Onde já está reconhecida: telas/admin e label operacional no portal do motorista.
- [x] Onde NÃO está reconhecida: como role técnica separada no RBAC (por design).
- [x] Diferença entre acesso à tela e permissão de validação: não há diferença por “auxiliar” no código analisado; validação é por empresa e regras de ticket.
- [x] Exigência de `driver_id`: usado para auditoria/escopo de viagens; validação via RPC não bloqueia por ausência de `driver_id`.
- [x] Câmera lê mas callback não dispara: hipótese coberta via falha silenciosa do detector/loop.
- [x] Callback dispara mas validação falha: retorna overlay com `reason_code` (não silencioso) quando RPC responde.
- [x] Falha no banco/RLS: sem evidência de bloqueio específico da role de apoio.
- [x] Erro silencioso: **confirmado** no scanner (antes da correção).
- [x] Operador sem feedback visual: **confirmado** em cenários de falha de leitura.
- [x] Menor correção segura: feedback explícito e mensagens objetivas, sem alterar RBAC/RLS.

## Validação final

Diagnóstico concluído com evidência de código e ajuste mínimo aplicado para remover silêncio operacional no scanner, mantendo padrão multiempresa e reutilizando fluxo existente do motorista.
