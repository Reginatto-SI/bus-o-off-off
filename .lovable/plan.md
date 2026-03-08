

## Diagnóstico: Tela piscando a cada 15 segundos

### Causa raiz

Na linha 74 de `DriverBoarding.tsx`, a função `fetchData` faz `setLoadingData(true)` **toda vez** que é chamada — inclusive no auto-refresh de 15 segundos (linha 203-205).

Quando `loadingData` fica `true`, o JSX renderiza **Skeletons** (placeholders cinza) no lugar da lista de passageiros. Quando os dados voltam, renderiza a lista de novo. Isso causa o "pisca" visível a cada 15s.

### Correção

Separar o loading inicial do refresh silencioso:

1. Manter `setLoadingData(true)` apenas no **primeiro carregamento** (quando `passengers` está vazio)
2. No auto-refresh de 15s, **não** setar `loadingData(true)` — apenas atualizar os dados silenciosamente quando a resposta chegar
3. Mesma lógica para o botão de refresh manual (RefreshCw): pode usar um indicador discreto (ex: ícone girando) em vez de mostrar skeletons

### Implementação

- Adicionar um parâmetro `silent?: boolean` ao `fetchData`, ou criar um flag `isInitialLoad` via ref
- Quando `silent = true`, pular o `setLoadingData(true)`
- O interval e o botão de refresh chamam `fetchData` no modo silencioso
- O `useEffect` inicial chama no modo normal (com skeleton)

### Arquivo alterado

- `src/pages/driver/DriverBoarding.tsx` — ~5 linhas de mudança

