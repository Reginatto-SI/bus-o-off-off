# Fase 1 — Termos de Serviço, Políticas da Empresa e Aceite no Checkout

## 1. Resumo do que foi implementado

A Fase 1 implementa somente a fundação de banco de dados para permitir, em fases futuras, o fluxo:

> A empresa cadastra seus termos, o evento define qual versão será aplicada, o comprador aceita antes do pagamento, e a venda guarda para sempre a versão aceita no momento da compra.

Foram criadas estruturas para:

- termos lógicos por empresa;
- versões auditáveis dos termos;
- vínculo futuro entre evento e versão de termo;
- aceite futuro por venda com snapshot imutável;
- auditoria administrativa de ações relacionadas a termos;
- isolamento multiempresa por `company_id`;
- constraints e triggers para evitar vínculo entre empresas diferentes;
- proteção contra edição silenciosa de versões publicadas.

Não foram alterados checkout, telas administrativas, Asaas, webhook, split, venda manual, confirmação, ticket ou diagnóstico visual.

## 2. Migration criada

- `supabase/migrations/20261108120000_create_company_terms_phase1.sql`

A migration também cria índices compostos auxiliares em tabelas existentes para permitir FKs multiempresa seguras:

- `events_id_company_id_unique_idx` em `events(id, company_id)`;
- `sales_id_company_id_unique_idx` em `sales(id, company_id)`;
- `sales_id_event_id_company_id_unique_idx` em `sales(id, event_id, company_id)`.

## 3. Tabelas criadas

### `company_terms`

Agrupador lógico do termo por empresa.

Principais campos:

- `id`;
- `company_id`;
- `title`;
- `term_type`;
- `status`;
- `current_version_id`;
- `created_by`;
- `updated_by`;
- `created_at`;
- `updated_at`.

Status permitidos:

- `rascunho`;
- `vigente`;
- `substituido`;
- `inativo`.

Tipos permitidos:

- `termos_servico`;
- `politica_cancelamento`;
- `politica_reembolso`;
- `regras_embarque`;
- `regras_evento`;
- `personalizado`.

### `company_term_versions`

Conteúdo versionado e auditável do termo.

Principais campos:

- `id`;
- `company_id`;
- `term_id`;
- `version_number`;
- `title`;
- `term_type`;
- `content`;
- `summary`;
- `content_hash`;
- `status`;
- `published_at`;
- `published_by`;
- `effective_from`;
- `internal_note`;
- `created_by`;
- `updated_by`;
- `created_at`;
- `updated_at`.

Status permitidos:

- `draft`;
- `published`;
- `superseded`;
- `inactive`.

A versão recebe `content_hash` SHA-256 automaticamente quando o hash não é informado.

### `event_term_links`

Base para o evento apontar para a versão aplicada.

Principais campos:

- `id`;
- `company_id`;
- `event_id`;
- `term_id`;
- `term_version_id`;
- `selection_mode`;
- `acceptance_required`;
- `linked_by`;
- `created_at`;
- `updated_at`.

Modos permitidos:

- `company_current_at_publish`;
- `specific_version`.

`selection_mode` é a fonte única para indicar se a versão foi resolvida a partir da vigente da empresa no momento da publicação ou escolhida explicitamente. A coluna booleana `use_current_version` foi removida para evitar duplicidade de responsabilidade.

A tabela exige que evento, termo e versão pertençam à mesma empresa. Novos vínculos só podem ser criados com versões `published`; se uma versão vinculada virar `superseded` depois, o vínculo antigo continua preservado por referência histórica.

### `sale_term_acceptances`

Base para registrar, futuramente, o aceite da versão de termo por venda.

Principais campos:

- `id`;
- `company_id`;
- `sale_id`;
- `event_id`;
- `term_id`;
- `term_version_id`;
- `term_title_snapshot`;
- `term_type_snapshot`;
- `version_number`;
- `content_hash`;
- `accepted_text_snapshot`;
- `summary_snapshot`;
- `accepted_at`;
- `accepted_by_name`;
- `accepted_by_cpf`;
- `accepted_by_phone`;
- `acceptance_origin`;
- `ip_address`;
- `user_agent`;
- `accepted_by_user_id`;
- `explicit_acceptance`;
- `created_at`.

Origens permitidas:

- `public_checkout`;
- `admin_manual_external`;
- `admin_manual_internal`;
- `support_adjustment`.

A tabela não possui `acceptance_status`: o aceite representa um fato histórico imutável. Se uma invalidação operacional for necessária no futuro, ela deve ser registrada em tabela/log separado, por exemplo `company_term_audit_logs`, sem mutar ou apagar o aceite original.

A tabela já nasce com snapshot completo (`accepted_text_snapshot`) para preservar vendas antigas mesmo que o termo mude no futuro.

### `company_term_audit_logs`

Trilha administrativa para ações futuras de criação, publicação, troca de vigente, vínculo ao evento e ajustes operacionais.

Principais campos:

- `id`;
- `company_id`;
- `term_id`;
- `term_version_id`;
- `event_id`;
- `sale_id`;
- `action`;
- `description`;
- `old_value`;
- `new_value`;
- `metadata`;
- `performed_by`;
- `created_at`.

