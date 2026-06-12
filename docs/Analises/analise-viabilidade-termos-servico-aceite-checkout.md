# Análise de viabilidade — Termos de Serviço, Políticas da Empresa e Aceite no Checkout

## 1. Resumo executivo

**Viabilidade geral:** a melhoria é tecnicamente viável, mas deve ser implantada de forma incremental e com validação forte no backend/Edge Function antes da criação da cobrança Asaas.

**Pontos críticos encontrados antes de qualquer implementação:**

1. **O checkout público já cria a venda antes da cobrança Asaas.** O aceite de termos da empresa deve ser validado antes do `insert` em `sales` e também gravado junto da venda ou imediatamente após a criação da venda, antes de chamar `create-asaas-payment`.
2. **A cobrança Asaas é criada somente depois de `sales`, `seat_locks` e `sale_passengers`.** Isso é bom para inserir o aceite sem alterar webhook/split/verify, mas exige cuidado para não deixar venda pendente sem aceite quando o evento exigir termos.
3. **Hoje existe apenas aceite de responsabilidade/intermediação da plataforma, não termos próprios da empresa.** Esse lastro atual não substitui o aceite de contrato/políticas da empresa.
4. **Não há estrutura genérica de documentos/termos versionados por empresa.** Será necessário criar novas tabelas e políticas RLS.
5. **Venda manual cria tickets diretamente, sem passar pelo staging `sale_passengers` nem pela cobrança principal Asaas da venda online.** A regra de aceite manual precisa ser explícita, auditável e separada do aceite público.
6. **Tickets/comprovantes são gerados a partir de `tickets` e dados da venda.** Para consulta posterior da versão aceita, o dado deve estar em tabela própria por venda ou snapshot na venda, não apenas no evento.

**Recomendação final resumida:**

- Criar uma área administrativa de **Termos e Políticas** por empresa.
- Modelar **documento lógico** + **versões imutáveis** + **vínculo de evento** + **aceite por venda**.
- No checkout, inserir um bloco/card de termos dentro da etapa atual de pagamento/resumo (`step === 3`), antes do botão `Continuar para pagamento`.
- Persistir o aceite no momento da criação da venda e bloquear a Edge Function `create-asaas-payment` se o evento exigir termo e a venda não tiver aceite válido.
- Não alterar webhook Asaas, split financeiro, confirmação de pagamento, verify ou geração de ticket, exceto para exibir/diagnosticar o aceite já registrado.

---

## 2. Leitura do PRD obrigatório

PRD lido: `docs/PRD/Padroes/PRD — Termos de Serviço, Políticas da Empresa e Aceite no Checkout.txt`.

Principais regras extraídas do PRD:

- Cada empresa gerencia seus próprios termos.
- O evento define qual versão será aplicada.
- O comprador aceita antes do pagamento.
- A venda guarda permanentemente a versão aceita.
- Termos alterados depois não podem alterar vendas antigas.
- A melhoria não deve criar fluxo paralelo de venda.
- A melhoria não deve alterar regra de pagamento Asaas, confirmação por webhook ou split financeiro.
- O aceite precisa ser rastreável, com versão, data/hora, venda, empresa, evento e conteúdo aceito por snapshot ou referência imutável.

Interpretação técnica para este repositório:

- O requisito combina **cadastro administrativo**, **versionamento imutável**, **vínculo operacional do evento** e **registro transacional no checkout**.
- O ponto mais sensível é garantir que a venda não consiga chamar a criação de cobrança Asaas quando o evento exige termo e o aceite ainda não foi persistido.
- A modelagem deve priorizar imutabilidade e multiempresa; não deve reutilizar campos atuais de `platform_fee_terms_*`, pois eles representam termo comercial da plataforma aceito pela organizadora no cadastro do evento, não termo da empresa aceito pelo comprador.

---

## 3. Arquivos investigados

### 3.1 Frontend público

- `src/pages/public/Checkout.tsx`
  - Fluxo público de seleção de assentos, passageiros, resumo, aceite de responsabilidade/intermediação e criação da venda/cobrança.
- `src/pages/public/Confirmation.tsx`
  - Página pública de confirmação da venda, polling/verify e renderização de cards de passagem.
- `src/pages/public/TicketLookup.tsx`
  - Consulta pública posterior de passagens por CPF via Edge Function `ticket-lookup`.
- `src/components/public/TicketCard.tsx`
  - Card oficial de passagem/comprovante, usado na tela e exportação.
- `src/components/public/PassengerTicketList.tsx`
  - Agrupamento visual de tickets por passageiro.
- `src/lib/ticketPdfGenerator.ts`
  - PDF reaproveita visual do `TicketCard` em tela.
- `src/lib/ticketImageGenerator.ts`
  - Imagem do ticket reaproveita dados do `TicketCard`.
- `src/lib/intermediationPolicy.ts`
  - Textos e validações do aceite atual de intermediação/responsabilidade da plataforma.
- `src/lib/ticketPurchaseMetadata.ts`
  - Resolve data/origem de compra exibidas no ticket.

### 3.2 Frontend administrativo

- `src/pages/admin/Company.tsx`
  - Tela administrativa da empresa, hoje organizada em abas: Dados Gerais, Endereço, Contato, Observações, Identidade Visual, Redes Sociais, Configurações, Pagamentos e Vitrine Pública.
- `src/components/admin/BrandIdentityTab.tsx`
  - Exemplo de aba extra modularizada dentro de empresa.
- `src/pages/admin/Events.tsx`
  - CRUD/wizard principal de eventos; contém abas Geral, Frotas, Embarques, Passagens, Serviços, Patrocinadores e Publicação.
- `src/pages/admin/EventDetail.tsx`
  - Detalhe do evento com abas Viagens, Locais de Embarque, Vendas e Serviços.
- `src/components/admin/NewSaleModal.tsx`
  - Fluxo de venda manual/reserva/bloqueio administrativo.
- `src/pages/admin/Sales.tsx`
  - Listagem, detalhes e ações administrativas de vendas.
- `src/pages/admin/SalesDiagnostic.tsx`
  - Diagnóstico técnico de vendas, pagamentos, logs e dados brutos.
- `src/components/layout/AdminSidebar.tsx`
  - Navegação administrativa e grupos de menu.
- `src/contexts/AuthContext.tsx`
  - Resolução de usuário, papel, empresa ativa, multiempresa e developer cross-company.

### 3.3 Edge Functions e backend Supabase

- `supabase/functions/create-asaas-payment/index.ts`
  - Criação da cobrança Asaas depois da venda/staging de passageiros.
- `supabase/functions/asaas-webhook/index.ts`
  - Entrada de webhook Asaas.
- `supabase/functions/verify-payment-status/index.ts`
  - Fallback/on-demand de verificação de pagamento.
- `supabase/functions/_shared/payment-finalization.ts`
  - Finalização centralizada: muda venda para `pago`, gera tickets a partir de `sale_passengers`, limpa locks e registra logs.
