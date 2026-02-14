

# Compra sem reserva + carregamento confiavel de assentos

## Resumo das alteracoes

O objetivo e tornar o fluxo de selecao de assentos mais confiavel e profissional, com tres grandes melhorias:

1. **Loading obrigatorio com bloqueio visual** antes de liberar a selecao
2. **Revalidacao de assentos** antes de prosseguir ao pagamento
3. **Remocao do conceito de "reserva" no fluxo publico** (a venda so e confirmada pelo Stripe)

---

## Detalhes da implementacao

### 1. Overlay de carregamento no SeatMap

Ao entrar na tela de checkout (etapa 1), o mapa de assentos exibira um overlay com spinner e texto "Carregando assentos..." enquanto os dados reais sao buscados. Durante esse periodo, todos os botoes de assento ficarao desabilitados.

Quando o carregamento terminar com sucesso, aparecera brevemente um microtexto "Assentos sincronizados" acima da grade, dando confianca ao usuario.

**Arquivo:** `src/components/public/SeatMap.tsx`
- Adicionar overlay visual sobre a grade quando `loadingStatus` ou `interactionDisabled` forem `true`
- Exibir indicador "Assentos sincronizados" quando o loading terminar

### 2. Revalidacao de assentos antes de avancar para dados dos passageiros

Quando o usuario clicar em "Continuar para dados dos passageiros", o sistema fara uma nova consulta ao banco para verificar se os assentos selecionados ainda estao disponiveis.

Se algum assento tiver sido vendido/bloqueado nesse intervalo:
- Exibir toast com mensagem clara ("Alguns assentos que voce selecionou ja foram vendidos. Escolha outros.")
- Atualizar a lista de assentos ocupados automaticamente
- Remover os assentos conflitantes da selecao do usuario
- Manter o usuario na mesma tela (sem voltar)

**Arquivo:** `src/pages/public/Checkout.tsx`
- Modificar `handleAdvanceToPassengers` para revalidar assentos
- Adicionar mesma logica de revalidacao em `handleSubmit` (antes de criar a venda)

### 3. Revalidacao na submissao (handleSubmit)

Antes de criar a venda e os tickets no banco, o sistema revalidara os assentos individualmente (alem da capacidade geral que ja e validada). Se houver conflito:
- Exibir mensagem clara
- Voltar para etapa 1 com assentos atualizados
- Remover assentos conflitantes da selecao

### 4. Limpeza de reserva em caso de falha no Stripe

O fluxo atual ja limpa a venda e tickets quando o Stripe falha (capabilities_not_ready, erro generico). Isso sera mantido e reforçado para que nenhuma "reserva fantasma" fique no banco em caso de falha ou abandono.

Nao sera alterado o mecanismo de criacao de sale + tickets antes do redirect ao Stripe, pois isso e necessario para que o webhook consiga atualizar a venda. Porem, caso o checkout Stripe expire, a venda permanecera como "reservado" e podera ser limpa futuramente por processo administrativo (fora do escopo deste MVP).

---

## Arquivos a serem modificados

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/public/SeatMap.tsx` | Overlay de loading com spinner, bloqueio de interacao, microtexto "Assentos sincronizados" |
| `src/pages/public/Checkout.tsx` | Revalidacao de assentos em `handleAdvanceToPassengers` e `handleSubmit`, feedback de conflito |

## O que NAO sera alterado

- Layout geral das telas publicas
- Fluxo de rotas (eventos -> checkout -> confirmacao)
- Logica do webhook Stripe
- Componente SeatButton (visual dos estados ja esta correto)
- Tela de confirmacao

