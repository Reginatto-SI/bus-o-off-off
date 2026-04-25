# Plano: Persistir o diagnóstico do Webhook Asaas

## Escopo (somente documentação)

Conforme regra obrigatória da tarefa: **não alterar código, não criar lógica nova**, apenas materializar o diagnóstico em arquivo.

## Único arquivo a ser criado

`docs/Analises/analise-1-webhook-asaas.md`

Conteúdo: diagnóstico completo já apresentado na conversa, contendo:

1. **Resultado executivo** — três causas raiz identificadas e priorizadas.
2. **Causa raiz #1 (CRÍTICO):** chave Asaas de produção retornando HTTP 401 para empresa BUSÃO OFF OFF (6 ocorrências entre 22-24/04).
3. **Causa raiz #2:** falta de idempotência por venda no checkout público — mesma cliente Camila Lorena gerou 6 vendas distintas em 3 dias.
4. **Causa raiz #3:** venda `351151a0-dfb3-4aa8-ae88-40cccaea2f57` está presa em `reservado` há > 9h, sem `asaas_payment_id`, com polling ativo agora.
5. **O que NÃO é problema (validado):** dedup do webhook funciona, externalReference está correto, webhook não recria cobranças, único caso de múltiplos `payment_id` foi em sandbox de teste, e os 58% de "duplicação" em `outgoing_request` são apenas logging dual (request + response) com mesmo `payment_id`.
6. **Tabela de evidências numéricas** com 8 métricas-chave do banco.
7. **Riscos residuais** (financeiro, operacional, UX).
8. **Recomendações de correção mínima** (operacionais imediatas + sugestões de código futuras, **não aplicadas** nesta etapa).
9. **Apêndice de queries SQL** usadas no diagnóstico, para reprodução futura por outro analista/dev.

## O que NÃO está no plano

- Nenhuma alteração em edge functions (`asaas-webhook`, `create-asaas-payment`, `verify-payment-status`).
- Nenhuma migração de banco.
- Nenhuma alteração de config (`supabase/config.toml`).
- Nenhuma alteração no frontend.
- Nenhuma rotação de secret/credencial automática (precisa ser feita manualmente pelo operador no painel Asaas + aba `/admin/empresa`).

## Riscos

Nenhum risco técnico — apenas criação de arquivo Markdown em pasta de documentação. O arquivo serve como base para futuras tarefas corretivas que serão tratadas separadamente.
