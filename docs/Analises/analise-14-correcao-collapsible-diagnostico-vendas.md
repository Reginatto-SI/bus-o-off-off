# Correção mínima — Collapsible em `/admin/diagnostico-vendas`

## Objetivo

Restaurar com a menor mudança segura o fluxo de abertura dos detalhes da venda na tela administrativa `/admin/diagnostico-vendas`, eliminando o runtime error `CollapsibleTrigger is not defined` sem alterar layout, regras multiempresa ou comportamento entre sandbox e produção.

## Causa raiz identificada

- O componente `src/pages/admin/SalesDiagnostic.tsx` renderizava três blocos de payload técnico com `Collapsible`, `CollapsibleTrigger` e `CollapsibleContent`.
- Esses símbolos eram usados diretamente no JSX da aba "Payloads Técnicos", mas **não estavam importados** no arquivo.
- O mesmo arquivo também renderizava `ChevronDown` nesses gatilhos e o ícone também não estava importado.
- Como o JSX era executado ao abrir os detalhes da venda, a referência ausente disparava `ReferenceError` em runtime e podia gerar tela em branco.

## Arquivo(s) alterado(s)

- `src/pages/admin/SalesDiagnostic.tsx`
- `analise-14-correcao-collapsible-diagnostico-vendas.md`

## Correção aplicada

- Adicionados os imports faltantes de `Collapsible`, `CollapsibleTrigger` e `CollapsibleContent` a partir de `@/components/ui/collapsible`.
- Adicionado o import faltante do ícone `ChevronDown` em `lucide-react`.
- Incluídos comentários curtos no ponto de uso para registrar:
  - a causa do runtime;
  - que a solução manteve o padrão consolidado já existente no projeto.

## Por que essa foi a menor correção segura

- O projeto **já possui** wrapper oficial de `Collapsible` em `src/components/ui/collapsible.tsx`.
- O próprio admin já usa esse mesmo padrão em `FilterCard` e `AsaasDiagnosticPanel`.
- Portanto, não havia evidência de padrão removido, API quebrada ou necessidade de refatorar a aba de detalhes.
- A falha era estritamente de referência/import ausente, então corrigir os imports preserva:
  - card/listagem;
  - menu de ações `...`;
  - trilha operacional;
  - compatibilidade entre ambientes;
  - escopo multiempresa existente.

## Risco residual

- Baixo.
- O risco residual fica limitado a dados ausentes vindos do backend nos blocos já existentes de detalhes, mas a correção atual não amplia esse risco; apenas restaura a renderização do padrão já implementado.

## Checklist de validação executado

1. Localizado o uso exato de `CollapsibleTrigger` em `src/pages/admin/SalesDiagnostic.tsx`.
2. Confirmado que a causa raiz era **import ausente**, não troca de arquitetura ou componente removido.
3. Verificado no projeto o padrão consolidado de `Collapsible` em:
   - `src/components/admin/FilterCard.tsx`
   - `src/components/admin/AsaasDiagnosticPanel.tsx`
   - `src/components/ui/collapsible.tsx`
4. Aplicada a correção mínima no componente da tela.
5. Executado build para validar TypeScript/bundle sem erro novo.
6. Validado que não houve alteração em queries, `company_id`, RLS ou regras de ambiente.

## Próximos passos

- Nenhum passo adicional é necessário para este bug, além de validação manual da interação na rota `/admin/diagnostico-vendas` em ambiente de preview/admin.
