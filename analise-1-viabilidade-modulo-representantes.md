# Análise de Viabilidade — Módulo de Representantes

## 1. Resumo executivo

**Conclusão executiva:** o módulo de representantes é **viável**, porém o projeto **não está pronto para implementação direta em um único passo** sem risco de regressão em checkout/pagamento/split. O caminho seguro é por fases, preservando o fluxo único já existente de pagamentos Asaas e a lógica multiempresa.

**Pontos favoráveis reais identificados no estado atual:**
- Existe um fluxo de pagamento Asaas com contexto central de ambiente (`payment-context-resolver`) e com persistência do ambiente na venda, reduzindo bifurcação entre create/webhook/verify/reconcile.
- Existe estrutura consolidada de split financeiro no create da cobrança (plataforma + sócio), com validação de sócio ativo e wallet por ambiente.
- Existe padrão funcional já validado de “link + código + redirecionamento + vínculo no cadastro” (hoje para indicações de empresa e para vendedores), que pode ser reaproveitado para representantes sem criar fluxo paralelo.
- Existe separação de áreas logadas por perfil (admin x vendedor x motorista), o que viabiliza painel exclusivo.

**Riscos principais:**
- Não há entidade nativa de “representante” hoje (dados, RLS, comissão transacional própria, carteira Asaas própria, status próprios, trilha própria).
- O split atual está acoplado a no máximo **dois recebedores adicionais** (plataforma e sócio); incluir representante exige evolução explícita da composição de split para evitar lógica espalhada.
- Há divergência de fonte de ambiente no frontend (hook com fallback por hostname), enquanto backend exige contexto explícito/persistido — isso pode gerar risco operacional se não for tratado com rigor na próxima fase.
- O documento obrigatório `Plano de Desenvolvimento -Módulo de Representantes.txt` não foi localizado no repositório nesta sessão; portanto, há incertezas que precisam ser sanadas antes de execução.

**Recomendação:** implementação **por fases conservadoras**, com primeiro passo em contrato de dados/auditoria e centralização do cálculo/composição de comissão+split, antes de qualquer UI final.

---

## 2. Leitura das regras do projeto

### 2.1 Documentos-base utilizados
- ✅ `Diretrizes Oficiais do Projeto.txt` foi lido e usado como base de decisão.
- ⚠️ `Plano de Desenvolvimento -Módulo de Representantes.txt` **não foi encontrado** no repositório (nem em `docs/`, nem no root, nem por busca textual).

### 2.2 Regras que impactam diretamente a análise
As diretrizes impõem pontos críticos que afetam diretamente o desenho do módulo:
- **Sem fluxos paralelos desnecessários**, com comportamento previsível/auditável.
- **Multiempresa obrigatório** (`company_id` como fronteira de isolamento).
- **Asaas oficial**, com webhook como fonte de verdade para pagamento.
- **Ambientes sandbox/produção espelhados**, mudando apenas credenciais/endpoints/dados externos.
- **Sem lógica espalhada**, sem inferência implícita de ambiente, sem duplicação de regra.

Aplicação prática nesta análise:
- Recomendação de reaproveitar pipeline atual de criação/finalização de pagamento.
- Evitar “módulo representante” fora do contrato de `sales` + `payment-finalization` + logs oficiais.
- Manter vínculo representante→empresa com fonte de verdade única no cadastro da empresa, não em heurística frouxa de frontend.

---

## 3. Diagnóstico do estado atual do pagamento e split

### 3.1 Onde a cobrança é criada hoje
- A cobrança principal é criada em `supabase/functions/create-asaas-payment/index.ts`.
- O fluxo valida venda/status, carrega empresa, resolve ambiente/contexto, valida snapshot financeiro, cria/resolve customer e então cria payment no Asaas com `externalReference = sale.id`.

### 3.2 Onde o split é montado hoje
- A montagem do split acontece na mesma função de criação (`create-asaas-payment`), em `splitArray`.
- A política de split vem do resolvedor central (`payment-context-resolver`), que para fluxo principal define `splitPolicy = platform_and_socio`.

### 3.3 Centralizado x espalhado
- **Parcialmente centralizado**:
  - Centralizado para decisão de ambiente/owner/split-policy em `payment-context-resolver`.
  - Porém os **destinatários concretos do split** (plataforma + sócio) ainda são montados dentro de `create-asaas-payment`.
- Conclusão conservadora: boa base, mas ainda há acoplamento local para composição de recebedores.