## 4. RLS aplicada

Nesta fase não foi aberta nenhuma leitura pública.

### Leitura autenticada

Usuários autenticados podem consultar apenas registros da própria empresa via:

```sql
public.user_belongs_to_company(auth.uid(), company_id)
```

Aplicado em:

- `company_terms`;
- `company_term_versions`;
- `event_term_links`;
- `sale_term_acceptances`;
- `company_term_audit_logs`.

### Escrita administrativa

Inserção/atualização administrativa usa o padrão:

```sql
public.is_admin(auth.uid())
and public.user_belongs_to_company(auth.uid(), company_id)
```

Aplicado em:

- `company_terms`;
- `company_term_versions`;
- `event_term_links`;
- `sale_term_acceptances` somente para base administrativa futura;
- `company_term_audit_logs`.

### Deletes

Não foram criadas policies de delete para usuários autenticados. A operação normal esperada é mudança de status (`inativo`, `superseded`), não remoção física.

Além disso, versões publicadas/substituídas/inativas são protegidas por trigger contra delete físico.

## 5. Constraints e índices

### Integridade multiempresa

- `company_term_versions(term_id, company_id)` referencia `company_terms(id, company_id)`.
- `company_terms(current_version_id, company_id)` referencia `company_term_versions(id, company_id)`.
- `event_term_links(event_id, company_id)` referencia `events(id, company_id)`.
- `event_term_links(term_id, company_id)` referencia `company_terms(id, company_id)`.
- `event_term_links(term_version_id, term_id, company_id)` referencia `company_term_versions(id, term_id, company_id)`.
- `sale_term_acceptances(sale_id, event_id, company_id)` referencia `sales(id, event_id, company_id)`.
- `sale_term_acceptances(event_id, term_version_id, company_id)` referencia `event_term_links(event_id, term_version_id, company_id)`.
- `sale_term_acceptances(term_version_id, term_id, company_id)` referencia `company_term_versions(id, term_id, company_id)`.

Essas FKs impedem:

- evento vincular termo de outra empresa;
- aceite registrar termo de outra empresa;
- aceite apontar para evento diferente da venda;
- versão ser associada a termo de outra empresa.

### Unicidade e consulta

Índices principais:

- termo único por empresa/título/tipo;
- versão única por termo/empresa/número;
- apenas uma versão `published` por termo;
- vínculo único de termo por evento;
- aceite único por venda e versão de termo;
- índices por `company_id`, evento, venda e versão para as consultas futuras.

## 6. Regra de imutabilidade

A migration cria triggers para garantir:

- versão em `draft` pode ser editada;
- ao publicar (`published`, `superseded`, `inactive`), `published_at` passa a ser obrigatório e `published_by` é preenchido quando houver `auth.uid()` disponível;
- conteúdo publicado não pode mudar silenciosamente;
- campos imutáveis de versões não-draft não podem ser alterados:
  - `company_id`;
  - `term_id`;
  - `version_number`;
  - `title`;
  - `term_type`;
  - `content`;
  - `summary`;
  - `content_hash`;
  - `published_at`;
  - `published_by`;
  - `effective_from`.
- versão publicada/substituída/inativa não pode ser deletada;
- `current_version_id` de `company_terms` só pode apontar para versão `published` do mesmo termo e empresa;
- `event_term_links` só aceita novos vínculos com versão `published`; versões já vinculadas podem virar `superseded` posteriormente sem quebrar o histórico;
- `sale_term_acceptances` não aceita versão em `draft`, não possui status mutável e é imutável após inserção.

## 7. Como a estrutura suporta as próximas fases

### Fase 2 — Administração de termos

A tela administrativa poderá usar:

- `company_terms` para listar termos por empresa;
- `company_term_versions` para criar rascunhos, publicar versões e exibir histórico;
- `company_term_audit_logs` para registrar ações administrativas.

### Fase 3 — Vínculo com evento

O wizard de evento poderá usar:

- `event_term_links` para escolher versão específica ou versão vigente resolvida no momento da publicação via `selection_mode`;
- `acceptance_required` para indicar se o checkout deve exigir aceite;
- constraints multiempresa para impedir termo de outra empresa.

### Fase 4 — Checkout público

O checkout poderá:

- carregar os vínculos do evento;
- exibir a versão publicada vinculada;
- registrar o aceite em `sale_term_acceptances` antes da cobrança;
- usar o snapshot persistido para consulta posterior.

A leitura pública ainda precisará ser desenhada com RPC/Edge Function ou policies específicas. Ela não foi aberta nesta fase.

### Fase 5 — Confirmação, ticket, venda manual e diagnóstico

As telas futuras poderão consultar:

- `sale_term_acceptances` para mostrar “Termos aceitos”;
- `company_term_audit_logs` para suporte/auditoria;
- `event_term_links` para diagnosticar evento com termo obrigatório sem aceite.

## 8. Pendências por fase

### Pendências para Fase 2

