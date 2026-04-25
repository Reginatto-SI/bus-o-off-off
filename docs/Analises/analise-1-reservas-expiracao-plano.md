# 1. Resumo executivo

## Veredito objetivo
A adoção de uma política oficial de reservas com expiração automática no Smartbus BR é **viável e aderente** ao desenho atual, porque o sistema já possui os blocos centrais necessários:

- status distintos (`reservado`, `pendente_pagamento`, `pago`, `cancelado`, `bloqueado`);
- campo de validade explícita para reserva manual (`sales.reservation_expires_at`);
- rotina automática já separando checkout público e reserva manual (`cleanup-expired-locks`);
- diferenciação visual relevante em admin e comprovantes.

A direção de produto proposta (reserva temporária, pago como confirmação oficial, prevenção de reserva eterna) já está **parcialmente implementada** e precisa de consolidação por parâmetro e UX.

## Síntese da recomendação
1. **Manter política padrão por empresa em `/admin/empresa`** (fonte oficial multiempresa).
2. **Tornar prazo sempre obrigatório** (com default da empresa + override controlado no ato).
3. **Preservar regra operacional: apenas `pago` confirma embarque/manifesto/KPI financeiro**.
4. **Fechar gaps de consistência** onde reservas ainda entram em percepção de ocupação operacional sem segmentação clara.
5. **Executar rollout em fases**: parâmetros → UX de criação/edição → automação/observabilidade → relatórios/indicadores.

---

# 2. Diagnóstico do fluxo atual de reservas

## 2.1 Onde a reserva nasce hoje
A reserva administrativa nasce no modal de nova venda (`NewSaleModal`) em três abas: `manual`, `reserva` e `bloqueio`. Tanto a aba “Venda Manual” quanto “Reserva” gravam `sales.status = 'reservado'` (bloqueio grava `bloqueado`).

Além disso, as reservas administrativas já nascem com validade: `reservation_expires_at = now + 72h` (`MANUAL_RESERVATION_TTL_HOURS = 72`).

## 2.2 Campos relevantes definidos no fluxo
Na criação são preenchidos, entre outros:

- `status`;
- `sale_origin`;
- `platform_fee_status` (quando aplicável no fluxo manual);
- `reservation_expires_at`;
- `payment_environment`;
- `tickets` vinculados por assento.

Ou seja: hoje a reserva não é apenas um rótulo visual, ela ocupa assentos via tickets e possui data de validade explícita no banco.

## 2.3 Diferença entre reserva manual e checkout público
Há dois fluxos separados de pendência:

- **Checkout público:** usa `status = pendente_pagamento` e expiração por `seat_locks.expires_at`.
- **Reserva admin/manual:** usa `status = reservado` e expiração por `sales.reservation_expires_at`.

Essa separação já existe no cleanup e é correta do ponto de vista de previsibilidade (não mistura TTL curto técnico com reserva operacional humana).

## 2.4 Como os assentos ficam bloqueados
No admin, o mapa de assentos consulta `tickets` e considera ocupação para praticamente tudo que não é bloqueio explícito. Em resumo:

- `bloqueado` vai para bucket de bloqueio;
- demais tickets aparecem como ocupados.

Na prática, reserva ocupa assento e reduz disponibilidade.

## 2.5 Onde a reserva aparece visualmente
A reserva aparece:

- na listagem `/admin/vendas` com status próprio;
- nos cards/KPIs operacionais da tela de vendas (“Reservas em aberto”);
- no fluxo de comprovante com render específico de “Comprovante de Reserva” (sem QR operacional exposto);
- em consultas públicas por CPF quando a venda ainda não está paga.

## 2.6 Se há rotina automática de limpeza/expiração
Sim. A Edge Function `cleanup-expired-locks`:

- cancela `pendente_pagamento` expirado por lock;
- cancela `reservado` expirado por `reservation_expires_at`;
- limpa resíduos operacionais (`tickets`, `sale_passengers`, `seat_locks` conforme o caso);
- registra logs em `sale_logs` (`auto_cancelled`, `manual_reservation_auto_cancelled`) e logs técnicos em console.

