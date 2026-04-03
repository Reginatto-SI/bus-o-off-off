# Análise complementar técnica — Split, Modelagem de Dados e Estratégia de Implementação do Módulo de Representantes

## 1. Correção da análise anterior

### 1.1 Revalidação dos documentos obrigatórios
- Base confirmada: `docs/manual-operacional-smartbus-br/Diretrizes Oficiais do Projeto.txt`.
- Sobre `Plano de Desenvolvimento -Módulo de Representantes.txt`: foi feita nova varredura técnica no repositório (`find . -type f -name '*.txt'` + busca textual por “Plano de Desenvolvimento”, “Módulo de Representantes” e “Representantes”).
- Resultado desta cópia local: o arquivo **não apareceu no filesystem atual**.

### 1.2 Ajuste objetivo
- Correção aplicada nesta análise: eu **não trato mais a ausência como premissa de negócio**; trato como **lacuna de artefato nesta cópia local**.
- Portanto, esta análise foi conduzida com base no código real + diretrizes oficiais, e qualquer ponto dependente do plano foi listado em “Dúvidas abertas”.

---

## 2. Split atual (detalhado)

### 2.1 Onde o split é montado hoje (fluxo real)
1. **Checkout público** envia `payment_environment` para `create-asaas-payment`.
2. `create-asaas-payment` resolve contexto (`resolvePaymentContext`) e persiste ambiente na venda se necessário.
3. A função calcula percentuais (`platform_fee_percent` e `socio_split_percent`), valida sócio ativo/wallet por ambiente e monta `splitArray`.
4. O payload da cobrança é enviado ao Asaas com `split: splitArray`.
5. `webhook` e `verify-payment-status` não remontam split; eles validam consistência de configuração e convergem na finalização da venda via `finalizeConfirmedPayment`.

### 2.2 Como o split está estruturado hoje
- Destinatários do split no fluxo principal:
  - **Plataforma** (wallet vinda de secret por ambiente).
  - **Sócio financeiro ativo** (`socios_split`) com wallet por ambiente.
- Percentuais:
  - `companies.platform_fee_percent`.
  - `companies.socio_split_percent` (quando > 0 e com sócio válido).
- Ambiente:
  - Decisão central em `payment-context-resolver`.
  - Ambiente da venda vira fonte de verdade para webhook/verify/reconcile.

### 2.3 Ponto exato onde o representante entraria
- Entrada natural: **na mesma etapa de composição do `splitArray` em `create-asaas-payment`**, logo após validar plataforma/sócio e antes de enviar `paymentPayload` ao Asaas.
- Risco se feito “rápido”: duplicar validação de wallet/percentual em `create`, `verify` e `webhook`.
- Conclusão objetiva: para não espalhar lógica, é recomendável criar **resolvedor único de recebedores de split** (plataforma, sócio, representante) usado por `create` e por validações de `verify/webhook`.

### 2.4 Risco técnico real
- **Checkout**: alto risco se soma de percentuais > 100% ou se wallet faltar no momento de cobrança.
- **Consistência**: risco médio/alto se regras de split ficarem diferentes entre create e validações de verify/webhook.
- **Duplicação**: risco alto no estado atual se representante for adicionado por cópia de blocos em múltiplas funções.

---

## 3. Modelagem de dados proposta

## 3.1 Tabelas necessárias

### A) `representatives`
- **Objetivo**: cadastro mestre do representante (identidade, status, código, wallet, usuário logado).
- **Relações**:
  - 1:1 ou 1:N com `profiles/auth.users` (conforme regra de login adotada).
  - 1:N com `representative_company_links`.
  - 1:N com `representative_commissions`.

### B) `representative_company_links`
- **Objetivo**: fonte de verdade do vínculo representante → empresa indicada.
- **Relações**:
  - N:1 com `representatives`.
  - 1:1 (fase inicial) com `companies` via unique em `company_id`.

### C) `representative_commissions`
- **Objetivo**: ledger auditável de comissão por venda.
- **Relações**:
  - N:1 com `representatives`.
  - N:1 com `companies`.
  - 1:1 (recomendado) com `sales` para evitar duplicidade por venda.

## 3.2 Campos principais (tipo lógico + função)

### `representatives`
- `id` (uuid): chave primária.
- `user_id` (uuid): usuário autenticado do representante.
- `name` (texto): nome comercial.
- `email` (texto): contato/login.
- `phone` (texto): contato.
- `document_number` (texto): CPF/CNPJ.
- `status` (enum: ativo/inativo/bloqueado/pendente_validacao): estado operacional.
- `representative_code` (texto único): código público de indicação.
- `referral_link` (texto): link oficial (pode ser derivável, mas útil em cache/auditoria).
- `asaas_wallet_id_production` (texto): wallet produção.
- `asaas_wallet_id_sandbox` (texto): wallet sandbox.
- `commission_percent` (numérico): percentual padrão do representante.
- `created_at` / `updated_at` (timestamp): trilha básica.

### `representative_company_links`
- `id` (uuid): chave primária.
- `company_id` (uuid): empresa indicada (fase inicial com unique).
- `representative_id` (uuid): representante dono do vínculo.
- `link_source` (enum: url_ref/codigo_manual/admin_ajuste): origem do vínculo.
- `source_code` (texto): código usado no momento do vínculo.
- `source_context` (json/texto): contexto técnico (rota, sessão, etc.).
- `linked_at` (timestamp): quando o vínculo nasceu.
- `locked` (boolean): bloqueio de alteração manual frágil.
- `created_at` / `updated_at` (timestamp): auditoria operacional.

