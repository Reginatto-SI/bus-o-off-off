# 1. Objetivo

Avaliar a viabilidade funcional e estrutural de um MVP de programa de indicações no Smartbus BR com a regra:

- uma empresa/usuário indicador recomenda o Smartbus BR para outra empresa;
- a empresa indicada passa a operar no sistema;
- a plataforma acompanha o retorno financeiro real gerado por essa empresa indicada;
- a indicação só se torna elegível quando a empresa indicada atingir uma meta mínima de retorno para a plataforma (exemplo inicial: R$ 100,00);
- ao atingir a meta, a plataforma libera uma recompensa única de R$ 50,00 ao indicador;
- depois do pagamento, a mesma indicação nunca mais volta a gerar comissão.

A análise foi orientada pelas Diretrizes Oficiais do Projeto, com foco em previsibilidade, auditabilidade, simplicidade, reaproveitamento de estrutura existente, respeito a `company_id` e ausência de fluxos paralelos desnecessários.

---

# 2. Premissas de negócio

Premissas que devem ser tratadas como regra do MVP:

- a recompensa **não** é paga por cadastro, criação de conta ou simples onboarding;
- a recompensa depende de **retorno financeiro real da plataforma**;
- o critério de elegibilidade deve usar uma fonte de verdade já existente e confiável no sistema;
- a meta mínima deve ser parametrizável por indicação, mas com valor inicial recomendado de **R$ 100,00** em taxa gerada para a plataforma;
- a recompensa deve ser parametrizável por indicação, mas com valor inicial recomendado de **R$ 50,00**;
- cada indicação gera **no máximo um pagamento**;
- a indicação deve ter ciclo de vida claro: `pendente` → `em_progresso` → `elegivel` → `paga`;
- cancelamentos e vendas não confirmadas não podem contar para elegibilidade;
- a funcionalidade deve respeitar o isolamento multiempresa via `company_id`;
- o MVP não deve virar programa de afiliado recorrente, recorrência vitalícia, cashback contínuo ou engine de comissões;
- a comissão interna da plataforma é dado sensível, então a UI futura deve expor apenas o necessário para o contexto operacional do indicador.

Premissas que **ainda precisam de validação de produto/negócio** antes da implementação:

- se o indicador será uma **empresa** (mais aderente ao modelo multiempresa) ou um **usuário/perfil** vinculado a uma empresa;
- se a indicação nasce por **link/código público**, por cadastro manual no admin ou pelos dois caminhos;
- como será feito o pagamento da recompensa no MVP: transferência manual assistida, crédito interno operacional ou outro fluxo já existente da plataforma;
- quais critérios mínimos impedem fraude básica (ex.: CNPJ igual, telefone igual, e-mail igual, responsável igual).

---

# 3. Diagnóstico do estado atual

## 3.1. O que já existe hoje e pode ser reaproveitado

### a) Venda como entidade financeira central
A estrutura do projeto já define `sales` como registro final da operação comercial, com status, origem, valores, taxa da plataforma, empresa dona do contexto e timestamps relevantes.

Campos já existentes em `sales` com maior relevância para esta análise:

- `company_id`;
- `status`;
- `gross_amount`;
- `platform_fee_total`;
- `platform_fee_amount`;
- `platform_fee_status`;
- `payment_confirmed_at`;
- `cancelled_at`;
- `sale_origin`;
- `payment_environment`.

Isso é positivo para o MVP porque evita criar cálculo financeiro novo do zero.

### b) Regra oficial do projeto para reconhecer financeiro real
As diretrizes do projeto já definem que:

- o gateway oficial é o Asaas;
- o pagamento começa como reservado;
- só vira pago após confirmação;
- o webhook é a fonte de verdade;
- somente vendas com status `pago` contam para faturamento e KPIs.

Além disso, o projeto já consolidou relatórios e KPIs para somarem financeiro oficial apenas sobre vendas com `status = 'pago'`.

### c) Consolidação recente de `platform_fee_total`
O histórico recente do projeto mostra uma padronização explícita de `platform_fee_total` como valor consolidado oficial da taxa da plataforma, inclusive com fallback controlado para `platform_fee_amount` apenas em vendas manuais antigas ou saneadas.

Isso é importante porque a proposta de indicação depende exatamente de medir “quanto a plataforma ganhou” com a empresa indicada.

### d) Fluxo de confirmação financeira já auditável
O sistema já possui trilhas auditáveis para pagamento:

- `sale_logs` para histórico operacional;
- `sale_integration_logs` para trilha técnica de integrações/webhooks/sincronizações;
- timestamps como `payment_confirmed_at` e `cancelled_at`;
- atualização explícita de `platform_fee_total` quando a venda efetivamente consolida o resultado financeiro.