Há migration de cron a cada 1 minuto para disparo automático.

## 2.7 Se reserva entra em ocupação, relatórios, manifesto e operação
Estado atual é **misto**:

- **Manifesto/lista de embarque**: orientado a `pago` (correto para operação de embarque).
- **Driver boarding**: consulta vendas pagas (correto para embarque).
- **Relatório de evento (`EventReport`)**: ocupação e receita calculadas só com pago (correto para KPI oficial).
- **Eventos (`/admin/eventos`)**: há contagem com `reservado` + `pago` para volume/ocupação visual e bloqueio de exclusão de transporte ao existir qualquer venda (pago ou reservada).
- **Nova venda admin (disponibilidade do transporte)**: trata `reservado` e `pendente_pagamento` dentro do bloco “Reservados”.

## 2.8 Riscos reais já existentes
1. **Risco de “lotação percebida” por reserva aberta** em visões operacionais que agregam reservado.
2. **Risco de limbo operacional** se cleanup atrasar/falhar (reserva vencida segue com status antigo até a execução).
3. **Risco de confusão semântica** entre “reserva ativa”, “reserva vencida aguardando cleanup” e “venda confirmada”.
4. **Risco de governança**: TTL fixo em código (72h) ainda não parametrizado por empresa.

---

# 3. Problemas e riscos identificados

## 3.1 Problemas de produto/negócio
- **Parâmetro de reserva não está externalizado por empresa**: hoje TTL está hardcoded no frontend/admin (72h), embora a base já suporte validade por venda.
- **Ausência de política explícita configurável** para permissões e exceções (ex.: impedir reserva perto do embarque).
- **Possível desalinhamento de leitura operacional** entre telas que usam pago-only e telas que exibem reservado no contexto de ocupação.

## 3.2 Problemas de UX
- Na criação da reserva, o prazo não é decidido explicitamente pelo operador; é implícito por regra fixa.
- Falta sinalização mais forte de “tempo restante da reserva” no ponto de criação e na gestão diária.
- A noção “reserva ≠ confirmação de embarque” já existe em algumas telas, mas não está igualmente forte em toda jornada administrativa.

## 3.3 Problemas de auditabilidade operacional
- Apesar de haver logs relevantes, faltam indicadores de saúde operacional visíveis para gestão (ex.: quantas reservas vencem por dia, backlog vencido aguardando cleanup, etc.).

---

# 4. Viabilidade da nova lógica de reservas com expiração

## 4.1 Resposta direta
**Sim, é viável.**

A estrutura atual já viabiliza:

- reserva temporária com vencimento;
- cancelamento automático e liberação de assentos;
- separação entre reserva e venda paga;
- leitura de status por fluxo.

## 4.2 Grau de esforço
- **Incremental/moderado**, não estrutural profundo.
- Banco e cleanup já possuem os pilares.
- Maior esforço está em **consolidação funcional/UX/política** e não em invenção arquitetural.

## 4.3 Conflitos com fluxos existentes
Conflitos principais são de **consistência entre telas e regras visuais**, não de impossibilidade técnica.

Ex.: algumas telas já operam no princípio “pago é oficial”; outras ainda apresentam reservado como ocupação operacional sem segmentação didática suficiente.

## 4.4 Riscos técnicos e operacionais
- Dependência do scheduler/execução do cleanup para convergência final do status.
- Risco de regras divergentes entre frontend/admin e backend se parâmetros não forem centralizados.
- Risco de complexidade excessiva se muitos parâmetros opcionais forem criados sem hierarquia clara.

---

# 5. Análise das opções de parametrização

## Opção A — Parâmetros em `/admin/empresa` (recomendada)
**Prós**
- Melhor aderência multiempresa (política por tenant).
- Coerência com outros parâmetros de governança já existentes na empresa.
- Menor risco de configurações conflitantes entre eventos.
- Mais previsível para operador e suporte.

