# 1. Objetivo

Executar a etapa de fechamento remoto/documentado e limpeza funcional das referências legadas de Stripe no Smartbus BR, mantendo o histórico de dados, sem remover schema do banco e sem alterar o fluxo oficial atual baseado em Asaas.

# 2. O que já estava neutralizado

Antes desta etapa, o repositório já estava com:

- `stripe-webhook` retornando `410`;
- `create-checkout-session` retornando `410`;
- `create-connect-account` retornando `410`;
- `supabase/config.toml` sem publicar essas functions;
- schema, tipos e leituras históricas preservados.

# 3. Referências Stripe ainda encontradas

## 3.1 Referências operacionais remotas/documentais

1. Secrets esperados no legado já neutralizado:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
2. Possível endpoint externo legado a conferir manualmente:
   - webhook Stripe configurado no dashboard externo apontando para ambiente antigo do projeto.
3. Documentação operacional ainda mencionando Stripe:
   - `docs/manual-operacional-smartbus-br/03-conectar-conta-stripe.md`
   - `docs/manual-operacional-smartbus-br/07-criar-evento-completo.md`
   - `docs/manual-operacional-smartbus-br/08-publicar-evento-colocar-venda.md`

## 3.2 Referências funcionais/históricas no código

1. `SalesDiagnostic` ainda identificava Stripe como gateway em vendas antigas.
2. `SalesReport` ainda exportava `payment_id` priorizando `stripe_payment_intent_id`.
3. `TicketCard`, `TicketLookup` e `Confirmation` ainda carregam IDs Stripe legados para compatibilidade histórica.
4. `payment-context-resolver.ts` e `payment-observability.ts` ainda mantêm o provider `stripe` por compatibilidade de dados e logs históricos.

# 4. O que é histórico vs. o que é ruído operacional

## 4.1 Histórico necessário

Devem permanecer por enquanto:

- colunas Stripe no banco;
- tipos TS gerados/manuals ligados a essas colunas;
- IDs legados em tickets, confirmação e diagnósticos, quando usados apenas para leitura histórica;
- provider `stripe` em estruturas compartilhadas de validação/log enquanto houver dado antigo e trilha histórica persistida.

## 4.2 Ruído operacional indevido

Precisava ser limpo nesta etapa:

- exibir `Stripe` como gateway ativo em filtros/diagnóstico administrativo;
- manter exportação enviesada para `stripe_payment_intent_id` como `payment_id` principal;
- documentação operacional sem aviso claro de que Stripe está descontinuado;
- comentários de suporte que sugeriam Stripe como fallback operacional atual.

# 5. Ajustes aplicados

## 5.1 Diagnóstico administrativo

- `SalesDiagnostic` passou a exibir `Legado Stripe` quando a venda antiga tem IDs Stripe.
- O filtro visual também foi reclassificado para `Legado Stripe`, evitando colocar Stripe em pé de igualdade com Asaas no produto atual.
- O comportamento de leitura histórica foi preservado: as vendas antigas continuam classificáveis/filtráveis.

## 5.2 Exportação de relatório

- `SalesReport` deixou de priorizar `stripe_payment_intent_id` como `payment_id` principal.
- Agora a exportação prioriza `asaas_payment_id` e usa Stripe apenas como fallback histórico.

## 5.3 Comentários e referência técnica compartilhada

- Foram adicionados comentários objetivos em `payment-context-resolver.ts` e `payment-observability.ts` para deixar explícito que `stripe` permanece apenas por histórico/compatibilidade, não como runtime ativo.
- Comentários em `TicketCard` foram reclassificados para compatibilidade histórica, sem sugerir Stripe como fallback oficial atual.

## 5.4 Documentação operacional

- `03-conectar-conta-stripe.md` foi reclassificado como documento legado/descontinuado.
- `07-criar-evento-completo.md` e `08-publicar-evento-colocar-venda.md` receberam aviso explícito de que o gateway oficial atual é Asaas.
- Trechos que sugeriam Stripe como requisito operacional atual foram reescritos para linguagem neutra ou oficial do Asaas.

## 5.5 Limpeza do repositório

- Os arquivos `analise-21-auditoria-stripe-legado.md` e `analise-22-neutralizacao-operacional-stripe.md` foram removidos conforme solicitado.
- Foi consolidado um novo relatório desta etapa em `analise-23-fechamento-remoto-limpeza-stripe.md`.

# 6. Checklist operacional remoto

