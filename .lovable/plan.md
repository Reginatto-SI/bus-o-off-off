# Plano: Padronização de Imagem/Banner e Melhoria Visual da Tela /admin/eventos

## Status: ✅ CONCLUÍDO

---

## Alterações Implementadas

### 1. Orientação de Imagem (aba Geral)
- ✅ Atualizado texto de orientação para "Imagem do Evento (600 × 400)"
- ✅ Alterado de formato vertical (4:5) para horizontal (3:2)
- ✅ Área de upload com aspect-ratio 3:2 fixo

### 2. Preview da Imagem
- ✅ Preview usa proporção 3:2 fixa (aspect-[3/2])
- ✅ object-cover para manter proporção correta

### 3. Cards da Listagem (/admin/eventos)
- ✅ Imagem/placeholder adicionado no topo dos cards
- ✅ Placeholder visual para eventos sem imagem (gradiente + inicial)
- ✅ Todos os cards têm altura uniforme de imagem

### 4. Contagem de Transportes (Frotas)
- ✅ Query atualizada para retornar vehicle_id nas trips
- ✅ Função getFleetCount criada (conta veículos únicos)
- ✅ Interface EventWithTrips atualizada
- ✅ Exibição alterada de "X viagem(ns)" para "X transporte(s)"
- ✅ Ida+volta do mesmo veículo conta como 1 transporte

### 5. Remoção de Código Obsoleto
- ✅ Função getTripCount removida (não mais usada)

---

## Critérios de Sucesso ✅

1. ✅ Upload de imagem orienta para 600x400 (3:2)
2. ✅ Preview mostra imagem em proporção 3:2 correta
3. ✅ Cards na listagem exibem imagem no topo
4. ✅ Eventos sem imagem usam placeholder visual padronizado
5. ✅ Todos os cards têm altura uniforme
6. ✅ Contador mostra "X transporte(s)" baseado em veículos únicos
7. ✅ Ida+volta do mesmo veículo conta como 1 transporte
8. ✅ Layout funciona bem em grid

---

## Arquivos Modificados

- `src/pages/admin/Events.tsx`
