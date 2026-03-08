

## Plano: Refatoração de nomenclatura "Viagem" → "Transporte"

### Arquivo: `src/pages/admin/Events.tsx`

Este é um refactoring puramente de interface. Nenhuma alteração de banco, lógica interna ou rotas.

---

### 1. Textos e labels — substituições diretas

| Local | Atual | Novo |
|-------|-------|------|
| Botões "Adicionar Viagem" (linhas 2988, 3011) | Adicionar Viagem | Adicionar Transporte |
| Título do modal (linha 4288) | Adicionar/Editar Viagem | Adicionar/Editar Transporte |
| Label radio (linha 4294) | Tipo da Viagem * | Tipo de Transporte * |
| Radio "Ida" (linha 4302) | Ida | Somente Ida |
| Radio "Volta" (linha 4306) | Volta | Somente Volta |
| Header da seção (linha 2979) | Viagens do Evento | Transportes do Evento |
| Empty state (linhas 3000-3001) | Nenhuma viagem cadastrada / Adicione viagens | Nenhum transporte cadastrado / Adicione transportes |
| Empty embarques (linhas 3107-3108) | Adicione viagens primeiro / vinculado a uma viagem | Adicione transportes primeiro / vinculado a um transporte |
| Label embarques (linha 3114) | Viagem Selecionada | Selecionar transporte |
| Dropdown "Todas as viagens" (linha 3123) | Todas as viagens | Todos os transportes |
| Placeholder embarques (linha 3120) | Selecione uma viagem | Selecione um transporte |
| Label modal embarque (linha 4466) | Vincular a Viagem * | Vincular ao transporte * |
| Placeholder modal embarque (linha 4473) | Selecione uma viagem * | Selecione um transporte * |
| Toasts (linhas 1557, 1623, 1631, 1692, 1694) | Viagem atualizada/adicionada/excluída/Erro ao salvar viagem | Transporte atualizado/adicionado/excluído/Erro ao salvar transporte |
| Texto ajuda "Ida e Volta" (linha 4315) | duas viagens vinculadas | dois trajetos vinculados (ida e volta) |
| Texto embarques agrupados (linha 3168) | Embarques da viagem selecionada | Embarques do transporte selecionado |
| Texto delete block (linhas 1655, 1672) | Esta viagem possui... | Este transporte possui... |
| Texto destino (linha 2857) | destino final da viagem | destino final do transporte |

---

### 2. Agrupamento de cards na aba Frotas (linhas 3016-3082)

**Hoje:** `sortedEventTrips.map()` renderiza um card por trip (2 cards para Ida+Volta).

**Novo:** Agrupar trips pareadas em um único card.

Lógica:
- Filtrar apenas trips de ida (ou trips sem par)
- Para cada ida, buscar a volta pareada
- Renderizar um único card com badge "Ida e Volta" (se pareado), "Somente Ida" ou "Somente Volta"
- Mostrar: veículo, capacidade, motorista, ajudante
- Manter botões de editar/excluir (operam na trip de ida; a volta é manipulada automaticamente pela lógica existente)

---

### 3. Dropdown no modal de embarque (linhas 4476-4480)

**Hoje:** Lista todas as trips individualmente com `getTripLabelWithoutTime` (mostra "Ida • Ônibus..." e "Volta • Ônibus..." separados).

**Novo:** Quando `isGroupedTransportPolicy`, usar `groupedBoardingTripOptions` (já existe e agrupa Ida+Volta). Quando não é agrupado, manter trips individuais mas com label "Somente Ida" / "Somente Volta".

Atualizar `getTripLabelWithoutTime` para usar os novos termos.

---

### 4. Atualizar `getTripLabelWithoutTime` (linha 1413)

De: `${type} • ${vehicleType} ${plate} • ${capacity} lug. • Motorista: ${driver}`

Para: manter o formato mas trocar "Ida"/"Volta" por "Somente Ida"/"Somente Volta" quando não é agrupado, ou apenas mostrar o veículo sem prefixo de direção quando é transporte agrupado.

---

### Resumo

- ~30 substituições de texto em um único arquivo
- 1 refatoração estrutural: agrupar cards de trips pareadas em um único card na aba Frotas
- 1 ajuste no dropdown do modal de embarque para usar opções agrupadas
- Nenhuma alteração de banco, API ou lógica de negócio