**Contras**
- Não cobre exceções por evento sem mecanismo complementar.

## Opção B — Parâmetros por evento
**Prós**
- Ajuste fino por operação específica.

**Contras**
- Aumenta risco de erro operacional.
- Pode gerar comportamento inconsistente entre eventos sem percepção imediata.
- Mais carga cognitiva para time de operação.

## Opção C — Tela administrativa específica só de reservas
**Prós**
- Isolamento temático.

**Contras**
- Cria fluxo paralelo desnecessário e piora descobribilidade.
- Menor aderência ao princípio de mudanças mínimas.

## Opção D — Híbrido (empresa + override controlado no ato)
**Prós**
- Equilíbrio entre padrão global e exceção controlada.
- Reduz rigidez sem perder governança.

**Contras**
- Exige regra de permissão clara para evitar abuso.

## Recomendação de modelagem
Adotar **híbrido com hierarquia fixa**:

1. política padrão em `/admin/empresa` (obrigatória);
2. override na criação somente se parâmetro permitir e dentro de limite máximo;
3. trilha de auditoria para overrides.

---

# 6. Telas e fluxos impactados

## 6.1 `/admin/vendas` — **Obrigatório**
**Por que impacta:** é o centro de gestão de reservas e status.

**Ajustes necessários:**
- exibir claramente prazo/tempo restante da reserva;
- reforçar diferenciação entre “reservado ativo”, “reservado vencido aguardando cleanup”, “pago”;
- possíveis filtros adicionais por “reserva vencida/próxima do vencimento”.

**Tipo de impacto:** visual, lógico, filtro, copy.

## 6.2 `NewSaleModal` (fluxo de criação de reserva) — **Obrigatório**
**Por que impacta:** ponto de origem das reservas.

**Ajustes necessários:**
- aplicar política da empresa como default;
- exibir prazo que será aplicado;
- permitir override apenas se habilitado;
- validar limite máximo.

**Tipo de impacto:** UX, validação, permissão.

## 6.3 `/admin/empresa` — **Obrigatório**
**Por que impacta:** local recomendado para política padrão multiempresa.

**Ajustes necessários:**
- novos parâmetros de política de reserva;
- cópia explicativa objetiva;
- validações simples para evitar combinações inválidas.

**Tipo de impacto:** configuração, copy, permissão.

## 6.4 `/admin/eventos` — **Recomendável (pode virar obrigatório dependendo de decisão de ocupação)**
**Por que impacta:** hoje há leituras de volume com reservado+pago e bloqueio de exclusão com base em existência de vendas.

**Ajustes possíveis:**
- tornar explícito no texto o que é ocupação comercial x confirmação paga;
- revisar labels para evitar interpretação de lotação oficial por reservas.

**Tipo de impacto:** copy, cálculo/semântica.

## 6.5 Dashboard admin — **Recomendável**
**Por que impacta:** já possui distribuição por status, mas pode ganhar alertas operacionais de reserva vencida/próxima.

**Tipo de impacto:** indicador operacional.

## 6.6 Relatórios (`EventReport`, `SalesReport`, comissão) — **Baixo impacto, revisão obrigatória de consistência**
**Por que impacta:** base já orientada a pago para financeiro; precisa garantir que novas regras não quebrem consistência de filtros/status.

**Tipo de impacto:** validação de regra e copy.

## 6.7 Manifesto / embarque (`generateBoardingManifest`, DriverBoarding) — **Sem mudança de regra, validação obrigatória**
**Por que impacta:** confirmar manutenção da regra “somente pago no embarque”.

**Tipo de impacto:** regressão/garantia.

## 6.8 Consulta de passagem / comprovantes (`TicketLookup`, `TicketCard`, `Confirmation`) — **Recomendável**
**Por que impacta:** já existe distinção comprovante x passagem oficial; recomenda-se harmonizar mensagens de vencimento e status reservado.

