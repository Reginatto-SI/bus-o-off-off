# Análise 3 — Validação real do fluxo Asaas

## 1. Resumo executivo

- **Aderência geral estimada:** **~86%** (alta aderência estrutural, com lacunas críticas pontuais em confiabilidade operacional e consistência financeira pós-confirmação).
- **Conclusão executiva curta:** o fluxo está maduro para operação assistida, **mas ainda não 100% pronto para produção sem risco crítico**.
- **Principais riscos reais encontrados:**
  1. **Cobrança criada no Asaas sem persistência garantida de `asaas_payment_id` na venda** (update sem tratamento de erro no final do `create-asaas-payment`).
  2. **Venda pode ficar “paga sem ticket”** (estado explicitamente tratado como inconsistente, porém ainda possível e dependente de reconciliação manual).
  3. **Snapshot financeiro (platform/sócio) é recalculado no webhook/verify com configuração atual da empresa** (não necessariamente congelada no momento da criação da cobrança), abrindo espaço para divergência split x ledger.
  4. **Fallback de ambiente no frontend por hostname** quando edge falha: seguro para disponibilidade, mas com risco de decisão incorreta em host não oficial/mal configurado.
  5. **Comissão de representante pode falhar sem bloquear confirmação** (venda confirma, comissão pode não nascer).

---

## 2. Divergências por PRD

### PRD 00 — Índice geral

- **Status:** ✅ aderente (documento de indexação e criticidade).
- **Divergência:** nenhuma de implementação (não define comportamento transacional).

---

### PRD 01 — Visão geral

#### Aderência
- Fluxo macro implementado: create → webhook prioritário → verify fallback → finalização compartilhada → trilha de auditoria.

#### Divergências
1. **Persistência do vínculo Asaas na venda não é fail-closed após criar cobrança**.
   - A função cria pagamento com sucesso e depois faz `update` da venda sem validar erro; isso pode deixar pagamento existente no gateway e venda sem `asaas_payment_id`.
   - **Classificação:** 🔴 Crítica (risco financeiro e rastreabilidade).

2. **Regra “auditável ponta a ponta” é parcialmente violada em rollback destrutivo no checkout**.
   - Em erro genérico, venda/staging são removidos; a rastreabilidade local pode ficar limitada a logs técnicos e console.
   - **Classificação:** 🟡 Média.

#### Regra de ouro (PRD 01)
- **Parcialmente respeitada**. O fluxo único existe, mas há pontos de exceção não fail-closed (persistência final do `asaas_payment_id`).

---

### PRD 02 — Fluxo checkout e venda

#### Aderência
- Nascimento da venda com `payment_environment` explícito.
- `create-asaas-payment` valida status elegível, ambiente, split, snapshot e cria cobrança com `externalReference = sale.id`.

#### Divergências
1. **Divergência de rollback em exceção de invoke da edge**.
   - Em erro de rede/indisponibilidade da função, fluxo cai para `/confirmacao/:id` **sem rollback** (mantém venda pendente).
   - PRD descreve rollback genérico em erro de criação; no código isso é somente para erro genérico com resposta, não para exceção de invoke.
   - **Classificação:** 🟠 Alta.

2. **Fluxo “empresa sem integração” mantém venda pendente sem cobrança por decisão de produto**.
   - Coerente com PRD atual, mas continua sendo ponto de quebra operacional recorrente (venda nasce sem cobrança efetiva).
   - **Classificação:** 🟡 Média.

#### Regra de ouro (PRD 02)
- **Respeitada no núcleo** (não marca pago sem confirmação).
- **Fragilidade lateral**: estados pendentes longos sem cobrança vinculada continuam possíveis.

---

### PRD 03 — Webhook e confirmação

#### Aderência
- Webhook com validação de token por ambiente, validação de referência, deduplicação por `asaas_event_id` e finalização idempotente.
- Verify como fallback, com warning explícito quando confirma sem webhook observado.