Isso reduz muito o risco de desenhar uma feature opaca.

## 3.2. O que não existe hoje

Não foi identificada estrutura nativa de:

- programa de indicações;
- vínculo formal entre empresa indicadora e empresa indicada;
- status de ciclo de vida de indicação;
- trilha de pagamento de recompensa;
- regra persistida de “meta batida” por empresa indicada.

Ou seja: para implementar essa funcionalidade será necessário criar uma entidade mínima nova, mas **não** uma arquitetura nova de pagamentos.

## 3.3. Observações importantes do estado atual

- O sistema já diferencia fluxos online e manuais, mas converge ambos para a mesma entidade `sales`.
- Em vendas manuais antigas ainda existe compatibilidade com `platform_fee_amount`, porém o consolidado oficial migrou para `platform_fee_total`.
- Cancelamentos existem e já impactam o status da venda, então qualquer regra de indicação precisa depender do estado final consolidado, não de intenções de venda.
- O projeto já possui padrão forte de multiempresa e RLS por `company_id`, o que favorece desenhar a indicação sempre vinculada a empresas e não a um contexto global solto.

---

# 4. Fonte de verdade recomendada

## 4.1. Conclusão objetiva

A fonte de verdade mais segura para decidir se a empresa indicada atingiu a meta mínima de retorno é:

**soma do valor efetivo de taxa da plataforma nas vendas da empresa indicada, considerando apenas vendas com `status = 'pago'`, usando `platform_fee_total` como valor oficial e `platform_fee_amount` apenas como fallback técnico controlado para compatibilidade histórica.**

Em termos práticos, a regra recomendada para o MVP é:

- considerar apenas registros de `sales` da empresa indicada (`sales.company_id = company_indicada_id`);
- considerar apenas `status = 'pago'`;
- somar `coalesce(platform_fee_total, platform_fee_amount, 0)` apenas enquanto houver legado histórico a ser suportado;
- após saneamento completo do legado, o alvo natural deve ser somente `platform_fee_total`.

## 4.2. Por que `platform_fee_total` é a melhor base

### Motivos favoráveis

1. **Mede exatamente o retorno da plataforma**
   - o programa proposto não quer premiar receita bruta da empresa indicada;
   - quer premiar o valor efetivamente apropriado pela plataforma;
   - `platform_fee_total` representa esse conceito com muito mais precisão do que `gross_amount`.

2. **Já está alinhado ao financeiro oficial do sistema**
   - relatórios e KPIs recentes passaram a tratar `platform_fee_total` como taxa consolidada oficial;
   - isso evita criar lógica paralela só para indicações.

3. **Funciona melhor para online e manual**
   - vendas online já consolidam `platform_fee_total` quando o pagamento confirma;
   - vendas manuais recentes também caminham para esse mesmo consolidado;
   - o fallback em `platform_fee_amount` cobre legado sem exigir engine separada.

4. **É mais auditável que usar heurística indireta**
   - usar `gross_amount` multiplicado por percentual atual da empresa seria arriscado, porque o percentual pode mudar no futuro;
   - usar taxa consolidada persistida preserva a fotografia financeira da venda no momento correto.

## 4.3. O que não recomendo como fonte primária

### a) `gross_amount`
Não é adequado como base principal porque mede faturamento bruto da venda, não o retorno líquido/retido pela plataforma.

### b) percentual atual de comissão da empresa x `gross_amount`
Não é seguro porque recalcula o passado com regra atual e pode gerar distorção histórica se a taxa contratual mudar.

### c) somente `platform_fee_status = 'paid'`
Também não é suficiente isoladamente. Esse campo é útil no fluxo manual com cobrança separada da taxa, mas a diretriz oficial do projeto diz que o financeiro confiável entra quando a venda está `pago`. Logo, `platform_fee_status` pode complementar diagnóstico, porém não deve ser a métrica final da regra de indicação.

## 4.4. Tratamento de cancelamentos

Cancelamentos devem ser tratados da forma mais simples possível:

- venda cancelada **não conta**;
- se uma venda já somada para o progresso for cancelada antes de a indicação virar elegível, o progresso diminui naturalmente na próxima apuração;
- se a indicação já tiver sido marcada como `elegivel`, recomenda-se **congelar a elegibilidade** até revisão manual apenas se houver um evento excepcional posterior (ex.: reversão de pagamento relevante);
- se a recompensa já tiver sido paga, o MVP não deve tentar “estornar automaticamente” a comissão, para evitar nova complexidade financeira.

