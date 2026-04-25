# Fechamento de ambiguidades — `/admin/diagnostico-vendas`

## Objetivo

Responder de forma objetiva às ambiguidades restantes sobre a tela `/admin/diagnostico-vendas`, sem corrigir o código ainda, para definir a menor correção possível com base no comportamento real implementado hoje.

## Escopo verificado

Arquivos principais inspecionados:
- `src/pages/admin/SalesDiagnostic.tsx`
- `src/contexts/AuthContext.tsx`
- `src/components/layout/AdminHeader.tsx`
- `src/hooks/use-runtime-payment-environment.ts`
- `src/App.tsx`
- `src/components/layout/AdminSidebar.tsx`
- `src/pages/admin/SalesReport.tsx`
- `src/pages/admin/Events.tsx`
- `src/pages/admin/Sales.tsx`
- `src/integrations/supabase/types.ts`

## Comandos e checagens executados

### Código
- `nl -ba src/pages/admin/SalesDiagnostic.tsx | sed -n '300,430p'`
- `nl -ba src/pages/admin/SalesDiagnostic.tsx | sed -n '810,1085p'`
- `nl -ba src/pages/admin/SalesDiagnostic.tsx | sed -n '1220,1605p'`
- `rg -n "slice\(|paginate|page|range\(|group|collapse|salesWithOperationalView.map" src/pages/admin/SalesDiagnostic.tsx`
- `rg -n "Developer: cross-company|cross-company|!isDeveloper && activeCompanyId" src/pages/admin src/contexts src/components`
- `nl -ba src/pages/admin/SalesReport.tsx | sed -n '186,210p'`
- `nl -ba src/pages/admin/Events.tsx | sed -n '1000,1045p'`
- `nl -ba src/pages/admin/Sales.tsx | sed -n '448,520p'`
- `nl -ba src/integrations/supabase/types.ts | sed -n '1225,1246p'`

### Reprodução local do pipeline da tela
Foi executado um script local em Python, sem alterar o repositório, reproduzindo fielmente o pipeline da tela com filtros padrão:
1. autenticação no Supabase com o usuário informado;
2. query `sales` com `order(created_at desc)` e `limit(100)`;
3. enriquecimento por `tickets` e `seat_locks`;
4. aplicação dos filtros client-side padrão (`gateway=all`, `paymentStatus=all`);
5. ordenação final local por prioridade do diagnóstico + `created_at desc`.

Resultado objetivo do script para a venda `30400fef-99fe-4418-8357-7085b000c823` no momento da checagem:

```json
{
  "raw_count": 99,
  "raw_contains_sale": true,
  "raw_index": 1,
  "filtered_count": 99,
  "filtered_contains_sale": true,
  "filtered_index": 1,
  "rendered_count": 99,
  "rendered_contains_sale": true,
  "rendered_index": 46,
  "rendered_sale_snapshot": {
    "id": "30400fef-99fe-4418-8357-7085b000c823",
    "company_id": "a0000000-0000-0000-0000-000000000001",
    "company_name": "Empresa Padrão (Teste)",
    "status": "cancelado",
    "payment_environment": "sandbox",
    "asaas_payment_status": "PENDING",
    "payment_status_label": "Pagamento aguardando confirmação"
  }
}
```

## Respostas objetivas às 8 perguntas

## 1. A venda estava na grade ou ficou fora do array final renderizado?

### Resposta objetiva
**Ela estava no array final renderizado.**

### Evidência
Pelo script que reproduziu a lógica da tela com filtros padrão no momento da análise:
- entrou no resultado bruto da query `sales`: **sim** (`raw_contains_sale = true`, `raw_index = 1`);
- entrou no array após filtros client-side: **sim** (`filtered_contains_sale = true`, `filtered_index = 1`);
- entrou no array final renderizado: **sim** (`rendered_contains_sale = true`, `rendered_index = 46`).

### Interpretação conservadora
A evidência disponível neste momento aponta que a venda **não foi excluída do pipeline da tela**. O mais provável é que ela tenha passado despercebida visualmente ou sido interpretada de forma errada pelo resumo da linha.

### Limite da evidência
Eu **não capturei a tela no navegador** nesta etapa, então não posso provar visualmente se o operador rolou até a linha. Mas no pipeline de dados/renderização, ela estava presente.

## 2. Existe paginação virtual, slice, agrupamento ou limitação visual adicional depois da query?