#### Divergências
1. **“Venda paga sem ticket” continua possível**.
   - É detectado e registrado (`partial_failure`/`ticket_generation_incomplete`), mas ainda exige reconciliação manual.
   - **Classificação:** 🔴 Crítica.

2. **Webhook pode rejeitar evento válido se venda estiver sem `payment_environment`**.
   - Comportamento é intencional (fail-closed), porém operacionalmente gera risco de pagamento não convergir automaticamente.
   - **Classificação:** 🟠 Alta.

3. **Verify pode confirmar sem webhook**.
   - Está conforme PRD (fallback), mas na prática pode virar caminho frequente em ambiente instável e reduzir previsibilidade operacional.
   - **Classificação:** 🟡 Média.

#### Regra de ouro (PRD 03)
- **Respeitada com ressalvas**: webhook é prioritário, verify não substituto formal. Contudo, o sistema depende fortemente de verify em incidentes.

---

### PRD 04 — Split, comissões e representantes

#### Aderência
- Split centralizado com resolvedor único.
- Representante opcional, 1/3 da taxa da plataforma, e inelegibilidade/wallet ausente não derruba checkout.
- Limite de soma de split > 100% bloqueia criação.

#### Divergências
1. **Risco real de divergência split (cobrança) vs snapshot financeiro (confirmação)**.
   - Snapshot de webhook/verify recalcula com `platform_fee_percent`/`socio_split_percent` atuais da empresa, sem congelamento explícito do percentual usado na criação da cobrança.
   - Se taxa mudar entre criação e confirmação, pode haver divergência contábil.
   - **Classificação:** 🟠 Alta.

2. **Comissão de representante não é transação bloqueante da confirmação**.
   - Falha na RPC de comissão gera log de erro, mas pagamento/ticket seguem.
   - **Classificação:** 🟠 Alta.

#### Regra de ouro (PRD 04)
- **Parcialmente respeitada**: arquitetura busca coerência, porém ainda há risco de descolamento temporal entre split efetivo e snapshot/ledger.

---

### PRD 05 — Configuração da empresa e validação

#### Aderência
- Isolamento de credenciais por ambiente.
- Diagnóstico admin detalhado (API key/wallet/account/pix readiness).
- Verificação com contexto administrativo e ambiente resolvido.

#### Divergências
1. **Fallback local por hostname no frontend pode mascarar erro de resolução edge**.
   - Em falha da função de ambiente, frontend força fallback para hostname.
   - Em domínios não mapeados como produção, ambiente cai para sandbox.
   - **Classificação:** 🟠 Alta (mistura operacional potencial).

2. **Diagnóstico “ok” não garante ausência de falha na criação de cobrança**.
   - Já previsto como cenário, e continua real (diferença entre check e execução transacional no create).
   - **Classificação:** 🟡 Média.

#### Regra de ouro (PRD 05)
- **Parcialmente respeitada**: isolamento existe, mas fallback local mantém risco de ambiente incorreto em contexto host irregular.

---

### PRD 06 — Operação, erros e diagnóstico

#### Aderência
- Existe trilha técnica/operacional robusta (`sale_integration_logs`, `sale_logs`, dedup).
- Há função de reconciliação para pago sem ticket.

#### Divergências
1. **Nem toda falha fica investigável somente por banco**.
   - Parte da evidência de falhas no checkout fica no console frontend; em rollback destrutivo, o registro operacional pode perder contexto de negócio.
   - **Classificação:** 🟡 Média.

2. **Fluxos com exceção no invoke (checkout → confirmação) aumentam MTTR**.
   - Venda pendente sem cobrança pode exigir investigação manual e contato de suporte sem trilha completa de criação externa.
   - **Classificação:** 🟠 Alta.

#### Regra de ouro (PRD 06)
- **Parcialmente respeitada**: boa observabilidade backend, mas ainda existem pontos com rastreio incompleto no ciclo de UX/erro.