- `supabase/functions/_shared/payment-observability.ts`
  - Logs operacionais e integração por venda.
- `supabase/functions/ticket-lookup/index.ts`
  - Consulta pública de tickets e montagem do payload usado em `TicketLookup`.
- `supabase/functions/create-platform-fee-checkout/index.ts`
  - Fluxo separado da taxa de plataforma em vendas manuais.

### 3.4 Tipos e migrations relevantes

- `src/types/database.ts`
  - Tipos principais: `Company`, `Event`, `Sale`, `SalePassengerRecord`, `TicketRecord`, `SaleLog`, `UserRoleRecord`.
- `src/integrations/supabase/types.ts`
  - Tipos gerados do Supabase.
- `supabase/migrations/20260131001444_f8dbc20e-05dd-47eb-ad12-40b328fb2e48.sql`
  - Base inicial de políticas públicas/admin para eventos, vendas e entidades principais.
- `supabase/migrations/20260210003929_ecaa7fae-bc1c-4dfe-8347-690b42328e3a.sql`
  - Criação de `tickets` e políticas públicas iniciais de sales/tickets.
- `supabase/migrations/20260305000000_add_company_id_trips_sales_event_boarding_locations.sql`
  - Reforço multiempresa em `trips`, `sales` e `event_boarding_locations`.
- `supabase/migrations/20260311010520_fc7a27bc-058e-418c-b4c9-289ec167e201.sql`
  - Criação de `seat_locks` e `sale_passengers`, usados no checkout público.
- `supabase/migrations/20260701090000_create_sale_integration_logs.sql`
  - Logs técnicos de integração por venda.
- `supabase/migrations/20260311020000_add_sale_integration_logs.sql`
  - Versão/estrutura também encontrada para `sale_integration_logs`.
- `supabase/migrations/20260706090000_add_event_platform_fee_terms_traceability.sql`
  - Campos atuais de aceite dos termos da taxa da plataforma no evento.
- `supabase/migrations/20261103090000_add_benefit_snapshot_to_sales_and_passengers.sql`
  - Exemplo de snapshot transacional persistido em venda/passageiros.
- `supabase/migrations/20261104090000_add_benefit_snapshot_to_tickets.sql`
  - Exemplo de snapshot levado para `tickets` porque `sale_passengers` é staging.

---

## 4. Estrutura atual do sistema

### 4.1 Empresas

**Modelagem atual:**

- Tipo `Company` contém dados cadastrais, identidade visual, links públicos, integração Asaas, taxas, configurações de reserva manual e vitrine pública.
- Não há campos de termos contratuais próprios da empresa.
- A tela `/admin/empresa` edita a empresa ativa em abas. Esse é o ponto mais natural para uma aba administrativa de termos quando a escolha for manter tudo dentro de Empresa.

**Arquivos relevantes:**

- `src/types/database.ts`
- `src/pages/admin/Company.tsx`
- `src/components/admin/BrandIdentityTab.tsx`
- `src/contexts/AuthContext.tsx`

**Multiempresa atual:**

- `AuthContext` resolve `activeCompanyId`, `activeCompany`, `userCompanies` e papel do usuário por empresa.
- Developer pode enxergar empresas ativas além dos vínculos diretos, conforme lógica atual.
- As telas administrativas filtram por `activeCompanyId` em consultas sensíveis.

### 4.2 Eventos

**Modelagem atual:**

- `Event` tem `company_id`, status (`rascunho`, `a_venda`, `encerrado`), data, cidade, descrição, informação pública, preço, limite por compra, venda online, venda por vendedor, validação no checkout, política de transporte, categoria, precificação por categoria e campos de aceite da taxa da plataforma.
- Os campos `platform_fee_terms_accepted`, `platform_fee_terms_accepted_at`, `platform_fee_terms_version` e `platform_fee_terms_accepted_by` são específicos do termo da taxa da plataforma aceito pela empresa/organizador, não do termo da empresa aceito pelo comprador.

**Criação/edição:**

- `src/pages/admin/Events.tsx` concentra o wizard/modal de evento.
- Abas atuais no modal: Geral, Frotas, Embarques, Passagens, Serviços, Patrocinadores e Publicação.
- O evento já possui um padrão de tabs/wizard; uma aba “Termos” ou “Termos e Políticas” se encaixa tecnicamente nesse padrão.
- O PRD recomenda não poluir a etapa geral com contrato completo; portanto o evento deve apenas vincular/revisar termos, não editar o texto completo.

**Detalhe do evento:**

- `src/pages/admin/EventDetail.tsx` exibe Viagens, Locais de Embarque, Vendas e Serviços. Pode futuramente exibir resumo do termo aplicado, mas o vínculo principal deve ficar no wizard de criação/edição.

### 4.3 Checkout público

**Fluxo atual em `Checkout.tsx`:**

1. Carrega evento, viagem e local de embarque por URL.
2. Valida `allow_online_sale`.
3. Carrega empresa, taxas, tipos de passagem, preços por categoria e assentos.
4. Step 1: seleção de assentos.
5. Step 2: dados dos passageiros.
6. Transição para Step 3: resolve benefícios/snapshots financeiros.
7. Step 3: método de pagamento, resumo e checkbox de aceite de responsabilidade/intermediação.
8. `handleSubmit` valida passageiros, aceite de intermediação e Pix readiness.
9. Abre aba em branco para evitar bloqueio de popup.
10. Revalida assentos e capacidade.
11. Insere `sales` com status `pendente_pagamento`, dados do comprador, valores, `intermediation_responsibility_accepted=true` e `company_id`.
12. Insere `seat_locks` vinculados à venda.
13. Insere `sale_passengers` como staging para gerar tickets depois da confirmação.
14. Invoca Edge Function `create-asaas-payment`.
15. Redireciona a aba pré-aberta para a fatura Asaas.

**Conclusão:** a cobrança Asaas é criada **depois** da venda, locks e passageiros. O ponto ideal para aceite fica antes de `handleSubmit` chamar `insert` em `sales` e antes da chamada da Edge Function.

### 4.4 Venda pública

- Tabela principal: `sales`.
- A venda pública nasce como `pendente_pagamento`.
- Passageiros ficam em `sale_passengers` até a confirmação.
- Tickets são criados só após confirmação real do pagamento.
- A confirmação é centralizada em `payment-finalization.ts`.

### 4.5 Venda manual administrativa

- `src/components/admin/NewSaleModal.tsx` controla venda manual, reserva e bloqueio.
- Abas: `manual`, `reserva`, `bloqueio`.
- Venda manual/reserva cria `sales` com status `reservado`.
- Bloqueio cria `sales` com status `bloqueado`.
- Venda manual cria `tickets` diretamente, não `sale_passengers`.
- A taxa da plataforma em venda manual usa fluxo separado (`platform_fee_status`, `platform_fee_amount` e `create-platform-fee-checkout`).
- A venda manual registra `sale_logs` com `manual_paid_created`, `reservation_created` ou `seat_block_created`.

