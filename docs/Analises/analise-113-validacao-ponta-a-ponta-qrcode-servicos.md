# Análise 113 — validação ponta a ponta do QR de serviços no `/validador`

## 1. Resumo executivo

**Diagnóstico objetivo:** o fluxo está **parcialmente pronto no nível técnico**, mas **bloqueado para teste operacional real** no estado atual.

Motivos principais:
- a base técnica de token + itens + RPCs + integração no `/validador` existe e está coerente;
- porém o fluxo comercial/operacional ainda não fecha ponta a ponta porque:
  1) a venda de serviço nasce como `pendente`/`pendente_taxa` e não há, no fluxo de `/vendas/servicos`, uma etapa explícita de confirmação para `pago`;
  2) não existe evidência de entrega visual do QR (imagem/print/comprovante/botão de copiar) para o cliente.

**Classificação final desta análise:** **parcialmente pronto (bloqueado operacionalmente)**.

---

## 2. Mapa do fluxo ponta a ponta

### 2.1 Venda de serviço
1. A venda é criada em `/vendas/servicos` (`ServiceSales.tsx`) com `sale_origin = admin_manual`.
2. O status inicial é:
   - `pendente_taxa` para `dinheiro`;
   - `pendente` para `pix`/`link`.
3. A venda grava os dados principais em `sales`.

### 2.2 Geração do token (QR técnico)
1. O token é gerado no frontend via `crypto.randomUUID()`.
2. O valor é persistido em `sales.service_qr_code_token` no insert da venda.
3. O schema define índice único parcial para `service_qr_code_token` não nulo.

### 2.3 Persistência dos itens
1. Após criar `sales`, o fluxo grava item em `sale_service_items`.
2. Campos críticos gravados: `unit_type`, `control_type`, `quantity_total`, `quantity_used`, `unit_price`, `total_price`, `status`.
3. `quantity_remaining` é coluna gerada em banco (`quantity_total - quantity_used`, com guarda).
4. Há rollback mínimo quando falha a criação do item (remove a venda recém-criada).

### 2.4 Pagamento / status
1. Regras de resolução/consumo de serviço exigem `sales.status = pago`.
2. `resolve_service_qr` e `consume_service_item` bloqueiam:
   - `pendente_taxa` (`sale_pending_fee`);
   - qualquer status diferente de `pago` (`sale_not_paid`);
   - `cancelado` (`sale_cancelled`).
3. Não foi encontrada, no fluxo de `/vendas/servicos`, uma etapa clara que evolua automaticamente a venda para `pago`.

### 2.5 Exibição do QR
- Existe token persistido, mas não foi encontrado comprovante operacional com:
  - imagem QR;
  - botão copiar token;
  - PDF/ticket/impressão de QR de serviço.

### 2.6 Leitura no `/validador`
1. `DriverValidate.tsx` tenta primeiro passagem com `validate_ticket_scan`.
2. Só se a passagem retornar `invalid_qr`, tenta `resolve_service_qr` com o mesmo token.
3. Se resolver serviço (inclusive bloqueios de negócio, exceto `service_qr_not_found`), exibe overlay de serviços.

### 2.7 Consumo unitário
1. O botão por item chama `consume_service_item` com:
   - `p_sale_service_item_id`;
   - `p_service_qr_code_token`.
2. Após resposta, o frontend recarrega `resolve_service_qr` para refletir saldo real.
3. Há bloqueio de clique concorrente no frontend por `consumingItemId`.

### 2.8 Auditoria
1. A tabela `service_item_validations` registra consumo e bloqueios.
2. Guarda usuário (`validated_by_user_id`), reason code, resultado, saldos antes/depois.
3. Cobertura é boa para trilha técnica de operação em campo.

---

## 3. Pontos validados

1. **Token técnico de QR de serviços existe e é persistido.**
2. **Unicidade do token protegida por índice único parcial.**
3. **Estrutura `sale_service_items` está consistente para saldo por item.**
4. **Relações com `sales`, `services`, `event_services`, `events`, `companies` estão modeladas por FKs.**
5. **Modelo suporta múltiplos itens por venda** (apesar da UI atual vender 1 por confirmação).
6. **`resolve_service_qr` lista itens com `is_consumable` e motivo de bloqueio por item.**
7. **`consume_service_item` aplica consumo unitário com guarda de concorrência.**
8. **`pendente_taxa` está bloqueada explicitamente** na resolução e no consumo.
9. **Fluxo de passagem foi preservado no `DriverValidate`** (passagem primeiro, serviço como fallback em `invalid_qr`).
10. **Frontend não ajusta saldo local “no escuro”**; recarrega pelo backend após consumo.

