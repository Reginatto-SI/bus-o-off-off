# Dúvidas abertas — Mercado Pago Marketplace

**Regra:** `aberta`, `respondida com evidência` ou `não aplicável`. Resposta verbal não fecha item.
**Referências:** [Fase 6](./15-fase-6-avaliacao-marketplace-1-n.md) · [riscos](./23-mercado-pago-registro-riscos.md)

## 1. Marketplace 1:N e split

| ID | Pergunta | Classe | Evidência exigida | Status |
|---|---|---|---|---|
| Q-1N-01 | 1:N é oferecido no Brasil ao SmartBus e em quais checkouts? | bloqueante | contrato + documentação | aberta |
| Q-1N-02 | Máximo de recebedores inclui vendedor, SmartBus, sócio e representante? | bloqueante | contrato de API/teste | aberta |
| Q-1N-03 | Aceita valores fixos em centavos e qual regra de resíduo? | bloqueante | documentação + sandbox | aberta |
| Q-1N-04 | Beneficiário opcional/sem conta pode ser omitido sem bloquear venda? | bloqueante | documentação + teste | aberta |
| Q-1N-05 | Sócio global pode receber em vendas de múltiplos sellers? | bloqueante | parecer MP | aberta |
| Q-1N-06 | Quem precisa OAuth e KYC? | bloqueante | requisitos oficiais | aberta |
| Q-1N-07 | Quais meios/parcelamentos/checkouts suportam 1:N? | bloqueante | matriz oficial | aberta |

## 2. Estorno, chargeback e tarifas

| ID | Pergunta | Classe | Evidência exigida | Status |
|---|---|---|---|---|
| Q-REV-01 | Como refund total reverte cada parcela e tarifa? | bloqueante | documentação + teste | aberta |
| Q-REV-02 | Refund parcial permite escolher/alocar participantes? | bloqueante | contrato + sandbox | aberta |
| Q-REV-03 | Quem responde e é debitado no chargeback? | bloqueante | contrato | aberta |
| Q-REV-04 | O que ocorre se participante não tiver saldo? | bloqueante | contrato operacional | aberta |
| Q-REV-05 | Tarifas são descontadas antes/depois do split e são restituídas? | bloqueante | relatório/API | aberta |
| Q-REV-06 | Quais eventos, prazos, retries e ordem são garantidos? | importante | documentação webhook | aberta |

## 3. OAuth e segurança

| ID | Pergunta | Classe | Evidência exigida | Status |
|---|---|---|---|---|
| Q-OA-01 | PKCE é suportado/exigido para este fluxo? | importante | doc oficial | aberta |
| Q-OA-02 | Scopes, TTL, rotação de refresh e revogação? | bloqueante | doc oficial | aberta |
| Q-OA-03 | Uma conta pode conectar-se a mais de empresa/app? | bloqueante | regra oficial | aberta |
| Q-OA-04 | Como separar usuários/credenciais teste e produção? | bloqueante | doc + sandbox | aberta |
| Q-OA-05 | Como validar identidade/saúde da conta conectada? | importante | endpoints oficiais | aberta |

## 4. Comercial, contrato e operação

| ID | Pergunta | Classe | Evidência exigida | Status |
|---|---|---|---|---|
| Q-COM-01 | Volume mínimo, aprovação e prazo de habilitação 1:N? | bloqueante | proposta comercial | aberta |
| Q-COM-02 | Custos por produto, split, refund, chargeback e saque? | bloqueante | proposta comercial | aberta |
| Q-COM-03 | SLA, rate limits e canal de incidente? | importante | contrato/SLA | aberta |
| Q-COM-04 | Relatórios/API permitem conciliar por participante? | bloqueante | amostra + documentação | aberta |
| Q-COM-05 | Ambiente de teste reproduz todos os participantes/eventos? | bloqueante | acesso/teste | aberta |
| Q-COM-06 | Responsabilidades regulatórias/contratuais de cada parte? | bloqueante | pareceres/contrato | aberta |

## 5. Dúvidas internas SmartBus

- Qual cenário financeiro é elegível para piloto se 1:N não for aprovado?
- Qual é a matriz oficial de cancelamento/refund parcial por passagem?
- Qual solução de secrets e política de retenção serão aprovadas?
- Quem possui autoridade de go/no-go, incidente e reconciliação?
- Há aprovação jurídica/contábil/financeira para sequer estudar repasse interno?

## Critério de fechamento

Registrar link/versão/data, país/produto/ambiente, responsável e impacto em ADR, risco, backlog e PRD. Se evidências conflitarem, a dúvida permanece aberta.
