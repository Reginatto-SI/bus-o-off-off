

# Correção: Divergência no Mapa de Assentos (Double Deck)

## Diagnóstico (comprovado via banco)

O veículo AJY-7E61 tem **81 seats** no banco, quando deveria ter **64** (60 vendáveis + 4 bloqueados do template).

**Floor 1 (Piso inferior):**
- Template espera: 12 executivo + 4 bloqueados = 16
- Banco tem: 12 executivo + 1 "X" bloqueado + **3 _tmp_ + 17 _legacy_** = 33

**Floor 2 (Piso superior):**
- Template espera: 36 convencional + 12 leito = 48
- Banco tem: 48 (correto agora, mas screenshots do user foram antes do último sync)

### Causa raiz

O `syncSeatsFromSnapshot` acumula lixo a cada re-sync:

1. **_legacy_ seats mantêm coordenadas originais** — na re-sync seguinte, são matched por coordenada e "atualizados" em vez de deletados, mas como o label já virou `_legacy_xxx`, o update tenta mudar o label de volta, cria conflito, e gera MAIS _tmp_ seats.

2. **_tmp_ seats nunca são limpos** — são criados na FASE 5 para evitar conflito de label, mas ficam para sempre.

3. **Cada re-sync piora o problema** — acumula mais _legacy_ e _tmp_, fazendo o público mostrar dezenas de assentos bloqueados falsos.

### Impacto no público

O Checkout carrega `select('*').eq('vehicle_id', vehicleId)` — traz TODOS os 81 seats, incluindo 21 lixos. O SeatMap renderiza todos como bloqueados (ícone Ban), poluindo o mapa do piso inferior.

## Correção

### 1. `syncSeatsFromSnapshot` (Fleet.tsx) — Limpar junk ANTES de tudo

Adicionar **FASE 0** no início da função: deletar todos os seats com label `_legacy_%` ou `_tmp_%` que **não têm tickets vinculados**. Para os que têm tickets, manter como estão (já são _legacy_).

Isso garante que cada re-sync parte de um estado limpo, sem acumular lixo.

```text
FASE 0 (NOVA): DELETE FROM seats WHERE vehicle_id=X AND (label LIKE '_legacy_%' OR label LIKE '_tmp_%') AND id NOT IN (SELECT seat_id FROM tickets WHERE seat_id IS NOT NULL)
```

O resto das fases permanece igual (órfãos, update, insert).

### 2. Checkout (SeatMap) — Filtrar seats técnicos

No Checkout.tsx, ao setar seats, filtrar labels técnicos antes de passar ao SeatMap:

```ts
const validSeats = existingSeats.filter(s => !s.label.startsWith('_legacy_') && !s.label.startsWith('_tmp_'));
setSeats(validSeats as Seat[]);
```

Isso é uma proteção defensiva — se o sync falhar parcialmente, o público não mostra lixo.

### 3. Validação pós-sync

Na FASE 7 existente (validação), adicionar check: se ainda existem seats com `_tmp_` ou `_legacy_` para coordenadas do template, reportar erro. Isso detecta sync incompleto.

## Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `src/pages/admin/Fleet.tsx` | FASE 0 na `syncSeatsFromSnapshot` |
| `src/pages/public/Checkout.tsx` | Filtrar `_legacy_`/`_tmp_` ao setar seats |

## Resultado esperado

Após re-sync:
- Floor 1: exatamente 16 seats (12 executivo + 4 bloqueados)
- Floor 2: exatamente 48 seats (36 convencional + 12 leito)
- Público: mapa limpo sem ícones Ban falsos

