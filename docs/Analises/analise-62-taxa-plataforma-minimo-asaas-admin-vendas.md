# Análise — taxa da plataforma abaixo do mínimo do Asaas em `/admin/vendas`

## 1. Resumo executivo
- O fluxo atual trata a taxa da plataforma da venda manual como **cobrança separada** da venda principal: a venda nasce `reservado`, com `platform_fee_status = pending` quando há taxa, e só deveria virar `pago` após confirmação da taxa via webhook. Isso é explícito no frontend, no backend e no trigger do banco. 
- Quando a taxa calculada fica abaixo de **R$ 5,00**, a edge function `create-platform-fee-checkout` aplica uma regra específica: marca a taxa como `waived` (`dispensada`), grava log de histórico e retorna sucesso técnico sem abrir cobrança no Asaas.
- O estado `waived` não promove a venda para `pago` (ponto positivo de segurança), mas permite a operação permanecer como reserva ativa e seguir no fluxo operacional de reserva até vencer/cancelar. Isso pode produzir perda de receita da plataforma se virar prática recorrente.
- A regra do mínimo está **hardcoded globalmente** (`const ASAAS_MIN_CHARGE = 5.0`) e não parametrizada por empresa. A lógica não usa `company_id` para decidir mínimo — só para gravar/consultar dados da venda.
- Há evidências de decisão intencional (não acidente): comentários, mensagens de UI e logs descrevem a dispensa como comportamento explícito. Porém, do ponto de vista de produto financeiro, a decisão está **incompleta**, porque cria exceção de receita sem política formal de compensação (ajuste para mínimo, bloqueio preventivo, acúmulo etc.).

## 2. Contexto do problema
- No fluxo administrativo, a venda manual é criada por `NewSaleModal` com status inicial `reservado`, e a taxa da plataforma (quando aplicável) é calculada na criação da venda e persistida em `sales.platform_fee_amount`.
- A cobrança dessa taxa não ocorre no mesmo momento da criação da venda; ela é acionada depois, por CTA “Pagar Taxa”, que chama `startPlatformFeeCheckout` e invoca a edge `create-platform-fee-checkout`.
- O comportamento reportado (taxa R$ 4,76 marcada como “Dispensada”) é coerente com a implementação atual: qualquer taxa `< 5.00` entra em ramificação de `waived`.

## 3. Fluxo atual da venda manual
1. **Entrada em `/admin/vendas`**
   - A criação acontece em `src/components/admin/NewSaleModal.tsx` (aba `manual`).
2. **Cálculo e persistência da venda**
   - Ao confirmar, o modal insere em `sales`:
     - `status = 'reservado'` (não `pago`),
     - `sale_origin = 'admin_manual'`,
     - `platform_fee_amount` (se houver),
     - `platform_fee_status = 'pending'` (quando há taxa) ou `not_applicable`,
     - `reservation_expires_at` (validade da reserva manual),
     - `company_id` e `payment_environment` explícitos.
3. **Criação de tickets e logs**
   - Insere tickets em `tickets` e registra `sale_logs` com ação de criação manual reservada.
4. **Cobrança da taxa da plataforma (momento separado)**
   - O pagamento da taxa é iniciado por ação explícita (lista de vendas ou comprovante), via `startPlatformFeeCheckout` -> edge `create-platform-fee-checkout`.
5. **Retorno da cobrança**
   - Se cobrança criada: grava `platform_fee_payment_id` e log `platform_fee_checkout_created`.
   - Se abaixo do mínimo: marca `platform_fee_status = 'waived'` e log `platform_fee_waived`.
6. **Confirmação final**
   - Se Asaas confirmar pagamento da taxa (`platform_fee_<sale_id>` no webhook), `asaas-webhook` marca:
     - `platform_fee_status = 'paid'`,
     - `platform_fee_paid_at`,
     - `platform_fee_total` (consolidado),
     - e promove venda de `reservado` para `pago`.
7. **Restrição de transição para pago**
   - Frontend (`Sales.tsx`) e trigger SQL (`enforce_platform_fee_before_paid`) bloqueiam promoção para `pago` quando taxa não está em condição permitida.
