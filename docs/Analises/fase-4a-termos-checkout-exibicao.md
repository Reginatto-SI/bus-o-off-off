# Fase 4A — Termos e Políticas no Checkout Público

## 1. Resumo do que foi implementado

A Fase 4A adiciona ao checkout público a leitura e exibição dos termos e políticas vinculados ao evento, com aceite visual/local quando pelo menos um vínculo exige aceite obrigatório.

Esta etapa não registra aceite em banco, não altera a venda, não altera a criação de cobrança Asaas e não modifica webhook, verify, split, tickets ou fluxos administrativos de venda.

## 2. Arquivos alterados

- `src/pages/public/Checkout.tsx`
  - adiciona estados locais para termos do evento;
  - carrega vínculos de `event_term_links` pelo `event_id` e `company_id` do evento;
  - carrega as versões publicadas correspondentes em `company_term_versions`;
  - valida o aceite visual/local antes de iniciar a criação da venda/cobrança;
  - renderiza o card de termos no Step 3 antes do aceite atual de intermediação da plataforma.
- `src/components/public/EventTermsAcceptanceCard.tsx`
  - novo card público para listar termos do evento;
  - exibe título, tipo, versão, resumo, data de publicação e obrigatoriedade;
  - abre modal para leitura do conteúdo completo;
  - exibe checkbox único quando há termo obrigatório.
- `docs/Analises/fase-4a-termos-checkout-exibicao.md`
  - documentação curta da fase.

## 3. Como os termos são carregados

O checkout usa o evento já carregado na página como origem do escopo multiempresa.

Fluxo aplicado:

1. aguarda `event.id` e `event.company_id`;
2. consulta `event_term_links` filtrando por:
   - `event_id = event.id`;
   - `company_id = event.company_id`;
3. se não houver vínculos, mantém lista vazia e não bloqueia o checkout;
4. se houver vínculos, coleta apenas os `term_version_id` vinculados;
5. consulta `company_term_versions` filtrando por:
   - `company_id = event.company_id`;
   - `status = 'published'`;
   - `id in (term_version_id vinculados)`;
6. monta a lista exibida somente quando a versão pertence ao mesmo `term_id` e à mesma `company_id` do vínculo.

A implementação não busca o termo vigente atual da empresa para decidir checkout. A versão efetiva é sempre a gravada em `event_term_links.term_version_id`.

## 4. Como os termos aparecem no checkout

No Step 3, antes do aceite atual de intermediação/responsabilidade da plataforma, o checkout exibe o bloco **Termos e Políticas do Evento** quando:

- há termos carregando;
- ocorreu erro de carregamento;
- existem vínculos de termos para o evento.

Para cada termo vinculado, o card mostra:

- título;
- tipo do termo em formato amigável;
- número da versão;
- data de publicação;
- resumo, quando existir;
- indicação de **Aceite obrigatório** ou **Informativo**;
- botão **Ler conteúdo completo**.

O conteúdo completo abre em modal no próprio checkout, sem navegação para outra página.

## 5. Como funciona o aceite visual/local

Se pelo menos um termo vinculado tiver `acceptance_required = true`, o card mostra um checkbox único:

> Li e aceito os Termos e Políticas aplicáveis a este evento.

Esse estado fica apenas no React state do checkout (`eventTermsAccepted`).

Não há gravação em:

- `sale_term_acceptances`;
- `sales`;
- `seat_locks`;
- `sale_passengers`;
- payload da Edge Function `create-asaas-payment`.

## 6. Como o botão de pagamento é bloqueado visualmente

O botão final de pagamento considera bloqueio local quando:

- os termos ainda estão carregando;
- houve erro ao carregar termos;
- existe termo obrigatório e o checkbox local não foi marcado.

O `handleSubmit` também valida antes de abrir aba de pagamento, criar venda, criar locks, criar passageiros ou chamar `create-asaas-payment`.

Mensagens amigáveis usadas:

- erro/carregamento de termos: `Não foi possível carregar os termos deste evento. Tente novamente em instantes.`;
- aceite obrigatório pendente: `Para continuar, é necessário aceitar os termos deste evento.`.

## 7. Limitações da Fase 4A

- O aceite dos termos do evento é apenas visual/local no checkout.
- Não existe snapshot auditável do texto aceito nesta fase.
- Não existe defesa backend contra tentativa de pagamento sem aceite.
- A leitura pública depende das permissões/RLS já disponíveis para `event_term_links` e `company_term_versions`; esta fase não cria migration nova.
- Falha de carregamento dos termos bloqueia o pagamento de forma segura para evitar avanço sem exibir uma política potencialmente obrigatória.

## 8. Pendências para Fase 4B

- Persistir aceite em `sale_term_acceptances`.
- Salvar snapshots auditáveis de título, tipo, versão, hash, resumo e conteúdo aceito.
- Blindar backend/Edge Function contra pagamento sem aceite obrigatório.
- Definir contrato seguro entre checkout, venda e criação da cobrança.
- Validar como o aceite será consultado em confirmação, ticket, diagnóstico ou auditoria.
- Criar migrations/RLS/RPC se necessário para leitura pública e persistência auditável com segurança.

## 9. Checklist de testes manuais

### Evento sem termos

- [ ] Abrir checkout público de evento sem vínculo em `event_term_links`.
- [ ] Confirmar que o card de termos não aparece ou não bloqueia o pagamento.
- [ ] Confirmar que o fluxo atual segue com o aceite de intermediação da plataforma.

### Evento com termo não obrigatório

- [ ] Vincular termo publicado ao evento com `acceptance_required = false`.
- [ ] Abrir checkout e confirmar que o termo aparece como informativo.
- [ ] Confirmar que o botão de pagamento não exige checkbox de termos do evento.
- [ ] Clicar em **Ler conteúdo completo** e confirmar abertura do modal.

### Evento com termo obrigatório

- [ ] Vincular termo publicado ao evento com `acceptance_required = true`.
- [ ] Abrir checkout e confirmar que o card de termos aparece.
- [ ] Confirmar que o checkout bloqueia avanço sem aceite local.
- [ ] Confirmar mensagem amigável quando a validação do submit é acionada sem aceite.
- [ ] Marcar o checkbox e confirmar que o fluxo atual pode seguir.

### Múltiplos termos

- [ ] Vincular mais de um termo publicado ao evento.
- [ ] Confirmar que todos os termos vinculados aparecem.
- [ ] Confirmar que basta um vínculo obrigatório para exigir aceite local.
- [ ] Confirmar que o conteúdo completo de cada termo abre corretamente.

### Regressão

- [ ] Confirmar que não houve alteração no insert de `sales`.
- [ ] Confirmar que não houve alteração em criação de `seat_locks`.
- [ ] Confirmar que não houve alteração em criação de `sale_passengers`.
- [ ] Confirmar que não houve alteração na chamada para `create-asaas-payment`.
- [ ] Confirmar que webhook, verify, split, finalização, venda manual, confirmação e ticket não foram alterados.
