# Análise 2 — Regra de Distribuição da Taxa (Plataforma / Sócio / Representante)

Data: 2026-04-25  
Escopo: auditoria técnica/documental sem implementação.

## 1) Como o sistema funciona hoje

## 1.1 Fonte de percentuais
O fluxo atual não usa uma “taxa total” única para depois repartir 1/3-1/3-1/3 ou 50/50 automaticamente.  
Ele usa **dois percentuais de configuração da empresa**:
- `companies.platform_fee_percent` (percentual da plataforma)
- `companies.socio_split_percent` (percentual do sócio sobre a taxa/plano vigente no backend)

Além disso, quando há representante elegível, o percentual operacional dele é derivado de regra própria:
- `representative_percent = platform_fee_percent / 3` (arredondado em 2 casas)

## 1.2 Split Asaas (create-asaas-payment)
Na criação da cobrança, o backend chama `resolveAsaasSplitRecipients` com:
- `platformFeePercent` vindo da empresa
- `socioSplitPercent` vindo da empresa
- `representativeId` da venda

Esse resolvedor monta recebedores do Asaas com percentuais independentes por recebedor:
- plataforma: entra com `platformFeePercent` (se habilitada e com wallet)
- sócio: entra com `socioSplitPercent` (se >0 e sócio ativo com wallet)
- representante: entra com `platformFeePercent/3` (se elegível e com wallet)

Ou seja, não existe repartição automática da mesma base em “3 partes iguais” quando há representante.

## 1.3 Snapshot financeiro da venda
O snapshot persiste percentuais e valores no momento da criação da cobrança (`split_snapshot_*`) e é reutilizado por verify/webhook quando disponível.  
Quando snapshot não existe, verify/webhook recalculam com os percentuais atuais da empresa + regra do resolvedor.

## 1.4 Comissão (ledger) do representante
A função SQL oficial `upsert_representative_commission_for_sale` calcula comissão do representante como:
- `commission_percent = ROUND(platform_fee_percent / 3, 2)`
- `commission_amount = base_amount * commission_percent`

Isso confirma regra fixa de 1/3 da taxa da plataforma para o representante (não 1/3 da “taxa total já repartida entre 3”).

## 1.5 Painéis / UI operacional
- `/admin/empresa` permite configurar manualmente “Taxa da Plataforma (%)” e “Taxa do Sócio (%)”.
- `/admin/socios` mantém cadastro do sócio beneficiário financeiro via `socios_split`.
- Painel do representante consome ledger persistido (`representative_commissions`) e **não recalcula** comissão no frontend.

---

## 2) A regra esperada (1/3 com representante e 50/50 sem representante) existe?

## Cenário esperado 1 — Com representante
Esperado: taxa total dividida em 3 partes iguais (plataforma/sócio/representante = 1/3 cada).

**Evidência encontrada:** não há algoritmo com essa fórmula no código auditado.  
O que existe é:
- plataforma = `platform_fee_percent`
- sócio = `socio_split_percent`
- representante = `platform_fee_percent / 3`

Portanto, o cenário “1/3 para cada um” **não está implementado como regra central única**.

## Cenário esperado 2 — Sem representante
Esperado: taxa total dividida 50% plataforma / 50% sócio.

**Evidência encontrada:** não há fallback automático “sem representante => 50/50”.  
Sem representante, o sistema apenas não inclui recebedor representante e mantém plataforma/sócio conforme percentuais configurados (`platform_fee_percent`, `socio_split_percent`).

Conclusão: o cenário “50/50” **não é regra automática do backend**.

---

## 3) O split enviado ao Asaas respeita qual lógica de fato?

Respeita a lógica **configurada por percentuais explícitos + elegibilidade operacional**:
- inclui plataforma conforme `platform_fee_percent` e wallet da plataforma;
- inclui sócio conforme `socio_split_percent` e validação de sócio ativo/wallet;
- inclui representante conforme `platform_fee_percent/3` e elegibilidade/wallet;
- soma >100% bloqueia criação.

Isso significa que o split está coerente com o modelo atual documentado no PRD 04 (percentuais configuráveis + representante opcional), mas **não coerente com a regra de negócio esperada 1/3-1/3-1/3 / 50-50** descrita nesta tarefa.

---

## 4) Representante participa do split real?

Sim, participa **quando elegível** (representante ativo + wallet no ambiente).  
Se não elegível, checkout segue e representante é ignorado no split sem bloquear a venda.

Logo, o representante já participa do split real, porém com percentual derivado de `platform_fee_percent/3` (não de uma divisão igual da taxa total entre 3 participantes).

---

## 5) Sócio participa corretamente do split?

No modelo atual, sim, desde que:
- `socio_split_percent > 0` na empresa;
- exista sócio ativo em `socios_split`;
- exista wallet válida no ambiente.

Sem essas condições, o split de sócio falha ou é bloqueado conforme validação.

---

## 6) Divergências entre cálculo, split enviado e ledger interno

## 6.1 Split x ledger de representante
- Split do representante usa `platform_fee_percent/3` via resolvedor.
- Ledger do representante usa a mesma regra `platform_fee_percent/3` na função SQL.

=> Há **coerência interna** entre split e ledger para representante no modelo atual.