### Resposta objetiva
**Não.** Depois da query principal, não existe paginação local, `.slice()`, agrupamento, accordion de linhas nem condição extra que remova a linha da tabela.

### O que existe de fato
1. a query faz `limit(100)`;
2. depois há enriquecimento com `tickets` e `seat_locks`;
3. depois há filtros client-side de `gateway` e `paymentStatus`;
4. depois há **ordenação local** por prioridade do diagnóstico e, em empate, `created_at desc`;
5. a renderização usa `salesWithOperationalView.map(...)` diretamente em toda a tabela.

### Consequência prática
A venda pode ser deslocada para baixo pela ordenação local, mas não é cortada por paginação visual adicional.

## 3. O filtro “Status Pagamento” usa exatamente qual função e quais regras?

### Função usada
A UI usa exatamente `computePaymentStatus(sale)`.

### Labels possíveis gerados hoje
- `Pagamento confirmado`
- `Pagamento aguardando confirmação`
- `Pagamento expirado`
- `Pagamento estornado`
- `Pagamento cancelado`
- `Pagamento confirmado manualmente`
- `Sem pagamento ativo`
- `Pagamento aguardando confirmação manual`
- `Pagamento em processamento`
- `Sem dados suficientes de pagamento`

### Como o select “Status Pagamento” agrupa esses labels
- `aguardando`:
  - `Pagamento aguardando confirmação`
  - `Pagamento aguardando confirmação manual`
  - `Pagamento em processamento`
- `pago`:
  - `Pagamento confirmado`
  - `Pagamento confirmado manualmente`
- `falhou`:
  - `Pagamento expirado`
  - `Pagamento estornado`
  - `Pagamento cancelado`

### Caso exato pedido
Para uma venda com:
- `status = cancelado`
- `asaas_payment_status = PENDING`
- `asaas_payment_id` preenchido

A função retorna **`Pagamento aguardando confirmação`**, porque ela testa `asaas_payment_status === 'PENDING'` antes de olhar o `sale.status` cancelado.

### Consequência prática
Essa venda:
- **não entra** no grupo `falhou`;
- **entra** no grupo `aguardando`;
- e visualmente pode parecer “cobrança ainda em aberto”, mesmo que `sale_integration_logs` já indiquem confirmação com falha parcial.

## 4. O card/linha pode ficar com empresa vazia ou incorreta por falha no join com `companies`?

### Resposta objetiva
**Pode ficar sem nome, mas não some da grade por isso.**

### Evidência no código
- A query usa `company:companies(name)`.
- O schema tipado mostra relação `sales_company_id_fkey -> companies.id`.
- No mapeamento, a UI trata `company` nulo com fallback: `company_name: s.company?.name ?? '-'`.

### Conclusão
- Se o join não resolver `company`, a venda **continua no array**.
- A UI **não quebra** por `company = null`; ela cai para `'-'`.
- Além disso, a grade principal **nem exibe o nome da empresa na linha**, só no detalhe. Então uma falha de join com `companies` não explica ausência visual da linha; no máximo piora a auditabilidade.

## 5. O modo developer ignorar empresa ativa foi decisão intencional ou atalho técnico?

### Resposta objetiva
**Há indício forte de decisão intencional local, mas não de padrão geral do admin.**

### Evidência a favor de “intencional local”
Há comentários explícitos no código:
- `AuthContext`: `Developer cross-company: buscar TODAS as empresas ativas`
- `SalesDiagnostic`: `Developer: cross-company. Others: filter by active company.`

Isso mostra que o comportamento não é acidental no arquivo; foi escrito deliberadamente.

### Evidência contra ser “padrão geral do admin”
Outras telas relevantes seguem o padrão oposto e respeitam `activeCompanyId` mesmo para developer:
- `SalesReport`
- `Events`
- `Sales`

### Conclusão objetiva
`/admin/diagnostico-vendas` está **fora do padrão predominante** do admin. Então, embora o código local pareça intencional, o comportamento tem cara de **atalho técnico específico dessa tela**, não de regra consolidada do sistema administrativo inteiro.

## 6. O badge global “Sandbox” do header influencia alguma query ou é só visual?

### Resposta objetiva
**É 100% visual para esta tela.**

### Evidência
- O header usa `useRuntimePaymentEnvironment()` apenas para ler `isSandbox` e exibir o badge.
- `SalesDiagnostic` não consome `environment`, `source`, `isSandbox` ou qualquer valor desse hook.
- Nenhuma query de `SalesDiagnostic` depende do badge do header.

