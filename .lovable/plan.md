

## Plano: Fases operacionais da viagem (Ida / Desembarque / Reembarque)

### Estado atual

- `boarding_status` suporta: `pendente`, `checked_in`, `checked_out`
- RPC `validate_ticket_scan` aceita actions: `checkin` (pendente→checked_in) e `checkout` (checked_in→checked_out)
- Falta o status `reboarded` e a action `reboard` (checked_out→reboarded)
- `transport_policy` no evento: `ida_obrigatoria_volta_opcional`, `ida_volta_obrigatorio`, `trecho_independente`
- Nenhuma tela tem conceito de "fase operacional"

### Mapeamento fase → action → status

```text
Fase           Action    Transição
─────────────  ────────  ─────────────────────
Ida            checkin   pendente → checked_in
Desembarque    checkout  checked_in → checked_out
Reembarque     reboard   checked_out → reboarded
```

### Alteracoes

#### 1. Migracao SQL — novo status `reboarded` + action `reboard`

Atualizar a RPC `validate_ticket_scan` para aceitar `reboard` como action:
- Se action = `reboard` e status atual = `checked_out` → sucesso, status = `reboarded`
- Se ja `reboarded` → `already_reboarded`
- Se nao `checked_out` → `reboard_without_checkout`

Adicionar reason messages correspondentes.

#### 2. driverTripStorage.ts — persistir fase operacional

Adicionar `getPersistedPhase` / `setPersistedPhase` com chave `driverPhase_{userId}_{companyId}`.
Tipo: `'ida' | 'desembarque' | 'reembarque'`.

#### 3. DriverHome.tsx — seletor de fase

- Buscar `transport_policy` do evento junto com as trips (ja tem o join com events)
- Abaixo do card do evento, exibir segmented control com as fases aplicaveis:
  - `somente_ida` / `ida_obrigatoria_volta_opcional` com policy "somente ida" → apenas "Ida"
  - Demais → "Ida", "Desembarque", "Reembarque"
- Fase salva no localStorage e restaurada ao recarregar
- KPIs e labels do card mudam conforme a fase:
  - Ida: Embarcados / Pendentes da ida (checked_in count vs pendente)
  - Desembarque: Desembarcados / Dentro do veiculo (checked_out vs checked_in)
  - Reembarque: Reembarcados / Faltando voltar (reboarded vs checked_out)
- Botao "Ver embarque" renomeado para "Lista de passageiros"
- Toast discreto ao trocar fase

#### 4. DriverValidate.tsx — scanner respeita a fase

- Ler fase do localStorage antes de escanear
- Mapear fase → action: ida→checkin, desembarque→checkout, reembarque→reboard
- Alterar overlay de resultado:
  - Ida: "EMBARQUE LIBERADO"
  - Desembarque: "DESEMBARQUE CONFIRMADO"
  - Reembarque: "REEMBARQUE LIBERADO"
- Manual token tambem usa a action da fase ativa
- Exibir badge da fase ativa no topo da tela do scanner

#### 5. DriverBoarding.tsx — lista sensivel a fase

- Ler fase do localStorage
- KPIs mudam labels conforme fase (mesma logica do Home)
- Badge de status do passageiro muda:
  - Ida: "Embarcado" (checked_in) / "Pendente" (pendente)
  - Desembarque: "Desembarcou" (checked_out) / "No veiculo" (checked_in)
  - Reembarque: "Reembarcou" (reboarded) / "Faltando" (checked_out)
- Click no passageiro executa a action da fase ativa (nao so checkin)
- Dialog de confirmacao com texto coerente com a fase

#### 6. REASON_MESSAGES — novas mensagens

Adicionar ao mapa:
- `already_reboarded` → "Ja reembarcado"
- `reboard_without_checkout` → "Reembarque sem desembarque"

### Arquivos alterados

- **Migracao SQL** — atualizar RPC validate_ticket_scan (adicionar reboard)
- **src/lib/driverTripStorage.ts** — adicionar get/setPersistedPhase
- **src/pages/driver/DriverHome.tsx** — seletor de fase, KPIs por fase, transport_policy
- **src/pages/driver/DriverValidate.tsx** — action por fase, overlay por fase
- **src/pages/driver/DriverBoarding.tsx** — KPIs, badges e actions por fase

### Sem quebra de funcionalidade existente

O fluxo atual (checkin/checkout) continua funcionando. A fase "Ida" e o comportamento default. Eventos somente-ida nao mostram fases extras.