> **Importante:** o ambiente do Codex não permitiu validar o dashboard remoto do Supabase, os secrets remotos nem o dashboard externo do Stripe. O checklist abaixo deve ser executado manualmente pelo responsável operacional.

## 6.1 Secrets/variáveis remotas

- [ ] Verificar no ambiente Supabase/host se ainda existem `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`.
- [ ] Se existirem, remover ou inutilizar os values após confirmar que nenhuma integração externa legítima depende deles.
- [ ] Registrar a data/hora da remoção e o responsável.

## 6.2 Webhook Stripe externo

- [ ] Acessar o dashboard externo do Stripe.
- [ ] Verificar se ainda existe endpoint de webhook apontando para ambientes do Smartbus BR.
- [ ] Se existir, desativar/remover o endpoint legado.
- [ ] Salvar evidência da remoção (print/log interno).

## 6.3 Deploy da versão neutralizada

- [ ] Confirmar que o deploy mais recente contém as functions Stripe neutralizadas (`410`).
- [ ] Confirmar que `supabase/config.toml` da versão implantada não publica mais essas functions.
- [ ] Se houver ambiente de staging/sandbox e produção, conferir ambos separadamente.

## 6.4 Validação pós-deploy

- [ ] Executar chamada controlada ao endpoint antigo de `stripe-webhook` e confirmar resposta `410`.
- [ ] Executar chamada controlada ao endpoint antigo de `create-checkout-session` e confirmar resposta `410`.
- [ ] Executar chamada controlada ao endpoint antigo de `create-connect-account` e confirmar resposta `410`.
- [ ] Validar que checkout Asaas continua funcionando normalmente.
- [ ] Validar que ticket lookup histórico continua abrindo vendas antigas.

## 6.5 Monitoramento de chamadas indevidas

- [ ] Procurar logs 4xx/410 nos endpoints Stripe neutralizados após deploy.
- [ ] Se houver chamadas recorrentes, identificar origem (cliente antigo, automação, webhook externo, script manual).
- [ ] Registrar plano de desligamento da origem residual antes da remoção final do schema.

# 7. Pontos que ainda exigem ação manual

1. confirmação remota de deploy em produção/sandbox;
2. verificação/remoção de secrets remotos Stripe;
3. verificação/remoção de webhook no dashboard Stripe;
4. monitoramento de eventuais chamadas residuais aos endpoints neutralizados;
5. decisão futura sobre quando remover provider `stripe` de estruturas compartilhadas e quando eliminar o schema legado.

# 8. Impacto validado

## 8.1 Impacto positivo

- Stripe deixou de aparecer como gateway ativo nas telas auditadas desta etapa.
- Exportação deixou de privilegiar Stripe como identificação principal.
- A leitura correta do produto atual ficou alinhada ao gateway oficial Asaas.

## 8.2 Histórico preservado

- vendas antigas continuam consultáveis;
- logs antigos continuam legíveis;
- payloads legados continuam disponíveis quando necessários para diagnóstico retroativo;
- nenhuma coluna de banco foi removida.

## 8.3 Fluxo atual preservado

- o fluxo Asaas não foi alterado;
- não foi reativada nenhuma dependência operacional de Stripe;
- a neutralização anterior permanece válida.

# 9. Pendências para remoção final de schema

1. definir janela de retenção para colunas Stripe;
2. decidir se `provider: "stripe"` ainda precisará existir após a fase final de auditoria histórica;
3. revisar necessidade futura de manter `stripeCheckoutSessionId` nos payloads públicos;
4. avaliar se `SalesDiagnostic` deverá ocultar por completo o legado Stripe após a janela de retenção;
5. remover dependências e tipos de Stripe somente após confirmação de que não há mais chamadas residuais nem necessidade de auditoria operacional ativa.

# 10. Checklist de validação

- [x] Stripe não aparece mais como gateway ativo do sistema nas telas auditadas.
- [x] referências históricas permanecem apenas quando necessárias.
- [x] exportações/diagnósticos não induzem leitura errada do fluxo atual.
- [x] fluxo Asaas continua intacto no código desta etapa.
- [x] nenhum ajuste desta etapa reativou dependência de Stripe.
- [x] foi criado checklist claro para conferência de deploy/secrets/webhooks remotos.
- [x] os arquivos `analise-21-auditoria-stripe-legado.md` e `analise-22-neutralizacao-operacional-stripe.md` foram removidos.
- [ ] validação remota de produção/sandbox permanece pendente de execução manual fora do ambiente do repositório.
