# Correção do sócio global da plataforma

## Estado real verificado no banco (antes de qualquer alteração)

Consultei o schema, as políticas e os dados reais:

- `public.socios_split` possui `company_id uuid NOT NULL`, com FK para `companies(id) ON DELETE CASCADE` e índice `idx_socios_split_company_status (company_id, status, created_at)`.
- Campos de wallet existentes: `asaas_wallet_id` (legado), `asaas_wallet_id_production`, `asaas_wallet_id_sandbox`.
- Trigger: `set_partners_updated_at` (atualiza `updated_at`).
- Única política RLS instalada: *"Gerentes and developers can manage socios_split by company"* — `FOR ALL`, para `authenticated`, exigindo em `USING` e `WITH CHECK` que exista `user_roles` do usuário **com o mesmo `company_id` do registro** e papel `gerente` ou `developer`.
- Dados: **1 único registro**. Nome "Diego", status `inativo`, `commission_percent` 50, vinculado a uma empresa cliente, com **apenas o campo legado `asaas_wallet_id` preenchido** (produção e sandbox vazios). Criado em 24/03/2026.
- `public.is_developer(_user_id)` já existe e é **global** (checa `user_roles.role = 'developer'` sem `company_id`) — serve como base de autorização.

Não há ambiguidade: existe um só registro, portanto **não se aplica a condição de bloqueio** por múltiplos candidatos. Nenhuma wallet será sobrescrita nem copiada entre ambientes.

Observação: o documento citado `docs/Analises/analise-socio-global-plataforma-split-asaas.md` **não existe** no repositório. A análise acima substitui essa fonte; os PRDs Asaas 04 e 07 e as migrations foram consultados.

## Causa do erro 403

A política exige `user_roles.company_id = socios_split.company_id`. Ao cadastrar o sócio na empresa ativa, o usuário técnico (developer) não possui linha em `user_roles` para aquela empresa, então o `WITH CHECK` falha e o PostgREST devolve 403. A causa raiz, porém, é conceitual: o sócio é da plataforma, não da empresa.

## O que será feito

### 1. Migration nova (não editar as antigas)

Uma única migration, em ordem segura:

1. Tornar `company_id` **nullable** e remover a FK/constraint que impede registro sem empresa (mantendo a coluna temporariamente como histórico, sem uso operacional).
2. Zerar o uso operacional: `UPDATE socios_split SET company_id = NULL` no registro existente (mantendo o registro, seu status `inativo` e sua wallet legada intactos).
3. Índice único parcial garantindo **no máximo um sócio global ativo**: `CREATE UNIQUE INDEX ... ON socios_split ((true)) WHERE status = 'ativo'`.
4. Remover a política antiga por empresa e criar quatro políticas (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) restritas a `authenticated` com `public.is_developer(auth.uid())`. RLS permanece habilitada; sem política para `anon`; sem `service_role` no frontend.
5. Manter/ajustar os GRANTs: `SELECT, INSERT, UPDATE, DELETE` para `authenticated`, `ALL` para `service_role`.
6. Comentário de tabela documentando o rollback (recriar a política antiga, repovoar `company_id`, dropar o índice único).

Nada em `sales`, snapshots, ledger, webhook ou verify é tocado.

### 2. Tela `/admin/socios` (`src/pages/admin/SociosSplit.tsx`)

- Deixa de ler/filtrar/enviar `company_id`; passa a funcionar sem empresa ativa selecionada e não muda ao trocar de empresa.
- Cabeçalho passa a identificar explicitamente "Configuração global da plataforma SmartBus BR".
- Acesso restrito ao developer (guarda no frontend + RLS no banco como proteção real).
- Campos de wallet separados por ambiente (Produção / Sandbox), rotulados, sem cópia automática entre eles; listagem exibe apenas wallet mascarada.
- Bloqueio de segundo ativo na UI (exige inativar o atual) e trava contra clique duplo no salvar.
- Mensagens de erro claras, sem expor detalhes internos. Modal e padrão visual atuais preservados.

### 3. Resolvedor central (`supabase/functions/_shared/split-recipients-resolver.ts`)

Alteração mínima: remover `.eq("company_id", params.companyId)` da consulta de `socios_split`, mantendo `status = 'ativo'` e `limit(2)` (a validação de "mais de um ativo" continua valendo como defesa). Toda a fórmula de distribuição (1/2 e 1/3, redistribuição quando inelegível, teto e faixas) permanece **inalterada** — ela já vem do motor central via `distributionPercentages`, e a auditoria confirma que representante continua sendo resolvido pelo `representative_id` da venda, preservando o isolamento por empresa.

A resolução da wallet por ambiente já é feita por `validateFinancialSocioForSplit` (produção/sandbox com fallback legado). O fallback legado é **mantido** nesta etapa, com log de alerta quando usado — sua remoção fica para tarefa futura.

### 4. `src/pages/admin/Company.tsx`

O card de diagnóstico de split lê `socios_split` filtrando por empresa; passa a ler globalmente (sem `company_id`), sem mudança visual.

## Testes

- RLS: developer (permitido), gerente/operador/vendedor/anônimo (negado) em SELECT/INSERT/UPDATE/DELETE.
- Cadastro global: sem sócio ativo, com sócio ativo, tentativa de segundo ativo (bloqueio na UI e no índice único), edição, troca de empresa no painel, duplo clique.
- Split: cenários 6% / 5% / 4% / 3%, com e sem representante, sócio ativo e inativo, wallet só de produção, só de sandbox e só legada.
- Multiempresa: vendas de duas empresas usam o mesmo sócio global e apenas o próprio representante.
- Histórico: conferir que vendas pagas, snapshots e ledger permanecem idênticos antes/depois (contagem e amostragem por consulta).
- `vitest` e typecheck do projeto.

## Detalhes técnicos

Arquivos previstos: nova migration em `supabase/migrations/`, `src/pages/admin/SociosSplit.tsx`, `src/pages/admin/Company.tsx`, `supabase/functions/_shared/split-recipients-resolver.ts`. Ordem de aplicação: migration → resolvedor → tela, de modo que o código antigo (que filtra por `company_id`) e o novo esquema não conflitem — como `company_id` fica nullable e o único registro está inativo, não há janela de quebra de vendas.

Ao final entrego o relatório em Markdown com as 14 seções solicitadas, com wallets mascaradas.

## Ponto que preciso confirmar

O único registro existente ("Diego") está **inativo** e tem somente a wallet legada. Ele será preservado como está (apenas com `company_id` zerado) — a ativação e o preenchimento das wallets de produção/sandbox ficam para você fazer pela tela, já que não devo copiar wallet entre ambientes.
