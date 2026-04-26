# Análise 116 — comprovante operacional imprimível do QR de serviços

## 1. Resumo executivo

Foi implementado um comprovante operacional imprimível no `/vendas/servicos`, reaproveitando o card de comprovante já existente na tela.

Entregas principais:

- botão **Imprimir comprovante**;
- impressão limpa focada no comprovante (sem menu/sidebar/formulários/botões);
- QR de serviços grande e legível;
- campos operacionais obrigatórios no comprovante;
- orientação por status (`pago` x não pago);
- rodapé obrigatório SmartBus BR.

Com isso, o comprovante está apto para homologação operacional interna.

---

## 2. Estado anterior

Antes desta etapa, o QR de serviços já era exibido no pós-venda e podia ser copiado.

Porém, ainda não havia um modo de impressão limpa do comprovante (a tela não possuía ação específica de imprimir o bloco operacional isolado).

---

## 3. Decisão aplicada

Foi usada a solução mínima com:

- `window.print()`;
- área dedicada de comprovante (`.service-receipt-print`);
- regras `@media print` locais na própria página para:
  - ocultar elementos fora do comprovante;
  - esconder botões de ação (`.no-print`);
  - imprimir somente o bloco de comprovante com layout legível.

Essa abordagem evita criação de componente/rota nova e mantém o padrão visual atual.

---

## 4. Arquivos alterados

- `src/pages/admin/ServiceSales.tsx`
- `docs/Analises/analise-116-comprovante-operacional-qrcode-servicos.md`

---

## 5. Conteúdo do comprovante

Campos exibidos no comprovante:

1. título `Comprovante de Serviço SmartBus BR`;
2. identificação visual simples (`SmartBus BR · Operação de Serviços`);
3. QR Code (baseado em `service_qr_code_token`);
4. token do QR em texto;
5. status da venda;
6. alerta visual quando status não é `pago`;
7. nome do cliente;
8. CPF do cliente (quando disponível);
9. telefone do cliente (quando disponível);
10. evento;
11. serviço;
12. quantidade;
13. valor unitário;
14. valor total;
15. forma de pagamento;
16. data/hora de emissão;
17. orientação curta por status:
   - `pago`: “Apresente este QR Code ao responsável pelo serviço.”
   - não pago: “Este comprovante ainda não libera consumo do serviço.”
18. rodapé obrigatório:
   - `Gerado por SmartBus BR — www.smartbusbr.com.br — Contato: (31) 99207-4309`.

---

## 6. Regra por status

### `pago`

- status com destaque positivo;
- orientação de uso liberado do QR no serviço.

### `pendente`

- alerta de que o comprovante não libera consumo;
- QR permanece visível para operação, sem indicar liberação.

### `pendente_taxa`

- mesmo comportamento de alerta de não liberação;
- QR visível apenas como referência operacional.

---

## 7. Validações realizadas

1. comprovante de venda `pago` exibe status positivo e orientação de uso;
2. comprovante pendente/pendente_taxa exibe alerta;
3. QR renderizado usa `service_qr_code_token`;
4. token visível no comprovante permanece igual ao usado no botão de copiar;
5. botão de imprimir acionando `window.print()`;
6. regras `@media print` ocultam elementos fora do comprovante;
7. botões de ação ocultos em impressão (`.no-print`);
8. rodapé obrigatório exibido;
9. nenhuma alteração em `/validador`;
10. nenhuma alteração em passagem;
11. build passou.

---

## 8. Riscos remanescentes

### UX

- comprovante é funcional e compacto, mas ainda sem refinamentos avançados de design para diferentes impressoras.

### Impressão

- comportamento final depende do navegador/impressora do operador (margens e escala podem variar).

### Operação

- para pix/link pendente, comprovante existe, mas não libera consumo até confirmação de pagamento.

### Técnico

- solução usa CSS de impressão local na página; caso o layout global mude muito no futuro, convém revalidar a regra `@media print`.

---

## 9. Próximo passo recomendado

Próxima etapa recomendada:

1. homologação de campo com operadores reais (fluxo venda → impressão → leitura no `/validador`);
2. avaliar necessidade de PDF dedicado em etapa posterior;
3. manter evolução separada para confirmação real de pix/link (sem bypass local).

---

## 10. Checklist final

- [x] Análises 109 a 115 foram lidas.
- [x] PRDs oficiais foram lidos.
- [x] Botão de impressão foi adicionado.
- [x] Impressão limpa foi implementada.
- [x] QR usa `service_qr_code_token`.
- [x] Token aparece no comprovante.
- [x] Status aparece no comprovante.
- [x] Alerta aparece quando não pago.
- [x] Dados do cliente aparecem quando disponíveis.
- [x] Dados do evento/serviço aparecem.
- [x] Valores aparecem.
- [x] Rodapé obrigatório aparece.
- [x] `/validador` não foi alterado.
- [x] Passagem não foi alterada.
- [x] Build passou.
- [x] Arquivo `docs/Analises/analise-116-comprovante-operacional-qrcode-servicos.md` foi criado.
