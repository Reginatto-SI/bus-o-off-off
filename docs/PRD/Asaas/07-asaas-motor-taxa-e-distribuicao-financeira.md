# 07 — PRD Asaas: Motor de Taxa e Distribuição Financeira

> **Documento de integração e referência.**
>
> A regra financeira normativa vigente está em:
> `../PRD 01 — Regra Oficial de Divisão da Taxa entre Marketplace, Sócio e Representante.txt`
>
> Este arquivo não deve manter fórmulas paralelas nem critérios próprios de elegibilidade. Em caso de divergência, prevalece o PRD normativo acima.

## 1. Objetivo

Documentar como o motor financeiro do fluxo Asaas deve consumir a regra oficial de taxa e distribuição, sem criar uma segunda regra de negócio.

## 2. Regra de ouro

O cálculo usado em checkout, venda manual, snapshot, split Asaas, diagnóstico e ledger deve ser o mesmo definido no PRD financeiro normativo.

## 3. Pontos que devem permanecer convergentes

- cálculo por item/passagem;
- mínimo e teto;
- distribuição entre Marketplace, Sócio e Representante;
- tratamento de wallet ausente por ambiente;
- snapshot financeiro;
- payload efetivamente enviado ao gateway;
- logs e diagnóstico;
- ledger de representante.

## 4. Proibições

- não duplicar fórmula financeira neste documento;
- não criar critério próprio de elegibilidade;
- não bloquear venda por regra histórica já substituída;
- não alterar divisão financeira sem atualizar primeiro o PRD normativo;
- não considerar este arquivo como fonte superior ao PRD financeiro oficial.

## 5. Referências

- `../PRD 01 — Regra Oficial de Divisão da Taxa entre Marketplace, Sócio e Representante.txt`
- `04-asaas-split-comissoes-e-representantes.md` — documento histórico/operacional
- `00-asaas-indice-geral.md`
