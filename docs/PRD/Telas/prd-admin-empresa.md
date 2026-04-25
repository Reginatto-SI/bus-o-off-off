# PRD — Tela `/admin/empresa`

## 1) Objetivo da tela
Centralizar a configuração da empresa ativa (dados cadastrais, identidade, vitrine pública, políticas operacionais e integração de pagamentos Asaas), com persistência em `public.companies` e respeito ao isolamento multiempresa por `company_id`/RLS.

## 2) Público usuário
- **Gerente**: acesso principal à edição da empresa.
- **Developer**: pode editar e visualizar blocos técnicos (ex.: comissionamento/diagnóstico).
- **Operador**: acesso à tela com limitações de edição.
- Usuários fora desse escopo são redirecionados para `/admin/eventos`.

## 3) Rotas e arquivos relacionados
- Rota: `/admin/empresa` em `src/App.tsx`.
- Página principal: `src/pages/admin/Company.tsx`.
- Componentes reutilizados relevantes:
  - `AdminLayout`, `PageHeader`, `BrandIdentityTab`.
  - `AsaasOnboardingWizard`, `AsaasDiagnosticPanel`.
  - `CityAutocomplete`, `Tabs`, `Card`, `Alert`, etc.
- Vitrine pública vinculada:
  - `/empresa/:nick` → `src/pages/public/PublicCompanyShowcase.tsx`.
  - `/:nick` (atalho curto) → `src/pages/public/PublicCompanyShortLink.tsx`.

## 4) Estrutura geral da tela
A tela usa um `form` único com `handleSubmit`, segmentado em abas (`Tabs`).
- Carrega empresa ativa via `activeCompanyId` (`companies.select`).
- Hidrata estado local com `hydrateFormFromCompany`.
- Salva por `companies.update` (ou `insert` no fallback sem empresa existente).

## 5) Abas/seções existentes
1. **Dados Gerais**
2. **Endereço**
3. **Contato**
4. **Observações**
5. **Identidade Visual**
6. **Redes Sociais**
7. **Configurações**
8. **Pagamentos**
9. **Vitrine Pública** (exibida para gerente)

## 6) Regras por aba

### 6.1 Dados Gerais
- PF/PJ com validações específicas (CPF/CNPJ).
- Upload de logo (Storage bucket `company-logos`).
- Configuração do `public_slug` com validação de disponibilidade (`is_company_public_slug_available`).
- Exibe links curto/canônico da vitrine e QR Code.

### 6.2 Endereço
- Campos de endereço institucional, incluindo cidade/UF via `CityAutocomplete`.
- Campos também suportam exigências de onboarding Asaas.

### 6.3 Contato
- E-mail, telefone, WhatsApp, site.

### 6.4 Observações
- Campo livre institucional (`notes`).

### 6.5 Identidade Visual
- Cores primária/acento/ticket via `BrandIdentityTab`.

### 6.6 Redes Sociais
- URLs de Instagram/Facebook/TikTok/YouTube/Telegram/X/site.
- Exibição pública condicional na vitrine.

### 6.7 Configurações
- Política de reservas manuais (`allow_manual_reservations`, TTL em minutos).
- Política de embarque manual (`allow_manual_boarding`).

### 6.8 Pagamentos (Asaas)
- Snapshot de integração por ambiente (sandbox/produção).
- Ações de verificar integração (`check-asaas-integration`) e desvincular (`create-asaas-account` em modo disconnect).
- Wizard de criação/vínculo Asaas (`AsaasOnboardingWizard`).
- Área de comissionamento (developer).

### 6.9 Vitrine Pública
- Upload/remoção de capa (`company-covers`).
- Texto de apresentação (`intro_text`, limite 400).
- Estilo de fundo (`background_style`: `solid|subtle_gradient|cover_overlay`).

## 7) Campos exibidos e editáveis (resumo)
Principais colunas de `companies` manipuladas:
- Identificação: `name`, `legal_type`, `legal_name`, `trade_name`, `document`, `document_number`, `cnpj`.
- Contato/endereço: `email`, `phone`, `whatsapp`, `website`, `address`, `address_number`, `province`, `postal_code`, `city`, `state`.
- Institucional: `notes`, `logo_url`.
- Vitrine: `public_slug`, `cover_image_url`, `intro_text`, `background_style`, `social_*`.
- Identidade: `primary_color`, `accent_color`, `ticket_color`.
- Comercial/operação: `platform_fee_percent`, `socio_split_percent`, `allow_manual_reservations`, `allow_manual_boarding`, `manual_reservation_ttl_minutes`.
- Asaas (status/metadados por ambiente).

## 8) Regras de validação
- CPF/CNPJ válidos conforme tipo cadastral.
- E-mail com regex.
- UF com 2 caracteres.
- `public_slug` reservado/ocupado bloqueia salvamento.
- `platform_fee_percent` e `socio_split_percent` entre 0 e 100.
- TTL de reserva > 0 e minutos entre 0 e 59 na UI.

## 9) Regras multiempresa
- Leitura/escrita sempre sobre empresa ativa (`activeCompanyId`).
- Consultas auxiliares com filtro por `company_id` (ex.: sócios financeiros).
- Políticas RLS de `companies` e funções auxiliares (`user_belongs_to_company`, `is_developer`) preservam isolamento.