- Criar tela/aba administrativa de termos.
- Implementar ações de criar rascunho, publicar, criar nova versão e marcar vigente.
- Gravar logs administrativos em `company_term_audit_logs`.
- Definir exatamente quais papéis podem publicar/inativar termos.

### Pendências para Fase 3

- Criar vínculo visual no evento.
- Resolver se evento usa versão vigente no momento da publicação ou versão específica.
- Validar publicação do evento quando `acceptance_required=true` e não houver versão válida.

### Pendências para Fase 4

- Implementar leitura pública segura dos termos do evento.
- Inserir card/modal/drawer de aceite no checkout.
- Registrar `sale_term_acceptances` antes da cobrança, mantendo qualquer invalidação futura em log separado sem mutar o aceite original.
- Adicionar guarda em `create-asaas-payment` para bloquear cobrança sem aceite quando obrigatório.

### Pendências para Fase 5

- Exibir referência dos termos aceitos na confirmação.
- Exibir referência no ticket/comprovante.
- Incluir aceite em consulta pública de passagens.
- Incluir diagnóstico administrativo de venda paga sem aceite obrigatório.
- Definir comportamento final da venda manual com aceite externo.

## 9. Checklist de validação manual

> As queries abaixo são exemplos de validação para ambiente local/homologação. Substitua os UUIDs por empresas, eventos e vendas reais do ambiente de teste.

### Migration aplica sem erro

```bash
supabase db push
```

### Empresa A cria termo

```sql
insert into public.company_terms (company_id, title, term_type, status)
values ('<company_a_id>', 'Termos Gerais de Transporte', 'termos_servico', 'rascunho');
```

### Versão 1 é criada

```sql
insert into public.company_term_versions (
  company_id,
  term_id,
  version_number,
  title,
  term_type,
  content,
  status
)
values (
  '<company_a_id>',
  '<term_id>',
  1,
  'Termos Gerais de Transporte',
  'termos_servico',
  'Conteúdo da versão 1',
  'draft'
);
```

### Versão 1 é publicada

```sql
update public.company_term_versions
set status = 'published'
where id = '<term_version_1_id>';
```

### Termo aponta para versão vigente

```sql
update public.company_terms
set status = 'vigente', current_version_id = '<term_version_1_id>'
where id = '<term_id>';
```

### Tentativa de alterar conteúdo publicado é bloqueada

```sql
update public.company_term_versions
set content = 'Novo conteúdo indevido'
where id = '<term_version_1_id>';
-- Esperado: erro "Published term versions are immutable..."
```

### Versão 2 pode ser criada sem apagar versão 1

```sql
insert into public.company_term_versions (
  company_id,
  term_id,
  version_number,
  title,
  term_type,
  content,
  status
)
values (
  '<company_a_id>',
  '<term_id>',
  2,
  'Termos Gerais de Transporte',
  'termos_servico',
  'Conteúdo da versão 2',
  'draft'
);
```

### Evento não pode ser vinculado a termo de outra empresa

```sql
insert into public.event_term_links (
  company_id,
  event_id,
  term_id,
  term_version_id,
  acceptance_required
)
values (
  '<company_b_id>',
  '<event_company_a_id>',
  '<term_company_a_id>',
  '<term_version_company_a_id>',
  true
);
-- Esperado: erro de FK/RLS por inconsistência de company_id.
```

### Venda não pode aceitar termo de outra empresa

```sql
insert into public.sale_term_acceptances (
  company_id,
  sale_id,
  event_id,
  term_id,
  term_version_id,
  term_title_snapshot,
  term_type_snapshot,
  version_number,
  content_hash,
  accepted_text_snapshot,
  acceptance_origin
)
values (
  '<company_b_id>',
  '<sale_company_a_id>',
  '<event_company_a_id>',
  '<term_company_b_id>',
  '<term_version_company_b_id>',
  'Termo de outra empresa',
  'termos_servico',
  1,
  'hash',
  'snapshot',
  'public_checkout'
);
-- Esperado: erro de FK/RLS por venda/evento/termo de empresas diferentes.
```

### Empresa B não lê termos da Empresa A

Executar como usuário autenticado somente na Empresa B:

```sql
select *
from public.company_terms
where company_id = '<company_a_id>';
-- Esperado: 0 linhas por RLS.
```

## 10. Validação final da migration

Validação executada nesta revisão:

```bash
npx supabase db lint
```

Resultado no ambiente atual: **bloqueado por infraestrutura local**, pois o CLI não conseguiu conectar no Postgres local em `127.0.0.1:54322`. Também não há Docker disponível no container para subir o Supabase local.

Bloqueio antes de produção: aplicar a migration em um ambiente Supabase/Postgres disponível (`supabase db push` ou pipeline de staging) e executar as queries do checklist manual antes de promover para produção.

## 11. Observações finais

- A Fase 1 não abriu leitura pública de termos porque o checkout ainda não foi implementado.
- A leitura pública futura deve ser feita com cuidado, preferencialmente por RPC/Edge Function que retorne apenas versões vinculadas a eventos publicados.
- A estrutura de aceite já está preparada para snapshot completo, evitando que vendas antigas passem a apontar para termos novos.
