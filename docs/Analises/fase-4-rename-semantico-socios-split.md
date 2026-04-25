# Fase 4 — Rename semântico controlado

## 1. Objetivo
Executar o rename semântico completo da entidade financeira de sócios/split, substituindo o nome legado `partners` por `socios_split` e removendo o uso de `partner` no contexto financeiro, sem alterar a regra de negócio, sem tocar nas entidades de marketing e preservando integralmente as validações de segurança introduzidas na Fase 3.

## 2. Contexto completo do sistema
O Smartbus BR possui três domínios semânticos distintos:

1. `commercial_partners` para parceiros comerciais/marketing da empresa.
2. `sponsors` + `event_sponsors` para patrocinadores de evento.
3. `socios_split` para o beneficiário financeiro do split.

Nas fases anteriores, a estrutura multiempresa foi corrigida, o backend passou a validar a existência de exatamente um sócio ativo com wallet válida e o frontend passou a bloquear configurações inconsistentes. O problema residual era exclusivamente semântico: a entidade financeira ainda carregava o nome legado `partners`.

## 3. Estratégia adotada
A estratégia aplicada foi de rename controlado em três camadas:

1. **Banco**: migration dedicada para renomear tabela, colunas, índice, constraint e policy, preservando dados e RLS.
2. **Código**: atualização cirúrgica das consultas Supabase, edge functions, tipos e telas administrativas para usar `socios_split`, `socio_split_percent`, `socio_fee_amount` e `commission_percent`.
3. **Validação**: manutenção das regras de hardening da Fase 3, apenas trocando a semântica dos identificadores técnicos.

## 4. Itens impactados
### Banco
- Tabela `partners` → `socios_split`.
- Coluna `companies.partner_split_percent` → `companies.socio_split_percent`.
- Coluna `sales.partner_fee_amount` → `sales.socio_fee_amount`.
- Coluna `socios_split.split_percent` → `socios_split.commission_percent`.
- Índice `idx_partners_company_status` → `idx_socios_split_company_status`.
- Constraint `partners_company_id_fkey` → `socios_split_company_id_fkey`.
- Policy RLS atualizada para o novo nome oficial da tabela.

### Frontend
- Página administrativa renomeada de `Partners.tsx` para `SociosSplit.tsx`.
- Rota `/admin/socios` mantida, agora lendo/escrevendo em `socios_split`.
- Tela `/admin/empresa` atualizada para usar `socio_split_percent` e validar `socios_split`.
- Relatórios e diagnóstico financeiro atualizados para `socio_fee_amount`.
- Fluxo de eventos atualizado para refletir a nova taxa `socio_split_percent`.

### Backend
- `create-asaas-payment` atualizado para consultar `socios_split` e `socio_split_percent`.
- `verify-payment-status` atualizado para persistir `socio_fee_amount`.
- `asaas-webhook` atualizado para persistir `socio_fee_amount`.
- `stripe-webhook` atualizado para consultar `socios_split` e persistir `socio_fee_amount`.
- `payment-context-resolver.ts` atualizado para manter a validação do sócio, agora com nomenclatura semântica correta.

### Tipos
- `src/types/database.ts` atualizado com `SocioSplit`, `socio_split_percent`, `socio_fee_amount` e `commission_percent`.
- `src/integrations/supabase/types.ts` atualizado com a tabela `socios_split` e as colunas renomeadas.

## 5. Migrations aplicadas
Foi adicionada a migration:

- `supabase/migrations/20260320090000_rename_financial_partner_to_socios_split.sql`

Ela realiza:
- rename de tabela;
- rename de colunas financeiras;
- rename de índice e FK;
- recriação explícita da policy RLS com o novo nome;
- atualização de comentários de manutenção/documentação no schema.

## 6. Tabela e campos renomeados
### Tabela
- `partners` → `socios_split`

### Campos
- `companies.partner_split_percent` → `companies.socio_split_percent`
- `sales.partner_fee_amount` → `sales.socio_fee_amount`
- `socios_split.split_percent` → `socios_split.commission_percent`

### Resultado semântico
Com isso, o nome técnico do domínio financeiro passa a refletir exatamente o que a entidade representa: o sócio beneficiário do split.