### 3.4 Como define percentuais e wallet
- Percentuais: `companies.platform_fee_percent` e `companies.socio_split_percent`.
- Wallet da plataforma: segredo por ambiente (`ASAAS_WALLET_ID` / `ASAAS_WALLET_ID_SANDBOX`) via `runtime-env`.
- Wallet do sócio: `socios_split.asaas_wallet_id_production/sandbox` (fallback no campo legado), validada por `validateFinancialSocioForSplit`.

### 3.5 Identificação da empresa recebedora
- A cobrança principal é sempre criada com API key da **empresa** no fluxo principal (`ownerType=company`), logo a empresa é dona da cobrança; split distribui para plataforma/sócio.

### 3.6 Suporte estrutural para múltiplos splits
- Estruturalmente existe array de split (`split: splitArray`), então tecnicamente suporta N entradas.
- Contudo, a regra atual só prevê explicitamente 2 categorias adicionais (plataforma e sócio).
- Risco real ao incluir representante: duplicar validações/wallet/percentual em múltiplos pontos sem um resolvedor unificado de “recebedores de split”.

### 3.7 Diferenças perigosas entre create/webhook/verify/reconcile/finalização
- **Convergência boa no pós-pagamento**: webhook e verify convergem em `finalizeConfirmedPayment`, e reconcile reutiliza o mesmo núcleo.
- **Create** é mais complexo (snapshot, split, customer, cobrança).
- **Webhook** valida token por ambiente persistido da venda e rejeita sem `payment_environment` resolvido.
- **Verify fallback** consulta Asaas quando necessário e também finaliza pelo núcleo compartilhado.

Diagnóstico: há convergência suficiente para manter fluxo único, desde que a futura comissão de representante **não** seja adicionada fora desse núcleo.

---

## 4. Diagnóstico do estado atual do modelo de dados

### 4.1 O que já existe e pode ser reaproveitado
- **Entidade de vendedor (`sellers`)** com:
  - código curto para link,
  - comissão percentual,
  - pix key,
  - vínculo `company_id`,
  - uso em `sales.seller_id`.
- **Modelo de indicação por código (`company_referrals`)** com:
  - `referral_code`,
  - timestamps de captura/ativação/elegibilidade,
  - status de progresso,
  - relação empresa indicadora ↔ indicada,
  - gatilho de atualização por vendas pagas.
- **Estruturas de split financeiro (`socios_split` + campos em `companies`)**.
- **Infra de auditoria operacional** em `sale_integration_logs` e `sale_logs` + observabilidade nas edge functions.

### 4.2 O que não existe e precisará ser criado
Não há hoje estrutura específica para:
- `representative_id` em empresa/venda,
- entidade de representante com `codigo_representante`, `link_representacao`, `wallet_id` dedicado,
- tabela de comissão transacional de representante (pendente/disponível/paga/bloqueada),
- histórico formal de vínculo representante→empresa com origem/contexto imutável.

### 4.3 O que existe, mas está inadequado para este caso
- `sellers` não participa de split e foi modelado para comissão comercial manual; usar “seller” como representante financeiro cria conflito semântico e risco de regra quebrada.
- `company_referrals` atual modela indicação entre **empresas**, não entre representante pessoa e empresa indicada.

### 4.4 Multiempresa e RLS
- Projeto possui forte uso de `company_id` e políticas por empresa.
- Para representante, o maior risco é modelar vínculo fora dessa chave e abrir fuga de escopo.
- Recomendação: toda nova entidade de representante e comissão deve ter `company_id`/ou chave de escopo explícita e política RLS específica.

---

## 5. Diagnóstico de autenticação, perfil e painel exclusivo

### 5.1 Como usuários são criados hoje
- Fluxo admin: edge function `create-user` cria usuário e vincula role em `user_roles`.
- Fluxo público de empresa: `register-company` cria usuário (email confirmado), empresa e role `gerente`.

### 5.2 Como perfis/roles são distinguidos
- `AuthContext` carrega `user_roles` por empresa ativa.
- Roles tipadas atuais: `gerente`, `operador`, `vendedor`, `motorista`, `developer`.
- Rotas/menus e bloqueios já respeitam esse modelo (ex.: vendedor fora do admin).

### 5.3 Encaixe de representante
Caminho mais seguro: **role própria (`representante`) + área fora do admin**, replicando padrão vendedor/motorista.
- Motivo: evita misturar escopo administrativo com escopo comercial externo.
- Alternativa “perfil vinculado sem role” é possível, mas aumenta risco de exceções em guardas já baseadas em role.

