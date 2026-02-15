

# Adicionar campo "Data do Embarque" no modal de Embarques (Events.tsx)

## Problema

A migration adicionou a coluna `departure_date` na tabela `event_boarding_locations`, mas o modal "Editar/Adicionar Local de Embarque" na pagina principal de eventos (`src/pages/admin/Events.tsx`) nao foi atualizado. O campo de data nao aparece no formulario.

## Alteracoes

### Arquivo: `src/pages/admin/Events.tsx`

1. **Adicionar `departure_date` ao estado `boardingForm`** (linha 210)
   - Incluir `departure_date: ''` no objeto inicial

2. **Adicionar campo no modal** (entre "Horario de Embarque" e "Ordem da Parada", ~linha 2957)
   - Novo campo "Data do Embarque" com `input type="date"`
   - Default: data do evento sendo editado (`editingEvent?.date`)

3. **Propagar no `handleEditBoarding`** (~linha 1030)
   - Carregar `boarding.departure_date ?? ''` ao abrir para edicao

4. **Propagar no `handleSaveBoarding`** (~linhas 1072 e 1096)
   - Incluir `departure_date: boardingForm.departure_date || null` nos objetos de insert e update

5. **Resetar nos pontos de limpeza** (~linhas 1042, 1091, 1113)
   - Incluir `departure_date: ''` nos resets do formulario

6. **Exibir data na listagem de embarques** (onde mostra "Horario: XX:XX")
   - Adicionar a data formatada antes do horario, ex: "15/02 as 20:00"

### Nenhuma alteracao de banco necessaria

A coluna `departure_date` ja existe na tabela `event_boarding_locations`.