### 4.6 Passageiros da venda

- Checkout público: `sale_passengers` é staging por passageiro, com `company_id`, CPF, telefone, trip, seat e snapshots de benefício/preço.
- Após pagamento: `tickets` recebe dados do passageiro e snapshots relevantes.
- Venda manual: `tickets` são inseridos diretamente pelo admin.

### 4.7 Confirmação da venda

- Página pública `Confirmation.tsx` busca `sales` e `tickets` por `sale_id`.
- Se necessário, usa `verify-payment-status` para atualizar status/tickets.
- A geração oficial de tickets após pagamento é feita em `payment-finalization.ts`.

### 4.8 Ticket/comprovante

- `TicketCard.tsx` é o template visual principal.
- `PassengerTicketList.tsx` agrupa tickets por passageiro.
- PDF e imagem reaproveitam o visual/dados do `TicketCard`.
- Hoje não há informação de termos aceitos no `TicketCardData`.

### 4.9 Diagnóstico administrativo de vendas

- `Sales.tsx` mostra listagem, detalhes da venda, tickets e logs.
- `SalesDiagnostic.tsx` mostra dados brutos, logs da venda e logs técnicos de integração.
- É um bom lugar para alertar inconsistências de aceite, por exemplo “pagamento confirmado sem aceite obrigatório”.

### 4.10 Logs/auditoria existentes

- `sale_logs`: trilha operacional por venda.
- `sale_integration_logs`: logs técnicos de integração, principalmente Asaas/webhook/requisições.
- `payment-observability.ts`: helpers para logs operacionais e críticos.
- Console logs estruturados no checkout e Edge Functions.
- Não há tabela específica de auditoria para alterações de termos/documentos.

### 4.11 Permissões e RLS por empresa

Padrão atual observado:

- Tabelas administrativas usam `company_id`.
- Políticas RLS frequentemente usam `public.user_belongs_to_company(auth.uid(), company_id)` e `public.is_admin(auth.uid())` para escrita.
- Várias leituras públicas existem para eventos à venda, assentos, locks, tickets e consulta pública.
- A modelagem de termos deve seguir esse mesmo padrão.

---

## 5. Fluxo atual do checkout

Fluxo detalhado com impacto para aceite:

1. Usuário abre `/eventos/:id/checkout` com `tripId` e `locationId` na query.
2. `Checkout.tsx` carrega:
   - `events` com empresa;
   - `trips` com veículo;
   - `boarding_locations`;
   - `companies` para taxa/plataforma/Pix;
   - `event_fees`;
   - `event_ticket_types`;
   - `event_category_prices`, quando aplicável;
   - assentos e ocupação por RPC.
3. `step === 1`: seleção de assentos.
4. `handleAdvanceToPassengers` valida assentos, inicializa passageiros e vai para `step === 2`.
5. `step === 2`: formulário/accordion de passageiros.
6. Botão “Continuar” valida passageiros e resolve snapshots de benefícios.
7. `step === 3`: método de pagamento + resumo + aceite atual de intermediação.
8. Botão “Continuar para pagamento” chama `handleSubmit`.
9. `handleSubmit`:
   - valida passageiros;
   - exige `intermediationAccepted`;
   - valida Pix readiness;
   - abre aba vazia;
   - revalida assentos/capacidade;
   - cria venda `sales`;
   - cria `seat_locks`;
   - cria `sale_passengers`;
   - chama `create-asaas-payment`;
   - envia usuário para URL Asaas.

**Momento atual da cobrança:** cobrança criada **depois** do `insert` em `sales`, `seat_locks` e `sale_passengers`.

---

## 6. Ponto recomendado para inserir aceite

### 6.1 Ponto visual recomendado

Inserir o aceite na etapa atual `step === 3`, junto do resumo e antes do botão “Continuar para pagamento”. Essa etapa já representa “revisão + método de pagamento” e já possui o aceite de intermediação obrigatório.

Ordem recomendada dentro do `step === 3`:

1. Método de pagamento.
2. Resumo da compra.
3. Card de termos da empresa/evento.
4. Checkbox explícito de aceite dos termos da empresa.
5. Checkbox atual de intermediação/responsabilidade da plataforma.
6. Botão `Aceitar e ir para pagamento` ou `Continuar para pagamento` habilitado apenas se os aceites obrigatórios estiverem válidos.

### 6.2 Ponto transacional recomendado

No `handleSubmit`, antes de abrir/usar efetivamente o fluxo de pagamento:

1. Validar passageiros.
2. Validar termos exigidos pelo evento.
3. Validar `intermediationAccepted`.
4. Revalidar assentos/capacidade.
5. Criar `sales` com referência/snapshot do aceite, ou criar `sales` e imediatamente inserir `sale_term_acceptances` antes de `seat_locks`/`sale_passengers` e antes de `create-asaas-payment`.

**Recomendação técnica mais segura:**

- Criar tabela separada `sale_term_acceptances` com `sale_id` único por termo obrigatório e snapshot imutável.
- No `insert` de `sales`, incluir também colunas-resumo opcionais, como `terms_acceptance_required`, `terms_acceptance_status` ou `accepted_terms_version_id`, se a equipe quiser filtros rápidos.
- Após criar `sales`, inserir `sale_term_acceptances` no mesmo bloco do checkout, antes de chamar `create-asaas-payment`.
- Adicionar uma validação de backend em `create-asaas-payment`: se o evento exige termos, recusar cobrança quando não existir aceite válido para a venda.

### 6.3 Impacto de aceitar antes da criação da cobrança

Como a cobrança já é criada depois da venda, não é necessário mover Asaas. O impacto é:

- adicionar carregamento dos termos no checkout;
- adicionar estado de aceite no Step 3;
- persistir aceite antes da Edge Function;
- endurecer `create-asaas-payment` para impedir bypass via chamada direta.

### 6.4 Venda criada antes da cobrança: onde registrar aceite

A venda precisa existir para que o aceite referencie `sale_id`. Portanto:

- o checkbox/consentimento acontece antes do clique final;
- o registro persistente acontece logo após o `insert` em `sales`;
- se falhar ao inserir aceite, fazer rollback de `sales` como já ocorre em falhas de locks/passageiros;
- não chamar `create-asaas-payment` enquanto o aceite não estiver persistido.

---

## 7. Proposta de modelagem de dados

Não aplicar migrations agora. Proposta mínima:

### 7.1 `company_terms`

Documento lógico por empresa.

Campos sugeridos:

- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null references companies(id)`
- `title text not null`
- `term_type text not null`
- `status text not null` — `rascunho`, `vigente`, `substituido`, `inativo` ou status do documento lógico, conforme decisão.
- `current_version_id uuid null` — FK para `company_term_versions(id)` após criação da tabela.
- `is_required_default boolean not null default false`
- `created_by uuid null references auth.users(id)`
- `updated_by uuid null references auth.users(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### 7.2 `company_term_versions`

Versão imutável do conteúdo.

Campos sugeridos:

- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null references companies(id)`
- `term_id uuid not null references company_terms(id)`
- `version_number integer not null`
- `title_snapshot text not null`
- `term_type_snapshot text not null`
- `content text not null`
- `summary text null`
- `status text not null` — `draft`, `published`, `superseded`, `inactive` ou equivalentes em português.
- `published_at timestamptz null`
- `effective_from timestamptz null`
- `published_by uuid null references auth.users(id)`
- `internal_note text null`
- `content_hash text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `unique(term_id, version_number)`
- `unique(id, company_id)` para facilitar FK composta.

### 7.3 `event_term_links`

Vínculo do evento com a versão de termo.

Campos sugeridos:

- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null references companies(id)`
- `event_id uuid not null references events(id) on delete cascade`
- `term_id uuid not null references company_terms(id)`
- `term_version_id uuid not null references company_term_versions(id)`
- `selection_mode text not null` — `company_current_at_publish`, `specific_version`, `no_terms`.
- `acceptance_required boolean not null default true`
- `linked_by uuid null references auth.users(id)`
- `linked_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `unique(event_id, term_id)` ou `unique(event_id)` se só houver um pacote único de termos por evento.

**Observação importante:** se o produto quiser múltiplos documentos por evento, use `unique(event_id, term_id)`; se quiser um “pacote de termos” único, simplificar para `events.company_term_version_id` pode ser suficiente. Pelo PRD, recomendo a tabela `event_term_links`, pois acomoda Termos Gerais, Cancelamento, Embarque etc. sem mudar schema.

### 7.4 `sale_term_acceptances`

Registro imutável do aceite por venda.

Campos sugeridos:

- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null references companies(id)`
- `sale_id uuid not null references sales(id) on delete cascade`
- `event_id uuid not null references events(id)`
- `term_id uuid not null references company_terms(id)`
- `term_version_id uuid not null references company_term_versions(id)`
- `term_title_snapshot text not null`
- `term_type_snapshot text not null`
- `version_number integer not null`
- `content_hash text not null`
- `content_snapshot text not null` — recomendado, mesmo com versão imutável, para máxima rastreabilidade.
- `summary_snapshot text null`
- `accepted_at timestamptz not null default now()`
- `accepted_by_name text null`
- `accepted_by_cpf text null`
- `accepted_by_phone text null`
- `accepted_via text not null` — `public_checkout`, `admin_manual_external`, `admin_manual_internal`.
- `accepted_by_user_id uuid null references auth.users(id)` — usado no manual/admin.
- `ip_address inet null`
- `user_agent text null`
- `explicit_acceptance boolean not null default true`
- `created_at timestamptz not null default now()`
- `unique(sale_id, term_version_id)`.

### 7.5 `term_audit_logs` ou reaproveitamento parcial de logs

Para auditoria de criação/publicação/troca de vigente/vínculo ao evento, `sale_logs` não é suficiente porque depende de `sale_id`. Proposta:

- Criar `company_term_audit_logs` com `company_id`, `term_id`, `term_version_id`, `event_id`, `sale_id`, `action`, `description`, `old_value`, `new_value`, `performed_by`, `metadata`, `created_at`.

Alternativa mínima:

- Usar `sale_logs` apenas para aceite em venda e inconsistências por venda.
- Criar logs específicos de termos para ações administrativas.

### 7.6 Colunas auxiliares opcionais em `events`

Se a equipe preferir consulta rápida sem join para o caso simples:

- `terms_acceptance_required boolean not null default false`
- `terms_selection_mode text null`
- `default_term_version_id uuid null`

Ainda assim, recomendo `event_term_links` como fonte oficial e colunas auxiliares apenas para performance/UX.

---

## 8. Versionamento

### 8.1 Como garantir que termo publicado não seja sobrescrito silenciosamente

- Depois que `company_term_versions.status = 'published'`, bloquear update em `content`, `title_snapshot`, `version_number`, `content_hash` por trigger no banco.
- Permitir update apenas em campos operacionais muito controlados, como `status` de `published` para `superseded`/`inactive`, se necessário.
- No frontend, edição de versão publicada deve abrir fluxo “Criar nova versão”, não editar a versão existente.

### 8.2 Alteração relevante deve gerar nova versão

- Botão “Criar nova versão” copia o conteúdo da vigente para rascunho com `version_number + 1`.
- Publicação da nova versão define `published_at`, `published_by`, `content_hash` e torna a versão anterior `superseded` se ela era vigente.
- A troca de vigente deve ser registrada em auditoria.

### 8.3 Versões antigas continuam acessíveis

- Nunca deletar versões publicadas.
- `company_term_versions` deve manter versões `published`, `superseded` e `inactive` acessíveis para admins e para consulta de venda.
- Inativação deve impedir uso em novos eventos, não apagar histórico.

### 8.4 Venda antiga continua vinculada à versão aceita

- `sale_term_acceptances.term_version_id` aponta para a versão aceita.
- `sale_term_acceptances.content_snapshot` preserva o conteúdo completo aceito.
- Mesmo se `company_terms.current_version_id` mudar, a venda antiga continua exibindo o snapshot/referência original.

### 8.5 Riscos de implementação e prevenção

| Risco | Mitigação |
|---|---|
| Update acidental em versão publicada | Trigger de imutabilidade + UI sem edição direta |
| Venda antiga exibindo termo vigente atual | Sempre consultar `sale_term_acceptances`, nunca `company_terms.current_version_id`, nas telas de venda/ticket |
| Evento apontando para termo de outra empresa | FK composta/trigger validando `event.company_id = term_version.company_id` |
| Termo inativo usado em nova venda | Validação no admin ao publicar/vender e validação em `create-asaas-payment` |
| Snapshot muito grande | `content_snapshot` em tabela separada, índices apenas em IDs/status/datas, não no texto |

---

## 9. Impacto em eventos

### 9.1 Melhor localização na UI

Recomendação: criar uma aba no wizard de evento chamada **“Termos”** ou **“Termos e Políticas”**, entre “Passagens” e “Publicação” ou antes de “Publicação”.

Motivos:

- O PRD pede não poluir a etapa geral com contrato completo.
- `Events.tsx` já usa tabs/wizard e indicadores de etapa.
- A aba de evento deve apenas vincular/revisar termos e mostrar prévia curta.

### 9.2 Comportamento sugerido na aba do evento

A aba deve permitir:

- Ver termo atualmente aplicado.
- Ver versão, status, data de publicação/vigência e empresa.
- Escolher “usar termo vigente da empresa” ou “selecionar versão específica”.
- Exibir prévia/resumo e link/modal para conteúdo completo.
- Marcar se aceite é obrigatório no checkout.
- Alertar quando não houver termo publicado.

### 9.3 Usar vigente da empresa vs versão específica

Recomendação:

- Default para novos eventos: **usar termo vigente da empresa no momento da publicação/venda**.
- Opção avançada: **fixar versão específica**.
- Ao publicar evento `a_venda`, resolver e gravar a versão efetiva em `event_term_links`. Isso evita que a troca de vigente da empresa altere silenciosamente eventos já publicados, salvo se houver decisão explícita de “seguir vigente”.

### 9.4 Bloquear publicação/venda quando obrigatório ausente

Regra recomendada:

- **Não bloquear rascunho** sem termo.
- **Alertar fortemente** em `rascunho` quando aceite obrigatório estiver marcado sem termo publicado.
- **Bloquear publicação para `a_venda`** se `acceptance_required = true` e não houver `term_version_id` publicado/válido.
- Se a empresa optar por evento sem termo obrigatório, permitir publicação, registrando `acceptance_required=false`.

---

## 10. Impacto no checkout público

### 10.1 Melhor formato visual

Recomendação: **card expansível dentro do Step 3**, com botão/link para modal de leitura completa.

Motivos:

- O checkout atual já usa cards, collapsible/accordion e step fixo mobile.
- Modal isolado pode esconder contexto e criar fricção no mobile.
- Drawer/modal pode ser útil para o texto completo, mas o aceite deve estar visível no próprio fluxo.

Formato sugerido:

- Card: “Termos e Políticas da empresa”.
- Exibir empresa responsável, evento, título do termo, versão e data de publicação.
- Prévia/resumo no card.
- Ação “Ler termos completos” abrindo modal/drawer com `ScrollArea`.
- Checkbox: “Li e aceito os Termos de Serviço, Política de Cancelamento e Regras de Embarque da empresa responsável por este evento.”
- Botão final desabilitado enquanto faltarem aceites obrigatórios.

### 10.2 UX mobile

- O card deve ficar antes da barra fixa mobile ou refletir seu estado no botão fixo.
- O botão fixo atual deve considerar `termsAccepted` além de `intermediationAccepted`.
- Mensagem clara ao tentar avançar: “Para continuar, é necessário aceitar os termos deste evento.”

### 10.3 Dados necessários no checkout

No carregamento do evento, buscar o termo efetivo:

- `event_term_links` por `event_id` e `company_id`.
- `company_term_versions` com conteúdo publicado/snapshot atual.
- Caso `acceptance_required=true` e não encontre versão válida, bloquear pagamento e logar erro.

### 10.4 Rastreabilidade posterior

O texto aceito deve ser rastreável por:

- `sale_term_acceptances.term_version_id`;
- `sale_term_acceptances.content_snapshot`;
- `content_hash`;
- `accepted_at`;
- dados do comprador.

---

## 11. Impacto em vendas

### 11.1 Venda pública

Adicionar ao fluxo:

- Estado local de termos carregados.
- Estado local de aceite.
- Validação antes do `insert` em `sales`.
- Inserção em `sale_term_acceptances` depois do `insert` em `sales` e antes de `create-asaas-payment`.
- Rollback da venda se a persistência do aceite falhar.

### 11.2 Venda paga apenas após confirmação válida

A regra atual deve permanecer:

- Venda nasce `pendente_pagamento`.
- Cobrança Asaas é criada.
- Webhook/verify confirmam.
- `payment-finalization.ts` muda para `pago` e cria tickets.

O aceite não deve mudar status de venda nem gerar ticket.

### 11.3 Venda sem aceite por falha/bypass

Adicionar validação em `create-asaas-payment`:

- Carregar `sale`, `event`, `event_term_links`.
- Se evento exige aceite, exigir registro em `sale_term_acceptances` para `sale_id` e `term_version_id` esperado.
- Se ausente, retornar `409`/`400` com `error_code = terms_acceptance_required`.
- Registrar `sale_logs` e `sale_integration_logs`/operational event.

Essa validação é essencial porque frontend sozinho não impede chamada direta à Edge Function.

---

## 12. Impacto em venda manual

### 12.1 Como funciona hoje

Venda manual em `NewSaleModal.tsx`:

- Usuário admin seleciona evento/viagem/embarque/assentos.
- Informa passageiros.
- Cria `sales` com status `reservado`.
- Cria `tickets` diretamente.
- Registra `sale_logs`.
- Se houver taxa de plataforma, cobra taxa separada.

### 12.2 A venda manual deve exigir aceite?

Alternativas:

**Alternativa A — exigir aceite formal também no admin**

- Admin só conclui venda manual se marcar que o cliente aceitou os termos.
- Prós: consistência jurídica/operacional.
- Contras: pode travar atendimento presencial/telefone se o cliente não estiver no fluxo digital.

**Alternativa B — registrar aceite fora do sistema**

- Campo obrigatório quando evento exige termos: “Cliente aceitou os termos fora do checkout público”.
- Exigir responsável admin, data/hora e observação opcional.
- Gravar `sale_term_acceptances.accepted_via = 'admin_manual_external'` e `accepted_by_user_id`.
- Prós: audita o ato sem forçar checkout público.
- Contras: menor força probatória que o aceite direto do comprador.

**Alternativa C — permitir venda manual sem aceite, mas marcar exceção**

- Gravar ausência/dispensa explícita com motivo.
- Prós: flexível.
- Contras: risco jurídico e operacional maior.

### 12.3 Recomendação

Recomendo a **Alternativa B** como padrão mínimo seguro:

- Se evento exige termos, venda manual deve exigir um checkbox administrativo: “Cliente aceitou os termos fora do checkout público”.
- Mostrar a versão do termo aplicada ao evento.
- Registrar aceite em `sale_term_acceptances` com:
  - `accepted_via='admin_manual_external'`;
  - `accepted_by_user_id=user.id`;
  - `accepted_at=now()`;
  - nome/CPF do passageiro comprador;
  - snapshot do termo.
- Registrar `sale_logs` com descrição clara.

Para reservas ou bloqueios:

- `bloqueio`: não exigir aceite, pois não há comprador.
- `reserva`: decisão de produto. Recomendação: se reserva gera compromisso comercial com cliente, exigir aceite fora do sistema ou registrar “pendente de aceite antes de pagamento”.

### 12.4 Riscos

- Admin marcar aceite sem evidência real.
- Disputa posterior por ausência de prova direta do comprador.
- Tickets de venda manual existem antes de pagamento principal; por isso a exibição de termos deve aparecer no comprovante como “aceite registrado pelo admin”, não como aceite público.

---

## 13. Impacto em confirmação, ticket e consulta posterior

### 13.1 Página de confirmação

Em `Confirmation.tsx`:

- Buscar `sale_term_acceptances` por `sale_id`.
- Exibir resumo abaixo dos dados da compra/tickets:
  - “Termos aceitos: Termos Gerais de Transporte — versão 2 — aceito em 12/06/2026 às 14:32.”
- Ação “Ver termos aceitos nesta compra” abre modal com `content_snapshot`.

### 13.2 Ticket/comprovante

Em `TicketCardData` e `TicketCard.tsx`:

- Adicionar campos opcionais de termo aceito.
- Exibir referência compacta no ticket, sem poluir QR/embarque:
  - título;
  - versão;
  - data/hora;
  - origem do aceite.
- PDF/imagem herdam o visual se o dado estiver no `TicketCard`.

### 13.3 Detalhe administrativo da venda

Em `Sales.tsx`:

- Buscar `sale_term_acceptances` junto dos tickets/logs.
- Exibir card “Termos aceitos” no modal de detalhes.
- Mostrar alerta se evento exige termos e não há aceite.

### 13.4 Diagnóstico da venda

Em `SalesDiagnostic.tsx`:

- Incluir `sale_term_acceptances` nos dados brutos/diagnóstico.
- Exibir status:
  - `OK: aceite encontrado`;
  - `Atenção: evento sem termos obrigatórios`;
  - `Crítico: evento exigia termos, pagamento confirmado sem aceite`.

### 13.5 Consulta pública do ticket

Em `ticket-lookup/index.ts`:

- Incluir resumo do aceite por venda no payload.
- Não retornar termos de outra venda/empresa.
- Abrir a versão aceita/snapshot da própria venda.

---

## 14. Impacto em permissões e RLS

### 14.1 Regras obrigatórias

- Empresa não pode ver termos de outra empresa.
- Evento só pode usar termo da própria empresa.
- Venda só pode aceitar termo da empresa responsável pelo evento.
- Admin só vê termos/vendas conforme permissão atual.
- Suporte/dev segue padrão atual: developer cross-company via app e/ou service role nas Edge Functions, sem ampliar indevidamente o acesso público.

### 14.2 Proposta de RLS

#### `company_terms`

- SELECT authenticated: `user_belongs_to_company(auth.uid(), company_id)`.
- INSERT/UPDATE authenticated: `is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id)`.
- DELETE: evitar ou restringir a rascunhos sem versões/vendas; preferir `status='inativo'`.

#### `company_term_versions`

- SELECT authenticated: empresa do usuário.
- SELECT público: apenas por RPC/Edge Function ou policy limitada a versões vinculadas a eventos `a_venda` e com `acceptance_required=true`. Recomendação: evitar SELECT público direto do conteúdo completo e usar RPC/Edge Function pública controlada.
- INSERT/UPDATE draft/publish: admin da empresa.
- Trigger de imutabilidade para versões publicadas.

#### `event_term_links`

- SELECT authenticated: empresa do usuário.
- SELECT público: links de eventos `a_venda` necessários ao checkout.
- INSERT/UPDATE: admin da empresa.
- Trigger/FK validando company_id do evento e termo.

#### `sale_term_acceptances`

- SELECT authenticated: `user_belongs_to_company(auth.uid(), company_id)`.
- SELECT público: por venda/ticket somente em contexto seguro. Recomendação: RPC/Edge Function para confirmation/ticket lookup, evitando policy aberta `USING (true)` com conteúdo completo.
- INSERT público: apenas se a venda referenciada for de evento `a_venda`, mesma empresa, e versão vinculada ao evento. Como isso é complexo em policy, melhor usar RPC `record_public_terms_acceptance` ou inserir via Edge Function/service role.
- INSERT admin: admin da empresa para venda manual.
- UPDATE/DELETE: não permitir em registros de aceite; criar correções por novo log, não mutar aceite.

### 14.3 Ponto de atenção

O checkout hoje insere `sales`, `seat_locks` e `sale_passengers` diretamente pelo cliente Supabase com policies públicas. Para `sale_term_acceptances`, uma policy pública bem feita é possível, mas arriscada por envolver conteúdo jurídico e validação cruzada. A alternativa mais segura é usar uma Edge Function/RPC security definer para criar venda + aceite de forma atômica no futuro. Como implantação incremental, dá para começar com insert direto + validação defensiva em `create-asaas-payment`, mas o ideal de longo prazo é transação backend.

---

## 15. Impacto em auditoria e logs

### 15.1 Eventos de auditoria necessários

| Evento | Onde registrar |
|---|---|
| Criação de termo | `company_term_audit_logs` |
| Publicação de versão | `company_term_audit_logs` |
| Troca de termo vigente | `company_term_audit_logs` |
| Inativação/substituição | `company_term_audit_logs` |
| Vínculo de termo ao evento | `company_term_audit_logs` e opcional `sale_logs` não se aplica |
| Aceite no checkout | `sale_term_acceptances` + `sale_logs` |
| Tentativa de pagamento sem aceite | `sale_logs` + `sale_integration_logs`/operational event |
| Pagamento confirmado sem aceite obrigatório | `sale_logs` + diagnóstico/critical payment issue |

### 15.2 Reaproveitamento de logs existentes

- `sale_logs` deve ser reaproveitado para eventos por venda.
- `sale_integration_logs` deve ser usado se a falha ocorrer na borda de integração/criação de cobrança.
- Para ações administrativas de termos, criar log próprio é mais correto porque não há `sale_id`.

---

## 16. Impacto no Asaas

### 16.1 O que não deve mudar

A melhoria não deve alterar:

- webhook Asaas;
- split financeiro;
- confirmação de pagamento;
- regra de venda paga;
- verify payment;
- finalização de ticket;
- payload financeiro principal da cobrança;
- cálculo de taxa/plataforma/sócio/representante.

### 16.2 Onde Asaas é impactado indiretamente

A única mudança necessária perto do Asaas é uma **guarda antes da criação da cobrança** em `create-asaas-payment`:

- Se evento exige aceite e não existe `sale_term_acceptances`, retornar erro e não criar cobrança.
- Se aceite existe e corresponde ao termo vinculado ao evento, seguir fluxo atual intacto.

### 16.3 Confirmação por webhook/verify

Não deve haver alteração na regra de confirmação. Porém, diagnóstico pós-confirmação deve alertar se:

- evento exigia termo;
- venda está `pago`;
- não há aceite registrado.

Esse cenário deve ser tratado como inconsistência operacional crítica, não como motivo para desfazer pagamento automaticamente.

---

## 17. Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Regressão no checkout | Comprador não conclui compra | Inserir card no Step 3 sem alterar Step 1/2; testes desktop/mobile; feature flag se necessário |
| Quebra no mobile | Botão fixo permite avançar sem aceite ou layout fica poluído | Incluir `termsAccepted` no disabled do botão fixo; card compacto; modal/drawer só para texto completo |
| Venda com pagamento sem aceite | Risco jurídico e inconsistência | Validação frontend + validação obrigatória em `create-asaas-payment` antes de criar cobrança |
| Aceite salvo sem venda | Registro órfão | `sale_id` obrigatório FK; inserir aceite após criar venda; rollback se falhar |
| Venda antiga apontando para termo novo | Quebra da regra de ouro | `sale_term_acceptances` com `term_version_id` e `content_snapshot`; nunca consultar vigente para venda antiga |
| Termo de outra empresa vinculado ao evento | Vazamento multiempresa | FK/trigger validando `company_id`; RLS; filtros por `activeCompanyId` |
| Evento publicado com termo inativo | Checkout bloqueado ou aceita termo inválido | Validar na publicação e em `create-asaas-payment`; alertar admin |
| Dificuldade de suporte | Atendimento sem visibilidade | Exibir aceite em `Sales.tsx`, `SalesDiagnostic.tsx`, confirmação e ticket |
| Conflito com venda manual | Admin não sabe como registrar aceite | Campo explícito “aceite fora do sistema”; log com usuário admin; política documentada |
| Performance | Conteúdo longo carregado no checkout/listagens | Carregar resumo no checkout e conteúdo completo sob demanda; não indexar texto completo; usar tabela separada |
| Policy pública permissiva demais | Exposição de termos/aceites | Preferir RPC/Edge Function pública controlada para consulta/gravação |
| Pagamento confirmado sem aceite por bug legado | Estado crítico pós-fato | Diagnóstico e `sale_logs`; reconciliar manualmente sem alterar pagamento |

---

## 18. Plano incremental de implantação

### Etapa 1 — Análise e mapeamento

- **Objetivo:** consolidar decisões de fluxo, pontos de tela e modelagem.
- **Arquivos/telas prováveis:** este documento; PRD; `Checkout.tsx`; `Events.tsx`; `NewSaleModal.tsx`; Edge Functions Asaas.
- **Risco:** decisão incompleta gerar retrabalho.
- **Critério de aceite:** plano aprovado com regra de venda pública/manual e escopo de dados.
- **Exige migration:** não.
- **Exige RLS:** não.

### Etapa 2 — Modelagem mínima de dados

- **Objetivo:** criar tabelas de termos, versões, vínculo de evento e aceite por venda.
- **Arquivos/telas prováveis:** novas migrations Supabase; tipos gerados; `src/types/database.ts` se mantido manualmente.
- **Risco:** modelagem sem imutabilidade suficiente.
- **Critério de aceite:** tabelas com `company_id`, FKs, índices, RLS e triggers de imutabilidade.
- **Exige migration:** sim.
- **Exige RLS:** sim.

### Etapa 3 — Área administrativa de termos

- **Objetivo:** CRUD administrativo de termos por empresa.
- **Arquivos/telas prováveis:** nova rota `/admin/empresa/termos` ou aba em `Company.tsx`; `AdminSidebar.tsx` se rota separada; componentes UI existentes de cards/tabela/dialog.
- **Risco:** criar padrão visual fora do Lovable/admin atual.
- **Critério de aceite:** gerente/developer cria rascunho, visualiza lista/histórico, sem acessar outra empresa.
- **Exige migration:** depende da etapa 2 já aplicada.
- **Exige RLS:** sim, já na etapa 2.

### Etapa 4 — Versionamento/publicação

- **Objetivo:** publicar versões, criar nova versão a partir de publicada e marcar vigente.
- **Arquivos/telas prováveis:** tela de termos; migrations/triggers; logs.
- **Risco:** permitir edição silenciosa de versão publicada.
- **Critério de aceite:** versão publicada não edita conteúdo; nova alteração gera versão nova; auditoria registra usuário/data.
- **Exige migration:** possivelmente triggers/funções.
- **Exige RLS:** sim.

### Etapa 5 — Vínculo com evento

- **Objetivo:** evento seleciona termo vigente ou versão específica.
- **Arquivos/telas prováveis:** `src/pages/admin/Events.tsx`; possível componente tab “Termos”; `EventDetail.tsx` para resumo.
- **Risco:** poluir wizard ou publicar sem versão válida.
- **Critério de aceite:** evento `a_venda` com aceite obrigatório sempre tem `event_term_links` válido; evento pode ficar sem termo se aceite não obrigatório.
- **Exige migration:** sim, se `event_term_links` não existir ainda.
- **Exige RLS:** sim.

### Etapa 6 — Aceite no checkout

- **Objetivo:** exibir termos no Step 3 e bloquear avanço sem aceite.
- **Arquivos/telas prováveis:** `src/pages/public/Checkout.tsx`; possível componente reutilizável de card/modal; RPC/Edge Function para buscar termo público.
- **Risco:** regressão mobile e popup Asaas.
- **Critério de aceite:** botão final desabilita sem aceite; mensagem clara; leitura do conteúdo completo; fluxo Step 1/2 intacto.
- **Exige migration:** não se etapa 2/5 já existe.
- **Exige RLS:** talvez policy/RPC pública para leitura.

### Etapa 7 — Registro do aceite na venda

- **Objetivo:** persistir `sale_term_acceptances` antes da cobrança.
- **Arquivos/telas prováveis:** `Checkout.tsx`; possível RPC/Edge Function; `create-asaas-payment` para guarda backend.
- **Risco:** venda pendente sem aceite; aceite sem venda; bypass da Edge Function.
- **Critério de aceite:** venda pública com evento obrigatório sempre tem aceite antes da cobrança; sem aceite, `create-asaas-payment` recusa.
- **Exige migration:** sim, tabela de aceite.
- **Exige RLS:** sim.

### Etapa 8 — Exibição em confirmação/ticket

- **Objetivo:** mostrar referência e abrir snapshot aceito.
- **Arquivos/telas prováveis:** `Confirmation.tsx`; `TicketCard.tsx`; `PassengerTicketList.tsx`; `ticket-lookup/index.ts`; `TicketLookup.tsx`.
- **Risco:** expor conteúdo de outra venda ou poluir ticket.
- **Critério de aceite:** confirmação e ticket exibem versão aceita da venda; consulta abre snapshot, não vigente atual.
- **Exige migration:** não.
- **Exige RLS:** pode exigir RPC/Edge Function pública segura.

### Etapa 9 — Diagnóstico administrativo

- **Objetivo:** dar suporte/auditoria para aceite.
- **Arquivos/telas prováveis:** `Sales.tsx`; `SalesDiagnostic.tsx`; `sale_logs`; `sale_integration_logs`.
- **Risco:** suporte não identificar inconsistências.
- **Critério de aceite:** admin vê aceite, versão, data/hora e origem; diagnóstico alerta pagamento sem aceite obrigatório.
- **Exige migration:** não, se logs já bastarem.
- **Exige RLS:** não além das tabelas novas.

### Etapa 10 — Venda manual

- **Objetivo:** registrar aceite fora do checkout ou exceção auditada.
- **Arquivos/telas prováveis:** `NewSaleModal.tsx`; `Sales.tsx`; `sale_term_acceptances`; `sale_logs`.
- **Risco:** admin marcar aceite sem prova ou fluxo ficar lento.
- **Critério de aceite:** evento obrigatório exige checkbox administrativo; log registra usuário e versão; bloqueio não exige aceite.
- **Exige migration:** não, se tabela de aceite já existe.
- **Exige RLS:** sim para insert admin.

### Etapa 11 — Testes e validação

- **Objetivo:** cobrir fluxo público, manual, multiempresa, Asaas e histórico.
- **Arquivos/telas prováveis:** testes manuais; testes unitários existentes; possível teste de Edge Function/RPC.
- **Risco:** falso positivo sem testar bypass/backend.
- **Critério de aceite:** checklist abaixo aprovado em desktop/mobile, Pix/cartão e empresas diferentes.
- **Exige migration:** não.
- **Exige RLS:** não.

---

## 19. Checklist de testes recomendados

### 19.1 Testes manuais administrativos

- [ ] Empresa A cria termo em rascunho.
- [ ] Empresa A publica versão 1.
- [ ] Empresa A marca versão 1 como vigente.
- [ ] Empresa A cria nova versão 2 a partir da versão 1.
- [ ] Versão publicada não permite edição silenciosa de conteúdo.
- [ ] Versão antiga continua acessível no histórico.
- [ ] Empresa B não vê termos da Empresa A.
- [ ] Usuário operador sem permissão não publica termo, se essa regra for adotada.
- [ ] Developer/suporte acessa conforme padrão atual permitido.

### 19.2 Testes de evento

- [ ] Evento usa termo vigente da empresa.
- [ ] Evento usa versão específica.
- [ ] Evento sem termo é permitido quando aceite não obrigatório.
- [ ] Publicação é bloqueada quando aceite obrigatório não tem versão válida.
- [ ] Evento não consegue vincular termo de outra empresa.
- [ ] Evento publicado continua apontando para versão correta após troca de vigente.
- [ ] Evento com termo inativo mostra alerta operacional.

### 19.3 Testes de checkout público

- [ ] Checkout carrega evento com termos obrigatórios.
- [ ] Checkout exibe empresa, título, versão e prévia do termo.
- [ ] Modal/drawer/card abre conteúdo completo.
- [ ] Botão de pagamento fica bloqueado sem aceite.
- [ ] Mensagem “Para continuar, é necessário aceitar os termos deste evento.” aparece quando aplicável.
- [ ] Checkout libera pagamento com aceite.
- [ ] Venda registra versão aceita.
- [ ] Aceite é gravado antes de `create-asaas-payment`.
- [ ] Chamada direta a `create-asaas-payment` sem aceite é recusada.
- [ ] Aceite salvo + falha no pagamento mantém rastreabilidade sem marcar venda como paga.

### 19.4 Testes de histórico/versionamento

- [ ] Cliente A compra aceitando versão 1.
- [ ] Empresa publica versão 2.
- [ ] Cliente A continua vendo versão 1.
- [ ] Nova venda usa versão 2 quando evento/configuração determinar.
- [ ] Ticket antigo abre snapshot antigo, não termo vigente.

### 19.5 Testes de confirmação/ticket/consulta

- [ ] Página de confirmação mostra “Termos aceitos: ...”.
- [ ] Ticket/comprovante mostra referência compacta.
- [ ] PDF/imagem do ticket mantém layout legível.
- [ ] Consulta pública por CPF retorna referência dos termos da venda.
- [ ] Link “Ver termos aceitos” abre snapshot aceito.
- [ ] Admin consulta aceite em detalhes da venda.
- [ ] Diagnóstico mostra aceite e alerta inconsistências.

### 19.6 Testes de venda manual

- [ ] Venda manual de evento obrigatório exige aceite fora do sistema.
- [ ] Admin registra aceite externo com usuário/data/hora.
- [ ] `sale_logs` registra ação e versão.
- [ ] Reserva segue regra definida: exige aceite ou marca pendente/exceção.
- [ ] Bloqueio não exige aceite.
- [ ] Comprovante de venda manual diferencia aceite público de aceite registrado pelo admin.

### 19.7 Testes Asaas

- [ ] Pix após aceite segue fluxo atual.
- [ ] Cartão após aceite segue fluxo atual.
- [ ] Webhook confirma venda sem depender de lógica de termos.
- [ ] Verify confirma venda sem depender de lógica de termos.
- [ ] Split financeiro mantém valores atuais.
- [ ] Cobrança não é criada quando evento exige termo e aceite está ausente.
- [ ] Pagamento confirmado sem aceite quando evento exigia termos aparece como inconsistência crítica no diagnóstico.

### 19.8 Testes responsivos/performance

- [ ] Checkout desktop.
- [ ] Checkout mobile com barra fixa.
- [ ] Conteúdo longo de termo não quebra layout.
- [ ] Listagens administrativas não carregam texto completo desnecessariamente.
- [ ] Consulta de ticket não expõe termos de outra venda/empresa.

---

## 20. Dúvidas pendentes

1. O produto quer permitir **múltiplos documentos por evento** ou um **pacote único de termos** por evento?
2. A empresa pode publicar evento sem termo se `acceptance_required=false`, ou termos serão obrigatórios para todas as vendas online no futuro?
3. Quais papéis podem publicar/inativar termos: apenas `gerente` e `developer`, ou `operador` também pode gerenciar rascunhos?
4. A venda manual deve bloquear finalização sem aceite externo para reservas, ou somente para venda manual efetiva?
5. O comprador precisa rolar até o fim do texto antes de marcar aceite, ou checkbox explícito basta?
6. Deve haver resumo dos pontos principais (`summary`) obrigatório para melhorar UX?
7. O conteúdo aceito deve ficar sempre em `content_snapshot` por venda, mesmo duplicando texto, ou a equipe prefere apenas referência imutável a `company_term_versions`? Minha recomendação é combinação dos dois.
8. A consulta pública do termo aceito deve exigir algum token/código da venda, ou a consulta por CPF já é suficiente dentro do padrão atual?

---

## 21. Recomendação final

Implementar a melhoria é viável sem alterar o fluxo financeiro principal, desde que sejam respeitados estes princípios:

1. **Não reutilizar `platform_fee_terms_*` para termos da empresa.** Esses campos têm outro significado.
2. **Criar versionamento imutável por empresa.** Termo publicado não pode ser editado silenciosamente.
3. **Resolver versão efetiva no evento.** O checkout não deve depender do termo vigente atual se o evento já fixou uma versão.
4. **Exigir aceite no Step 3 do checkout.** É o ponto mais compatível com o fluxo atual de resumo/pagamento.
5. **Persistir aceite antes da cobrança Asaas.** Venda pode nascer antes, mas cobrança não deve ser criada sem aceite quando obrigatório.
6. **Adicionar guarda em `create-asaas-payment`.** É a proteção contra bypass e a principal blindagem técnica.
7. **Manter webhook/verify/split/finalização intactos.** Apenas diagnóstico deve apontar inconsistência se pagamento confirmado sem aceite obrigatório.
8. **Tratar venda manual como fluxo auditado separado.** Recomendado registrar aceite externo pelo admin, com versão/snapshot e `sale_logs`.
9. **Exibir sempre a versão aceita da venda.** Confirmação, ticket, consulta pública e admin devem abrir `sale_term_acceptances.content_snapshot`, não o termo vigente.

A implementação simples é possível, mas a parte crítica é a combinação de **RLS + imutabilidade + validação backend antes de Asaas**. Sem esses três pontos, há risco real de venda paga sem aceite, aceite de termo de outra empresa ou venda antiga apontando para termo novo.