**Tipo de impacto:** copy e estados de interface.

## 6.9 Edge Function de cleanup + cron — **Obrigatório (observabilidade e governança)**
**Por que impacta:** motor de expiração real.

**Ajustes necessários:**
- manter separação de fluxos;
- reforçar monitoramento/alerta operacional de falha.

**Tipo de impacto:** automação e operação.

---

# 7. Regras operacionais recomendadas

## 7.1 Regras de negócio (posição objetiva)
1. **Reserva conta em ocupação?**
   - Em **ocupação operacional de assento no mapa**, sim (assento indisponível enquanto reserva ativa).
   - Em **ocupação oficial/KPI financeiro/comercial confirmado**, não (somente pago).

2. **Reserva aparece em manifesto/lista de embarque?**
   - **Não.** Manifesto deve permanecer pago-only.

3. **Reserva gera passagem virtual?**
   - **Não como passe operacional.** Pode gerar **comprovante de reserva** claramente descaracterizado.

4. **Reserva aparece como passageiro confirmado?**
   - **Não.** Confirmado = pago.

5. **Reserva vencida vira cancelada automática?**
   - **Sim**, por cleanup.

6. **Alertas de proximidade de expiração?**
   - **Sim, recomendável** (baixo custo/alto ganho operacional).

7. **Revisão operacional antes da saída?**
   - **Sim, recomendável** com checklist simples de reservas abertas.

8. **Restrição de criação perto do embarque?**
   - **Sim, recomendável** por parâmetro (janela mínima).

9. **Diferenciação visual reservado x pago?**
   - **Obrigatória**, consistente em todas as telas-chave.

## 7.2 Política de prazo
- Prazo deve ser sempre obrigatório (nunca reserva sem vencimento).
- Default da empresa deve ser aplicado automaticamente.
- Override manual apenas com governança (permissão + limite máximo + log).

---

# 8. Impactos estruturais e dependências

## 8.1 Banco de dados
### Já existe
- `sales.reservation_expires_at`.
- status e campos para ciclo de vida da venda.

### Prováveis ajustes incrementais
- campos de política na empresa (se ainda inexistentes), por exemplo:
  - `allow_manual_reservations`;
  - `reservation_default_ttl_minutes`;
  - `allow_reservation_ttl_override`;
  - `reservation_max_ttl_minutes`;
  - `reservation_block_before_departure_minutes`.

> Observação: não implementar nesta etapa; apenas mapear viabilidade.

## 8.2 Status e transições
Modelo atual já comporta:
- `reservado` → `pago` (com guardas de taxa/plataforma);
- `reservado` → `cancelado` por expiração automática;
- limpeza de `reservation_expires_at` em transições de encerramento.

## 8.3 Automações
- Cleanup já cobre os dois fluxos (checkout público e reserva manual).
- Dependência crítica: execução contínua do scheduler.

## 8.4 Logs e auditoria
Já há trilha em `sale_logs` para criação/cancelamento automático e mudanças de status.

Melhoria recomendada:
- incluir log explícito de override de prazo (quem, valor padrão, valor aplicado, motivo opcional).

## 8.5 Desempenho e risco de efeito colateral
- Mudança é de baixo a moderado risco estrutural.
- Maior risco está em consistência de filtro/cálculo entre telas e não em capacidade técnica do banco/edge.

---

# 9. Plano recomendado de implementação por fases

## Fase 1 — Política oficial por empresa + contratos de regra (baixo risco, alto valor)
- Definir parâmetros em `/admin/empresa`.
- Definir defaults e limites.
- Documentar regra oficial (pago confirma; reservado é temporário).

**Critério de aceite:** empresa consegue configurar política e sistema mantém comportamento atual quando parâmetros padrão forem equivalentes ao legado.

## Fase 2 — UX de criação e gestão da reserva (governança operacional)
- Aplicar parâmetros no `NewSaleModal`.
- Exibir prazo e permitir override controlado.
- Melhorar visibilidade em `/admin/vendas` (tempo restante, vencidas).