## 10) Segurança e RLS
- `companies` com RLS habilitado.
- Policy de visualização para usuário da empresa.
- Policy de gestão por gerente da própria empresa.
- Policy adicional para developer (gerenciar todas as empresas).
- Política pública de leitura da empresa exige `is_active` e `public_slug` (vitrine pública).

## 11) Integrações externas
- **Asaas**: diagnóstico, vínculo/desvínculo e readiness Pix via edge functions.
- **Supabase Storage**: upload de logo/capa.
- **QR Code**: geração/download local para divulgação da vitrine.

## 12) Estados de carregamento, erro e sucesso
- `loading` inicial com `Skeleton`.
- `saving` no submit.
- Estados de upload (`logoUploading`, `coverUploading`).
- Feedback via `toast` para sucesso/falha/alertas.

## 13) Regras específicas da Vitrine Virtual (estado atual)
- A vitrine pública depende de `companies.public_slug`.
- A página pública resolve por slug (`/empresa/:nick`) e lista eventos/patrocinadores/parceiros da empresa.
- Existe fluxo manual para definir/editar slug na aba de Dados Gerais.
- Há normalização do slug e checagem de disponibilidade por RPC.
- Unicidade técnica é garantida por índice único parcial em `companies(public_slug)`.

## 14) Problemas/riscos identificados
1. **Risco principal pré-ajuste**: empresa nova podia nascer sem `public_slug` se o operador não configurasse manualmente.
2. Isso reduz descoberta pública (`/:nick` e `/empresa/:nick`) e impacto comercial.
3. Dependência de ação manual pós-cadastro para vitrine.

## 15) Melhorias recomendadas
1. Geração automática de slug na criação da empresa (determinística, sem aleatoriedade).
2. Backfill seguro para empresas antigas sem slug.
3. Preservar slugs já existentes.
4. Manter fluxo manual para ajustes futuros sem quebrar links existentes.

## 16) Critérios de aceite
- [x] Toda nova empresa criada recebe `public_slug` automaticamente (via trigger `companies_set_public_slug` + `generate_unique_company_public_slug`).
- [x] Slug segue normalização oficial (lowercase, sem acentos, hífens válidos).
- [x] Unicidade garantida com sufixo sequencial (`-2`, `-3`, ...).
- [x] Nenhum slug existente é sobrescrito.
- [x] Backfill executa apenas onde `public_slug is null`.
- [ ] Tela `/admin/empresa` permanece funcional sem alteração de arquitetura (pendente validação manual em ambiente executando app).

## 17) Estratégia oficial de backfill registrada
- Consulta diagnóstica sugerida:
```sql
select id, name, trade_name, public_slug
from public.companies
where public_slug is null;
```
- Estratégia aplicada no banco:
  - `update` somente em `public_slug is null`.
  - Geração por função central de slug único.
  - Não altera registros já configurados.

## 18) Validação final (2026-04-25)
- ✅ Trigger `companies_set_public_slug` garantido na migration automática (drop/create explícito).
- ✅ `public.normalize_public_slug()` já existia em migration anterior (`20260328000000_add_company_public_slug.sql`).
- ✅ Índice único parcial `companies_public_slug_unique_idx` validado e reforçado com `if not exists`.
- ✅ Backfill restrito a `where public_slug is null`, sem sobrescrever slugs existentes.
- ✅ Fluxo de criação via `register-company` continua sem enviar `public_slug`, delegando geração automática ao banco.
- ⚠️ Validação E2E em ambiente com banco ativo continua recomendada para comprovar runtime ponta a ponta.

## 19) Validação Fase 1 (estrutura PRD comportamental)

### 1. Objetivo
Conforme seções 1, 5 e 6: centralizar configuração da empresa ativa e integração operacional de pagamentos.

### 2. Contexto no sistema
Conforme seções 3, 9, 10 e 11: conecta cadastro da empresa, regras multiempresa, RLS e integrações Asaas/Storage.

### 3. Fluxo REAL da tela
Conforme seções 4, 5, 6 e 12: carregamento da empresa ativa, hidratação de formulário por abas, persistência e feedback de operação.

### 4. Regras de negócio
Conforme seções 6, 8, 9 e 13: validações cadastrais, slug público, políticas operacionais e regras de isolamento por empresa.

### 5. Integrações envolvidas
Conforme seção 11: Asaas (diagnóstico/vínculo), Storage (logo/capa), QR Code da vitrine e RPC de slug.

### 6. Estados possíveis
Conforme seção 12: carregando (`Skeleton`), salvando, upload de mídia, sucesso/erro por `toast`.

### 7. Cenários de falha
Conforme seções 14 e 15: ausência/erro de slug, inconsistência de vitrine e falhas de configuração de pagamentos.

### 8. Riscos operacionais
Conforme seções 14, 15 e 18: dependência de configuração correta de empresa/Asaas e impacto comercial da ausência de slug.

### 9. Logs e diagnóstico
Conforme seções 11, 12, 17 e 18: diagnóstico por edge functions Asaas, consultas SQL de backfill e validações de trigger/índice.

### 10. Dúvidas pendentes
Validação E2E ponta a ponta em ambiente executando app permanece recomendada (já registrada na seção 18).
