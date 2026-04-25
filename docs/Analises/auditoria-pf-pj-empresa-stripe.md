# Auditoria Investigativa — PF/PJ em `/admin/empresa` + impacto Stripe Connect

## 1) Resumo executivo (OK / Atenção / Bloqueio)

**Status geral: ATENÇÃO**

- **OK**: O schema já possui `legal_type` e `document_number`, com backfill e check constraint para `PF|PJ`; os tipos TypeScript também foram atualizados para esses campos.
- **OK**: O CRUD de `/admin/empresa` (leitura + edição/salvamento) já considera PF/PJ, com validações condicionais de CPF/CNPJ e persistência em `companies`.
- **ATENÇÃO**: Ainda há pontos legados que assumem CNPJ/PJ (ex.: onboarding público de empresa e função `register-company`), o que pode gerar inconsistência de regra de negócio fora da tela `/admin/empresa`.
- **ATENÇÃO**: O fluxo Stripe Connect atual cria conta sempre com `business_type: "company"` e não diferencia PF (`individual`) vs PJ (`company`), potencialmente bloqueando ou distorcendo onboarding para PF.
- **SEM BLOQUEIO imediato** para edição cadastral de `/admin/empresa`, mas há **risco funcional** para pagamentos/Stripe em cenários PF.

---

## 2) Estado atual do schema e tipos (tabela de campos)

### 2.1 Campos auditados em `companies`

| Campo | Onde existe | Obrigatoriedade atual | Observações |
|---|---|---|---|
| `legal_type` | Migration `20260404000000_add_company_legal_type_document_number.sql`; tipos em `src/integrations/supabase/types.ts` e `src/types/database.ts` | **NOT NULL** no banco, default `'PJ'`; no tipo `Row` é obrigatório | Possui check constraint `('PF','PJ')`; backfill seta `'PJ'` para legados. |
| `document_number` | Migration `20260404000000_add_company_legal_type_document_number.sql`; tipos em `src/integrations/supabase/types.ts` e `src/types/database.ts` | Nullable no banco e nos tipos | Backfill com `COALESCE(cnpj, document)` para legado; sem validação SQL de CPF/CNPJ. |
| `name` | Schema original `companies`; tipos | **NOT NULL** | No form `/admin/empresa`, é derivado de `trade_name`/`legal_name` (PJ) ou `trade_name`/`full_name` (PF). |
| `trade_name` (equiv. nome fantasia) | Migration `20260205010242...`; tipos | Nullable | Equivale a “Nome Fantasia”; usado como nome de exibição público. |
| `legal_name` (equiv. razão social) | Migration `20260205010242...`; tipos | Nullable | Equivale a “Razão Social”; obrigatório apenas em validação de UI quando PJ. |
| `cnpj` | Migration `20260205010242...`; tipos | Nullable | Mantido por compatibilidade; `/admin/empresa` grava `null` para PF. |
| `document` (legado) | Schema inicial; tipos | Nullable | Continua sendo preenchido com o mesmo valor de `document_number` para compatibilidade. |
| `stripe_account_id` | Migration `20260214134332...`; tipos | Nullable | ID da conta Connect persistido em `companies`. |
| `stripe_onboarding_complete` | Migration `20260214134332...`; tipos | **NOT NULL**, default `false` | Atualizado pela edge function `create-connect-account` conforme capabilities. |

### 2.2 Constraints / defaults / consistência de nomes

- **Confirmado**:
  - `legal_type` com `DEFAULT 'PJ'`, `NOT NULL` e `CHECK (legal_type IN ('PF','PJ'))`.
  - `document_number` adicionada sem `NOT NULL` e sem `UNIQUE`.
  - Backfill legado executa:
    - `legal_type = 'PJ'` para nulos/fora do domínio.
    - `document_number = COALESCE(cnpj, document)` quando nulo.
- **Não encontrado**:
  - constraint de unicidade para CPF/CNPJ em `document_number`.
  - validação SQL de formato/tamanho de CPF/CNPJ.
- **Nomenclatura**:
  - Predomina `snake_case` (`legal_type`, `document_number`) em schema, payload e tipos.
  - Não foi encontrada inconsistência relevante com camelCase (`legalType`/`documentNumber`) no fluxo auditado.

---

## 3) Auditoria do CRUD `/admin/empresa` (passos de teste + achados)

## 3.1 Mapeamento de fluxo (código)

1. **Leitura inicial (fetch)**
   - `fetchCompany()` consulta `companies` com `activeCompanyId`; fallback para última empresa criada quando `activeCompanyId` ausente.
