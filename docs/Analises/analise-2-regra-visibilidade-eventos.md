# Análise 2 — regra única de visibilidade de eventos

## 1. Resumo executivo

A regra oficial consolidada nesta tarefa passou a ser: **um evento permanece visível na apresentação padrão enquanto sua janela operacional estiver aberta; essa janela termina no último `event_boarding_locations.departure_date + departure_time` vinculado ao evento; na ausência de embarques, o fallback seguro continua sendo o fim do dia de `events.date`**.

Essa decisão foi validada contra a tela `/motorista`, que já tentava usar dados de embarque para recorte temporal, porém com uma heurística local e inconsistente (`-1` até `+5` dias a partir do primeiro embarque do transporte). A implementação removeu essa heurística e centralizou a regra em um util compartilhado.

## 2. Diagnóstico da tela `/motorista`

### Como ela funciona hoje
- Rota principal: `/motorista` em `src/App.tsx`, renderizando `src/pages/driver/DriverHome.tsx`.
- Tela de embarque relacionada: `/motorista/embarque`, renderizando `src/pages/driver/DriverBoarding.tsx`.
- Ambas consultam `trips` com join em `events` e restringem por `events.status = 'a_venda'`.
- Antes do ajuste, `DriverHome` aplicava uma janela própria baseada no **primeiro** `event_boarding_locations.departure_date` por viagem, mantendo somente viagens entre `ontem` e `+5 dias`.
- `DriverBoarding` não aplicava essa mesma heurística: aceitava a viagem persistida ou a primeira viagem disponível somente por `status`.

### Fonte temporal usada antes
- `/motorista` **não** usava apenas `events.date`.
- A melhor evidência encontrada foi o uso de `event_boarding_locations.departure_date`, mas de forma parcial e local à `DriverHome`.
- Não havia conceito centralizado de “evento em andamento”; havia apenas recorte operacional por janela heurística.

### Conclusão sobre `/motorista`
A tela do motorista já indicava, pelo próprio código, que a fonte temporal operacional mais confiável estava mais próxima dos embarques do que da data principal do evento. Porém, a implementação anterior era inconsistente e não servia como regra oficial do sistema porque:
- usava o **primeiro** embarque em vez do último marco operacional;
- aplicava um range arbitrário `-1/+5` dias;
- não era reutilizada nas demais telas.

## 3. Fonte temporal oficial recomendada

### Fonte de verdade
**`event_boarding_locations.departure_date` + `event_boarding_locations.departure_time`, usando o último embarque do evento como fim operacional real.**

### Regra adotada
1. Buscar todos os embarques (`event_boarding_locations`) do evento.
2. Calcular o maior instante entre `departure_date + departure_time`.
3. Enquanto esse instante não passar, o evento continua visível na apresentação padrão.
4. Se o evento não tiver embarques cadastrados, usar fallback para o fim do dia de `events.date`.

### Justificativa objetiva
- `trips.departure_time` sozinho não resolve porque não possui data operacional completa.
- `events.date` sozinho não cobre retorno/embarque posterior ao dia principal.
- `event_boarding_locations` já representa o horário real operacional usado em fluxos de venda, lista de embarque e motorista.
- O fallback em `events.date` evita esconder eventos sem embarques configurados.

## 4. Telas impactadas

### Regra aplicada
- `/admin/eventos`
- `/motorista`
- `/motorista/embarque`
- `/eventos`
- `/empresa/:nick`
- modal administrativo de venda manual (`NewSaleModal`)
- `/admin/relatorios/lista-embarque`

### Regra validada no mapeamento
Também foi validado no código que outras telas listam/selecionam eventos, mas não foram alteradas por não serem a apresentação padrão principal desta tarefa ou por dependerem de contexto histórico/relatório:
- `src/pages/admin/Sales.tsx`
- `src/pages/admin/SalesReport.tsx`
- `src/pages/admin/EventReport.tsx`
- `src/pages/public/PublicEventDetail.tsx`
- `src/pages/public/TicketLookup.tsx`

## 5. Implementação realizada

### Centralização da lógica
Foi criado o util compartilhado:
- `src/lib/eventOperationalWindow.ts`

Ele centraliza:
- cálculo do fim operacional do evento;
- fallback para `events.date` quando não há embarques;
- verificação de visibilidade operacional;
- filtro reutilizável de eventos visíveis.

### Ajuste mínimo aplicado
- `DriverHome` deixou de usar a janela heurística `-1/+5` baseada no primeiro embarque e passou a usar a regra compartilhada baseada no último embarque do evento.
- `DriverBoarding` passou a validar a viagem persistida e a viagem padrão pela mesma regra operacional.
- `PublicEvents` e `PublicCompanyShowcase` agora ocultam eventos cuja janela operacional já terminou.
- `NewSaleModal` passou a oferecer apenas eventos ainda operacionalmente visíveis na seleção padrão.
- `BoardingManifestReport` passou a usar a mesma regra por padrão, mantendo o histórico acessível pelo toggle existente `Mostrar eventos antigos`.
- `Events` (`/admin/eventos`) passou a ocultar eventos operacionalmente finalizados na visão padrão, mantendo acesso ao histórico ao aplicar filtros administrativos.

### Evidência de reutilização
A lógica ficou centralizada em um único util, sem duplicar comparações de datas por tela.

## 6. Riscos e limitações

- A regra depende de `event_boarding_locations.departure_date`; se o cadastro operacional estiver incompleto, o sistema usa fallback para `events.date`.
- Telas analíticas/históricas continuam com comportamentos próprios porque seu objetivo não é a apresentação operacional padrão.
- A regra usa o horário do navegador/app para comparação instantânea; isso é consistente com o restante do front-end atual, mas pode ser refinado no futuro caso o produto queira timezone operacional explícito por empresa.
- Não houve alteração automática de `status`, arquivamento ou sincronização de lifecycle do evento.
- Não foi criada nova arquitetura nem opção configurável.

## 7. Texto implementado no admin

Mensagem adotada em `/admin/eventos`:

> **A visão padrão mostra somente eventos ainda dentro da janela operacional. Eventos finalizados continuam acessíveis ao aplicar filtros de histórico.**
