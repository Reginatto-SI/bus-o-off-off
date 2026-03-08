

## Plano: Desfazer operação do passageiro no app do motorista

### Abordagem

Adicionar uma nova action `undo` na RPC `validate_ticket_scan` que reverte o status do passageiro para o estado anterior da fase. No frontend, quando o passageiro já está "done" na fase ativa, o toque abre um dialog de "Desfazer" em vez do dialog de confirmação normal.

### 1. Migração SQL — nova action `undo`

Adicionar bloco na RPC `validate_ticket_scan` para `p_action = 'undo_checkin' | 'undo_checkout' | 'undo_reboard'`:

| Action | Status atual esperado | Novo status |
|---|---|---|
| `undo_checkin` | `checked_in` | `pendente` |
| `undo_checkout` | `checked_out` | `checked_in` |
| `undo_reboard` | `reboarded` | `checked_out` |

Se o status não bater, retorna `blocked` com reason code adequado (ex: `undo_not_applicable`). A validação continua registrando em `ticket_validations` para auditoria.

### 2. driverPhaseConfig.ts — adicionar config de undo por fase

Adicionar ao `PhaseConfig`:
- `undoAction`: `'undo_checkin' | 'undo_checkout' | 'undo_reboard'`
- `undoTitle`: ex "Desfazer embarque"
- `undoConfirmText`: ex "Deseja desfazer o embarque de"
- `undoSuccessTitle`: ex "EMBARQUE DESFEITO"

### 3. DriverBoarding.tsx — permitir desfazer ao tocar em passageiro "done"

Hoje, passageiros "done" não são clicáveis. Mudanças:
- Passageiros "done" passam a ser clicáveis (cursor-pointer)
- Ao tocar em done → abre dialog de **desfazer** (novo state `undoPassenger`)
- Dialog usa textos do `phaseConfig` (undoTitle, undoConfirmText)
- Ao confirmar, chama RPC com a `undoAction` da fase
- Atualiza estado local com o novo `boarding_status` retornado
- KPIs e badges atualizam automaticamente (já reativo via useMemo)

### 4. REASON_MESSAGES — nova mensagem

Adicionar `undo_not_applicable` → "Operação não pode ser desfeita nesta fase".

### Arquivos alterados

- **Migração SQL** — adicionar undo_checkin/undo_checkout/undo_reboard na RPC
- **src/lib/driverPhaseConfig.ts** — undo config por fase
- **src/pages/driver/DriverBoarding.tsx** — click em done abre dialog de undo

### Sem quebra de funcionalidade existente

O fluxo normal (checkin/checkout/reboard) continua idêntico. Apenas passageiros já marcados ganham a opção de desfazer.

