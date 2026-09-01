# Regras financeiras SmartBus

## Fonte normativa e separação

A fonte normativa vigente é `docs/PRD/PRD 01 — Regra Oficial de Divisão da Taxa entre Marketplace, Sócio e Representante.txt`, cujo título interno é **PRD 01 — Regra Oficial de Taxa da Plataforma, Base de Cálculo e Divisão entre Marketplace, Sócio e Representante** e cuja atualização normativa de 2026-07-30 substitui critérios históricos. O PRD Asaas 04 se declara histórico; o PRD Asaas 07 não substitui a atualização posterior do PRD 01 oficial. Revalidar migrations/código porque a implementação pode divergir da regra normativa; documentar, não corrigir silenciosamente.

Estas são regras SmartBus, não do Asaas:

- resolver o valor financeiro individual de cada passagem/item, separar taxas adicionais da empresa e escolher a faixa: até R$100 = 6%; acima de R$100 até R$300 = 5%; acima de R$300 até R$600 = 4%; acima de R$600 = 3%; o total da venda nunca escolhe a faixa;
- taxa adicional pode compor a cobrança, mas por padrão não altera base, faixa, taxa SmartBus ou divisão;
- aplicar teto de R$25 em cada passagem/item, somar as taxas e então aplicar o mínimo operacional de R$5 sobre a taxa total;
- calcular a taxa total antes da divisão; a divisão nunca altera essa taxa total;
- conservar 100% da taxa, com arredondamento determinístico sem sobra/perda;
- o sócio é global da plataforma, não pertence à empresa cliente e nunca deve ser filtrado por `company_id`; sua única condição operacional de recebimento é wallet válida no ambiente da venda, sem completar sandbox com produção ou vice-versa;
- o representante pertence à empresa vendedora e recebe somente com vínculo comprovado e wallet válida no ambiente da venda; sem wallet no ambiente, é tratado como ausente;
- congelar faixa, percentual, bruto, teto, destinatários e consolidados em snapshot;
- manter split efetivo, snapshot, ledger e relatórios reconciliáveis.

## Quatro cenários oficiais de divisão

| Sócio com wallet válida no ambiente | Representante da empresa com vínculo comprovado e wallet válida no ambiente | Marketplace | Sócio | Representante |
|---|---|---:|---:|---:|
| Sim | Sim | 1/3 | 1/3 | 1/3 |
| Sim | Não | 1/2 | 1/2 | 0 |
| Não | Sim | 2/3 | 0 | 1/3 |
| Não | Não | 100% | 0 | 0 |

Wallet ausente nunca bloqueia a venda por si só. A parcela do sócio ausente é redirecionada ao Marketplace; o representante confirmado preserva seu 1/3. Representante sem wallet válida é tratado como ausente e a tabela define o redirecionamento. Wallet realmente ausente aplica o cenário sem criar dívida. Falha de consulta ou ambiguidade não deve ser confundida com ausência comprovada: registrar degradação e pendência de conciliação conforme o PRD.

`platform-fee-engine.ts` e `split-recipients-resolver.ts` são os pontos centrais atuais. `representative_commissions` é o ledger identificado. `socios_split` representa o sócio global; `company_id` é legado e não pode ser usado para filtrá-lo. Campos `platform_fee_total` e `platform_fee_amount` coexistem por compatibilidade histórica e exigem cuidado.

## Mecanismo monetário atual do Asaas

A regra acima produz valores absolutos em reais e pertence ao SmartBus BR; `walletId` e os campos de split são mecanismos Asaas. Em cobrança avulsa que exige montante exato, usar `fixedValue` com duas casas. Em parcelamento com duas ou mais parcelas, usar `totalFixedValue` para o total comercial destinado a cada wallet; `fixedValue` nesse caso significa valor **por parcela**. Não converter a parcela monetária em `percentualValue`: no Asaas esse campo incide sobre o líquido após tarifas e não preserva o valor comercial aprovado. A wallet da conta emissora não entra no array: o não transferido permanece na emissora. Envio no payload não prova liquidação; conciliar resposta, status e valor efetivo.

## Gateway sem capacidade equivalente

Não alterar fórmula para caber na API. Avaliar, nesta ordem:

1. split completo nativo;
2. split parcial + ledger para partes não liquidadas;
3. sem split + ledger interno e liquidação manual/externa, conforme decisão aprovada;
4. bloqueio do gateway para o cenário se integridade/auditoria não puder ser preservada.

Marcar `CAPABILITY GAP` se recebedores, múltiplos splits, arredondamento, mínimo, moeda, timing de liquidação, estorno de repasses ou ambiente não reproduzirem a obrigação. Exigir decisão humana para mudar liquidação ou risco financeiro.

## Homologação financeira

Testar limites R$100/R$101, R$300/R$301, R$600/R$601; taxa abaixo/igual/acima de R$5; item abaixo/igual/acima do teto de R$25; múltiplos itens/faixas; taxa adicional sem mudança da base; os quatro cenários oficiais; representante sem wallet; sócio sem wallet; ambos sem wallet; sandbox/produção sem complementação; cobrança avulsa com `fixedValue`; parcelamento com `totalFixedValue`; split do payload = snapshot = ledger; confirmação duplicada; cancelamento/estorno/chargeback. Não aprovar apenas pelo payload: reconciliar retorno e registros internos.
