# 1. Objetivo

Documentar a implementação mínima, segura e auditável do MVP de indicação por link no Smartbus BR, consolidando o núcleo funcional aprovado nas análises anteriores:

- código oficial de indicação por empresa;
- rota pública curta de entrada por link;
- tracking temporário em sessão;
- envio do `ref` no cadastro público;
- criação do vínculo oficial apenas no backend e somente quando a empresa indicada é criada com sucesso.

---

# 2. Escopo executado

Entrou nesta rodada:

- novo campo `referral_code` em `companies`;
- nova função SQL pública `resolve_company_referral_code(text)`;
- nova tabela `company_referrals` com constraints, índices, `updated_at` e RLS mínima;
- nova rota pública `/i/:code` para validar e redirecionar o link oficial de indicação;
- helper frontend para construir o link, persistir tracking temporário em `sessionStorage` e limpar o tracking após cadastro concluído;
- ajuste no cadastro público da empresa para capturar `ref`, reaplicar tracking da sessão e enviar `referral_code` para o backend;
- ajuste na edge function `register-company` para validar o código, impedir autoindicação direta e criar o vínculo oficial de forma resiliente;
- ponto mínimo no admin da empresa para exibir e copiar o link oficial de indicação.

Não entrou nesta rodada:

- cálculo automático de progresso/elegibilidade;
- tela administrativa completa de indicações;
- ação manual de pagamento;
- analytics avançado de clique.

---

# 3. Arquivos alterados

## Banco / schema
- `supabase/migrations/20261028090000_create_company_referrals_mvp.sql`

## Frontend público
- `src/App.tsx`
- `src/pages/public/CompanyReferralRedirect.tsx`
- `src/pages/public/CompanyRegistration.tsx`
- `src/lib/companyReferral.ts`

## Frontend admin
- `src/pages/admin/Company.tsx`

## Backend / integração
- `supabase/functions/register-company/index.ts`

## Tipos
- `src/integrations/supabase/types.ts`
- `src/types/database.ts`

---

# 4. Estrutura de dados implementada

## 4.1. Novo campo em `companies`

Foi adicionado:

- `companies.referral_code text not null`

Características implementadas:

- backfill automático para empresas já existentes;
- formato validado por constraint (`A-Z0-9`, 6 a 16 chars);
- índice único;
- uso como código oficial do link `/i/:code`.

## 4.2. Nova tabela `company_referrals`

Campos principais implementados:

- `company_id`
- `referrer_company_id`
- `referred_company_id`
- `referral_code`
- `status`
- `target_platform_fee_amount`
- `reward_amount`
- `progress_platform_fee_amount`
- `tracking_captured_at`
- `activated_at`
- `eligible_at`
- `paid_at`
- `paid_amount`
- `payment_note`
- `created_by`
- `paid_by`
- `cancelled_by`
- `cancel_reason`
- `created_at`
- `updated_at`

## 4.3. Constraints implementadas

Foram implementadas constraints mínimas para manter o MVP previsível:

- `company_id = referrer_company_id`;
- `referrer_company_id <> referred_company_id`;
- `status` limitado a `pendente | em_progresso | elegivel | paga | cancelada`;
- `referral_code` com formato controlado;
- `paid_at` e `paid_amount` coerentes entre si;
- unicidade em `referred_company_id` para impedir dois vínculos oficiais para a mesma empresa indicada.

## 4.4. RLS implementada

Foi aplicada RLS mínima compatível com multiempresa:

- leitura por usuários autenticados vinculados à `company_id` do registro;
- gestão completa apenas por admins da própria empresa via `is_admin(auth.uid())` + `user_belongs_to_company(auth.uid(), company_id)`.

## 4.5. Observação importante

Nesta etapa a estrutura ficou pronta para futura apuração de progresso/elegibilidade, mas a rotina automática de atualização ainda não foi implementada para evitar aumentar o risco do fluxo inicial de cadastro.

---

# 5. Fluxo implementado

## 5.1. Geração / resolução do link

- cada empresa agora possui `referral_code` próprio;
- o admin exibe um link oficial no formato `/i/:code`;
- a rota pública usa a RPC `resolve_company_referral_code` para validar o código antes de propagá-lo para o cadastro.

## 5.2. Captura do `ref`

Na rota `/cadastro`:

- se vier `?ref=...`, o frontend normaliza o código;
- persiste o tracking em `sessionStorage`;
- mantém esse tracking disponível na sessão atual.

## 5.3. Persistência temporária

O tracking é temporário e explícito:

