# Análise 53 — Wizard onboarding contextual no dashboard

## Resumo executivo
O wizard "Comece por aqui" do `/admin/dashboard` já calcula etapas com dados reais da empresa, mas o topo do card ainda comunica de forma genérica e pouco orientativa. A evolução proposta é local e segura: derivar um estágio contextual linear a partir dos booleanos já existentes (`hasVehicle`, `hasDriver`, `hasBoardingConfig`, `hasEvent`, `hasPublishedEvent`, `hasPaidSale`) e usar esse estágio para mensagens dinâmicas e CTA único do próximo passo.

## Diagnóstico do comportamento atual
- O checklist já existe e está funcional como lista de tarefas com progresso e próximo passo.
- O topo do card mantém texto estático ("Siga estas etapas...") e pouco contexto por estágio operacional.
- O popup de onboarding possui dois modos (`welcome` e `event_cta`), mas com linguagem ampla e pouco personalizada para o momento operacional.
- A renderização do checklist já suporta label, descrição e ação (`Ver`/`Ir agora`), então a evolução pode reutilizar o padrão existente sem novo componente.

## Regra atual de cada etapa
No `Dashboard`, as etapas são avaliadas por consultas por `company_id`:
1. **Cadastrar veículo**: `vehicles` > 0
2. **Cadastrar motorista**: `drivers` > 0
3. **Configurar embarque**: `boarding_locations` ativas > 0
4. **Criar primeiro evento**: `events` > 0
5. **Publicar viagem**: `events` com `status='a_venda'` e `is_archived=false` > 0
6. **Fazer primeira venda**: `sales` com `status='pago'` > 0

## Proposta de cálculo do estágio contextual
Derivar `onboardingStage` local com regra linear e auditável:
- `active`: `hasPaidSale`
- `published_done`: `hasPublishedEvent` e não `hasPaidSale`
- `event_done`: `hasEvent` e não `hasPublishedEvent`
- `boarding_done`: `hasBoardingConfig` e não `hasEvent`
- `driver_done`: `hasDriver` e não `hasBoardingConfig`
- `vehicle_done`: `hasVehicle` e não `hasDriver`
- `initial`: caso contrário

Com isso, mapear conteúdo contextual por estágio (título + apoio + CTA recomendado), sempre refletindo apenas o estado atual e sem criar nova regra de negócio.

## Riscos de regressão
- **Baixo risco funcional**: não muda schema, rotas, RLS, nem consultas centrais além de reaproveitar os booleanos já existentes.
- **Risco visual moderado**: ajustes de hierarquia no topo do card podem afetar densidade visual; mitigação: manter layout compacto e seguir classes já usadas.
- **Risco de inconsistência textual**: mensagens e CTA precisam permanecer sincronizados ao próximo passo; mitigação: usar `nextOnboardingStep` como fonte do link, e estágio apenas para texto.

## Decisão final de implementação
Implementar apenas em `src/pages/admin/Dashboard.tsx`:
1. Criar tipo/local `OnboardingStage` e cálculo via `useMemo` baseado no estado real.
2. Criar mapa contextual por estágio (`title`, `description`, `ctaLabel`).
3. Melhorar cabeçalho do card com mensagem contextual, progresso e próximo passo recomendado.
4. Incluir CTA único opcional no topo (usando `nextOnboardingStep.href`), e no estágio `active` oferecer CTA neutro para `/admin/vendas`.
5. Ajustar texto do popup sem criar novo fluxo (apenas copy mais orientativa).
6. Adicionar comentários curtos explicando que o estágio é derivado e não altera regra de conclusão.