### 5.4 Área logada exclusiva
- O sistema já suporta áreas logadas exclusivas por tipo de usuário (vendedor e motorista), com rotas dedicadas.
- Portanto, painel exclusivo de representante é viável sem quebrar áreas existentes, desde que siga o mesmo padrão de isolamento.

---

## 6. Diagnóstico do vínculo representante → empresa

### 6.1 Ponto ideal para nascer o vínculo
Pelo padrão já adotado em `company_referrals`, o vínculo oficial deve nascer no **cadastro da empresa** (backend), não no clique do link.

### 6.2 Link `ref` e código alternativo
- Estruturalmente viável reaproveitar rota curta + código + redirect para cadastro (igual `/i/:code` e `/v/:code`).
- Também é viável aceitar código manual no cadastro como fallback controlado.

### 6.3 Auditoria e fonte de verdade
- Fonte de verdade deve ser registro backend no momento de criação da empresa (com timestamp, origem, contexto), nunca apenas session/local state.
- O frontend pode capturar `ref`, mas não deve “concretizar vínculo” sem persistência no backend.

### 6.4 Regra “1 empresa = 1 representante” (fase inicial)
- O projeto já usa padrão semelhante com unicidade de vínculo em `company_referrals.referred_company_id`.
- Estratégia segura: aplicar constraint única equivalente no vínculo de representante para impedir múltiplos vínculos concorrentes.

### 6.5 Fluxo novo vs reaproveitamento
- Há ponto natural reaproveitável no `register-company` (já processa referral code sem bloquear cadastro).
- Recomendado estender esse ponto, evitando novo fluxo paralelo de vinculação posterior manual.

---

## 7. Diagnóstico da comissão e rastreabilidade

### 7.1 Onde deveria nascer a comissão
Pelo desenho atual, o mais seguro é nascer **na camada de confirmação financeira** (quando pagamento é confirmado/finalizado), não só em dashboard.

### 7.2 Momento de registro
Comparativo conservador:
1. **Na criação da venda:** alto risco de comissão sobre venda não paga/cancelada.
2. **Somente após confirmação de pagamento:** mais aderente à regra oficial de financeiro baseado em `status='pago'`.
3. **Intermediário com consolidação:** possível, porém mais complexo e com risco de drift.

Recomendação: registrar comissão em estado inicial técnico (ex.: pendente de confirmação) apenas se houver necessidade operacional clara; caso contrário, registrar após confirmação como fonte oficial.

### 7.3 Vínculo explícito com venda original
- Necessário vínculo direto por `sale_id` (e idealmente `payment_id`/ambiente) para auditoria total.
- Hoje não existe tabela dedicada para ledger de comissão de representante.

### 7.4 Estados de comissão
- O projeto já trabalha com estados explícitos em outros domínios (venda/referral). É viável adotar `pendente`, `disponível`, `paga`, `bloqueada`, mas isso ainda precisa de entidade nova.

### 7.5 Evitar lógica espalhada
- Comissão de representante deve nascer no backend (edge + SQL/trigger central) e não em cálculo de tela.
- Relatórios devem ler dado persistido, não recalcular heurística no frontend.

---

## 8. Diagnóstico de segurança, ambiente e riscos

### 8.1 Ambiente sandbox/produção
- Backend de pagamentos está orientado a ambiente persistido por venda e contexto resolvido centralmente.
- Webhook foi endurecido para validar token por ambiente da venda.

### 8.2 Riscos ao adicionar representante no split
- Se inclusão for feita apenas em `create-asaas-payment` sem resolveror central de recebedores, haverá risco de divergência futura entre ambientes e entre fluxos.
- Wallet ID de representante não pode ser tratado no frontend; deve ficar em backend/DB com acesso controlado.

### 8.3 Exposição de dados sensíveis
- Chaves Asaas permanecem em backend/env secrets (bom).
- Atenção: novos campos de wallet de representante exigem mesmo nível de proteção/RLS.

### 8.4 Trechos sensíveis que exigirão atenção
- Composição de split no create da cobrança.
- Contrato de finalização e logs (para refletir comissão sem duplicação).
- Cadastro público (para vínculo auditável e antifraude de código).

---

## 9. Reaproveitamentos possíveis

- **Padrão de links curtos/códigos**:
  - `/v/:code` + RPC de resolução de vendedor.
  - `/i/:code` + RPC de resolução de indicação.
- **Padrão de vínculo no cadastro backend**:
  - `register-company` já materializa vínculo de referral no banco.
- **Padrão de painel exclusivo fora do admin**:
  - `SellerDashboard` e portal de motorista provam separação por perfil.
