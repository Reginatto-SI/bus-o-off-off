# Análise 112 — Integração do `/validador` com QR de serviços

## 1. Resumo executivo

Nesta etapa, a tela `/validador/validar` foi integrada para reconhecer dois contextos de leitura no mesmo fluxo operacional:

- QR de passagem (fluxo existente, preservado);
- QR de serviços (novo fluxo com `resolve_service_qr` + consumo unitário via `consume_service_item`).

A validação de passagem continua como primeira tentativa, sem alteração da RPC `validate_ticket_scan`. Quando o retorno da passagem indica QR inválido (`invalid_qr`), o frontend tenta resolver o mesmo token como QR de serviços. Se houver contexto de serviços, a tela exibe dados da venda e lista de itens com saldos, bloqueios e ação unitária de consumo.

## 2. Estado anterior

Antes desta integração, o `/validador`:

- capturava QR pela câmera (BarcodeDetector/jsQR) ou token manual;
- chamava apenas `validate_ticket_scan`;
- exibia overlay de sucesso/bloqueio apenas para passagem;
- não diferenciava QR de serviços;
- não listava itens de serviço;
- não consumia serviços.

Ou seja, qualquer QR de serviços era tratado como inválido do ponto de vista de passagem.

## 3. Decisão de integração

A decisão implementada foi manter o fluxo principal de passagem intacto e usar fallback controlado para serviços:

1. ler token;
2. chamar `validate_ticket_scan` (passagem);
3. se `reason_code = invalid_qr`, tentar `resolve_service_qr`;
4. se `resolve_service_qr` retornar sucesso ou bloqueio conhecido de serviços (exceto `service_qr_not_found`), renderizar contexto de serviços;
5. se também não resolver serviços, manter resposta de QR inválido.

Essa ordem reduz risco de regressão no fluxo atual de passagem e evita heurísticas frágeis no frontend.

## 4. Arquivos alterados

- `src/pages/driver/DriverValidate.tsx`
- `docs/Analises/analise-112-integracao-validador-qrcode-servicos.md`

## 5. Fluxo final do operador

1. Operador abre `/validador/validar` e lê o QR.
2. Sistema tenta passagem primeiro.
3. Se for passagem válida/bloqueada de passagem, mantém experiência atual de overlay.
4. Se passagem retornar `invalid_qr`, sistema tenta resolver como QR de serviços.
5. Em QR de serviços resolvido, tela mostra:
   - cliente;
   - status da venda;
   - forma de pagamento;
   - evento (nome resolvido por `event_id`);
   - lista de itens com comprada/usada/restante/status/consumível.
6. Em item consumível, operador clica em “Consumir 1”.
7. Front chama `consume_service_item` com `sale_service_item_id` e `service_qr_code_token`.
8. Após retorno, front recarrega os dados chamando `resolve_service_qr` novamente para saldo consistente.
9. Operador usa “Ler próximo” para voltar ao scanner.

## 6. Tratamento de bloqueios

Foi implementado mapeamento operacional de mensagens para os principais `reason_code` de serviços:

- `service_qr_not_found` → “QR de serviços inválido ou não reconhecido.”
- `service_qr_resolved` → “Serviços da venda carregados com sucesso.”
- `service_item_consumed` → “1 unidade consumida com sucesso.”
- `sale_cancelled` → “Venda cancelada. Não é possível consumir o serviço.”
- `sale_pending_fee` → “Venda pendente de taxa. Consumo indisponível.”
- `sale_not_paid` → “Venda ainda não está paga. Não é possível consumir o serviço.”
- `control_not_required` → “Serviço sem validação obrigatória. Nada para consumir.”
- `no_balance` → “Saldo esgotado para este serviço.”
- `item_inactive` → “Item de serviço inativo para consumo.”
- `service_qr_mismatch` → “Este item não pertence ao QR de serviços lido.”
- `concurrent_update_blocked` → “Outro operador consumiu este item. Releia para atualizar.”
- `not_allowed_company` → “Você não tem permissão para validar esta venda.”

Também foi exibido motivo por item quando não consumível (`control_not_required`, `no_balance`, `item_inactive`).

## 7. Validações realizadas

Validações executadas nesta etapa:

1. Build de produção (`npm run build`) passando com sucesso.
2. Revisão do fluxo implementado para garantir:
   - fallback para serviços só após `invalid_qr` de passagem;
   - consumo apenas via RPC;
   - bloqueio de duplo clique por item (`consumingItemId`);
   - recarga de saldo via `resolve_service_qr` após consumo.
3. Lint geral foi executado e falhou por débitos preexistentes do repositório, sem relação direta com esta tarefa.

## 8. Riscos remanescentes

Pontos que seguem pendentes fora desta tarefa:

- comprovante final dedicado de serviços na jornada pós-venda;
- QR de serviços impresso/visível no material final ao cliente (dependente do fluxo de comprovante);
- carrinho multi-serviço na UI de venda (`/vendas/servicos` ainda opera confirmação unitária por vez);
- regra operacional e UX para regularização de venda em dinheiro (`pendente_taxa` → `pago`) no campo.

## 9. Próximo passo recomendado

Próxima etapa recomendada: testes E2E operacionais com massa real de QR de passagem e QR de serviços (incluindo concorrência com dois operadores), validando mensagens e tempos de resposta em ambiente semelhante ao uso móvel de campo.

## 10. Checklist final

- [x] PRDs foram consultados.
- [x] Análises 109, 110 e 111 foram consultadas.
- [x] `/validador` continua validando passagem.
- [x] QR de serviço é reconhecido.
- [x] QR de serviço pago lista itens.
- [x] Consumo usa `consume_service_item`.
- [x] Frontend não altera saldo diretamente.
- [x] Saldo recarrega após consumo.
- [x] Bloqueios possuem mensagem amigável.
- [x] Não houve alteração no fluxo Asaas.
- [x] Não houve alteração no fluxo de venda.
- [x] Arquivo `docs/Analises/analise-112-integracao-validador-qrcode-servicos.md` foi criado.