8. **Reserva ativa**
   - A reserva permanece operacionalmente ativa até pagamento/cancelamento ou vencimento por `cleanup-expired-locks` (que cancela `reservado` vencido com base em `reservation_expires_at`).

**Conclusão do fluxo:** hoje é possível ter venda manual válida no estado `reservado` + taxa `waived`, sem cobrança da taxa, até a reserva expirar ou ser tratada manualmente.

## 4. Como a taxa da plataforma é calculada hoje
- **Onde calcula:** `NewSaleModal.tsx` no `handleConfirm`.
- **Regra:** `platformFeeAmount = round(grossTotal * (platform_fee_percent / 100), 2)`.
- **Origem do percentual:** `company.platform_fee_percent`.
- **Arredondamento:** manual para 2 casas usando `Math.round(... * 100) / 100`.
- **Validação de mínimo na criação da venda:** **não existe** na criação.
- **Validação de mínimo na criação da cobrança:** existe na edge `create-platform-fee-checkout` (valor mínimo Asaas hardcoded em `5.0`).
- **Diferença manual x pública:**
  - manual/admin: taxa separada (`platform_fee_status` controla pendência/baixa),
  - checkout público: segue fluxo principal Asaas e não usa essa cobrança separada (`not_applicable` no contexto descrito).
- **Regra específica para origem manual:** sim, toda a trilha de cobrança separada (`platform_fee_*`) é focada em `admin_manual` / conversões administrativas.

## 5. Onde e por que a taxa vira `dispensada`
- **Onde:** edge `supabase/functions/create-platform-fee-checkout/index.ts`.
- **Condição exata:** `if (feeAmount < ASAAS_MIN_CHARGE)` com `ASAAS_MIN_CHARGE = 5.0`.
- **Ação executada:**
  - atualiza venda para `platform_fee_status = 'waived'`,
  - grava log `platform_fee_waived` com descrição “abaixo do mínimo Asaas... marcada como dispensada”,
  - retorna `200` com `{ waived: true }`.
- **Status/modelagem:**
  - `waived` é status oficial documentado em comentário da migration de `platform_fee_status` (`not_applicable`, `pending`, `paid`, `waived`, `failed`).
  - é campo textual em `sales.platform_fee_status`, sem enum SQL dedicado.
- **Decisão de produto x contingência técnica:**
  - Há forte evidência de decisão explícita de implementação (mensagens, comentários e log específico),
  - mas não há evidência no código de política financeira de compensação para receita dispensada; portanto é implementação intencional, porém incompleta como regra de produto financeiro.

## 6. Impactos operacionais e financeiros do comportamento atual
### 6.1 Cenário permitido hoje
Sim, o sistema permite:
- venda principal criada normalmente,
- reserva ativa válida,
- taxa não cobrada (status `waived`),
- operação seguindo como reserva até vencimento/cancelamento/pagamento por outro caminho.

### 6.2 Impacto financeiro
- Enquanto `status` permanecer `reservado`, não entra no financeiro oficial (KPIs/relatórios usam `status='pago'`).
- Porém, se o fluxo operacional considerar a reserva “suficiente” para seguir atividades manuais sem cobrança posterior da taxa, há risco de receita da plataforma nunca ser capturada.
- O estado `waived` em si formaliza a dispensa e pode normalizar exceções sem contrapartida financeira.

### 6.3 Impacto operacional
- A UI informa “Dispensada”, o que reduz fricção imediata, mas pode induzir leitura de “resolvido” para um caso que é, na prática, perda de monetização.
- O cleanup automático cancela reservas vencidas, mitigando reserva eterna, mas não recupera taxa dispensada.

## 7. Validação contra as diretrizes oficiais do projeto
Referência usada: `docs/manual-operacional-smartbus-br/Diretrizes Oficiais do Projeto.txt`.

