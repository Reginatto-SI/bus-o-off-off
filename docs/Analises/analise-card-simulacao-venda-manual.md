# Análise — Card `CalculationSimulationCard` na venda manual

## 1) Diagnóstico do componente atual

### Sintoma observado
Na tela `/admin/vendas` → **Nova Venda** (aba **Venda Manual**), quando há passageiros com tipos de passagem de preços diferentes, o card **Simulação de cálculo** pode exibir um valor unitário médio em “Preço por passagem”, enquanto o **Resumo financeiro da venda** exibe o subtotal real por passageiro/tipo.

### Onde ocorre
- Componente compartilhado: `src/components/admin/CalculationSimulationCard.tsx`.
- Uso no fluxo de venda manual: `src/components/admin/NewSaleModal.tsx`.

### Evidência no código
O `CalculationSimulationCard` foi modelado com contrato centrado em `basePrice` numérico único:

```ts
interface CalculationSimulationCardProps {
  basePrice: number;
  fees: EventFeeInput[];
  quantity?: number;
  showSaleTotals?: boolean;
  ...
}
```

Internamente, no modo agregado (`showSaleTotals = true`), ele calcula:
- `subtotal = basePrice * quantity`
- `totalFees = totalAdditionalFeesRounded * quantity`
- `totalSale = customerTotal * quantity`

Ou seja, a fórmula assume **preço base unitário homogêneo** (único) para multiplicação pela quantidade.

### Causa provável da divergência
A divergência não está apenas em “valor errado”, mas no **modelo de exibição**:
- o card foi projetado para trabalhar com um `basePrice` único;
- no cenário de múltiplos tipos (Adulto + Criança), não existe um único preço unitário real;
- para forçar subtotal real em layout atual, pode-se usar média (`subtotal / quantidade`), o que mantém aritmética, mas gera semântica confusa (“Preço por passagem” vira média implícita).

---

## 2) Lista de telas onde o componente é usado

Mapeamento por busca de referência direta (`rg -n "CalculationSimulationCard" src`):

1. `src/pages/admin/Events.tsx`
   - uso na configuração/simulação financeira do evento (preço unitário do evento).
2. `src/components/admin/NewSaleModal.tsx`
   - uso na etapa de pagamento da venda manual.
3. Definição do componente:
   - `src/components/admin/CalculationSimulationCard.tsx`

Não foram encontradas outras telas no `src` consumindo esse componente diretamente.

---

## 3) Para que o componente foi desenhado (análise de intenção)

Pelos cálculos e pelo contrato atual, o componente atende muito bem cenários de:

1. **Preço unitário único** por passagem (ex.: evento com `unit_price` padrão).
2. **Múltiplos passageiros com mesmo preço** (multiplicação linear por `quantity`).
3. **Modo agregado** com totais da venda, desde que o preço unitário continue homogêneo.

Ele **não representa nativamente** um mix de preços heterogêneos por passageiro/tipo no campo “Preço por passagem”.

---

## 4) Riscos de alteração do componente compartilhado

### Impacto potencial em `/admin/eventos`
No `Events.tsx`, o componente recebe `basePrice={parseCurrencyInputBRL(form.unit_price)}` e funciona como simulação de preço unitário de evento. Alterar sem cuidado o significado de `basePrice` ou layout pode quebrar entendimento/consistência dessa tela.

### Riscos técnicos
1. **Quebra de contrato implícito**: hoje `basePrice` = valor unitário real exibível.
2. **Regressão visual** em telas que esperam “Passagem/Preço por passagem” singular.
3. **Regressão financeira de UI** se alterar fórmulas sem manter equivalência com cálculo atual.
4. **Ambiguidade de labels**: campos atuais podem ficar semanticamente incorretos em cenários heterogêneos.

Conclusão de risco: modificar o comportamento global do componente sem feature-flag/prop específico aumenta chance de regressão fora da venda manual.

---

## 5) Como o card calcula hoje (fórmula atual)

Com base em `src/components/admin/CalculationSimulationCard.tsx`:

1. **Taxas ativas**: filtra `fees` por `is_active`.
2. **Taxa adicional por passagem**:
   - percentual: `(basePrice * fee.value) / 100`
   - fixa: `fee.value`
3. **Total de taxas por passagem**: soma e arredonda em 2 casas.
4. **Bruto por passagem**: `grossPerTicket = basePrice + totalAdditionalFeesRounded`.
5. **Taxa da plataforma** (quando percentual válido):
   - `platformFee = grossPerTicket * (platformFeePercent / 100)`
6. **Total cliente por passagem**:
   - se repasse ao cliente: `grossPerTicket + platformFee`
   - senão: `grossPerTicket`
