

# Refinamento do Módulo de Embarque — Plano de Implementação

## Análise do estado atual vs solicitado

| Item | Status | O que falta |
|------|--------|-------------|
| KPI "Faltam" → "Pendentes" | ❌ | Renomear em DriverHome e DriverBoarding |
| Barra de progresso na Home | ❌ | Adicionar linha "Embarque: X / Total" + Progress |
| "Próximo embarque" card na Home | ❌ | Buscar primeiro local de embarque com horário |
| Resumo por local (cards) no Boarding | ❌ | Cards compactos acima da lista |
| Busca rápida de passageiro | ❌ | Input que filtra por nome/assento/CPF |
| Botão "Atualizar" no Boarding | ❌ | RefreshCw no header |
| Auto-refresh a cada 15s | ❌ | `setInterval` + `fetchData` |
| Dialog com local do passageiro | ❌ | Adicionar `boardingLocationName` ao dialog |
| Badge "Pendente" (não "Aguardando") | ❌ | Renomear |
| Link "Ver embarque" após QR scan | ❌ | Botão no overlay do DriverValidate |
| KPIs e filtro por local já existem | ✅ | — |
| Check-in manual com dialog já existe | ✅ | — |
| Toast de feedback já existe | ✅ | — |
| Flash/torch já existe | ✅ | — |
| Moldura de scan já existe | ✅ | — |

## Arquivos a modificar

| Arquivo | Mudanças |
|---------|----------|
| `src/pages/driver/DriverHome.tsx` | Renomear "Faltam"→"Pendentes", progress bar, card "Próximo embarque" |
| `src/pages/driver/DriverBoarding.tsx` | Renomear "Faltam"→"Pendentes", busca rápida, cards resumo por local, botão atualizar, auto-refresh 15s, dialog com local |
| `src/pages/driver/DriverValidate.tsx` | Botão "Ver embarque" no overlay de sucesso |

## 1. DriverHome — Enriquecimento do painel

- Renomear KPI `Faltam` → `Pendentes`
- Após os KPIs, adicionar linha: `Embarque: {boarded} / {total}` + componente `<Progress value={percent} />`
- Buscar dados do próximo local de embarque: query `event_boarding_locations` join `boarding_locations` para o `tripId` ativo, ordenado por `departure_time ASC`, pegar o primeiro com passageiros pendentes
- Card compacto: nome do local + horário + "X passageiros / Y pendentes"
- Dados do local vêm na mesma `fetchActiveTrip` (adicionar sub-query)

## 2. DriverBoarding — Padrão operacional

### Header
- Adicionar botão `RefreshCw` ao lado do título "Embarque" que chama `fetchData()`

### Auto-refresh
- `useEffect` com `setInterval(fetchData, 15000)` quando a tela está aberta, cleanup no return

### Busca rápida
- `Input` com placeholder "Buscar passageiro..." abaixo dos KPIs
- Filtra `filteredPassengers` por `passengerName`, `seatLabel` (case-insensitive, includes)
- Funciona em conjunto com filtro de local

### Resumo por local (cards compactos)
- Acima da lista, mapear `locations` em mini-cards:
  - Nome do local
  - Total / Embarcados / Pendentes (calculados dos `passengers`)
- Sem accordion (mantém simples)

### Renomear
- "Faltam" → "Pendentes" nos KPIs
- "Aguardando" → "Pendente" na badge

### Dialog enriquecido
- Adicionar `boardingLocationName` ao texto de confirmação

## 3. DriverValidate — Link pós-scan

- No overlay de sucesso, adicionar botão secundário "Ver embarque" que navega para `/motorista/embarque`
- Manter "Ler próximo" como ação principal

