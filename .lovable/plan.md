

## Plano: Seletor de evento para o motorista com persistência

### Situação atual

Hoje as 3 telas do motorista (`DriverHome`, `DriverValidate`, `DriverBoarding`) buscam automaticamente a **primeira viagem ativa** (prioriza trips atribuídas ao driver, senão pega qualquer uma da empresa). Não existe seleção manual nem memória.

Se houver 2+ eventos `a_venda` ao mesmo tempo, o motorista fica preso no primeiro da lista.

### Solução

**Criar um seletor de evento na DriverHome** + **persistir a escolha no localStorage** + **compartilhar a trip selecionada entre as 3 telas**.

### Detalhes

#### 1. DriverHome — Seletor de evento

- Buscar **todas** as trips ativas da empresa (não apenas `limit(1)`), agrupadas por evento
- Se houver **1 evento**: exibir como hoje (sem seletor)
- Se houver **2+ eventos**: exibir um `Select` dropdown acima do card do evento ativo, com nome + data de cada evento
- Ao trocar, atualizar KPIs e card de próximo embarque
- Persistir o `tripId` selecionado em `localStorage` com chave `driverActiveTrip_{userId}_{companyId}`
- Ao carregar a página, verificar se existe tripId salvo e se ele ainda é válido (evento ainda `a_venda`)

#### 2. DriverValidate e DriverBoarding — Ler trip do localStorage

- Antes de buscar a trip, verificar se existe `driverActiveTrip_{userId}_{companyId}` no localStorage
- Se existir e for válido, usar diretamente (evita a query de busca de trip)
- Se não existir, manter fallback atual (busca automática)
- Isso garante que o scanner e a lista de embarque sempre apontem para o mesmo evento selecionado na Home

#### 3. Fluxo do motorista

```text
1. Motorista abre /motorista
2. Sistema carrega todos os eventos ativos
3. Se 2+ eventos → mostra dropdown "Selecione o evento"
4. Motorista escolhe → KPIs atualizam, localStorage salva
5. Motorista vai pro scanner → usa o tripId salvo
6. Motorista vê embarque → mesma trip
7. Fecha e reabre app → volta no mesmo evento
```

### Arquivos alterados

- `src/pages/driver/DriverHome.tsx` — buscar todas trips, seletor, persistência
- `src/pages/driver/DriverValidate.tsx` — ler tripId do localStorage antes de buscar
- `src/pages/driver/DriverBoarding.tsx` — ler tripId do localStorage antes de buscar

### Sem alterações no banco de dados

