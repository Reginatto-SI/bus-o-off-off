## O que está quebrado

Auditando o código e o banco real:

- **Termo da São Jorge Turismo** existe (`company_terms.id = 0e23bede…`, status `rascunho`, sem nenhuma linha em `company_term_versions`).
- Toda a infraestrutura já está montada: tabelas `company_terms`, `company_term_versions`, `event_term_links`, `sale_term_acceptances`, triggers de imutabilidade, RLS por empresa (`is_admin` + `user_belongs_to_company`), `EventTermsTab` no editor de evento, `EventTermsAcceptanceCard` no `Checkout.tsx`, gravação na Edge Function `create-asaas-payment` e aba "Aceites dos Termos" no detalhe da venda (`src/pages/admin/Sales.tsx`).
- O ponto que está realmente travando o usuário é o **fluxo de recuperação do rascunho sem versão**. A toast "Não foi possível recuperar o rascunho do termo. Verifique se a função de recuperação foi aplicada no banco de dados" vem de `getFriendlyErrorMessage` em `src/components/admin/CompanyTermsTab.tsx`, que casa erros contendo a substring `"function"` (muito ampla — qualquer erro PostgREST que mencione function cai aqui) e também `recover_company_term_initial_version` / `digest`. Como a RPC nova foi recriada com assinatura diferente (`returns table(term_id, version_id)`), e a tela trata `recover` como caminho único, qualquer falha intermitente (cache do PostgREST, hash do conteúdo etc.) bloqueia o usuário sem alternativa.

Demais pontos (Evento, Checkout, Aceite, Auditoria) já existem e funcionam de ponta a ponta na lógica — falta apenas garantir que o caso travado da São Jorge seja recuperado e que mensagens de erro/fluxo do CompanyTermsTab fiquem consistentes.

## O que vou ajustar

### 1. Recuperação de termo em rascunho sem versão (cerne do bug)

Em `src/components/admin/CompanyTermsTab.tsx`, no handler `handleSaveDraft` modo `recover`:

1. Tentar a RPC `recover_company_term_initial_version` como hoje.
2. Em caso de erro **diferente** de `term_already_has_initial_version` / `unique_violation`, executar fallback client-side:
   - re-checar com `select id from company_term_versions where term_id=… and company_id=…` (`maybeSingle`) para garantir que ainda não existe versão;
   - se não existir, inserir direto em `company_term_versions` com `version_number=1`, `status='draft'`, título/tipo herdados do termo, conteúdo/resumo/nota do formulário e `created_by/updated_by = auth.uid()` (RLS de gerente permite);
   - registrar `addAuditLog('draft_version_recovered')`.
3. Se a versão passar a existir em qualquer cenário, a tela atualiza com sucesso ("Rascunho recuperado com sucesso.").
4. Se já existir versão antes do fallback rodar, mostrar mensagem dedicada: *"Este termo já foi recuperado em outra tentativa. Atualize a página."*

Isso elimina o estado preso mesmo se a RPC falhar por cache de schema, hash ou versão anterior da função.

### 2. Mensagens de erro mais precisas

Em `getFriendlyErrorMessage`:

- Remover o match genérico por `"function"` (que sequestra qualquer erro).
- Manter matches específicos: `recover_company_term_initial_version`, `create_company_term_with_initial_version`, `digest(`, `pgrst202`, `could not find the function`.
- Adicionar mensagens dedicadas para `term is not eligible for draft recovery`, `term already has an initial version`, e novo cenário "Não é possível publicar um termo sem conteúdo." quando o `content` da versão estiver vazio.

### 3. Recuperar o caso real da São Jorge Turismo

Após o ajuste de código, recuperar manualmente o termo `0e23bede-e97c-4cc7-8471-a0cacbe0f2d7` via insert direto em `company_term_versions` (uma linha, `version_number=1`, `status='draft'`, conteúdo placeholder "Conteúdo a definir — edite este rascunho antes de publicar.", título/tipo herdados do `company_terms`). Assim a tela já mostra v1 em rascunho e o usuário consegue editar/publicar/marcar vigente normalmente.

### 4. Sanidade dos fluxos já existentes (apenas verificação, sem refator)

- **Evento**: `EventTermsTab` já lista apenas versões `published` (`status='published'`) da empresa ativa, filtra rascunhos e exige `company_id = activeCompanyId` — nenhum ajuste necessário.
- **Checkout público**: `Checkout.tsx` já carrega `event_term_links` + versões `published`, mostra `EventTermsAcceptanceCard`, bloqueia avanço sem o checkbox quando há termo obrigatório, e o `create-asaas-payment` registra `sale_term_acceptances` antes da cobrança — sem alterações.
- **Auditoria de venda**: `src/pages/admin/Sales.tsx` já busca `sale_term_acceptances` por `sale_id` + `company_id` e exibe a aba "Aceites dos Termos" no modal de detalhes — sem alterações.

### 5. Não vou mexer

- Schema do banco e migrations existentes (RPCs `recover_company_term_initial_version` e `create_company_term_with_initial_version` ficam como estão).
- Edge Function `create-asaas-payment`.
- Fluxo Asaas, split, webhook, venda manual.
- `EventTermsTab.tsx`, `EventTermsAcceptanceCard.tsx`, aba de aceites na `Sales.tsx`.

## Arquivos tocados

- `src/components/admin/CompanyTermsTab.tsx` — fallback de recuperação, mensagens de erro refinadas.
- Operação de dados única no banco para criar a versão v1 do termo da São Jorge Turismo (via tool de insert, com aprovação do usuário).

## Validação

1. Abrir `/admin/empresa?tab=termos` na São Jorge Turismo → termo aparece com `Total de versões: 1`, ação **Editar rascunho** habilitada, **Publicar versão**, **Publicar e marcar vigente** e **Visualizar conteúdo** disponíveis.
2. Editar o conteúdo e salvar → "Rascunho atualizado com sucesso.".
3. Publicar e marcar vigente → status `Vigente`, `v1` visível.
4. Criar outro termo do zero em outra empresa → não aparece para São Jorge (isolamento multiempresa).
5. Editar evento da São Jorge → aba Termos lista a v1 publicada como disponível para vincular.
6. Checkout público com termo obrigatório vinculado → checkbox aparece, bloqueia sem aceite, libera com aceite e registra em `sale_term_acceptances`.
7. Abrir detalhes da venda no admin → aba "Aceites dos Termos" lista o snapshot.
