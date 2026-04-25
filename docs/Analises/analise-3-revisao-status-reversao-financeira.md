# Revisão conservadora da classificação de reversão financeira

## Status que permaneceram como **reversão financeira real**

Mantidos na classificação que pode disparar blindagem pós-pago:

- `REFUNDED`
- `REFUND_REQUESTED`
- qualquer status contendo `CHARGEBACK`
- qualquer status contendo `DISPUTE`
- qualquer status contendo `CONTEST`

### Por quê
Esses sinais representam, no contexto operacional do Smartbus BR, cenários de estorno/contestação/disputa com risco financeiro real após confirmação da venda.

---

## Status removidos da classificação de reversão financeira real

Removidos da função `isFinancialReversalAsaasStatus`:

- `OVERDUE`
- `EXPIRED`
- `DELETED`
- `CANCELLED`

### Por quê
Pela semântica do contrato de eventos do Asaas, esses sinais não são equivalentes automáticos a perda financeira pós-pago em todos os casos.

Em especial, o próprio fluxo de eventos documentado do gateway indica que existem eventos ocasionais não ligados diretamente ao recebimento de valores (como trilhas administrativas), então tratar esses status como reversão terminal para venda já paga pode ser amplo demais.

---

## Ajuste aplicado para reduzir falso positivo operacional

Além do recorte da função de classificação, foi adicionado guard explícito no webhook para venda já `pago`:

- se o sinal **não** for terminal de perda financeira real (estorno/disputa/chargeback), o sistema **não** executa cancelamento destrutivo pós-pago;
- apenas atualiza `asaas_payment_status` e registra trilha de decisão.

---

## Risco evitado com o ajuste

O ajuste evita cancelar indevidamente venda já `pago` (e remover tickets/locks) por status que podem não significar perda financeira terminal pós-pago.

Com isso, a blindagem continua forte para estorno/disputa/chargeback real, mas reduz risco de falso positivo operacional e bloqueio indevido de embarque.
