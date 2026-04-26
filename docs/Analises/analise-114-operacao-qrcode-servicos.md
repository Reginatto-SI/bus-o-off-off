# Análise 114 — operação do QR de serviços (confirmação mínima + exibição operacional)

## 1. Resumo executivo

Foi aplicada a menor correção segura em `/vendas/servicos` para destravar teste operacional do QR de serviços:

- confirmação explícita de recebimento para pagamento em dinheiro;
- transição para `pago` somente quando essa confirmação manual é marcada;
- manutenção de `pix`/`link` como pendente (sem bypass);
- exibição operacional pós-venda do QR de serviços (visual + token copiável);
- registro de auditoria em `sale_logs` quando há confirmação manual de pagamento em dinheiro.

Com isso, o fluxo agora pode ser testado operacionalmente no cenário presencial (dinheiro confirmado), mantendo os bloqueios de segurança para vendas pendentes.

---

## 2. Estado anterior

Conforme a análise 113, os bloqueios principais eram:

1. venda de serviço criava `pendente`/`pendente_taxa`, sem etapa explícita para virar `pago`;
2. não havia QR visível/copiável para entrega operacional ao cliente;
3. o `/validador` exige status `pago` para consumo, então o fluxo real ficava travado.

---

## 3. Decisão aplicada

### Dinheiro

- foi adicionada confirmação explícita na UI: “Confirmo que o pagamento em dinheiro foi recebido presencialmente”.
- comportamento:
  - **marcado** ⇒ venda salva como `pago`;
  - **desmarcado** ⇒ venda salva como `pendente_taxa`.
- quando marcado, também grava `payment_confirmed_at` e registra trilha `manual_payment_confirmed` em `sale_logs`.

### Pix/Link

- continuam em `pendente`.
- não há marcação automática como `pago`.
- UI explicita que aguarda confirmação real de pagamento.

### `pendente_taxa`

- permanece sem liberação de consumo no `/validador` (sem mudanças em `resolve_service_qr`/`consume_service_item`).
- se dinheiro não for confirmado manualmente, a venda fica `pendente_taxa` e segue bloqueada para consumo.

### QR visível

- após a conclusão da venda, a tela passa a mostrar um comprovante operacional com:
  - QR visual (conteúdo = `service_qr_code_token`);
  - token em campo read-only;
  - botão “Copiar código do QR”;
  - dados básicos da venda (id, status, evento, serviço, cliente, quantidade);
  - alerta quando status ainda não é `pago`.

---

## 4. Arquivos alterados

- `src/pages/admin/ServiceSales.tsx`
- `docs/Analises/analise-114-operacao-qrcode-servicos.md`

---

## 5. Fluxo final da venda de serviço

1. operador seleciona evento e serviço;
2. informa quantidade e dados opcionais;
3. escolhe forma de pagamento;
4. se for dinheiro, decide explicitamente se recebeu presencialmente;
5. sistema grava:
   - dinheiro confirmado ⇒ `pago`;
   - dinheiro não confirmado ⇒ `pendente_taxa`;
   - pix/link ⇒ `pendente`;
6. QR de serviços aparece na própria tela após a venda;
7. operador pode copiar o token pelo botão;
8. `/validador` lê o token normalmente e só consome quando status está `pago`.

---

## 6. Validações realizadas

1. validação estática do fluxo em `ServiceSales.tsx`:
   - dinheiro sem confirmação explícita não vira `pago`;
   - dinheiro com confirmação vira `pago`;
   - pix/link não viram `pago` automaticamente;
   - QR exibido usa `service_qr_code_token`;
   - botão de cópia usa clipboard;
   - alerta aparece quando status não é `pago`.
2. build de produção executado com sucesso (`npm run build`).
3. não houve alteração em `/validador`, `validate_ticket_scan`, `resolve_service_qr` ou `consume_service_item`.

---

## 7. Riscos remanescentes

### 7.1 Pagamento

- confirmação de dinheiro continua manual (depende de disciplina operacional);
- pix/link seguem pendentes nesta tela até fluxo de confirmação real (Asaas/fallback) ser integrado de ponta a ponta para serviço.

### 7.2 UX

- comprovante exibido é funcional e mínimo; ainda pode evoluir para impressão/PDF dedicado.

### 7.3 Técnico

- sem mudanças no backend de validação; logo, bloqueios por status continuam corretos, mas também mantêm dependência de status `pago` para liberar consumo.

---

## 8. Próximo passo recomendado

1. evoluir comprovante operacional para impressão/PDF de serviço;
2. integrar confirmação de pagamento de serviço (pix/link) com fluxo oficial de cobrança/confirmação;
3. executar homologação operacional em campo (venda em dinheiro confirmada → leitura no `/validador` → consumo unitário).

---

## 9. Checklist final

- [x] PRDs foram lidos.
- [x] Análises 109 a 113 foram lidas.
- [x] Dinheiro exige confirmação explícita.
- [x] Dinheiro confirmado vira `pago`.
- [x] Pix/link não vira `pago` automaticamente.
- [x] QR visual é exibido.
- [x] Token pode ser copiado.
- [x] QR usa `service_qr_code_token`.
- [x] `/validador` não foi reescrito.
- [x] Passagem não foi alterada.
- [x] Build passou.
- [x] Arquivo `docs/Analises/analise-114-operacao-qrcode-servicos.md` foi criado.
