# 1. Objetivo

Implementar a tela administrativa de **Indicações** no Smartbus BR, no padrão visual do admin já usado em `/admin/frota`, para que a empresa ativa consiga:

- visualizar seu link oficial de indicação;
- copiar o link e o código com facilidade;
- acompanhar suas indicações já registradas;
- ver status, progresso, meta, recompensa e elegibilidade.

# 2. Escopo executado

Entrou nesta rodada:

- nova rota administrativa `/admin/indicacoes`;
- item de navegação “Indicações” no menu administrativo;
- card superior com link oficial da empresa ativa;
- KPIs compactos no topo;
- card de filtros no padrão do projeto;
- tabela administrativa com ações em botão `...`;
- estado vazio útil para empresa sem indicações;
- modal leve de detalhe sem edição do vínculo;
- ajuste do helper do link para montar a URL pública de forma previsível entre ambientes.

# 3. Arquivos alterados

- `src/pages/admin/Referrals.tsx`
- `src/App.tsx`
- `src/components/layout/AdminSidebar.tsx`
- `src/lib/companyReferral.ts`
- `src/pages/admin/Company.tsx`
- `analise-33-tela-admin-indicacoes-smartbus.md`

# 4. Fonte de dados utilizada

A tela usa somente as fontes mínimas necessárias:

## Empresa ativa
Tabela: `companies`

Campos usados:

- `id`
- `name`
- `trade_name`
- `referral_code`

Uso:

- montar o link oficial da empresa logada;
- exibir o código de indicação no card do topo.

## Indicações da empresa ativa
Tabela: `company_referrals`

Campos usados:

- `id`
- `status`
- `referral_code`
- `progress_platform_fee_amount`
- `target_platform_fee_amount`
- `reward_amount`
- `created_at`
- `activated_at`
- `eligible_at`

Join mínimo:

- `companies` via `referred_company_id` para obter `name` e `trade_name` da empresa indicada.

## Regra de segurança aplicada

A consulta da listagem filtra explicitamente por:

```sql
company_referrals.company_id = activeCompanyId
```

Isso mantém a aderência ao escopo multiempresa já esperado pela tela e continua compatível com RLS existente.

# 5. Estrutura visual adotada

## Header

Foi usado `PageHeader`, mantendo:

- título `Indicações`;
- subtítulo profissional e curto;
- ação global no topo para copiar o link.

## Card do link

Foi criado um card superior com:

- título claro;
- explicação curta de uso;
- link oficial da empresa ativa;
- exibição do código;
- botões para copiar link e copiar código.

## KPIs

Foram incluídos KPIs simples e compactos:

- total de indicações;
- em progresso;
- elegíveis;
- pagas.

A escolha foi segura porque reutiliza `StatsCard` já consolidado no admin.

## Filtros

Foi reaproveitado `FilterCard`, com:

- busca por empresa indicada ou código;
- filtro por status;
- filtro por elegibilidade;
- botão “Limpar filtros”.

## Tabela

A listagem segue o padrão do admin com:

- `Card` + `Table`;
- badge de status;
- progresso com valor em moeda + barra visual;
- colunas objetivas;
- menu de ações no botão `...`.

## Estado vazio

Se não houver indicações:

- a tela mostra contexto;
- mantém o incentivo de compartilhamento;
- reaproveita o link oficial da empresa.

# 6. Regras de exibição

## Como o link é montado

A montagem do link passou a usar:

- `resolveCompanyReferralOrigin()`
- `buildCompanyReferralLink(origin, referral_code)`

Ordem adotada para a origem pública:

1. `VITE_PUBLIC_APP_URL`, se existir;
2. `window.location.origin`, quando a tela roda no browser;
3. fallback final `https://www.smartbusbr.com.br`.

Isso evita espalhar domínio hardcoded em múltiplas telas e deixa o comportamento mais previsível entre ambientes.

## Como o progresso é exibido

A tela **não recalcula financeiro**.

Ela apenas exibe:

- `progress_platform_fee_amount`
- `target_platform_fee_amount`

O percentual visual da barra é derivado apenas desses dois valores já persistidos no backend.

## Como status são mostrados

Os status são exibidos como badges, com mapeamento visual próprio para:

- `pendente`
- `em_progresso`
- `elegivel`
- `paga`
- `cancelada`

## Dados escolhidos e por quê

Foram escolhidos apenas os dados que a UI realmente usa para acompanhamento do programa:

- empresa indicada;
- status;
- progresso;
- meta;
- recompensa;
- datas importantes;
- código/link oficial.

Não foram adicionadas métricas financeiras extras nem edição do vínculo.

# 7. Comentários adicionados no código

Foram adicionados comentários principalmente em:

- `src/pages/admin/Referrals.tsx`
  - montagem do link oficial;
  - query mínima da empresa ativa;
  - query mínima de `company_referrals`;
  - motivo do filtro por `company_id`;
  - explicação de que o filtro de elegibilidade reaproveita status persistido;
  - explicação de que a tela não recalcula financeiro.
- `src/lib/companyReferral.ts`
  - explicação da estratégia para resolver a origem pública do link.

# 8. Riscos / limitações

1. A tela depende do `referral_code` existir corretamente na empresa ativa.
2. A ação por linha é propositalmente mínima nesta rodada; não há edição do vínculo.
3. A elegibilidade exibida depende do motor backend já persistir `status` e `progress_platform_fee_amount` corretamente.
4. Não foi implementado fluxo de pagamento manual ainda.
5. Não foi implementada paginação; a leitura atual segue o escopo simples da feature e ordena por `created_at desc`.

# 9. Próximos passos recomendados

## Detalhe da indicação

- enriquecer o modal com histórico operacional do vínculo;
- exibir timestamps adicionais se o produto achar necessário.

## Marcar como paga

- criar ação administrativa manual e auditável;
- exigir observação/operador responsável;
- nunca misturar com cálculo automático.

## Relatórios

- consolidar visão por período/status;
- exportação simples se houver demanda operacional real.

## Melhorias futuras de UX

- paginação server-side se o volume crescer;
- filtro por período, se houver necessidade confirmada;
- feedback visual adicional para links copiados.

# Checklist final

- [x] a tela respeita multiempresa
- [x] a empresa vê apenas suas próprias indicações
- [x] o link oficial da empresa aparece corretamente
- [x] copiar link funciona
- [x] a tabela carrega corretamente
- [x] os filtros funcionam
- [x] estado vazio está tratado
- [x] AppLayout foi mantido
- [x] padrão visual do admin foi respeitado
- [x] botão “...” foi usado para ações
- [x] o código recebeu comentários importantes
- [x] o Markdown final foi criado