### `representative_commissions`
- `id` (uuid): chave primária.
- `company_id` (uuid): escopo multiempresa.
- `representative_id` (uuid): dono da comissão.
- `sale_id` (uuid): venda origem.
- `payment_environment` (enum sandbox/production): rastreio financeiro.
- `base_amount` (numérico): base de cálculo.
- `commission_percent` (numérico): percentual aplicado no evento.
- `commission_amount` (numérico): valor calculado.
- `status` (enum: pendente/disponivel/paga/bloqueada/cancelada): estado financeiro.
- `available_at` (timestamp): quando liberou.
- `paid_at` (timestamp): quando foi paga.
- `blocked_reason` (texto): motivo do bloqueio.
- `created_at` / `updated_at` (timestamp): rastreabilidade.

## 3.3 Alterações em tabelas existentes

### `companies`
- Adicionar (opcional, para leitura rápida):
  - `representative_id` (uuid nullable) **somente se** for usado como cache do vínculo oficial.
- Observação: fonte de verdade deve continuar em `representative_company_links`.

### `sales`
- Adicionar:
  - `representative_id` (uuid nullable) para snapshot de quem originou a empresa/venda no momento da cobrança.
- Justificativa: simplifica consultas e evita depender de join histórico sujeito a mudanças futuras.

### `sale_integration_logs` (opcional, recomendado)
- Adicionar metadado de representante nos eventos de pagamento/split para auditoria operacional completa.

---

## 4. Vínculo representante → empresa

### 4.1 Ponto exato escolhido
**Escolha:** no **cadastro da empresa** (backend `register-company`), usando código vindo de link `ref` ou entrada manual.

### 4.2 Justificativa objetiva
- Clique de link sozinho não é prova de vínculo.
- Pós-primeira-venda é tarde (abre janela de fraude e inconsistência financeira).
- Cadastro da empresa já é o ponto oficial onde o sistema hoje materializa vínculo de indicação (`company_referrals`) com robustez sem bloquear onboarding.

### 4.3 Regra operacional do vínculo
- Nasce quando a empresa é criada com código válido.
- Persiste em `representative_company_links` com `linked_at`, `source_code`, `link_source` e contexto.
- Fase inicial: `company_id` único (1 empresa = 1 representante).
- Alteração manual: bloqueada por padrão; exceção somente por fluxo administrativo auditado.

### 4.4 Como garantir auditabilidade/fraude/múltiplos representantes
- Constraint unique em `company_id`.
- Registro de origem e timestamp no vínculo.
- Validação de código no backend (nunca confiar somente no frontend).
- Opcional: hash/assinatura do contexto capturado para trilha forense.

---

## 5. MVP mínimo

### 5.1 MVP funcional (mínimo real)
- Cadastro de representante com código único e link oficial.
- Captura de `ref` no onboarding da empresa e gravação do vínculo oficial.
- Registro de `representative_id` na venda (snapshot).
- Comissão básica por venda paga (`status='pago'`) em ledger dedicado.
- Inclusão do representante no split **somente quando wallet válida**; sem wallet, comissão fica bloqueada (não quebra checkout).

---

## 6. Ordem de implementação

1. Modelagem DB mínima (`representatives`, `representative_company_links`, `representative_commissions` + constraints).
2. Extensão do `register-company` para criar vínculo oficial do representante no nascimento da empresa.
3. Snapshot do `representative_id` na venda e criação do registro de comissão na confirmação de pagamento.
4. Centralização da composição de recebedores de split (plataforma/sócio/representante) em resolvedor único.
5. Painel mínimo do representante (código, link, empresas vinculadas, comissão gerada/recebida).

---

## 7. O que fica fora

- Regras avançadas de múltiplos representantes por empresa.
- Motor de bônus progressivo/campanhas complexas.
- Liquidação automática bancária fora do split Asaas.
- Dashboards analíticos avançados (coortes, funil completo, BI externo).
- Regras retroativas de comissão para vendas antigas.

---

## 8. Riscos reais

1. Erro de split por percentual total > 100%.
2. Checkout quebrado por wallet de representante ausente sem política de fallback.
3. Divergência de regra se composição de split ficar duplicada em create/verify/webhook.
4. Comissão incorreta se nascer antes da confirmação real do pagamento.
5. Vazamento de dados multiempresa se vínculos/comissões não tiverem RLS forte por `company_id`.
6. Vínculo inconsistente se criado fora do cadastro oficial da empresa.

---

## 9. Conclusão técnica

- O ponto mais seguro e simples para o vínculo é **cadastro da empresa no backend**.
- O ponto mais seguro para comissão é **pós-confirmação de pagamento** (fonte financeira já consolidada no projeto).
- Para incluir representante no split sem regressão, o projeto precisa de **um resolvedor único de recebedores** e não de blocos duplicados.
- MVP viável com escopo curto: vínculo oficial + ledger de comissão + split condicionado a wallet válida.

---

## 10. Dúvidas abertas

1. Qual base oficial da comissão do representante: valor bruto da venda, taxa da plataforma ou outra?
2. Se o representante estiver sem wallet válida, a regra oficial é bloquear split desse recebedor ou bloquear toda cobrança?
3. O representante terá role dedicada no auth já no MVP (`representante`) ou isso pode entrar na fase seguinte?
4. O arquivo `Plano de Desenvolvimento -Módulo de Representantes.txt` está em qual caminho exato nesta branch/workspace?