## 4.5. Incerteza que precisa ser validada

Ainda vale validar no banco real se existem vendas antigas com `status = 'pago'` e `platform_fee_total` nulo fora dos cenários já saneados de venda manual. Se esse volume for irrelevante, a apuração pode usar somente `platform_fee_total`; se ainda houver legado relevante, o fallback temporário é prudente.

---

# 5. Proposta de fluxo funcional

## 5.1. Estados recomendados

Sugestão de ciclo de vida mínimo e explícito:

- `pendente`
- `em_progresso`
- `elegivel`
- `paga`
- `cancelada` (opcional, mas recomendável para fraude, erro de cadastro ou invalidação manual)

## 5.2. Definição objetiva de cada estado

### `pendente`
Usar quando o vínculo entre indicador e indicada foi criado, mas a empresa indicada ainda não demonstrou operação financeira válida.

Critério recomendado:

- indicação cadastrada com vínculo válido;
- empresa indicada existente ou em onboarding controlado;
- soma de retorno real da plataforma = zero.

### `em_progresso`
Usar quando a empresa indicada já gerou algum retorno financeiro real, mas ainda não bateu a meta.

Critério recomendado:

- existe ao menos uma venda paga válida da empresa indicada;
- soma acumulada de retorno real da plataforma > 0;
- soma acumulada ainda < meta mínima.

### `elegivel`
Usar quando a meta mínima for atingida por fonte financeira confiável, mas o pagamento da recompensa ainda não foi realizado.

Critério recomendado:

- soma acumulada elegível >= `target_platform_fee_amount` da indicação;
- recompensa ainda não paga;
- registro da data/hora de liberação em `eligible_at`.

### `paga`
Usar quando a recompensa foi efetivamente registrada como paga.

Critério recomendado:

- indicação já estava `elegivel`;
- houve ação explícita de pagamento/baixa;
- registrar `paid_at`, `paid_amount`, `paid_by` e uma referência operacional do pagamento.

### `cancelada`
Estado administrativo para encerrar casos inválidos.

Exemplos:

- autoindicação confirmada;
- empresa duplicada;
- fraude operacional;
- cadastro feito por engano.

## 5.3. Gatilho recomendado de elegibilidade

O gatilho mais previsível para o MVP é:

1. a indicação é criada;
2. uma rotina simples de apuração (manual via admin ou job idempotente) soma o retorno elegível da empresa indicada com base em `sales`;
3. quando a soma atingir a meta, a indicação muda para `elegivel` e grava `eligible_at`;
4. um responsável autorizado registra o pagamento e a indicação passa para `paga`.

## 5.4. Recomendação importante sobre o gatilho técnico

Para MVP, **não recomendo** depender imediatamente de trigger complexa em cada venda.

Melhor abordagem inicial:

- cálculo derivado e idempotente sobre `sales`;
- atualização de status da indicação por rotina controlada;
- possibilidade de botão administrativo “recalcular indicação” ou job periódico simples.

Motivo:

- mantém o comportamento auditável;
- evita acoplamento excessivo ao fluxo crítico de pagamento;
- reduz risco de quebrar a finalização financeira existente.

Se futuramente a feature amadurecer, pode haver atualização oportunista ao confirmar pagamento, mas o MVP deve nascer com apuração simples e reexecutável.

---

# 6. Estrutura mínima recomendada

## 6.1. Recomendação geral

Não existe estrutura atual que represente corretamente o domínio de indicação. Portanto, a solução mais segura é criar **uma entidade nova e mínima**, sem inventar submódulos extras.

## 6.2. Entidade mínima sugerida: `company_referrals`

Sugestão de campos mínimos:

- `id`
- `company_id`
  - empresa dona do contexto administrativo da indicação;
  - recomendação: usar a **empresa indicadora** como `company_id` principal do registro, porque ela é quem acompanhará a recompensa.
- `referrer_company_id`
  - empresa indicadora.
- `referred_company_id`
  - empresa indicada.
- `status`
  - `pendente | em_progresso | elegivel | paga | cancelada`.
- `target_platform_fee_amount`
  - meta mínima para liberar a recompensa.
- `reward_amount`
  - valor prometido da recompensa.
- `progress_platform_fee_amount`
  - snapshot opcional da última apuração para leitura rápida de progresso.
- `eligible_at`
- `paid_at`
- `paid_amount`
- `payment_note`
  - campo textual curto para referência de pagamento manual assistido.
- `created_by`
- `paid_by`
- `cancelled_by`
- `cancel_reason`
- `created_at`
- `updated_at`

## 6.3. Restrições mínimas recomendadas