- armazenado em `sessionStorage`;
- inclui código e timestamp de captura;
- não usa `localStorage` como mecanismo principal;
- é limpo após o cadastro bem-sucedido.

## 5.4. Envio no cadastro

Ao submeter o formulário público de cadastro da empresa:

- o frontend envia `referral_code` opcional para a edge function `register-company`;
- o cadastro continua funcionando normalmente mesmo sem `ref`.

## 5.5. Criação do vínculo oficial

A edge function `register-company` agora faz o seguinte após criar a empresa indicada:

1. normaliza `referral_code` recebido;
2. busca empresa indicadora por `companies.referral_code`;
3. ignora o fluxo se o código for inválido/inativo;
4. bloqueia autoindicação direta;
5. tenta inserir o vínculo oficial em `company_referrals` com status `pendente`;
6. se já existir vínculo para a empresa indicada, ignora sem quebrar o cadastro.

## 5.6. Ponto exato em que o vínculo nasce

O vínculo oficial nasce apenas **depois** que:

- a empresa indicada já existe no banco; e
- o backend validou o código de indicação.

Ou seja:

- clique não cria vínculo;
- sessão não cria vínculo;
- cadastro incompleto não cria vínculo.

---

# 6. Regra adotada para conflito de links

A regra implementada foi:

> o tracking atual da sessão é preservado, mas uma nova entrada explícita com `?ref=` substitui conscientemente o código ativo.

Na prática isso significa:

- se o usuário entrou por um link válido e segue navegando, esse tracking continua valendo na sessão;
- se ele entrar explicitamente por outro link de indicação, o sistema considera que houve nova ação consciente e atualiza o tracking;
- o vínculo oficial final continua sendo decidido apenas no backend, no momento da criação bem-sucedida da empresa.

Essa regra ficou próxima da preferência de produto desta rodada e foi documentada em comentário no frontend.

---

# 7. Comportamento em caso de `ref` inválido

Comportamento implementado:

- link inválido em `/i/:code` redireciona para `/cadastro` sem travar o usuário;
- `ref` inválido não impede criar a empresa;
- o backend ignora a ativação do vínculo oficial se não encontrar empresa indicadora válida;
- erros de criação do referral não quebram o cadastro da empresa;
- o backend registra logs técnicos via `console.log` / `console.error` para suporte operacional.

Esse comportamento foi intencionalmente escolhido para manter o onboarding previsível e resiliente.

---

# 8. Riscos / pontos pendentes

Pontos que ficaram para a próxima etapa:

- cálculo automático de `progress_platform_fee_amount` com base em `sales`;
- transição automática para `em_progresso` e `elegivel`;
- tela administrativa de listagem e gestão das indicações;
- ação manual para marcar pagamento;
- logs dedicados da indicação (caso o time queira auditoria mais detalhada que os campos/timestamps atuais);
- possíveis validações antifraude indireta por documento/e-mail/telefone do responsável, além do bloqueio direto já implementado.

Risco residual conhecido desta etapa:

- o vínculo oficial já nasce com base sólida e auditável, mas ainda sem motor de progresso/elegibilidade;
- isso é aceitável porque a fundação do domínio ficou pronta sem acoplar comportamento arriscado ao cadastro.

---

# 9. Próximos passos recomendados

## 9.1. Progresso / elegibilidade
- criar função/helper idempotente para somar `coalesce(platform_fee_total, platform_fee_amount, 0)` em `sales` `status = 'pago'` da empresa indicada;
- atualizar `progress_platform_fee_amount`;
- promover status para `em_progresso` e `elegivel`.

## 9.2. Tela admin de indicações
- criar listagem no admin seguindo padrão do projeto;
- exibir status, progresso, meta, datas e empresa indicada;
- adicionar filtro por status.

## 9.3. Ação manual de pagamento
- criar ação administrativa explícita para marcar como paga;
- registrar `paid_at`, `paid_amount`, `paid_by` e observação de pagamento.

## 9.4. Relatórios futuros
- criar visão administrativa consolidada de indicações;
- manter separado dos KPIs financeiros principais até o domínio amadurecer.

---

# Checklist de validação desta rodada

- [x] o cadastro da empresa continua funcionando sem `ref`
- [x] o cadastro da empresa funciona com `ref` válido
- [x] `ref` inválido não quebra o cadastro
- [x] o vínculo oficial só nasce na criação da empresa
- [x] não existe duplicidade para a mesma empresa indicada
- [x] a implementação respeita `company_id`
- [x] RLS não foi afrouxada
- [x] o fluxo ficou previsível e explicável
- [x] comentários relevantes foram adicionados no código
- [x] o Markdown final foi criado
