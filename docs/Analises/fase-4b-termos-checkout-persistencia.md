# Fase 4B — Persistência do aceite de termos no checkout

## 1. Resumo do que foi implementado

A Fase 4B implementa a parte transacional dos Termos e Políticas do Evento no checkout público:

- o checkout continua validando o aceite visual/local criado na Fase 4A;
- o checkout envia para `create-asaas-payment` o pacote de termos exibido e os dados do passageiro pagador;
- a Edge Function valida os vínculos obrigatórios do evento antes de qualquer chamada ao Asaas;
- a Edge Function registra snapshots imutáveis em `sale_term_acceptances` usando service role;
- a cobrança Asaas só segue se não houver termos obrigatórios ou se a venda possuir aceites válidos;
- falhas de aceite retornam erro controlado e o checkout limpa venda/locks/passageiros antes de exibir mensagem amigável.

## 2. Arquivos alterados

- `src/pages/public/Checkout.tsx`
  - passa a carregar `content_hash` das versões de termos;
  - monta `terms_acceptance` a partir dos termos exibidos e do pagador;
  - envia o payload para `create-asaas-payment`;
  - trata erros de aceite com rollback seguro e mensagem amigável.
- `src/components/public/EventTermsAcceptanceCard.tsx`
  - adiciona `contentHash` ao contrato público do termo carregado no checkout.
- `supabase/functions/create-asaas-payment/index.ts`
  - valida vínculos obrigatórios antes de chamar o Asaas;
  - registra `sale_term_acceptances` com snapshot auditável via service role;
  - bloqueia cobrança quando falta aceite obrigatório.
- `docs/Analises/fase-4b-termos-checkout-persistencia.md`
  - documentação da fase.

## 3. Decisão tomada: Edge Function, não insert direto público

A decisão foi registrar o aceite dentro da Edge Function `create-asaas-payment`.

Motivos:

- a migration da Fase 1 mantém `sale_term_acceptances` sem policy pública ampla de insert;
- o checkout público não deve receber permissão direta para escrever snapshots jurídicos;
- a função já usa service role e está no ponto transacional imediatamente anterior à cobrança;
- centralizar no backend permite validar empresa, evento, vínculo e versão antes de criar cobrança.

Não foi criada policy pública nova para `sale_term_acceptances`.

## 4. Como o aceite é registrado

No `handleSubmit`, após a venda, locks e passageiros serem criados, o checkout chama `create-asaas-payment` com `terms_acceptance`.

O payload contém:

- `accepted`;
- `accepted_term_version_ids`;
- `accepted_terms` com `term_id`, `term_version_id`, título, tipo, versão, hash, conteúdo e resumo;
- dados do aceitante: nome, CPF e telefone do passageiro pagador.

A Edge Function registra os aceites antes de qualquer chamada ao Asaas. Para eventos com termos exibidos, ela tenta registrar todos os termos enviados e vinculados ao evento, não apenas os obrigatórios. Para eventos sem termo obrigatório, a ausência de payload não bloqueia a cobrança.

## 5. Como o snapshot é montado

Embora o checkout envie os dados que possui, o snapshot persistido é montado no backend a partir da versão vinculada em `company_term_versions`, validada contra `event_term_links`.

Campos gravados em `sale_term_acceptances`:

- `company_id`;
- `sale_id`;
- `event_id`;
- `term_id`;
- `term_version_id`;
- `term_title_snapshot`;
- `term_type_snapshot`;
- `version_number`;
- `content_hash`;
- `accepted_text_snapshot`;
- `summary_snapshot`;
- `accepted_at`;
- `accepted_by_name`;
- `accepted_by_cpf`;
- `accepted_by_phone`;
- `acceptance_origin = 'public_checkout'`;
- `explicit_acceptance = true`.

Usar a versão vinculada como fonte final evita aceitar conteúdo adulterado no payload e preserva o snapshot da versão efetiva do evento.

## 6. Como `create-asaas-payment` valida antes da cobrança

Antes de buscar/consultar cobrança no Asaas, a função:

1. carrega a venda;
2. identifica `sale.event_id` e `sale.company_id`;
3. busca `event_term_links` do evento/empresa;
4. identifica vínculos com `acceptance_required = true`;
5. valida que os termos enviados pertencem ao evento, à empresa e à versão vinculada;
6. registra os aceites ausentes em `sale_term_acceptances`;
7. reconsulta a tabela para garantir que todos os termos obrigatórios possuem aceite válido da venda;
8. só então segue para empresa, ambiente, idempotência e chamada Asaas.

Critério de aceite válido nesta fase:

- mesma `sale_id`;
- mesma `company_id`;
- mesmo `event_id`;
- mesmo `term_id`;
- mesmo `term_version_id`;
- `acceptance_origin = 'public_checkout'`;
- `explicit_acceptance = true`.

Quando falta aceite obrigatório, a função retorna erro controlado com status `409`, `error_code = terms_acceptance_required` e não chama o Asaas.

