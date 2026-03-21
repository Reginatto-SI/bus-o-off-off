# Step 3 — Reestruturação da tela de diagnóstico de vendas

## 1. Problemas da tela anterior
- A listagem misturava status da venda, status do pagamento e leitura operacional em blocos visuais pouco claros.
- `reservado` podia parecer anomalia mesmo quando representava uma reserva manual legítima e ainda válida.
- A tela expunha linguagem muito técnica para operação diária, especialmente na leitura de bloqueios temporários.
- O tempo aparecia sem contexto suficiente e sem deixar explícita a fonte de verdade usada para cada fluxo.
- A coluna de diagnóstico acumulava interpretação, causa e ação em um mesmo espaço, reduzindo a confiança do operador.

## 2. Objetivo da nova tela
- Separar claramente por linha:
  - status da venda
  - status do pagamento
  - situação operacional
  - causa principal
  - tempo / validade
  - ação sugerida
- Respeitar a regra de negócio atual:
  - checkout público usa `seat_locks.expires_at`
  - reserva manual usa `reservation_expires_at`
  - `reservado` administrativo válido não é erro por si só
- Traduzir a leitura técnica para linguagem operacional, sem mudar backend, cleanup, webhooks ou regra de negócio.

## 3. Arquivos alterados
- `src/pages/admin/SalesDiagnostic.tsx`
- `step-3-tela-diagnostico-vendas.md`

## 4. Nova estrutura de exibição
A tabela principal foi reorganizada para exibir colunas separadas e explícitas:
1. Data
2. Evento
3. Comprador
4. Valor
5. Gateway
6. Ambiente
7. Status da venda
8. Status do pagamento
9. Situação operacional
10. Causa principal
11. Tempo / validade
12. Ação sugerida
13. Bloqueio temporário
14. Fluxo
15. Ações

A intenção foi manter o padrão visual existente da tela administrativa, mas transformar a listagem em leitura operacional confiável.

## 5. Nova lógica de status
- **Status da venda** continua vindo do próprio `sale.status`.
- **Status do pagamento** passou a ser calculado separadamente e com linguagem mais clara, por exemplo:
  - `Pagamento confirmado`
  - `Pagamento aguardando confirmação`
  - `Pagamento aguardando confirmação manual`
  - `Pagamento expirado`
  - `Pagamento cancelado`
  - `Sem dados suficientes de pagamento`
- **Situação operacional** agora tem leitura própria e não reaproveita o status da venda como atalho semântico.
- `reservado` com `reservation_expires_at` agora é tratado como **reserva manual legítima**, e só sobe para divergência quando a validade já venceu.

## 6. Nova lógica de causa
A tela agora define uma causa principal **mutuamente exclusiva** por linha, retornando o primeiro cenário dominante. Exemplos aplicados:
- `Checkout aguardando pagamento dentro do prazo.`
- `Checkout expirado e aguardando limpeza.`
- `Reserva manual válida.`
- `Reserva manual vencida.`
- `Pagamento confirmado, venda pendente de conciliação.`
- `Sem dados suficientes para diagnóstico.`
- `Divergência entre gateway e banco.`

Essa decisão evita que a linha apresente múltiplas interpretações ao mesmo tempo.

## 7. Nova lógica de tempo
A tela passou a usar tempo humano com direção, como:
- `vence em 4 horas`
- `venceu há 1 dia`
- `Criada há 12 minutos`

Fontes de verdade:
- checkout público: `seat_locks.expires_at`
- reserva manual: `reservation_expires_at`
- fallback sem vencimento operacional: `created_at` apenas como contexto de criação, não como expiração inventada

Além disso, a coluna informa a origem da leitura, por exemplo:
- `Fonte: bloqueio temporário do checkout`
- `Fonte: validade própria da reserva manual`
- `Fonte: data de criação da venda`

## 8. Melhorias de clareza operacional
- Termos técnicos foram traduzidos para linguagem operacional.
- `lock ausente` deixou de ser a mensagem central; a tela fala em `sem bloqueio temporário` ou explica que o bloqueio curto não se aplica a reservas manuais.
- Casos realmente críticos agora usam a categoria `Divergência`, em vez do genérico `Problema`.
- `reservado` administrativo válido ficou marcado como `Saudável` com causa e ação coerentes.
- Ação sugerida virou uma coluna textual própria, para orientar sem ampliar o escopo com automações novas.

## 9. Comentários adicionados no código
Foram adicionados comentários fortes e orientados a suporte/manutenção explicando:
- onde a tela separa status da venda e status do pagamento
- onde `reservado` é reconhecido como fluxo administrativo legítimo
- onde checkout público e reserva manual são diferenciados
- onde a fonte de verdade de tempo/validade é escolhida corretamente
- onde a causa principal única é calculada
- onde a ação sugerida é definida como orientação textual
- onde a linguagem técnica foi traduzida para linguagem operacional

## 10. Checklist de testes manuais
- [ ] Abrir `/admin/diagnostico-vendas` e confirmar que as colunas agora separam venda, pagamento, situação, causa, tempo e ação.
- [ ] Validar uma venda `pendente_pagamento` com `seat_locks.expires_at` futuro e conferir leitura “checkout dentro do prazo”.
- [ ] Validar uma venda `pendente_pagamento` com lock vencido e conferir leitura “checkout expirado e aguardando limpeza”.
- [ ] Validar uma venda `reservado` com `reservation_expires_at` futuro e conferir leitura “reserva manual válida”.
- [ ] Validar uma venda `reservado` com `reservation_expires_at` vencido e conferir leitura “reserva manual vencida”.
- [ ] Validar um caso com pagamento confirmado no gateway e venda ainda não conciliada no banco.
- [ ] Confirmar que os tempos aparecem em formato humano e com fonte de verdade explícita.
- [ ] Confirmar que a tela continua dentro do layout administrativo padrão.

## 11. Conclusão final
A mudança foi mantida no menor escopo possível, concentrada em `SalesDiagnostic.tsx`, sem alterar backend nem regra de negócio. A tela agora está estruturada para refletir a verdade operacional: separa conceitos, respeita a nova política de reservas manuais, usa a fonte correta de tempo/validade e orienta o operador com linguagem mais clara e acionável.
