

# Plano: Ajustes de UX/UI no Fluxo Publico de Compra

## 1. Corrigir "A definir" no checkout (info strip)

**Problema**: O checkout busca `boarding_locations` (tabela base, sem horario) e usa `trip.departure_time` como fallback, que e frequentemente null em viagens de volta. O horario real esta em `event_boarding_locations.departure_time`.

**Solucao**: Na query do checkout, buscar tambem `event_boarding_locations` filtrando por `trip_id` e `boarding_location_id` para obter o `departure_time` correto. Alternativamente, passar o horario via searchParams na navegacao desde PublicEventDetail.

**Abordagem escolhida**: Passar o `departure_time` como parametro na URL (mais simples e performante). Na PublicEventDetail, ao construir os searchParams, incluir o `departure_time` do `EventBoardingLocation` selecionado. No Checkout, ler esse parametro e exibir. Se ausente, ocultar o campo de horario em vez de mostrar "A definir".

**Arquivos**: `src/pages/public/PublicEventDetail.tsx` (adicionar param), `src/pages/public/Checkout.tsx` (ler param, remover fallback "A definir").

---

## 2. Mapa de assentos profissional (visual de onibus/van real)

**Problema**: O mapa atual e um grid generico sem silhueta de veiculo, sem frente/motorista claro, sem corredor visual.

**Solucao** (inspirada na imagem de referencia):

### SeatMap.tsx — Redesign completo
- Adicionar contorno arredondado simulando carroceria do veiculo (bordas arredondadas no topo como para-brisa)
- Area do motorista com icone de volante (steering wheel) no canto superior esquerdo
- Corredor visual como espaco vazio real entre colunas 2 e 3
- Grid responsivo com gap adequado
- Assentos maiores (w-11 h-11 ou w-12 h-12) para melhor toque no mobile

### SeatButton.tsx — Cores e icones distintos
- **Disponivel**: `bg-white border-gray-300 text-gray-700` (neutro limpo)
- **Selecionado**: `bg-primary text-white` com icone de check pequeno (cor laranja da marca)
- **Ocupado**: `bg-red-100 border-red-300 text-red-500` com icone de usuario/cadeado
- **Bloqueado**: `bg-amber-50 border-amber-300 text-amber-500` com icone X/proibido

### SeatLegend.tsx — Atualizar cores e adicionar icones
- Cada item da legenda inclui o mini-icone correspondente ao estado

**Arquivos**: `src/components/public/SeatMap.tsx`, `src/components/public/SeatButton.tsx`, `src/components/public/SeatLegend.tsx`

---

## 3. Legenda com alta distincao visual + icones

Ja coberto acima no item 2. As cores serao:

| Estado | Fundo | Borda | Texto/Icone |
|--------|-------|-------|-------------|
| Disponivel | branco/claro | cinza leve | numero em cinza escuro |
| Selecionado | primary (laranja) | primary | branco + mini check |
| Ocupado | vermelho claro | vermelho | vermelho + icone user |
| Bloqueado | ambar claro | ambar | ambar + icone X |

---

## 4. Dados dos passageiros em formato colapsavel (Accordion)

**Problema**: Com multiplos passageiros, a tela fica longa demais no mobile.

**Solucao**: Usar Collapsible (ja disponivel via Radix) para cada passageiro:

- Cada bloco colapsado mostra: "Assento 14 — Joao Silva" ou "Assento 14 — Pendente"
- Indicador visual: badge verde "Completo" ou badge amarela "Pendente"
- O primeiro passageiro abre expandido por padrao
- Ao preencher e fechar, o proximo pendente abre automaticamente
- Icone chevron para indicar aberto/fechado

**Arquivo**: `src/pages/public/Checkout.tsx` (step 2)

---

## 5. Selecao do CPF responsavel pelo pagamento

**Problema**: Novo requisito — precisa identificar qual passageiro e o responsavel pela compra.

**Solucao**:

- Adicionar estado `payerIndex` (default: 0, ou seja, passageiro 1)
- Abaixo da lista de passageiros (accordion), exibir secao "Responsavel pelo pagamento" com radio list:
  - "Passageiro do Assento X — Nome / CPF" para cada passageiro
- O CPF do responsavel selecionado sera usado no campo `customer_cpf` e `customer_name` do registro `sales`
- Validacao: nao permitir finalizar se o responsavel nao tiver CPF valido
- Visual: secao com titulo claro e radio buttons grandes

**Arquivo**: `src/pages/public/Checkout.tsx`

---

## Detalhamento Tecnico

### Arquivo: `src/pages/public/PublicEventDetail.tsx`
- Na funcao `handleContinue`, buscar o `EventBoardingLocation` selecionado e incluir `departure_time` nos searchParams:
```typescript
const selectedEBL = filteredLocations.find(l => l.boarding_location_id === selectedLocation);
const params = new URLSearchParams({
  trip: selectedTrip,
  location: selectedLocation,
  quantity: String(quantity),
  ...(selectedEBL?.departure_time && { time: selectedEBL.departure_time }),
  ...(sellerRef && { ref: sellerRef }),
});
```

### Arquivo: `src/pages/public/Checkout.tsx`
Alteracoes principais:
1. Ler `searchParams.get('time')` para o horario do embarque
2. Na info strip, usar esse horario em vez de `trip.departure_time`. Se ausente, ocultar o bloco de horario
3. Step 2: substituir cards fixos por Collapsible com resumo/indicador
4. Adicionar estado `payerIndex` e secao de selecao de responsavel
5. No `handleSubmit`, usar `passengers[payerIndex]` para `customer_name`/`customer_cpf`/`customer_phone` do sale

### Arquivo: `src/components/public/SeatMap.tsx`
- Redesenhar contorno do veiculo com SVG ou CSS (bordas arredondadas no topo simulando para-brisa)
- Icone de volante no canto superior esquerdo
- Corredor como div vazia com visual sutil
- Assentos maiores e mais espacados

### Arquivo: `src/components/public/SeatButton.tsx`
- Novas cores por estado (branco/laranja/vermelho/ambar)
- Adicionar icones: Check para selecionado, User para ocupado, Ban para bloqueado
- Tamanho maior: `w-11 h-11` ou `w-12 h-12`

### Arquivo: `src/components/public/SeatLegend.tsx`
- Atualizar cores para corresponder ao SeatButton
- Adicionar mini-icones em cada item da legenda

---

## Resumo de Arquivos

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `src/pages/public/PublicEventDetail.tsx` | Editar | Passar departure_time via URL |
| `src/pages/public/Checkout.tsx` | Editar | Horario correto, accordion, responsavel pagamento |
| `src/components/public/SeatMap.tsx` | Reescrever | Visual profissional tipo onibus real |
| `src/components/public/SeatButton.tsx` | Reescrever | Cores distintas + icones por estado |
| `src/components/public/SeatLegend.tsx` | Reescrever | Cores + icones atualizados |

---

## Validacoes

1. Nunca exibir "A definir" no fluxo publico
2. Cores dos assentos distinguiveis em 1 segundo
3. Accordion mostra status completo/pendente por passageiro
4. Responsavel pelo pagamento sempre definido e com CPF valido antes de finalizar
5. Layout mobile-first mantido em todas as alteracoes

