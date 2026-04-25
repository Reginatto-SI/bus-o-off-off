# 07 — PRD Asaas: Motor de Taxa e Distribuição Financeira

## 1. Objetivo
Definir uma regra **única, previsível e auditável** para:
- cálculo da taxa da plataforma;
- distribuição da taxa entre plataforma, sócio e representante;
- reflexo no split do Asaas;
- reflexo no snapshot financeiro, ledger e relatórios.

## 2. Contexto
Atualmente existem divergências entre comunicação comercial, PRDs legados e comportamento implementado.

Este PRD consolida a **regra oficial de negócio** para evolução do sistema.

## 3. Classificação
- **Criticidade:** Crítica / Financeira
- **Público principal:** Produto, Financeiro, Desenvolvimento, Suporte, Auditoria
- **Risco se quebrar:** divergência de cobrança, split incorreto, comissão incorreta, passivo operacional

## 4. Regra de taxa progressiva (por passageiro)
A taxa deve ser calculada por **valor unitário da passagem** (passageiro a passageiro):

| Valor da passagem | Taxa |
|---|---|
| Até R$ 100 | 6% |
| R$ 100 a R$ 300 | 5% |
| R$ 300 a R$ 600 | 4% |
| Acima de R$ 600 | 3% |

## 5. Teto da taxa
- Aplicar **máximo de R$ 25 por passageiro**.
- O teto é individual e não pode ser aplicado apenas no total da venda.

## 6. Ordem obrigatória de cálculo
Para cada passageiro:
1. Identificar a faixa da passagem;
2. Aplicar o percentual da faixa;
3. Aplicar teto de R$ 25, se necessário;
4. Definir valor final da taxa daquele passageiro.

Após processar todos os passageiros:
- consolidar a **taxa total da venda** como soma das taxas individuais.

## 7. Distribuição da taxa
### 7.1 Cenário A — com representante elegível
Divisão da taxa total em partes iguais:
- 1/3 → plataforma;
- 1/3 → sócio;
- 1/3 → representante.

### 7.2 Cenário B — sem representante elegível
Redistribuição obrigatória:
- 50% → plataforma;
- 50% → sócio.

### 7.3 Regras obrigatórias de conservação
- soma da distribuição deve ser 100% da taxa;
- não pode haver sobra;
- não pode haver perda.

## 8. Elegibilidade do representante
Representante só participa da divisão e do split se:
- estiver vinculado à empresa;
- estiver elegível (status ativo e vínculo válido);
- possuir `wallet_id` válido no ambiente da venda.

Se qualquer requisito falhar:
- representante não entra na divisão;
- aplicar automaticamente regra de distribuição 50/50.

## 9. Integração com Asaas (split)
O split enviado ao Asaas deve refletir exatamente os valores calculados no motor financeiro:
- plataforma: obrigatório;
- sócio: obrigatório;
- representante: condicional por elegibilidade.

Não é permitido enviar split com lógica divergente da regra oficial.

## 10. Snapshot financeiro obrigatório
A venda deve congelar, no momento da criação da cobrança, no mínimo:
- valor unitário da passagem por passageiro;
- faixa aplicada;
- percentual aplicado;
- valor bruto da taxa por passageiro;
- indicador de aplicação de teto;
- valor distribuído para plataforma;
- valor distribuído para sócio;
- valor distribuído para representante;
- valores consolidados da venda.

## 11. Pontos obrigatórios de reutilização da regra
A mesma lógica (sem duplicidade de fórmula) deve ser aplicada em:
- checkout público;
- venda manual;
- `create-asaas-payment`;
- resolvedor de split;
- webhook de confirmação/finalização;
- `verify-payment-status`;
- comissão/ledger de representante;
- relatórios e diagnóstico.

## 12. Regras críticas de governança
- não duplicar cálculo em múltiplos pontos com fórmulas diferentes;
- não permitir override manual fora de regra formal;
- não permitir divergência entre split, snapshot e ledger;
- mudanças futuras só podem ocorrer por revisão deste PRD.

## 13. Auditoria e rastreabilidade
Deve ser possível rastrear por venda e por passageiro:
- faixa aplicada;
- percentual aplicado;
- valor da taxa antes/depois do teto;
- aplicação do teto;
- divisão entre participantes;
- payload de split enviado ao Asaas;
- valores persistidos em snapshot e ledger.

## 14. Cenários mínimos de teste (homologação)
1. R$ 80 → 6% → divisão em 3 partes (quando representante elegível)
2. R$ 200 → 5%
3. R$ 500 → 4%
4. R$ 800 → 3%
5. R$ 1.000 → teto de R$ 25 por passageiro
6. Sem representante elegível → 50/50
7. Com representante elegível → 1/3 cada
8. Split Asaas igual ao cálculo do motor
9. Comissão/ledger igual ao split efetivo

## 15. Proibições
- não usar percentual fixo único por empresa como substituto do motor progressivo;
- não manter regra antiga de dominância da plataforma fora da divisão oficial;
- não ignorar ausência de representante sem redistribuição automática;
- não manter fórmulas paralelas entre fluxos.

## 16. Resultado esperado
- regra única e centralizada;
- cálculo previsível por passageiro;
- split coerente com o cálculo;
- comissão/ledger coerentes;
- auditoria confiável ponta a ponta.