---

## 4. Problemas encontrados

1. **Ausência de fechamento de pagamento no fluxo de venda de serviços (`/vendas/servicos`).**
   - O fluxo cria venda em `pendente`/`pendente_taxa`, mas não há passo explícito local para chegar a `pago`.
   - Consequência: QR pode existir, porém frequentemente ficará bloqueado por `sale_not_paid`/`sale_pending_fee`.

2. **Ausência de canal operacional para entregar o QR ao cliente.**
   - Não há evidência de tela/comprovante com QR visual, cópia de token, PDF ou impressão.
   - Consequência: uso em campo tende a depender de token manual/técnico, inviável para operação real.

3. **Risco de “pronto técnico, não pronto operacional”.**
   - Backend e validador suportam o fluxo, mas jornada real (vender → pagar → entregar QR → validar) ainda tem lacunas.

---

## 5. Lacunas operacionais

### 5.1 Lacunas técnicas
1. Falta integração explícita de confirmação de pagamento dentro da jornada de `/vendas/servicos`.
2. Não há evidência de emissão/renderização de QR de serviço para distribuição ao cliente.
3. Não há confirmação no fluxo atual de como operador regulariza `pendente_taxa` para `pago` no contexto de serviço.

### 5.2 Lacunas de produto/UX
1. Não há comprovante claro pós-venda com QR de serviços.
2. Não há gesto de UX para “copiar token” ou “imprimir QR”.
3. A operação de campo pode ficar dependente de entrada manual de token, com fricção alta.

---

## 6. Riscos antes de produção

### Alto
1. **Não entrega do QR ao cliente** (sem meio visual/operacional).
2. **Venda não evoluir para `pago`** e bloquear validação em massa.

### Médio
1. Regularização de `pendente_taxa` sem fluxo operacional claro para time de campo/financeiro.
2. Dependência de fallback de status sem rotina explícita no módulo de venda de serviços.

### Baixo
1. Colisão de token (baixo risco por UUID + índice único parcial).
2. Regressão em passagem (baixo risco no desenho atual, pois passagem segue prioridade e RPC dedicada).

---

## 7. Decisão recomendada

### Podemos testar agora?
- **Não para teste operacional completo (campo).**
- **Sim apenas para teste técnico controlado** (injeção manual de token + venda previamente em `pago`).

### Precisamos corrigir algo antes?
- **Sim.** Antes de homologação operacional, precisa no mínimo:
  1. fechar o caminho de status para `pago` na venda de serviço;
  2. expor QR de serviço de forma operacional (visual/copiável/imprimível).

### Qual correção vem primeiro?
1. **Primeiro:** fechamento de status/pagamento (`pendente`/`pendente_taxa` → `pago`) com regra oficial.
2. **Segundo:** entrega do QR ao usuário/operador em tela/comprovante.

---

## 8. Próximo prompt recomendado

```md
# Tarefa Codex — Correção mínima para destravar operação do QR de serviços

Objetivo: aplicar a menor correção segura para permitir teste operacional real do QR de serviços.

Escopo obrigatório:
1. Mapear e implementar o fluxo mínimo de confirmação de pagamento da venda de serviço em `/vendas/servicos`, garantindo transição para `pago` conforme regra oficial do projeto (sem inventar regra).
2. Expor o `service_qr_code_token` de forma operacional após a venda (no mínimo: exibir token copiável e QR visual na confirmação da venda), reutilizando padrões existentes de comprovante/ticket.
3. Não alterar a lógica de passagem (`validate_ticket_scan`) e não refatorar o `/validador` além do necessário.
4. Validar cenários: `pago` valida, `pendente_taxa` bloqueia, `pendente` bloqueia, consumo unitário reduz saldo e auditoria registra.

Entregáveis:
- alterações mínimas nos arquivos necessários;
- checklist de cenários testados;
- riscos remanescentes.
```

---

## 9. Checklist final

- [x] PRDs foram lidos.
- [x] Análises 109 a 112 foram lidas.
- [x] Geração do QR de serviços foi verificada.
- [x] Persistência dos itens foi verificada.
- [x] Status/pagamento foi verificado.
- [x] Exibição do QR foi verificada.
- [x] `/validador` foi verificado.
- [x] Consumo unitário foi verificado.
- [x] Auditoria foi verificada.
- [x] Regressão de passagem foi verificada.
- [x] Nenhuma implementação foi feita.
- [x] Arquivo `docs/Analises/analise-113-validacao-ponta-a-ponta-qrcode-servicos.md` foi criado.
