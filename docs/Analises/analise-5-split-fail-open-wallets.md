# Análise 5 — Split fail-open para wallets internas (sócio/representante)

## 1) Diagnóstico atual

### Escopo investigado
- `supabase/functions/create-asaas-payment/index.ts`
- `supabase/functions/_shared/split-recipients-resolver.ts`
- `supabase/functions/_shared/payment-context-resolver.ts`
- PRDs de referência:
  - `docs/PRD/Asaas/07-asaas-motor-taxa-distribuicao-financeira.md`
  - `docs/PRD/Asaas/04-asaas-split-comissoes-e-representantes.md`

### Fluxo real de criação da cobrança
1. `create-asaas-payment` resolve contexto financeiro, calcula distribuição e chama `resolveAsaasSplitRecipients` duas vezes (pré-resolução e resolução final).
2. O payload enviado ao Asaas sempre inclui `split` com os recebedores válidos encontrados (`splitArray`).
3. A cobrança é enviada para `POST /payments` no Asaas após a resolução do split.

### Resultado da pergunta crítica
**Venda pode ser bloqueada por ausência de wallet do sócio/representante?**
- **Sócio sem wallet:** **não bloqueia**. O resolver move o percentual para plataforma (`platformPercent`) e mantém a venda.
- **Representante sem wallet:** **não bloqueia**. O resolver redistribui automaticamente (1/2 para sócio quando elegível + 1/2 para plataforma; ou 100% plataforma quando sócio indisponível) e mantém a venda.
- **Sem representante na venda:** **não bloqueia**. O resolver trata como `missing_sale_representative` e redistribui.

## 2) Pontos de bloqueio encontrados

### Não encontrados para ausência de wallet interna (sócio/representante)
- Não há `throw` para `split_socio_wallet_missing` ou `representative_wallet_missing`.
- Esses casos são tratados com fallback de percentual para plataforma/sócio e retorno normal.

### Bloqueios existentes (fora da regra de wallet interna)
- `missing_platform_wallet` → retorna erro 500 e aborta criação da cobrança.
- `split_socio_query_failed` (falha de consulta DB) → retorna erro 500.
- `missing_distribution_percentages`/outros erros de resolução → retorno de erro 409.

> Esses bloqueios são de infraestrutura/configuração global e não de ausência de wallet de sócio/representante.

## 3) Comportamento atual do sistema

### Split resolver (`_shared/split-recipients-resolver.ts`)
- Sócio inválido/sem wallet: remove sócio do split e adiciona percentual à plataforma.
- Representante indisponível/inválido/sem wallet: chama redistribuição fail-open.
- Lista final de recebedores é parcial por design (apenas válidos).

### Create payment (`create-asaas-payment`)
- Prossegue com `splitArray` parcial.
- Em cenário extremo de indisponibilidade de sócio e representante, o split efetivo fica concentrado na plataforma.

## 4) Correção aplicada

### Objetivo da correção
Melhorar auditabilidade e evidência operacional da regra fail-open sem alterar o motor financeiro.

### Alteração mínima implementada
Arquivo alterado: `supabase/functions/create-asaas-payment/index.ts`

Foram adicionados logs explícitos:
- `socio_wallet_missing_repass_pending`
- `representative_wallet_missing_repass_pending`
- `split_fail_open_applied`

### Sem mudanças de regra financeira
- Não houve alteração na distribuição base (1/3, 1/3, 1/3 e fallback 50/50).
- Não houve alteração em webhook, verify ou cálculo do motor.
- Não houve nova arquitetura.

## 5) Arquivos alterados
- `supabase/functions/create-asaas-payment/index.ts`
- `docs/Analises/analise-5-split-fail-open-wallets.md`

## 6) Impacto no fluxo
- **Funcional:** comportamento de venda permanece fail-open para ausência de wallet interna.
- **Operacional:** agora os cenários de pendência de repasse ficam explicitamente rastreáveis por log.
- **Risco de regressão:** baixo (mudança localizada e sem alterar contratos/payload de cobrança).

## 7) Riscos remanescentes
- Falha de consulta ao banco para resolver sócio (`split_socio_query_failed`) ainda bloqueia venda (não é ausência de wallet; é falha de infraestrutura).
- `missing_platform_wallet` ainda bloqueia (wallet operacional da plataforma é requisito técnico para enviar split de taxa).

## 8) Testes realizados
1. Revisão estática do fluxo `create-asaas-payment` e resolver central de split.
2. Validação de que os casos de wallet ausente caem em caminhos de fallback sem `throw`.
3. Verificação de compilação/lint do arquivo alterado.

## Resposta objetiva (Etapa 2)
- **Venda pode ser bloqueada hoje por falta de wallet de sócio/representante?** **Não**.
- **Onde isso é garantido?** No resolver de split central, via fallback de percentuais e retorno com lista parcial de recebedores.
- **Qual regra evita o bloqueio?** Fail-open com redistribuição para plataforma/sócio válido.
- **Impacto real no fluxo de venda:** cobrança segue sendo criada com split parcial (ou concentrado na plataforma), sem perda de venda por wallet interna ausente.