**Critério de aceite:** nenhuma reserva nasce sem validade; operador entende visualmente o estado.

## Fase 3 — Observabilidade e proteção operacional
- Painéis/alertas para reservas próximas do vencimento e vencidas pendentes de cleanup.
- Alerta de saúde do cleanup (falhas/atrasos).

**Critério de aceite:** operação consegue agir antes de gerar lotação falsa e identifica falha de automação.

## Fase 4 — Consolidação de consistência cross-tela
- Revisão de copy e semântica em eventos/dashboard/relatórios/consulta.
- Garantir “pago-only” onde é confirmação oficial e “reservado” como pipeline operacional temporário.

**Critério de aceite:** leitura unificada entre vendas, evento, relatório e embarque.

## Fase 5 — Hardening e validações finais
- Testes de regressão por status/transição.
- Checklist multiempresa/perfil de permissão.
- Auditoria de dados históricos pós-rollout.

---

# 10. Dúvidas, pontos de atenção e validações necessárias

1. A empresa quer permitir override de prazo para todos os perfis ou apenas gerente?
2. Qual janela mínima padrão para bloquear criação de reserva próxima ao embarque (ex.: 30/60/120 min)?
3. Reserva manual ainda pode gerar taxa de plataforma pendente em todos os cenários atuais? (validar impacto operacional por perfil)
4. Qual SLA operacional aceitável para execução do cleanup (ex.: 1–2 minutos de atraso máximo)?
5. Quais cards/telas executivas devem exibir “reservas em risco” sem misturar com venda confirmada?
6. Há necessidade de política diferenciada por tipo de evento no futuro? (se sim, decidir desde já se será fase posterior ou fora de escopo)

---

# 11. Recomendação final objetiva

## Respostas diretas às 10 perguntas do escopo
1. **É viável adotar política oficial com expiração automática?**
   - **Sim.** A base atual já suporta.

2. **Melhor parâmetro em `/admin/empresa` ou outro local?**
   - **`/admin/empresa`**, com opção de override controlado no ato (híbrido).

3. **Prazo da reserva deve ser sempre obrigatório?**
   - **Sim.** Reserva sem prazo reabre risco de reserva eterna.

4. **Operador deve poder editar prazo no momento da reserva?**
   - **Sim, de forma controlada** (parâmetro + limite + perfil + log).

5. **Reserva deve contar em ocupação? Em quais contextos?**
   - **Sim** para indisponibilidade operacional de assento;
   - **Não** para ocupação/KPI oficial de venda confirmada.

6. **Reserva deve aparecer em manifesto/lista de embarque?**
   - **Não.** Apenas pago.

7. **Reserva deve gerar passagem virtual?**
   - **Somente comprovante de reserva, não passe operacional**.

8. **Quais telas realmente precisam ser alteradas?**
   - Obrigatórias: `/admin/vendas`, `NewSaleModal`, `/admin/empresa`, camada de automação/monitoramento cleanup.
   - Recomendáveis: `/admin/eventos`, dashboard, consulta/ticket/copy de status.

9. **Quais mudanças são obrigatórias vs recomendadas?**
   - Obrigatórias: parametrização por empresa, prazo obrigatório, UX de prazo na criação, consistência de status crítico.
   - Recomendadas: alertas preditivos, revisão semântica de telas derivadas, indicadores de saúde operacional.

10. **Plano mais seguro e coerente?**
   - Implementação em fases (parâmetro → UX → observabilidade → consolidação cross-tela → hardening), com mudanças incrementais e sem refatoração ampla.

## Conclusão final
A mudança **vale a pena** e está alinhada ao produto: reduz assento preso, reduz lotação falsa, melhora previsibilidade operacional e fortalece auditabilidade. O caminho recomendado é incremental, com forte reaproveitamento da estrutura existente e governança simples por empresa.