- **Previsibilidade:** parcialmente alinhado. A regra é determinística (abaixo de 5 => `waived`), mas o resultado de negócio (dispensa de receita) pode surpreender quem espera cobrança obrigatória da taxa.
- **Auditabilidade:** parcialmente alinhado. Há rastros (`sale_logs`, status, descrição), porém sem política explícita de reconciliação/compensação da dispensa.
- **Consistência:** parcialmente alinhado. O sistema é consistente tecnicamente dentro do fluxo manual, mas cria um tratamento excepcional (`waived`) que não aparece como política financeira global documentada.
- **Não criar fluxos paralelos desnecessários:** parcialmente alinhado. Já existe fluxo manual separado por natureza, mas `waived` adiciona bifurcação financeira relevante sem fechamento claro de produto.
- **Não inventar comportamento inteligente:** em desacordo parcial. A dispensa automática por mínimo é uma decisão “inteligente” local de gateway que altera receita sem passo explícito de confirmação de negócio.
- **Asaas como gateway oficial:** alinhado (toda cobrança oficial ainda depende do Asaas), mas a exceção por mínimo fica fora da cobrança.

**Veredito geral:** **parcialmente alinhado**, com pontos de desacordo para previsibilidade financeira e governança da regra.

## 8. Riscos identificados
1. **Perda silenciosa de receita da plataforma** em vendas de baixo valor com taxa < R$ 5,00.
2. **Ambiguidade operacional**: `waived` pode ser interpretado como sucesso financeiro, embora represente renúncia de taxa.
3. **Precedente perigoso**: exceção automática pode incentivar expansão de dispensas para outros casos sensíveis.
4. **Fragilidade multiempresa da regra de mínimo**: mínimo hardcoded global, sem configuração por empresa ou versão de contrato.
5. **Desalinhamento produto-financeiro**: regra técnica existe, mas sem política explícita de compensação (ajuste, bloqueio, saldo acumulado).
6. **Risco de compliance interno**: trilha existe, porém sem mecanismo de governança para aprovar/monitorar dispensas por volume/valor.

## 9. Alternativas possíveis de tratamento
### Opção A — Bloquear venda manual no momento da criação quando taxa calculada < mínimo
- **Prós:** máxima previsibilidade e proteção de receita; impede exceção silenciosa.
- **Contras:** aumenta fricção operacional para vendas de baixo ticket.
- **Adequação:** alta para controle financeiro rígido.

### Opção B — Ajustar automaticamente taxa para o mínimo (R$ 5,00)
- **Prós:** mantém cobrança e evita dispensa.
- **Contras:** altera regra comercial da taxa percentual (cobra acima do percentual acordado); pode exigir transparência contratual e UI explícita.
- **Adequação:** média, depende de validação jurídica/comercial.

### Opção C — Acumular saldo de taxas abaixo do mínimo e cobrar ao atingir piso
- **Prós:** preserva receita sem distorcer valor unitário por venda.
- **Contras:** maior complexidade de implementação e conciliação; cria crédito/débito acumulado.
- **Adequação:** alta em receita, média/baixa em simplicidade.

### Opção D — Manter dispensa (`waived`) como hoje
- **Prós:** simplicidade técnica imediata.
- **Contras:** risco contínuo de perda de receita e inconsistência de expectativa.
- **Adequação:** baixa para produto financeiro maduro.

### Opção E — Modelo híbrido seguro (recomendável)
- Bloquear criação da venda manual quando taxa < mínimo **ou** exigir escolha explícita e auditável de tratamento por usuário autorizado (bloquear / ajustar / acumular), com política única por empresa.
- **Prós:** previsibilidade + auditabilidade + governança.
- **Contras:** requer definição de produto e UX clara.

## 10. Recomendação final
### 10.1 Respostas diretas às perguntas
1. **Hoje é regra de negócio ou contingência técnica?**
   - Implementação explícita no código (regra operacional local), mas sem fechamento completo de produto financeiro. Classifico como **decisão de produto incompleta materializada tecnicamente**.
2. **`dispensada` faz sentido no produto atual?**
   - **Parcialmente**: faz sentido técnico para contornar limite do gateway, mas é frágil sem política de compensação e governança.
3. **Deveria bloquear venda manual abaixo do mínimo?**
   - Para preservar receita/previsibilidade, **sim, é a alternativa mais segura por padrão** (ou exigir decisão explícita autorizada).
4. **Existe ajuste automático seguro hoje?**
   - **Não.** Só existe dispensa automática (`waived`).
5. **Hoje a operação pode seguir sem plataforma receber?**
   - **Sim.** A venda pode seguir como reserva ativa com taxa dispensada.