- **Padrão de split e ambiente**:
  - `payment-context-resolver` + `create-asaas-payment`.
- **Padrão de finalização única**:
  - `finalizeConfirmedPayment` reutilizado por webhook/verify/reconcile.
- **Padrão de rastreabilidade**:
  - `sale_integration_logs` + logs operacionais por etapa.

---

## 10. Lacunas reais a preencher

1. Entidade própria de representante (dados cadastrais, status, código, link, wallet por ambiente, etc.).
2. Vínculo oficial representante→empresa indicada com constraints de unicidade e auditoria.
3. Ledger de comissão de representante por venda (`sale_id`) com estados e trilha de transição.
4. Estratégia formal de composição de múltiplos destinatários no split (plataforma + sócio + representante) sem duplicação.
5. Policies RLS e roles para o novo perfil, sem colidir com vendedor/motorista/admin.
6. Rotas privadas e guardas para painel de representante.
7. KPIs e consultas agregadas baseadas em fonte persistida (não cálculo solto em UI).
8. Procedimento operacional para wallet ausente/inválida e comissão bloqueada.

---

## 11. Ordem recomendada de implementação

### Fase 0 — Alinhamento documental
- Confirmar e versionar no repositório o `Plano de Desenvolvimento -Módulo de Representantes.txt` (ausente nesta análise).

### Fase 1 — Contrato de dados e segurança
- Criar modelagem de representante, vínculo e comissão.
- Definir RLS/constraints/índices e regras de auditoria.

### Fase 2 — Núcleo financeiro
- Extrair/centralizar composição de recebedores de split.
- Incluir representante de forma determinística por ambiente e com validações de wallet.

### Fase 3 — Vínculo no onboarding
- Estender `register-company` para resolver e persistir vínculo de representante no nascimento da empresa (sem bloquear cadastro em casos inválidos, conforme regra atual de robustez).

### Fase 4 — Perfil e autenticação
- Adicionar role/escopo de representante e guardas de rota.

### Fase 5 — Painel mínimo
- Painel representante simples: código, link, QR, empresas vinculadas, alertas de cadastro/wallet.

### Fase 6 — Comissão operacional
- Exibir comissão gerada/recebida com base em ledger persistido e transições auditáveis.

### Fase 7 — Endurecimento e observabilidade
- Logs específicos, reconciliação e alertas para falhas de split/wallet/comissão.

---

## 12. Riscos críticos antes de implementar

1. **Quebrar checkout** ao alterar split diretamente sem camada central.
2. **Comissão incorreta** se cálculo nascer no frontend ou fora do evento de confirmação de pagamento.
3. **Conflito multiempresa** se vínculo representante não tiver regra forte de escopo/uniqueness.
4. **Divergência sandbox/prod** se wallet/credenciais de representante não seguirem contrato por ambiente.
5. **Bifurcação de fluxo** se onboarding de representante for criado em caminho paralelo ao cadastro existente.
6. **Perda de auditabilidade** se status/comissões não forem persistidos como eventos estruturados.

---

## 13. Conclusão final

- **O módulo é viável:** sim.
- **O projeto atual suporta a evolução:** parcialmente, com boa base de pagamentos, ambientes, áreas segregadas e padrões de indicação reaproveitáveis.
- **Próximo passo mais seguro:** fechar lacuna documental do plano obrigatório ausente e iniciar pela fase de contrato de dados + centralização de composição de split/comissão, antes de qualquer UI final.

---

## 14. Perguntas em aberto

1. Onde está o arquivo obrigatório `Plano de Desenvolvimento -Módulo de Representantes.txt` para validação final de aderência?
2. A regra inicial de representante será realmente **1 empresa = 1 representante** com bloqueio definitivo de troca, ou haverá janela de correção operacional?
3. A comissão do representante incide sobre qual base oficial: valor bruto da venda, taxa da plataforma, ou outra base?
4. O representante participa do split em **todas** as vendas da empresa indicada ou apenas em janela/condição de elegibilidade?
5. Em caso de wallet ausente no representante, o pagamento deve bloquear, seguir sem split do representante, ou registrar comissão bloqueada para liquidação posterior?
6. O representante deve ser role autônoma no auth (`representante`) ou perfil vinculado a role existente com guardas adicionais?
7. Será necessário suporte futuro para múltiplos representantes por empresa? (Mesmo que não na fase inicial.)
8. Qual política oficial para retroatividade de comissão em vendas já pagas antes da ativação do vínculo?