2. **Hydration/defaults**
   - `hydrateFormFromCompany()` define `legal_type` com fallback `PJ`.
   - Documento no form usa prioridade `document_number ?? cnpj ?? document`.
3. **Validação e submit**
   - `handleSubmit()` valida permissões, PF/PJ, CPF/CNPJ, UF e e-mail.
   - `payload` salva em `companies` via `update` (quando `editingId`) ou `insert`.
4. **Persistência/reload**
   - Em sucesso, reaplica estado salvo (`setCompany`, `hydrateFormFromCompany`) e atualiza empresa ativa no contexto (`updateActiveCompany`).

## 3.2 Passos de teste manual recomendados

> Observação: passos definidos com base na leitura estática do código (sem execução E2E neste ciclo).

### Cenário A — PJ válido
1. Entrar em `/admin/empresa` com usuário gerente/operador.
2. Selecionar **Empresa (CNPJ)**.
3. Preencher `Razão Social`, `Nome Fantasia`, `CNPJ` válido.
4. Salvar.
5. Recarregar a página e confirmar persistência dos campos.

### Cenário B — PF válido
1. Selecionar **Pessoa Física (CPF)**.
2. Preencher `Nome Completo` e `CPF` válido.
3. (Opcional) preencher “Nome público/Apelido da vitrine”.
4. Salvar.
5. Recarregar e confirmar persistência.

### Cenário C — Troca PJ → PF
1. Partir de um cadastro PJ já salvo.
2. Trocar para PF, preencher dados PF válidos, salvar.
3. Reabrir e confirmar:
   - `legal_name` não reaparece no backend (deve estar `null` no payload para PF).
   - `cnpj` não reaparece (deve estar `null` em PF).

### Cenário D — Troca PF → PJ
1. Partir de um cadastro PF.
2. Trocar para PJ, preencher `Razão Social`, `Nome Fantasia`, `CNPJ` válido.
3. Salvar e recarregar.
4. Confirmar ausência de regressão nos campos PF (não obrigatórios para PJ).

### Cenário E — Validações negativas
1. PJ sem `Razão Social`/`Nome Fantasia` ⇒ deve bloquear.
2. PF sem `Nome Completo` ⇒ deve bloquear.
3. CPF/CNPJ inválidos ⇒ deve bloquear.
4. Usuário sem perfil permitido ⇒ deve redirecionar/negado.

## 3.3 Achados

- **A1 (OK)**: Validação condicional PF/PJ está implementada no submit (`PJ` exige razão social + nome fantasia + CNPJ válido; `PF` exige nome completo + CPF válido).
- **A2 (OK)**: Payload limpa campos sensíveis na troca de tipo:
  - `legal_name = null` quando PF.
  - `cnpj = null` quando PF.
- **A3 (ATENÇÃO)**: Na troca de tipo pelo `RadioGroup`, apenas `legal_name` é limpo explicitamente; `trade_name` e `full_name` permanecem no estado local. No submit, isso é mitigado parcialmente pelo mapeamento de payload, mas pode manter valor não desejado em `name` via fallback.
- **A4 (ATENÇÃO)**: `document_number` e `document` recebem `trim` sem normalização para apenas dígitos no payload; atualmente depende da máscara/entrada para manter formatação previsível.
- **A5 (ATENÇÃO)**: O código permite `insert` em `companies` quando não há `editingId`; em ambiente multi-tenant isso depende estritamente de policy para impedir criação indevida por papéis não autorizados.

---

## 4) Auditoria RLS/multi-tenant (riscos e verificações)

## 4.1 Políticas encontradas para `companies`

- `Users can view their companies` (SELECT por vínculo em `user_roles`).
- `Gerentes can manage companies` (FOR ALL por vínculo + role gerente).
- `Developer can manage all companies` (FOR ALL via `is_developer`).
- `Public can view companies with public events` (SELECT público quando `is_active = true` e evento em `a_venda`).

## 4.2 Verificação de impacto PF/PJ

- Não foi encontrado, nas migrations auditadas, afrouxamento explícito de RLS causado pela adição de `legal_type/document_number`.
- A mudança PF/PJ parece **estrutural** (colunas + backfill) e não altera policies diretamente.

## 4.3 Riscos

