# Fase 3 — Termos de Serviço, Políticas da Empresa e Vínculo Administrativo no Evento

## 1. Resumo do que foi implementado

A Fase 3 implementa o vínculo administrativo entre eventos e termos/políticas já publicados pela empresa ativa.

O evento agora possui uma aba **Termos e Políticas** no modal de criação/edição administrativa. Essa aba permite escolher termos publicados da mesma empresa do evento, resolver a versão efetiva que ficará gravada em `event_term_links` e configurar se aquele termo deverá exigir aceite no checkout em fase futura.

A implementação **não altera checkout público**, **não registra aceite de comprador**, **não usa `sale_term_acceptances`** e **não altera fluxos financeiros, Asaas, webhook, split, venda manual, confirmação ou ticket**.

## 2. Telas e arquivos alterados

- `src/pages/admin/Events.tsx`
  - adiciona a aba **Termos e Políticas** no fluxo administrativo do evento;
  - posiciona a etapa depois de **Passagens** e antes de **Serviços/Patrocinadores/Publicação**;
  - mantém a aba bloqueada até o evento ser salvo.

- `src/components/admin/EventTermsTab.tsx`
  - novo componente administrativo, isolado para evitar aumentar ainda mais a complexidade de `Events.tsx`;
  - carrega termos da empresa ativa com versões `published`;
  - lista vínculos atuais do evento;
  - salva/atualiza vínculos em `event_term_links`;
  - exibe prévia, resumo e conteúdo completo em modo leitura;
  - registra auditoria em `company_term_audit_logs` quando possível.

## 3. Como funciona o vínculo por versão vigente

No modo **Usar versão vigente da empresa**, o usuário escolhe um termo e o sistema resolve a versão por `company_terms.current_version_id`.

Regras aplicadas:

- o termo precisa pertencer à empresa ativa/evento;
- a versão vigente precisa existir na lista de versões `published`;
- o vínculo grava a versão efetiva no campo `event_term_links.term_version_id`;
- o vínculo grava `selection_mode = 'company_current_at_publish'`.

Isso garante que futuras alterações de termo vigente da empresa não mudem silenciosamente o evento já configurado.

## 4. Como funciona o vínculo por versão específica

No modo **Selecionar versão específica**, a aba lista somente versões com `status = 'published'` do termo selecionado.

Regras aplicadas:

- versões `draft`, `inactive` e `superseded` não são oferecidas para seleção;
- o vínculo grava a versão escolhida em `event_term_links.term_version_id`;
- o vínculo grava `selection_mode = 'specific_version'`;
- a validação do banco continua sendo a defesa final contra versões não publicadas ou fora da empresa.

## 5. Como funciona o aceite obrigatório no evento

A aba possui a opção **Exigir aceite dos termos no checkout**.

Comportamento atual:

- marcado: salva `acceptance_required = true` no vínculo;
- desmarcado: salva `acceptance_required = false` no vínculo;
- se o aceite estiver marcado, precisa existir termo e versão publicada resolvida;
- a configuração fica apenas no evento nesta fase.

A Fase 3 não exibe checkbox no checkout e não bloqueia pagamento. Essa leitura pública e o registro do aceite serão tratados na Fase 4.

## 6. Como funciona a visualização do termo vinculado

A aba exibe, para o termo selecionado ou já vinculado:

- título;
- tipo;
- versão;
- status publicado;
- data de publicação;
- resumo, quando existir;
- indicação se a versão é a vigente do termo;
- botão para visualizar o conteúdo completo em modo leitura.

A mensagem de apoio reforça que o evento guarda a versão efetiva selecionada e não acompanha automaticamente publicações futuras da empresa.

## 7. Como funciona a auditoria

Ao criar ou atualizar vínculo, o componente tenta inserir registro em `company_term_audit_logs` com:

- `company_id`;
- `term_id`;
- `term_version_id`;
- `event_id`;
- `action`;
- `description`;
- `performed_by`;
- `metadata`.

Actions usadas:

- `event_term_link_created`;
- `event_term_link_updated`.

Se a auditoria falhar por RLS/permissão/constraint, o vínculo principal continua salvo e a UI mostra aviso de que o log não pôde ser registrado.

## 8. Limitações conhecidas

- O usuário pode editar o vínculo existente para trocar modo, versão e obrigatoriedade de aceite.
- A remoção física/desvinculação do vínculo não foi implementada nesta fase porque a migration da Fase 1 não criou policy RLS de `DELETE` para `event_term_links`.
- Como `event_term_links` não possui campo de status/inativação, uma remoção segura exigiria nova decisão de modelagem ou policy explícita.
- A listagem de versões específicas mostra apenas versões `published`, seguindo a constraint atual que impede vínculo de `draft`, `inactive` ou `superseded`.
- A aba não cria termos; termos devem ser criados/publicados em `/admin/empresa`, aba **Termos e Políticas**.

## 9. Pendências para Fase 4

- Criar leitura pública controlada dos termos vinculados ao evento.
- Exibir termos no checkout público.
- Exibir checkbox/modal/drawer de aceite no checkout quando `acceptance_required = true`.
- Bloquear avanço/pagamento sem aceite quando aplicável.
- Registrar aceite em `sale_term_acceptances` com snapshot auditável.
- Garantir que o fluxo de pagamento envie os dados necessários sem alterar regras financeiras.
- Validar cenários de venda com múltiplos termos obrigatórios no mesmo evento.

## 10. Checklist de testes manuais

### Carregamento

- [ ] Abrir edição de evento e confirmar a aba **Termos e Políticas**.
- [ ] Empresa sem termos publicados mostra estado vazio.
- [ ] Empresa com termos publicados lista termos corretamente.
- [ ] Versões `draft` não aparecem.
- [ ] Termos de outra empresa não aparecem.

### Vínculo usando versão vigente

- [ ] Selecionar termo com `current_version_id` publicado.
- [ ] Salvar vínculo e confirmar gravação de `term_version_id`.
- [ ] Confirmar `selection_mode = 'company_current_at_publish'`.
- [ ] Confirmar `acceptance_required` conforme alternância.

### Vínculo usando versão específica

- [ ] Selecionar termo publicado.
- [ ] Trocar modo para **Selecionar versão específica**.
- [ ] Confirmar que apenas versões publicadas aparecem.
- [ ] Salvar e confirmar `selection_mode = 'specific_version'`.

### Aceite obrigatório

- [ ] Marcar aceite obrigatório com versão válida e salvar.
- [ ] Tentar salvar aceite obrigatório sem versão válida e confirmar bloqueio amigável.
- [ ] Salvar vínculo com `acceptance_required = false`.

### Histórico do vínculo

- [ ] Confirmar vínculo na listagem da aba.
- [ ] Visualizar conteúdo completo do termo vinculado.
- [ ] Editar vínculo para outra versão publicada.

### Multiempresa

- [ ] Empresa A não lista termos da Empresa B.
- [ ] Evento da Empresa A não aceita termo/versão da Empresa B.
- [ ] Erros de RLS/constraint aparecem com mensagem amigável.

### Regressão

- [ ] Checkout público sem alteração.
- [ ] Asaas sem alteração.
- [ ] Webhook sem alteração.
- [ ] Split sem alteração.
- [ ] Venda manual sem alteração.
- [ ] Confirmação/ticket sem alteração.
- [ ] Diagnóstico de vendas sem alteração.
