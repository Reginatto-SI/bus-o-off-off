# Implementação Fase 3 — Alertas proativos de reservas

## 1) O que foi implementado

### 1.1 Alerta automático ao entrar na tela `/admin/vendas`
- Implementado disparo automático de `toast.warning` quando há reservas em risco global (vencidas ou próximas do vencimento).
- O alerta só dispara quando há risco real e usa assinatura de contexto para evitar repetição/spam.

### 1.2 Resumo GLOBAL de risco
- O resumo operacional passou a usar contagem global da empresa (não apenas da página atual), com duas métricas:
  - reservas próximas do vencimento;
  - reservas vencidas.
- Cálculo feito em consultas dedicadas na tabela `sales` com `company_id` e `reservation_expires_at`.

### 1.3 Ação rápida operacional
- No banner de monitoramento global, adicionado atalho rápido para ação:
  - **Ver reservas vencidas** (aplica filtro `status=reservado` + risco `vencida`)
  - **Ver reservas críticas** (aplica filtro `status=reservado` + risco `proxima`)

### 1.4 Indicador de saúde operacional
- Incluído texto de saúde simples no resumo:
  - “Atualizado automaticamente agora” ou
  - “Atualizado automaticamente há X min”
- Objetivo: transmitir confiança de sincronização ativa sem expor detalhe técnico excessivo.

---

## 2) Decisões tomadas

1. Reutilizar a regra da fase 2 sem criar nova lógica paralela:
   - próxima do vencimento: até 60 min;
   - vencida: expiração no passado.
2. Manter implementação localizada em `src/pages/admin/Sales.tsx`.
3. Evitar arquitetura nova de notificações; usar `toast` + banner existente.
4. Evitar alerta intrusivo com anti-spam por assinatura de contexto.

---

## 3) Como o alerta foi estruturado

- Fonte: contagem global de risco calculada ao carregar/recarregar filtros principais.
- Trigger: efeito dedicado que observa os totais globais.
- Anti-spam: `riskToastSignatureRef` impede repetição da mesma combinação de contexto + totais.
- Comportamento:
  - sem risco: não alerta;
  - com risco: alerta único por assinatura.

---

## 4) Como o cálculo global foi feito

- Foram feitas duas consultas globais em `sales`:
  - próximas do vencimento (`reservation_expires_at` entre `now` e `now + 60min`)
  - vencidas (`reservation_expires_at < now`)
- Ambas aplicam `company_id` e filtros principais em vigor (busca/evento/vendedor/data/status quando aplicável).
- Mantida separação de risco apenas para `status = reservado`.

---

## 5) Validações executadas

- Build completo da aplicação após alterações (ok).
- Teste unitário base executado (ok).
- Validação funcional por implementação:
  - cenário sem risco: sem toast;
  - cenário com risco próximo: toast + banner + atalho;
  - cenário com vencidas: toast + banner + atalho dedicado;
  - ação rápida aplica filtro correto de risco;
  - isolamento por empresa via `company_id`.

---

## 6) Riscos remanescentes

1. O cálculo global com busca textual reaproveita o mesmo escopo de busca da listagem e pode custar mais em bases muito grandes.
2. Indicador de saúde reflete timestamp da última leitura de risco global no frontend (não é telemetria de infraestrutura do cron).
3. A convergência final de vencidas continua dependente do cleanup automático (comportamento esperado do produto).