6. **É bug, regra mal definida ou decisão incompleta?**
   - **Decisão incompleta de produto financeiro** (com risco operacional); não é bug acidental simples.
7. **Solução mais segura entre as opções listadas?**
   - **Bloquear** é a mais segura e simples.
   - Em segundo lugar, **acumular saldo** (melhor receita, maior complexidade).
8. **Qual preserva melhor previsibilidade, auditabilidade, simplicidade e receita?**
   - **Bloqueio preventivo com regra explícita** (e mensagem clara) maximiza previsibilidade/auditabilidade/simplicidade.
   - Se a prioridade absoluta for receita sem bloqueio, considerar acumulação com trilha robusta.

### 10.2 Recomendação objetiva de produto/operação
- **Não manter o comportamento atual como padrão definitivo.**
- Definir política oficial única para taxa abaixo do mínimo (preferência: bloqueio preventivo), com:
  - validação antes de criar venda manual,
  - mensagem operacional explícita,
  - trilha de auditoria padronizada,
  - configuração por empresa apenas se houver necessidade real de variação contratual.

## 11. Arquivos, funções e pontos exatos analisados
### Frontend (`/admin/vendas` e criação manual)
- `src/components/admin/NewSaleModal.tsx`
  - cálculo da taxa, criação de venda reservada, origem manual, reserva ativa (`reservation_expires_at`), CTA de pagar taxa.
- `src/pages/admin/Sales.tsx`
  - ações de “Pagar Taxa”, bloqueio de transição para pago quando taxa não confirmada, exibição de status “Dispensada”, histórico da venda.
- `src/lib/platformFeeCheckout.ts`
  - invocação da edge function e tratamento de retorno `waived`.

### Backend (Edge Functions)
- `supabase/functions/create-platform-fee-checkout/index.ts`
  - regra de mínimo Asaas (`ASAAS_MIN_CHARGE = 5.0`) e marcação `platform_fee_status = 'waived'`.
- `supabase/functions/asaas-webhook/index.ts`
  - confirmação da taxa, promoção `reservado` -> `pago`, consolidação em `platform_fee_total`, tratamento de falha.
- `supabase/functions/cleanup-expired-locks/index.ts`
  - cancelamento automático de reservas manuais vencidas (`reservation_expires_at`).

### Banco/migrations e regra de status
- `supabase/migrations/20260308131238_e77be19e-1cb7-4ef5-b54a-327f5514eb6c.sql`
  - criação de `platform_fee_status`, documentação de status possíveis, trigger anti-bypass inicial.
- `supabase/migrations/20260313180000_fix_reserved_fee_transition_rule.sql`
- `supabase/migrations/20260314115028_e9799097-639e-4e16-b59d-c51094fa6771.sql`
  - endurecimento da regra para impedir `pago` quando taxa está pendente/dispensada.
- `supabase/migrations/20261027090000_fix_manual_sales_platform_fee_consolidation.sql`
  - consolidação/fallback de taxa para relatórios e KPIs.
- `supabase/migrations/20261016103000_fix_sales_report_financial_paid_only.sql`
  - financeiro oficial restrito a vendas `pago`.

### Diretrizes oficiais validadas
- `docs/manual-operacional-smartbus-br/Diretrizes Oficiais do Projeto.txt`
  - princípios de previsibilidade, auditabilidade, consistência, padrão único e Asaas oficial.

## 12. Dúvidas e validações pendentes
1. **Política de produto formal**: existe decisão oficial documentada aprovando dispensa automática de taxa abaixo do mínimo?
2. **Governança de exceção**: quem pode dispensar taxa e em quais limites (valor, quantidade, período, empresa)?
3. **Contrato comercial**: é permitido cobrar mínimo fixo (R$ 5,00) quando percentual resultar abaixo disso?
4. **Estratégia financeira**: bloquear, ajustar para mínimo ou acumular saldo — qual regra oficial por empresa/produto?
5. **Observabilidade executiva**: há KPI/alerta para volume de `platform_fee_status = 'waived'` por empresa para evitar perda silenciosa?
6. **UX de risco**: o termo “Dispensada” deveria incluir alerta de impacto financeiro (para evitar interpretação de “pago”)?