A validação/gravação de termos acontece imediatamente após carregar a venda e antes de buscar a empresa, resolver ambiente, executar guarda de idempotência, consultar cobrança existente ou chamar qualquer endpoint externo do Asaas. Assim, nenhuma chamada ao Asaas ocorre antes da etapa de termos ser aprovada.

### Códigos de erro da etapa de aceite

A Edge Function padroniza os erros da etapa de termos com `error`, `error_code` e `message`:

- `terms_acceptance_required`: falta aceite obrigatório válido, o payload não contém todos os vínculos obrigatórios ou o termo/versão enviado não pertence ao evento/empresa.
- `terms_acceptance_persist_failed`: a validação passou, mas a gravação em `sale_term_acceptances` falhou.
- `terms_acceptance_validate_failed`: falha técnica ao consultar vínculos, versões ou aceites existentes para validar a etapa de termos.

## 7. Rollback e falha

Se a Edge Function rejeitar ou falhar ao registrar/validar o aceite com `terms_acceptance_required`, `terms_acceptance_persist_failed` ou `terms_acceptance_validate_failed`:

- o checkout não abre cobrança Asaas;
- remove `seat_locks` da venda;
- remove `sale_passengers` da venda;
- remove a venda criada;
- fecha a aba pré-aberta de pagamento;
- exibe sempre a mensagem amigável: `Não foi possível registrar o aceite dos termos deste evento. Tente novamente.`

Esses erros não caem no rollback genérico do pagamento para evitar expor mensagens técnicas ao comprador quando a falha pertence à etapa de termos.

Logs técnicos incluem:

- `sale_id`;
- `event_id`;
- `company_id`;
- `term_version_ids`;
- etapa `terms_acceptance_insert`, `terms_acceptance_validate` ou `terms_acceptance_verify`.

Duplicidade por retry é tratada de forma segura: a função consulta aceites existentes e aceita `23505` como cenário recuperável, desde que a verificação final encontre os aceites obrigatórios.

## 8. Limitações conhecidas

- A tela de confirmação, tickets, webhook, verify payment, split e finalização de pagamento não foram alterados nesta fase.
- Termos informativos são registrados com `explicit_acceptance = true` quando enviados pelo checkout porque a tabela exige `explicit_acceptance = true`; isso representa ciência do pacote exibido no checkout, não um checkbox individual por termo.
- A auditoria visual/admin dos aceites persistidos fica para fase posterior.
- Dados de IP e user-agent não foram persistidos nesta fase.

## 9. Pendências para próxima fase

- Definir exibição administrativa dos aceites por venda.
- Avaliar exibição dos termos aceitos na confirmação/ticket/consulta pública.
- Avaliar inclusão de IP/user-agent no snapshot.
- Avaliar origem de aceite para venda manual sem abrir policy pública.
- Criar testes automatizados específicos para a Edge Function, se o projeto padronizar esse tipo de teste.
- Rodar `deno check supabase/functions/create-asaas-payment/index.ts` ou validação equivalente em ambiente com Deno/Supabase CLI antes de produção; nesta estação o binário `deno` não está disponível.

## 10. Checklist de testes manuais

### Evento sem termos obrigatórios

- [ ] Abrir checkout de evento sem vínculos obrigatórios.
- [ ] Confirmar que o checkout permite pagamento normalmente.
- [ ] Confirmar que `create-asaas-payment` não retorna `terms_acceptance_required`.

### Evento com termo obrigatório e aceite válido

- [ ] Vincular termo publicado obrigatório ao evento.
- [ ] Abrir checkout público e marcar o checkbox de termos.
- [ ] Confirmar que `sale_term_acceptances` recebe um registro por termo enviado.
- [ ] Confirmar que a cobrança Asaas é criada normalmente.

### Evento com termo obrigatório e aceite ausente

- [ ] Tentar avançar sem marcar o checkbox no checkout.
- [ ] Confirmar bloqueio frontend com mensagem de aceite obrigatório.
- [ ] Chamar a Edge Function diretamente sem `terms_acceptance`.
- [ ] Confirmar status `409` e `error_code = terms_acceptance_required`.
- [ ] Confirmar que nenhuma cobrança Asaas foi criada.
- [ ] Simular falha técnica de validação e confirmar retorno `terms_acceptance_validate_failed` com rollback específico no checkout.

### Termo de outra empresa ou versão diferente

- [ ] Enviar payload com `term_version_id` não vinculado ao evento.
- [ ] Confirmar rejeição da Edge Function antes do Asaas.
- [ ] Confirmar ausência de cobrança criada.

### Retry/idempotência

- [ ] Repetir a chamada para a mesma venda após o aceite persistido.
- [ ] Confirmar que não há duplicidade em `sale_term_acceptances`.
- [ ] Confirmar que a função só segue se os aceites obrigatórios já estiverem válidos.

### Regressão de escopo

- [ ] Confirmar que webhook Asaas não foi alterado.
- [ ] Confirmar que verify payment não foi alterado.
- [ ] Confirmar que split/finalização/tickets/venda manual não foram alterados.
