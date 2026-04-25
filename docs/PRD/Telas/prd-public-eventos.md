# PRD — Tela `/eventos` (Catálogo público)

## 1. Objetivo
Apresentar os eventos disponíveis para compra online, com busca textual rápida e ordenação visual que preserve regras de visibilidade operacional.

## 2. Contexto no sistema
- **Venda:** é a porta de entrada para detalhe e checkout.
- **Pagamento:** não executa pagamento, mas alimenta o funil que termina em checkout/confirmacão.
- **Empresa:** mostra eventos com referência de empresa associada.
- **Usuário:** acesso público sem autenticação.

## 3. Fluxo REAL da tela
1. Busca eventos `status='a_venda'` e `is_archived=false` com join de empresa (`companies`).
2. Carrega embarques (`event_boarding_locations`) para os eventos retornados.
3. Calcula janela operacional por evento (`buildEventOperationalEndMap`) e filtra com `filterOperationallyVisibleEvents`.
4. Armazena eventos visíveis em estado local e encerra loading.
5. Aplica busca client-side por termo (`filterEventsByTerm`) em nome do evento, cidade e nome da empresa.
6. Aplica balanceamento visual (`interleaveEventCards`) para alternar itens na vitrine.
7. Renderiza: carrossel de destaque (até 5), grid de eventos, ou empty states.

## 4. Regras de negócio (CRÍTICO)
- Só aparecem eventos com `status='a_venda'` e não arquivados.
- Evento só fica visível se ainda estiver dentro da janela operacional calculada.
- Quando não há horário de embarque, janela operacional vai até fim do dia local do evento.
- Busca não altera backend; é filtro local sobre dados já carregados.
- `sellerRef` de querystring é preservado e repassado aos cards/carrossel.

## 5. Integrações envolvidas
- **Supabase tabelas:** `events`, `companies`, `event_boarding_locations`.
- **Libs de regra:** `eventOperationalWindow` (janela operacional), `eventSearch` (busca normalizada).
- **Componentes:** `EventsCarousel`, `EventCard`, `EventCardSkeletonGrid`, `EmptyState`.

## 6. Estados possíveis
- **Carregando:** skeleton grid.
- **Sem eventos disponíveis:** empty state de indisponibilidade.
- **Sem resultado de busca:** empty state com ação de limpar termo.
- **Lista carregada:** carrossel + grid.

## 7. Cenários de falha
| Cenário | Impacto | Ação esperada |
|---|---|---|
| Consulta retorna vazia | Catálogo sem itens | Exibir estado “Nenhuma passagem disponível” |
| Termo sem correspondência | Nenhum card após filtro | Exibir estado de busca sem resultado + botão limpar |
| Data/hora de embarque inválida | Evento pode cair em fallback de visibilidade | Fallback para data principal do evento (fim do dia) |
| Falha silenciosa na consulta (sem tratamento explícito) | Possível tela vazia sem mensagem técnica detalhada | Estado final segue para lista vazia/empty state |

## 8. Riscos operacionais
- Não há tratamento explícito de erro de rede com toast nessa página; falhas podem parecer “sem eventos”.
- Regras de visibilidade dependem de qualidade dos dados de embarque.

## 9. Logs e diagnóstico
- Diagnóstico principal via inspeção de resposta das consultas `events` e `event_boarding_locations`.
- Validar cálculo de janela em `eventOperationalWindow` quando evento esperado não aparece.
- Verificar querystring `ref` quando funil comercial por vendedor não propaga como esperado.

## 10. Dúvidas pendentes
- Estratégia oficial de telemetria para falhas de carga do catálogo: **não identificado no código atual**.
- Política de paginação/lazy load para catálogo grande: **não identificado no código atual**.
