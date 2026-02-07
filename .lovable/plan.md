# Plano: Ajustes de UX, Consistência e Regras de Negócio na Tela de Evento

## ✅ IMPLEMENTADO

Todos os ajustes foram implementados com sucesso:

### 1. Upload de Imagem/Banner do Evento ✅
- Adicionada coluna `image_url` na tabela `events`
- Criado bucket `event-images` no Storage
- Upload funcional com preview, remoção e orientações visuais

### 2. Correção do Conceito "Viagens" → "Frotas" ✅
- Tab renomeada para "Frotas"
- Contador mostra veículos únicos (não ida+volta separados)
- Resumo mostra "Transportes" em vez de "Viagens"

### 3. Padronização de Dropdowns (Sem Horário) ✅
- Todos os dropdowns de viagem usam `getTripLabelWithoutTime`
- Padrão: `Ida • Ônibus ABC-1234 • 49 lug. • Motorista: Nome`

### 4. Campo de Preço com 2 Decimais ✅
- Formatação automática ao perder foco (onBlur)
- Sempre exibe com 2 casas decimais

### 5. Limite de Passagens com Padrão 0 ✅
- Valor padrão alterado de 5 para 0
- Campo aceita min=0
- Texto auxiliar: "Use 0 para permitir compras sem limite por pedido"

### 6. Resumo do Evento Corrigido ✅
- Mostra "Transportes" (veículos únicos)
- Capacidade total não duplica ida+volta

### 7. Checklist de Publicação Ajustado ✅
- Exige apenas embarque na IDA (volta é opcional)
- Texto atualizado: "Pelo menos 1 local de embarque na Ida"

---

## Arquivos Modificados
- `src/types/database.ts` - Adicionado `image_url` na interface Event
- `src/pages/admin/Events.tsx` - Todas as alterações de UI e lógica
- Migração SQL - `image_url` + bucket `event-images`