- unique para impedir mais de uma indicação ativa entre o mesmo par indicador/indicada;
- check para impedir `referrer_company_id = referred_company_id`;
- FKs para `companies`;
- RLS respeitando `company_id`;
- regra de escrita restrita a perfis administrativos autorizados.

## 6.4. Trilhas de auditoria

Em vez de criar um subsistema grande de auditoria, recomendo duas camadas simples:

### Camada 1: campos auditáveis na própria indicação
- `eligible_at`
- `paid_at`
- `paid_by`
- `cancelled_by`
- `cancel_reason`
- `payment_note`

### Camada 2: tabela mínima de logs da indicação
Se o time julgar necessário desde o MVP, criar também `company_referral_logs` com padrão inspirado em `sale_logs`:

- `id`
- `company_referral_id`
- `company_id`
- `action`
- `description`
- `old_value`
- `new_value`
- `performed_by`
- `created_at`

Essa tabela é pequena, segue padrão já consolidado no projeto e evita esconder transições críticas.

## 6.5. O que evitar

- não criar carteira virtual;
- não criar ledger financeiro paralelo;
- não criar engine de comissão recorrente;
- não criar saldo acumulado multi-nível;
- não criar árvore de afiliados.

---

# 7. Riscos e validações

## 7.1. Riscos principais

### a) Autoindicação direta
A mesma empresa tentar indicar a si própria.

**Mitigação mínima:**
- bloquear quando `referrer_company_id = referred_company_id`.

### b) Autoindicação indireta por mesma pessoa
Empresas diferentes formalmente, mas controladas pela mesma pessoa/responsável.

**Mitigação mínima de MVP:**
- alertar ou bloquear quando houver coincidência de CNPJ, CPF do responsável, e-mail principal, telefone ou chave operacional equivalente, conforme dados disponíveis.
- se os dados não existirem de forma consistente no modelo atual, registrar explicitamente essa limitação no rollout do MVP.

### c) Empresa fake criada só para bater meta
Cadastro artificial com operação mínima apenas para sacar a recompensa.

**Mitigação mínima:**
- exigir empresa efetivamente ativa e com vendas pagas reais;
- usar meta baseada em taxa real da plataforma, não em cadastro;
- manter aprovação final do pagamento como ação administrativa humana no MVP.

### d) Duplicidade de indicação
Duas empresas diferentes tentando registrar a mesma indicada.

**Mitigação mínima:**
- política objetiva: a primeira indicação válida registrada vence;
- impedir segunda indicação ativa para a mesma `referred_company_id`.

### e) Elegibilidade artificial por reversões posteriores
Empresa bate a meta, mas depois tem cancelamentos/reembolsos relevantes.

**Mitigação mínima:**
- cálculo de progresso sempre baseado em vendas atualmente válidas;
- antes de pagar, o admin pode recalcular a indicação;
- após pagamento, não automatizar estorno no MVP.

### f) Exposição de dados sensíveis
Mostrar ao indicador taxa interna detalhada demais da empresa indicada.

**Mitigação mínima:**
- exibir apenas progresso percentual/valor acumulado rumo à meta, sem abrir composição detalhada venda a venda para perfis não autorizados.

## 7.2. Validações mínimas realistas para MVP

- bloquear autoindicação direta;
- impedir segunda indicação ativa para a mesma empresa indicada;
- exigir que empresa indicada pertença ao cadastro real de `companies`;
- exigir que a apuração use somente vendas da empresa indicada com `status = 'pago'`;
- permitir cancelamento administrativo da indicação com motivo;
- exigir confirmação manual do pagamento da recompensa;
- registrar usuário e data em mudanças críticas de status.

---

# 8. Impactos no sistema

## 8.1. Banco de dados

Impacto: **baixo a médio**.

Necessário:

- nova tabela principal de indicações;
- possivelmente tabela simples de logs;
- políticas RLS alinhadas ao padrão multiempresa;
- índices para `referrer_company_id`, `referred_company_id`, `company_id`, `status`.

## 8.2. Camada de apuração

Impacto: **baixo** se for feita como leitura derivada de `sales`.

Necessário:

- função/repositório para calcular progresso com base em `sales`;
- rotina idempotente de atualização do status da indicação;
- reaproveitamento da lógica financeira já consolidada em vez de recálculo criativo.

## 8.3. Admin

Impacto: **baixo a médio**.

Possível evolução futura:

- nova área administrativa “Indicações” dentro do layout padrão;
- listagem com filtros simples;
- detalhe da indicação com status, meta, progresso, datas e ações administrativas;
- ação manual de recalcular;
- ação manual de marcar pagamento.