- **R1 (ATENÇÃO)**: Policy `Gerentes can manage companies` usa `FOR ALL`; se o papel “operador” estiver tratado como admin em front (`isOperador`) mas não em policy específica de `companies`, pode haver discrepância de permissão percebida vs real (depende de funções auxiliares/claims em runtime).
- **R2 (ATENÇÃO)**: Fluxos/funcões legadas que dependem de `cnpj` podem introduzir comportamento parcial para PF sem violar RLS, mas com quebra funcional.
- **R3 (INCERTO)**: Não foi validado em ambiente Supabase real se todas as policies atuais estão exatamente refletidas só por migrations (pode haver policy criada manualmente).

---

## 5) Auditoria Stripe Connect (o que existe, se precisa ajuste, riscos)

## 5.1 O que está sendo enviado hoje para Stripe

No `create-connect-account`:
- Cria conta Connect `type: "express"`, `country: "BR"`.
- Define **sempre** `business_type: "company"`.
- Envia `company: { name: company.name }`.
- Solicita capabilities `card_payments` e `transfers`.
- Persiste `stripe_account_id` em `companies` e atualiza `stripe_onboarding_complete` com base no status de capabilities.

## 5.2 O que muda com PF

Para suportar PF de forma coerente no Stripe Connect, o fluxo tende a exigir diferenciação:
- PF → `business_type: "individual"` e campos de pessoa física.
- PJ → `business_type: "company"` e campos corporativos.

Hoje não há essa diferenciação; logo, a empresa PF cadastrada no admin pode cair em onboarding Stripe de PJ.

## 5.3 Riscos

- **S1 (ALTO)**: PF pode ter onboarding inconsistente/bloqueado por envio forçado de `business_type: company`.
- **S2 (MÉDIO)**: Mensagens/UI de pagamentos não orientam explicitamente PF vs PJ; risco de suporte e abandono no onboarding.
- **S3 (MÉDIO)**: Persistência em `companies` está correta para IDs/status Stripe, mas sem trilha do tipo de conta Stripe escolhida/efetiva.

## 5.4 Dependências ainda centradas em CNPJ (fora do Stripe)

- Fluxo público de cadastro (`/cadastro-empresa`) e edge function `register-company` continuam exigindo CNPJ obrigatório (sem opção PF).
- Isso conflita com a premissa de suporte PF/PJ global no produto, embora `/admin/empresa` já suporte ambos.

## 5.5 Recomendação mínima (sem implementar)

1. Ajustar estratégia de criação da conta Connect para derivar `business_type` de `companies.legal_type`.
2. Definir conjunto mínimo de campos por tipo antes de abrir onboarding.
3. Revisar mensagens da aba “Pagamentos” para refletir PF/PJ.
4. Mapear e alinhar onboarding público (`register-company` + `/cadastro-empresa`) com o novo modelo PF/PJ.

---

## 6) Recomendações mínimas (priorizadas: P0/P1/P2)

### P0 (alto impacto)
- **Stripe Connect PF/PJ**: parametrizar criação da conta por `legal_type` (PF→individual, PJ→company) e revisar pré-validações de campos mínimos.
- **Alinhar onboarding de empresa**: remover pressuposto exclusivo de CNPJ no fluxo público se PF for oficialmente suportado no produto inteiro.

### P1 (médio impacto)
- **Governança de documento**: padronizar armazenamento de `document_number` (somente dígitos ou máscara) e aplicar regra única.
- **Revisão de pontos legados**: endpoints/queries que ainda priorizam `cnpj` em vez de `document_number`/`legal_type`.

### P2 (baixo impacto)
- **Observabilidade**: incluir logs funcionais para transição PF↔PJ e erros de onboarding Stripe por tipo jurídico.
- **UX textual**: ajustar microcopies da aba pagamentos para reduzir confusão operacional.

---

## 7) Perguntas em aberto (INCERTO)

1. **INCERTO**: Existe alguma policy de `companies` criada manualmente fora das migrations versionadas?
2. **INCERTO**: A regra de negócio oficial do produto já permite PF também no onboarding público (`/cadastro-empresa`) ou apenas no admin interno?
3. **INCERTO**: Há requisitos fiscais/compliance específicos para Stripe BR no caso PF (campos obrigatórios adicionais) já definidos pela equipe?
4. **INCERTO**: Há rotinas de relatório/faturamento que ainda dependem exclusivamente de `cnpj` em produção?

---

## 8) Rastreabilidade do passo a passo obrigatório da investigação

1. Localização do formulário `/admin/empresa` e pontos de leitura/salvamento: **concluído**.
2. Localização de schema/types PF/PJ: **concluído**.
3. Localização do fluxo Stripe e mapeamento de payload: **concluído**.
4. Validação de dependências legadas de CNPJ: **concluído**.
5. Consolidação em relatório Markdown objetivo e acionável: **concluído**.