---

## 3. Pontos críticos de quebra

1. 🔴 **Venda paga sem ticket** (`inconsistent_paid_without_ticket`): existe detecção, porém estado ainda pode ocorrer.
2. 🔴 **Cobrança criada sem `asaas_payment_id` persistido na venda** por falha silenciosa após criação no gateway.
3. 🟠 **Webhook recebido mas rejeitado por ausência de `payment_environment`** (fail-closed correto, impacto alto).
4. 🟠 **Verify confirmando sem webhook correlacionado** (com warning, porém risco operacional de dependência de fallback).
5. 🟠 **Split/snapshot potencialmente divergente quando taxa muda entre criação e confirmação**.
6. 🟠 **Comissão não gerada por falha de RPC sem bloquear venda/ticket**.
7. 🟠 **Ambiente potencialmente misturado por fallback local de hostname** em falha do resolvedor edge.

---

## 4. Regras de ouro violadas

- **PRD 01 (fluxo único previsível e auditável):** violação parcial no ponto de persistência não garantida do `asaas_payment_id` após criação da cobrança.
- **PRD 04 (coerência split x snapshot x ledger):** violação potencial por recálculo temporal com parâmetros atuais da empresa.
- **PRD 05 (isolamento por ambiente sem mistura):** violação potencial via fallback local em hostname não oficial/mal mapeado.

---

## 5. Cenários mal cobertos

1. **Create payment bem-sucedido no gateway + falha ao atualizar venda local** (não há fail/compensação explícita).
2. **Mudança de taxas após criação da cobrança** (não há snapshot imutável da fórmula no momento de criação para reconciliação inequívoca posterior).
3. **Exceção de invoke no checkout** mantendo venda pendente sem trilha completa de erro transacional no banco.
4. **Comissão representante com falha técnica** sem retry automático orquestrado.

---

## 6. Riscos não documentados

1. **Dependência de atualização local pós-criação da cobrança sem verificação de erro** (risco de órfão entre gateway e banco).
2. **Possível inconsistência contábil por tempo (configuração mutável entre create e confirmação)**.
3. **Perda parcial de evidência de incidentes quando rollback destrói staging local e suporte depende de logs externos/frontend.**
4. **Path de fallback de ambiente baseado em hostname pode ser correto para disponibilidade, mas inseguro para governança em múltiplos domínios.**

---

## 7. Prioridade de correção

### 1) Correções urgentes (bloqueantes)
- Garantir persistência transacional/compensatória de `asaas_payment_id` após `create-asaas-payment`.
- Eliminar possibilidade operacional de “pago sem ticket” (ou automatizar reconciliação imediata e obrigatória).
- Congelar parâmetros financeiros usados no split no momento da criação (snapshot imutável de cálculo).

### 2) Correções importantes
- Endurecer fallback de ambiente (edge obrigatório com política de bloqueio seguro quando indeterminado).
- Criar retry/filas para falha de comissão de representante.
- Melhorar trilha de erro no cenário de exception invoke no checkout.

### 3) Melhorias
- Padronizar playbook e SLA de atendimento para pendências sem `asaas_payment_id`.
- Expandir alertas proativos por incidentes críticos (`webhook_not_observed`, `ticket_generation_incomplete`, `sale_without_asaas_payment_id`).

---

## 8. Conclusão

- **O sistema está pronto para produção?**
  - **Não totalmente.** Está próximo, mas ainda com riscos críticos reais em integridade de confirmação e consistência financeira.

- **Há riscos críticos ativos?**
  - **Sim.** Principalmente:
    - potencial de cobrança criada sem vínculo persistido na venda,
    - possibilidade de estado pago sem ticket,
    - risco de divergência split x snapshot em mudanças de configuração.

- **Recomendação final:** tratar os bloqueantes antes de declarar “100% coerente com PRDs” em produção plena.