## 6.2 Snapshot x cálculo dinâmico
- Com snapshot congelado, webhook/verify reutilizam valores (coerência temporal).
- Sem snapshot, webhook/verify recalculam dinamicamente com percentuais atuais (pode haver risco de divergência temporal em cenários de mudança de configuração entre criação e confirmação).

## 6.3 Divergência com regra esperada desta tarefa
- A divergência principal não é interna entre componentes atuais; é entre a **regra esperada** (1/3 ou 50/50 automáticos) e a **arquitetura vigente** (percentuais configuráveis + 1/3 do representante sobre taxa da plataforma).

---

## 7) Ausência de representante altera corretamente o cálculo?

No modelo atual, altera somente pela **remoção do recebedor representante**.

Não existe regra explícita de redistribuição automática para 50/50 plataforma/sócio quando representante está ausente.  
Ou seja, “sem representante” não implica automaticamente novo rateio; mantém-se o que está configurado para plataforma/sócio.

---

## 8) Existe hardcode de percentual fixo?

Sim, existem hardcodes/regras fixas relevantes:
1. Representante = `platform_fee_percent / 3` (hardcode funcional de fórmula).
2. Fallback `socio_split_percent ?? 50` em paths de recálculo (verify/webhook) quando snapshot não está presente.

Além disso, há configuração manual explícita de dois campos na empresa (plataforma e sócio), reforçando que o motor atual não deriva automaticamente a distribuição total pela presença/ausência de representante.

---

## 9) O sistema ignora sócio ou representante em algum cenário?

## Representante
Pode ser ignorado sem bloquear checkout quando:
- não existe `sale.representative_id`,
- representante não encontrado/inativo,
- wallet ausente,
- percentual inválido.

## Sócio
Não é “ignorado silenciosamente” quando deveria participar; há validações e erros para cenários inválidos (ex.: falha de consulta/validação).  
Também pode não entrar quando `socio_split_percent <= 0`, por configuração.

---

## 10) PRDs vs código (consistência)

PRD 04 descreve:
- split baseado em taxa da plataforma + taxa de sócio + elegibilidade de representante;
- representante com 1/3 da taxa da plataforma;
- representante opcional no split.

O código auditado está consistente com isso.

Porém, comparado à regra esperada desta tarefa (1/3 igual da taxa total com representante; 50/50 sem representante), há divergência de negócio.

---

## 11) Riscos financeiros identificados

1. **Risco de interpretação comercial/financeira:** se o negócio espera 1/3 ou 50/50 automáticos, o sistema atual pode distribuir diferente por depender de percentuais configurados.
2. **Risco operacional em mudanças de configuração:** nos casos sem snapshot congelado, recálculo dinâmico em verify/webhook pode divergir do esperado no momento da criação.
3. **Risco de auditoria contratual:** termos comerciais que descrevam repartição “automática por cenário” podem não bater com operação real parametrizada.
4. **Risco de repasse ao representante:** ausência de wallet mantém venda confirmada, mas comissão pode ficar bloqueada/pendente no ledger.

---

## 12) Recomendação objetiva

**Status geral frente à regra esperada desta tarefa:** **INCONSISTENTE**.

- **OK** para o modelo atual implementado (percentuais configuráveis + representante opcional com 1/3 da taxa da plataforma).
- **Inconsistente** frente à regra esperada 1/3-1/3-1/3 e 50/50 automáticos.
- **Incompleto** se a regra esperada for oficial, porque faltam:
  - fórmula central única de distribuição por cenário;
  - alinhamento explícito de PRD/contrato com algoritmo real;
  - validação de cenário sem representante com redistribuição automática definida.

---

## 13) Evidências auditadas (arquivos-chave)

Documentação:
- `docs/PRD/Asaas/04-asaas-split-comissoes-e-representantes.md`

Backend/Edge:
- `supabase/functions/_shared/split-recipients-resolver.ts`
- `supabase/functions/create-asaas-payment/index.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `supabase/functions/asaas-webhook/index.ts`

Banco/migrations:
- `supabase/migrations/20260320090000_rename_financial_partner_to_socios_split.sql`
- `supabase/migrations/20260411170000_update_representative_commission_one_third_platform_fee.sql`
- `supabase/migrations/20260424120000_add_sales_split_snapshot_asaas.sql`

Painéis:
- `src/pages/admin/Company.tsx`
- `src/pages/admin/SociosSplit.tsx`
- `src/pages/representative/RepresentativeDashboard.tsx`

---

## 14) Comandos usados na auditoria

- `rg -n "representative|socio_split_percent|platform_fee_percent|1/3|split|commission|socios_split|..." ...`
- `sed -n '1,220p' docs/PRD/Asaas/04-asaas-split-comissoes-e-representantes.md`
- `sed -n '1,260p' supabase/functions/_shared/split-recipients-resolver.ts`
- `sed -n '780,940p' supabase/functions/create-asaas-payment/index.ts`
- `sed -n '940,1085p' supabase/functions/verify-payment-status/index.ts`
- `sed -n '1080,1260p' supabase/functions/asaas-webhook/index.ts`
- `sed -n '1,220p' supabase/migrations/20260411170000_update_representative_commission_one_third_platform_fee.sql`
- `sed -n '1,220p' src/pages/admin/Company.tsx`
- `sed -n '100,220p' src/pages/representative/RepresentativeDashboard.tsx`