7. **Líquido organizador por passagem**:
   - se repasse ao cliente: `grossPerTicket`
   - senão: `grossPerTicket - platformFee`
8. **Modo agregado (`showSaleTotals`)**:
   - `subtotal = basePrice * quantity`
   - `totalFees = totalAdditionalFeesRounded * quantity`
   - `totalSale = customerTotal * quantity`
   - `totalPlatformFee = platformFee * quantity`
   - `totalOrganizerNet = organizerNet * quantity`
9. **Override de taxa da plataforma**:
   - `platformFeeAmountOverride` substitui o valor exibido da taxa de plataforma.

Observação: mesmo com override da taxa de plataforma, o label “Preço por passagem” continua vindo de `basePrice`.

---

## 6) Causa da divergência no fluxo de venda manual

No `NewSaleModal` existem dois blocos financeiros diferentes:

1. **Resumo financeiro da venda** (`adminCheckoutSummary`)
   - soma snapshots reais por passageiro (`original_price`, `final_price`).
   - compatível com tipos de passagem e benefícios por passageiro.

2. **Simulação de cálculo** (`CalculationSimulationCard`)
   - depende de `basePrice` unitário para renderizar “Preço por passagem” e derivar subtotal via multiplicação.

Quando há preços diferentes entre passageiros, não há “um preço por passagem” real único. Se usar fallback base do evento, fica errado. Se usar média, a matemática fecha, mas a comunicação pode confundir.

---

## 7) Alternativas de solução (sem implementar nesta tarefa)

### Alternativa A — Adaptar o componente com modo heterogêneo controlado por prop
Adicionar prop opcional (ex.: `lineItems` ou `isMixedPricing`) para:
- trocar label de “Preço por passagem” para algo neutro (ex.: “Composição de passagens”);
- exibir breakdown por tipo (ex.: `Adulto 1x89`, `Criança 1x36`);
- manter layout atual para usos antigos quando prop não for enviada.

**Prós:** reaproveita componente, menor duplicação.
**Contras:** aumenta complexidade do componente compartilhado.

### Alternativa B — Variação visual no uso da venda manual (sem novo componente)
No `NewSaleModal`, quando detectar preços heterogêneos:
- manter `CalculationSimulationCard` para taxas/totais;
- esconder/substituir apenas a linha “Preço por passagem” com bloco textual existente na própria tela (detalhe por tipo).

**Prós:** mudança local, baixo risco em `/admin/eventos`.
**Contras:** requer ajuste condicional de UI no ponto de uso.

### Alternativa C — Resumo específico da venda manual reutilizando estruturas existentes
Usar o bloco de resumo financeiro já existente como base principal e deixar a simulação apenas para taxas/plataforma, removendo semântica de unitário quando houver mix.

**Prós:** foco no valor real da venda.
**Contras:** pode reduzir padronização visual entre telas.

---

## 8) Recomendação da melhor abordagem

### Recomendação principal (segura e simples)
**Alternativa B**: ajuste **local no `NewSaleModal`**, sem alterar contrato global do `CalculationSimulationCard` inicialmente.

Motivos:
1. Menor risco de regressão em `/admin/eventos`.
2. Respeita restrição de não quebrar usos existentes.
3. Resolve dor de UX (evitar média como “preço real”) com mudança mínima.
4. Permite evolução futura do componente somente se necessário e validado.

### Diretriz funcional para o estado heterogêneo
Quando detectar mais de um preço de tipo de passagem na venda manual:
- não exibir “Preço por passagem” como valor único real;
- exibir composição por tipo/quantidade;
- manter subtotal, taxa de serviço, total da venda e taxa da plataforma coerentes com o total real.

---

## 9) Perguntas pendentes

1. Em cenário heterogêneo, o produto aceita renomear o label de “Preço por passagem” para algo neutro na venda manual?
2. O detalhamento esperado deve agrupar por **tipo de passagem** (Adulto/Criança) ou listar por **passageiro**?
3. Em caso de benefícios aplicados por CPF, o detalhamento deve mostrar preço original + preço final por tipo/passageiro no mesmo card?
4. A “Taxa de serviço” no card deve ser sempre derivada do subtotal final (após benefício) ou do original por política atual?
5. Para venda manual, o bloco de simulação deve priorizar clareza operacional mesmo que fique levemente diferente do layout de `/admin/eventos`?

---

## Evidências coletadas (arquivos/funções)
- `src/components/admin/CalculationSimulationCard.tsx`
- `src/components/admin/NewSaleModal.tsx`
- `src/pages/admin/Events.tsx`
- Comando de mapeamento de uso: `rg -n "CalculationSimulationCard" src`