### Conclusão
O badge global “Sandbox” **não interfere em query nenhuma** da tela `/admin/diagnostico-vendas`; ele apenas altera a aparência/semântica percebida no header.

## 7. A grade principal deveria continuar baseada em `sales` ou incorporar resumo de `sale_integration_logs`?

### Resposta arquitetural pedida
Pelo **código atual**, a intenção real da tela é:
- **diagnóstico funcional/operacional da venda**, baseado em `sales`;
- com enriquecimento operacional secundário por `tickets` e `seat_locks`;
- e com diagnóstico técnico detalhado relegado ao modal via `sale_integration_logs`.

### O que “diagnóstico de vendas” significa hoje no código
Hoje significa algo como:
- “estado resumido da venda e do pagamento conforme persistido em `sales`”,
- não “monitor técnico completo da integração”.

### A nomenclatura está coerente?
**Parcialmente.**
- Se o objetivo for diagnóstico funcional: o nome ainda passa.
- Se o objetivo operacional esperado pelo time inclui detectar incidentes reais de pagamento/webhook/finalização já persistidos nos logs, então o nome **superpromete** mais do que a grade entrega hoje.

### Conclusão conservadora
Eu **não trocaria a fonte primária da grade neste primeiro passo**. A intenção atual da implementação é claramente continuar baseada em `sales`. O problema não é que a fonte esteja “errada” para listar vendas; o problema é que a tela se chama/parece diagnóstica demais para uma grade que resume quase tudo pelo estado persistido em `sales`.

## 8. Qual é a menor correção possível para eliminar a principal fonte de confusão visual?

### Escolha única e prioritária
**Aplicar filtro obrigatório por `activeCompanyId` também para developer** na tela `/admin/diagnostico-vendas`.

### Justificativa objetiva
Entre as opções dadas, esta é a menor correção com maior impacto imediato porque:
1. elimina a principal ambiguidade entre o que o header promete (“empresa ativa”) e o que a query realmente faz;
2. alinha a tela ao padrão predominante do admin multiempresa;
3. reduz a chance de o operador procurar uma venda no contexto visual de uma empresa achando que a grade já está isolada quando não está;
4. é uma mudança local, pequena e de baixo risco sem alterar a arquitetura da tela.

### Por que não escolhi as outras como primeira
- **Filtro explícito de empresa/todas as empresas:** é bom, mas maior e mais opinativo do que simplesmente alinhar a tela ao padrão existente.
- **Filtro explícito de ambiente:** útil, porém a confusão mais básica hoje vem antes, do escopo por empresa.
- **Incidente técnico na grade:** importante, mas já entra em semântica/escopo de produto do diagnóstico e é passo posterior.
- **Renomear a tela:** ajuda, mas não resolve o erro de percepção causado por empresa ativa sem efeito real na query.

## Principal causa da confusão hoje

A principal causa da confusão é a combinação de dois fatores, com um dominante:

### Causa dominante
**A UI mostra uma empresa ativa, mas a tela ignora esse recorte quando o usuário é developer.**

### Causa secundária
A grade parece “diagnóstica”, porém resume o caso principalmente por `sales`, enquanto o incidente técnico real pode estar só nos logs (`sale_integration_logs` / `sale_logs`).

## Primeira correção mínima recomendada

### Fazer primeiro
**Restringir `/admin/diagnostico-vendas` por `activeCompanyId` também para developer.**

## Correções que devem ficar para step posterior

1. **Adicionar filtro explícito de ambiente** (`payment_environment`).
2. **Expor na grade um resumo mínimo de incidente técnico** quando `sale_integration_logs` apontar confirmação/falha relevante divergente de `sales`.
3. **Revisar a semântica textual da tela** (“diagnóstico”) para refletir com precisão se ela é funcional, técnica ou híbrida.
4. **Investigar a falha a montante** do caso real (`sale_update_failed`) no fluxo de finalização de pagamento.

## Fechamento objetivo

Com base no código real e na reprodução local do pipeline:
- a venda `30400fef-99fe-4418-8357-7085b000c823` **estava no array final renderizado**;
- não existe paginação/slice local extra escondendo a linha;
- o label da linha para esse caso é **`Pagamento aguardando confirmação`**;
- a tela **não usa** o badge global “Sandbox” para filtrar nada;
- o comportamento cross-company para developer é **localmente intencional**, mas **fora do padrão predominante** do admin;
- a menor correção com maior retorno imediato é **alinhar a query da tela ao `activeCompanyId`**.