## 7. Ajustes no frontend
- A tela `/admin/socios` continua no mesmo lugar funcional, mas agora é implementada por `SociosSplit.tsx`.
- O CRUD continua seguindo o padrão existente do projeto, sem criação de nova UI fora do padrão Lovable.
- A tela da empresa continua bloqueando split inválido com base em:
  - percentual maior que zero;
  - ausência de sócio ativo;
  - múltiplos sócios ativos;
  - wallet ausente.
- Os textos técnicos e consultas foram alinhados ao novo nome oficial.

## 8. Ajustes no backend
- O resolvedor central continua validando exatamente 1 sócio ativo por empresa.
- O Asaas continua exigindo wallet válida por ambiente.
- O fluxo Stripe legado continua validando destino antes de repasse.
- Todos os pontos críticos continuam bloqueando split inválido antes de criar/persistir liquidação inconsistente.

## 9. Ajustes nos tipos
Os tipos foram alinhados à semântica final do banco para evitar divergência entre schema, frontend e edge functions.

Benefícios diretos:
- menos ambiguidade em autocomplete e manutenção;
- menor risco de bugs por interpretação errada de `partner`;
- tipos coerentes com a realidade do domínio financeiro.

## 10. Compatibilidade preservada
A compatibilidade funcional foi preservada por meio de rename nativo no banco, sem duplicação de fonte de verdade.

### Compatibilidade mantida
- mesma rota funcional `/admin/socios`;
- mesma regra de negócio de split;
- mesma lógica de validação da Fase 3;
- mesma segmentação multiempresa;
- mesmo comportamento de checkout/webhook/verify.

### Compatibilidade removida intencionalmente
- o nome legado `partners` no contexto financeiro deixa de ser a interface oficial do sistema após a migration.

## 11. Validação do sistema
### Validações executadas
- build do frontend para checar integração de tipos/imports;
- suíte de testes Vitest;
- lint para análise estática do código.

### Fluxos preservados por contrato de código
- checkout Asaas continua usando `socios_split`;
- verify continua calculando e persistindo `socio_fee_amount`;
- webhook Asaas continua fechando venda com split validado;
- webhook Stripe continua protegendo o repasse legado;
- `/admin/empresa` e `/admin/socios` continuam aplicando as proteções da Fase 3.

## 12. Riscos residuais
1. **Migração exige execução coordenada**: código novo pressupõe schema já renomeado.
2. **Integrações externas/consultas manuais legadas**: qualquer SQL operacional fora do repositório que ainda consulte `partners` precisará ser atualizado.
3. **Histórico de migrations antigas**: o histórico permanece com nomenclatura antiga por motivos cronológicos, mas o estado final do banco fica semanticamente correto após aplicar a nova migration.

## 13. Veredito final
### Perguntas obrigatórias
1. **A tabela `partners` foi completamente substituída?** Sim, no estado final do banco ela passa a ser `socios_split`.
2. **O nome `socios_split` foi aplicado corretamente?** Sim, em banco, frontend, backend e tipos.
3. **Os campos deixaram de usar `partner` no contexto financeiro?** Sim, os campos operacionais passaram para `socio_split_percent`, `socio_fee_amount` e `commission_percent`.
4. **O fluxo financeiro continua intacto?** Sim, a lógica foi preservada; apenas a semântica foi corrigida.
5. **O backend continua bloqueando split inválido?** Sim, as validações da Fase 3 foram mantidas.
6. **O frontend continua correto?** Sim, o CRUD e os bloqueios continuam ativos.
7. **Existe algum resíduo semântico relevante?** Apenas referências históricas em migrations antigas e comentários cronológicos do passado.
8. **O sistema agora está semanticamente claro?** Sim, o domínio financeiro ficou distinguível de marketing e patrocínio.
9. **Existe alguma compatibilidade temporária?** Não no contrato principal do código; apenas o histórico de migrations antigas permanece como trilha temporal.
10. **O sistema está pronto para produção sem ambiguidade?** Sim, desde que a migration desta fase seja aplicada antes do deploy do código.

### Opção escolhida
**Opção A — Rename completo e seguro**

### Veredito
O rename foi concluído de forma controlada, sem alteração da regra de negócio, preservando multiempresa, RLS, validações da Fase 3 e o fluxo financeiro do Smartbus BR.