## 8.4. Segurança e auditoria

Impacto: **baixo**, desde que siga padrão já existente.

Necessário:

- RLS por `company_id`;
- logs de mudança de status;
- separação clara entre elegibilidade e pagamento;
- acesso restrito a informações sensíveis.

## 8.5. Pagamento da recompensa

Impacto: **médio** se tentar automatizar agora; **baixo** se começar manual assistido.

Recomendação:

- no MVP, registrar a recompensa como paga manualmente por admin autorizado;
- não criar gateway novo nem automação financeira agora.

---

# 9. Recomendação final

## 9.1. Vale implementar?

**Sim, vale implementar em fases.**

A ideia é compatível com o projeto atual porque:

- usa a entidade `sales` como fonte de verdade operacional e financeira;
- respeita multiempresa via `company_id`;
- conversa bem com a regra de que só venda paga conta para financeiro;
- pode ser auditável sem nova arquitetura;
- permite MVP simples e controlado.

## 9.2. MVP correto recomendado

O MVP recomendado é:

1. criar cadastro mínimo de indicação entre empresas;
2. usar apuração baseada em `sales` da empresa indicada;
3. considerar como retorno elegível a soma de `platform_fee_total` das vendas `pago`;
4. mover status da indicação por rotina idempotente e auditável;
5. liberar pagamento apenas como ação administrativa manual;
6. registrar pagamento uma única vez.

## 9.3. O que não deve entrar no MVP

- link público complexo com tracking avançado;
- comissão recorrente;
- múltiplos níveis de indicação;
- automação de repasse financeiro;
- painel detalhado com exposição sensível de todas as taxas da indicada;
- regras inteligentes difíceis de auditar.

## 9.4. Decisão arquitetural recomendada

A decisão mais segura é:

- **criar entidade mínima nova para a indicação**;
- **reaproveitar `sales` como base de apuração**;
- **não mexer no motor financeiro existente além do necessário para leitura**.

Essa abordagem atende diretamente ao princípio central do projeto: mudança mínima, previsível e auditável.

---

# 10. Próximos passos sugeridos

## 10.1. Etapa de análise concluída

Entregáveis desta etapa:

- definição do objetivo do programa;
- definição da fonte de verdade recomendada;
- definição do fluxo funcional mínimo;
- definição da estrutura mínima recomendada;
- mapeamento de riscos e validações de MVP.

## 10.2. Etapa de modelagem

Próximos passos de modelagem antes de codar:

1. validar com produto se o indicador será empresa, usuário ou ambos;
2. validar se a primeira versão terá cadastro manual da indicação ou link/código de convite;
3. definir o nome final da tabela e os enums/status;
4. definir a query/função oficial de apuração do progresso;
5. definir quais dados podem aparecer na UI sem expor sensibilidade indevida.

## 10.3. Etapa de implementação

Sequência sugerida:

1. migration da tabela `company_referrals`;
2. migration opcional de `company_referral_logs`;
3. políticas RLS;
4. função/repositório de apuração baseada em `sales`;
5. ação idempotente de recalcular status;
6. ação administrativa para registrar pagamento;
7. testes de cenários principais:
   - sem vendas;
   - vendas pagas abaixo da meta;
   - meta atingida;
   - cancelamento antes da elegibilidade;
   - autoindicação bloqueada;
   - duplicidade bloqueada.

## 10.4. Etapa de interface/admin

Somente depois da modelagem/implementação base:

- tela/lista “Indicações” no admin;
- filtros por status;
- card de progresso até a meta;
- detalhe com datas, valores e histórico;
- ação manual “Recalcular”;
- ação manual “Marcar como paga”.

## 10.5. Dúvidas que precisam ser validadas antes da implementação

- quem é juridicamente o recebedor da recompensa: empresa ou usuário?
- qual dado define unicidade de uma empresa indicada no programa: `companies.id`, CNPJ ou ambos?
- como registrar o pagamento da recompensa no MVP sem criar fluxo financeiro paralelo?
- haverá necessidade de aprovação manual da indicação antes de começar a contar progresso?
- o programa vale para qualquer empresa nova ou apenas para empresas com plano/contrato específico?

---

## Recomendação executiva resumida

A feature é viável **agora**, desde que seja implementada como **MVP em fases**, usando `sales` como base financeira oficial e `platform_fee_total` como métrica principal de retorno real da plataforma. O desenho mais seguro é criar uma entidade mínima de indicação entre empresas, apurar progresso de forma derivada e idempotente, liberar elegibilidade somente após soma confiável de vendas pagas e manter o pagamento da recompensa como ato administrativo manual e auditável.
