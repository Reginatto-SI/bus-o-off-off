# Idempotência, webhooks e convergência

Use esta referência em criação, retry, webhook, consulta, finalização e reconciliação.

## Idempotência externa e interna

A documentação PagBank define chaves de idempotência como identificadores enviados em header e afirma que requisições repetidas com a mesma chave recebem a mesma resposta. Ainda assim, confirme o header, formato, escopo e retenção no endpoint Order exato antes de implementar.

Regras SmartBus:

- Uma operação lógica tem uma chave estável, única por empresa, ambiente, venda, gateway e tipo de operação.
- Retry da mesma operação reutiliza chave e payload semanticamente idênticos.
- Mudança de valor, método ou split exige nova operação, não reutilização oportunista.
- Não gere chave aleatória a cada clique ou retry técnico.
- Persistir apenas a chave sem estado da tentativa não basta; mantenha estado, hash/versão do payload, resposta e IDs externos.
- Após timeout, primeiro recupere por idempotência/correlação/consulta. Não crie cobrança nova por reflexo.
- Idempotência do PagBank não substitui unicidade local, lock/concurrency control e finalização idempotente.

## Teste obrigatório de timeout

1. Enviar criação.
2. Simular perda da resposta após o PagBank processar.
3. Repetir com a mesma chave.
4. Confirmar que não surgiu segundo Order/Charge.
5. Recuperar IDs e estado.
6. Confirmar que cliques concorrentes não geram duplicidade.

## Autenticidade do webhook

Para Order, a documentação atual descreve:

- header `x-authenticity-token`;
- assinatura SHA-256 de `{token}-{payload_bruto}`;
- qualquer alteração de espaços no payload causa divergência;
- assinatura divergente exige descarte do evento.

Implicações:

- capture o corpo bruto antes do parser JSON;
- não use `JSON.stringify(request.body)` para reconstruir o conteúdo assinado;
- compare assinaturas em tempo constante quando suportado;
- limite tamanho do body e aplique proteção operacional antes do processamento pesado;
- só depois de validar a assinatura interprete o evento como autêntico.

## Roteamento multiempresa do token

O webhook pode carregar referências usadas somente para localizar a possível venda e a credencial candidata. Esses dados ainda não são confiáveis antes da assinatura.

Fluxo seguro:

1. preservar body bruto e header;
2. extrair apenas a correlação mínima sem executar mutação;
3. localizar uma única venda e seu `company_id`, gateway e ambiente persistidos;
4. carregar o token de webhook da conta/ambiente vinculados;
5. calcular SHA-256 sobre o corpo bruto;
6. descartar se não coincidir;
7. consultar o PagBank com o token da venda quando o evento for crítico ou ambíguo;
8. deduplicar e convergir pela finalização comum.

Se a correlação for ausente, múltipla ou apontar para gateway/ambiente incompatível, falhe fechado e registre incidente sem revelar segredos.

## Gate específico de Connect

A documentação de assinatura fala no token da conta fornecido pelo iBanking. Não presuma que access token OAuth, client secret ou outro segredo sejam equivalentes. Antes de produção, comprove:

- qual token assina webhooks gerados por uma cobrança feita com access token Connect;
- como obter, armazenar e rotacionar esse token por empresa e ambiente;
- presença do header em Sandbox e Produção;
- assinatura do body bruto no runtime real;
- eventos de PIX, cartão, cancelamento e pós-transação.

Sem essa comprovação, webhook PagBank multiempresa não está liberado para produção.

## Deduplicação e ordem

- Não assuma entrega única ou ordenada.
- Deduplique por identificador oficial do evento quando existir; na ausência, use chave composta estável do recurso/status com evidência consultada.
- `PAID` duplicado deve resultar em uma única finalização, ticket e ledger.
- Evento antigo não pode rebaixar estado financeiro confirmado.
- Retorne sucesso somente depois de preservar evidência suficiente para reprocessar ou concluir com segurança.
- Falha acessória de notificação interna não deve invalidar pagamento já confirmado.

## Consulta como fallback

Use consulta quando:

- webhook não chegou;
- assinatura/evento é ambíguo;
- status local diverge;
- usuário abre a tela de confirmação após atraso;
- reconciliação periódica encontra venda pendente;
- evento pós-transacional exige confirmação.

A consulta deve usar gateway, ambiente e credencial imutáveis da venda. Ela converge para a mesma função de finalização do webhook.

## Atenção a eventos pós-transacionais

A documentação atual indica que alguns eventos pós-transacionais, incluindo chargeback, podem chegar em formato diferente do webhook JSON principal. Trate isso como gate de homologação e não declare cobertura de chargeback apenas porque o evento `PAID` funciona.

