## Diagnóstico

A regra atual em `src/lib/eventOperationalWindow.ts` esconde o evento exatamente quando o **último embarque** acaba (ex.: embarque de ida às 08:00 some às 08:01, mesmo no dia do evento). Como muitos eventos têm ida e volta sem o retorno cadastrado, eventos do dia (ou de dias anteriores ainda em viagem) desaparecem indevidamente nos lugares que usam essa regra:

- `/admin/relatorios/lista-embarque` (dropdown sem o evento de hoje)
- `/validador` (tela do QR / motorista) — não mostra mais o evento ativo
- `/eventos`, `/empresa/:nick`, `/admin/eventos`, `NewSaleModal`, `ServiceSales` (mesmo efeito colateral)

## Correção

Ajuste **mínimo e centralizado** em `src/lib/eventOperationalWindow.ts`, sem mexer no resto:

1. Normalizar o fim operacional para o **fim do dia (23:59:59)** do último embarque (ou de `events.date` no fallback). Isso já garante que um evento de hoje continue visível durante todo o dia, independente do horário de partida.
2. Adicionar uma **folga de retorno** padrão de **2 dias corridos** após esse fim de dia. Cobre o cenário descrito pelo usuário: hoje é 05/06 e um evento de 05/06 com volta no dia seguinte continua aparecendo no dia 06 e 07.
3. Atualizar `eventOperationalWindow.test.ts` para refletir o novo comportamento (fim-de-dia + folga).

Esse ajuste corrige automaticamente:
- o dropdown de `/admin/relatorios/lista-embarque` (eventos de hoje voltam a aparecer; toggle "Mostrar eventos antigos" continua para histórico mais antigo);
- a tela `/validador` (QR/motorista), que volta a listar o evento em andamento;
- todas as demais telas que já consomem a regra (comportamento ganha coerência única).

## Fora do escopo

- Não criar configuração por empresa nem nova arquitetura.
- Não mexer em layout, RLS, status do evento ou lifecycle.
- Não duplicar lógica em telas individuais — manter regra única no util compartilhado.

## Detalhes técnicos

Arquivo: `src/lib/eventOperationalWindow.ts`
- Adicionar constante `OPERATIONAL_GRACE_DAYS = 2`.
- Em `getEventOperationalEnd`, após calcular o último instante, normalizar para fim do dia local e somar `OPERATIONAL_GRACE_DAYS` dias.
- Manter o fallback (sem embarques → `events.date`) sob a mesma regra (fim do dia + folga).

Arquivo: `src/lib/eventOperationalWindow.test.ts`
- Atualizar as 3 assertions para o novo `end-of-day + 2d`.

Nenhuma outra alteração de tela é necessária.
