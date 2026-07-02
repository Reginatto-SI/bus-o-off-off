## Diagnóstico

Testei a edge function `ticket-lookup` diretamente com o CPF do caso real (`70499466640`) e a passagem do evento `FORRÓ DE CURVELO - NATTAN`:

- No banco, a venda está `pago` e o evento tem `whatsapp_group_link` preenchido.
- A resposta atual da edge function em produção **não retorna o campo `whatsappGroupLink`** no payload (o campo simplesmente não aparece no JSON), enquanto retorna todos os outros campos normalmente.
- O código fonte atual de `supabase/functions/ticket-lookup/index.ts` já contém a lógica correta (linhas 168–191) que monta e devolve `whatsappGroupLink`. Ou seja: a versão publicada da edge function está desatualizada em relação ao código do repositório — o build/deploy dessa função ficou para trás.

Do lado do frontend (`TicketLookup.tsx` → `normalizeCardsFromResponse` → `PassengerTicketList` → `TicketCard`) o fluxo já está pronto: se `whatsappGroupLink` vier populado na resposta pública, o botão "Entrar no grupo do WhatsApp" aparece exatamente igual ao da área logada. O único elo quebrado é a edge function pública devolvendo o campo ausente.

## Correção proposta

Escopo mínimo, sem tocar em layout, pagamento, Asaas, webhook ou split.

### 1. `supabase/functions/ticket-lookup/index.ts`

Reforçar e simplificar a geração de `whatsappGroupLink` para garantir que ele volte no payload público sempre que a passagem for paga e o evento tiver grupo configurado, e forçar novo deploy da função:

- Manter a busca já existente em `events` (`id, company_id, whatsapp_group_link`) por `eventPublicMap`.
- Simplificar a regra para: `whatsappGroupLink = sale.status === 'pago' ? (eventPublic?.whatsapp_group_link ?? sale.event?.whatsapp_group_link ?? null) : null`.
  - Remover a comparação redundante `eventCompanyId === companyId` (ambos vêm da mesma linha de `events`; a checagem só cria risco de eliminar o link quando um dos lados vem nulo).
  - Multi-tenant continua garantido porque o link consultado é sempre do `event_id` da própria venda.
- Garantir que o campo `whatsappGroupLink` seja sempre incluído no objeto `results.push({...})` (usar `?? null` explícito para nunca virar `undefined` e ser descartado pelo `JSON.stringify`).
- Não mudar mais nada da função (colunas selecionadas, filtros, ordem, demais campos permanecem iguais).

O redeploy da edge function é obrigatório — hoje a versão publicada está sem o campo no payload.

### 2. `src/pages/public/TicketLookup.tsx` (ajuste mínimo de robustez)

- Corrigir a chave `eventId` duplicada dentro do objeto retornado por `normalizeCardsFromResponse` (linhas 149 e 158) — mantém apenas uma ocorrência. Não altera comportamento, apenas remove ruído.
- Nenhuma outra mudança: a leitura de `ticket.whatsappGroupLink ?? ticket.whatsapp_group_link` já cobre variações de payload.

### 3. Nada a mudar no frontend visual

- `TicketCard.tsx`: já renderiza o botão quando `showWhatsAppGroupCta && isPaid && ticket.whatsappGroupLink`. Sem alteração.
- `PassengerTicketList.tsx`: `withGroupWhatsAppLink` já propaga o link entre ida/volta do mesmo `eventId`. Sem alteração.

## Validação

1. Redeploy da edge function `ticket-lookup`.
2. Rechamar a função via `curl` com `{"cpf":"70499466640"}` e confirmar que cada ticket do evento `ec12e5c5-…` volta com `"whatsappGroupLink": "https://chat.whatsapp.com/Jqa3ixElUIU7Q3qwseLq9q"`.
3. Abrir `/consultar-passagens` deslogado, informar o CPF `704.994.666-40` e confirmar que a passagem do FORRÓ DE CURVELO - NATTAN mostra o botão **Entrar no grupo do WhatsApp** e o link abre para o grupo correto.
4. Confirmar que as outras passagens pagas do mesmo CPF que não têm grupo configurado continuam sem exibir o botão (evita botão vazio ou link cruzado entre eventos/empresas).
5. Confirmar que uma venda `reservado`/`pendente_pagamento`/`cancelado` não exibe o botão (regra `saleStatus === 'pago'` mantida na edge e no `normalizeCardsFromResponse`).
6. Conferir que a visualização logada em `/admin/vendas` continua idêntica (nenhuma mudança de componente).

## Arquivos alterados

- `supabase/functions/ticket-lookup/index.ts` (lógica simplificada + garantia do campo no payload + redeploy).
- `src/pages/public/TicketLookup.tsx` (remoção da chave `eventId` duplicada).
