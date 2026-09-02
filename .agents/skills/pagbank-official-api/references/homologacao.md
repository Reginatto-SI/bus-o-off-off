# Homologação e liberação

Use esta referência para decidir se desenvolvimento, Sandbox, piloto ou Produção podem avançar.

## Níveis de gate

### Pode começar desenvolvimento

É aceitável desenvolver de forma protegida quando:

- arquitetura direta, Order e Connect estão confirmados como direção;
- código fica atrás de feature flag/configuração;
- Asaas permanece intacto;
- mudanças de banco são aditivas;
- não há credencial real em código;
- testes usam Sandbox e contas isoladas;
- capability gaps continuam explícitos.

### Pode iniciar piloto controlado

Somente após comprovar em Sandbox:

- onboarding de duas ou mais empresas;
- isolamento Sandbox/Produção;
- PIX completo;
- cartão completo e criptografia por conta;
- parcelamento oferecido;
- quatro cenários de split;
- idempotência com timeout;
- webhook autenticado por conta;
- consulta fallback;
- finalização e ticket únicos;
- refund controlado;
- logs e reconciliação.

### Pode entrar em Produção

Somente após:

- homologação oficial PagBank concluída;
- produto comercial de marketplace/split habilitado;
- limites, tarifas, prazo e responsabilidade documentados para a conta real;
- webhook Connect multiempresa comprovado;
- primário, fees, chargeback e refund aprovados por produto/financeiro;
- 3DS/antifraude definidos;
- runbook de incidentes e desativação PagBank pronto;
- teste real de baixo valor com conciliação financeira;
- critérios de rollback e feature flag validados;
- monitoramento e alertas ativos.

## Matriz mínima de testes

| Área | Casos mínimos |
|---|---|
| Connect | autoriza, nega, state inválido, code expirado, refresh concorrente, revoga, reconecta |
| Multiempresa | A/B isoladas; credencial cruzada falha; Sandbox/Produção não se misturam |
| PIX | cria, expira, paga, timeout, webhook duplicado, consulta fallback, split |
| Cartão | aprova, nega, análise, criptografia inválida, chave de outra conta, parcelas, 3DS |
| Split | 4 cenários, resíduos de centavos, account inválida, soma inválida, consulta e liquidação |
| Idempotência | perda de resposta, retry igual, payload diferente, clique concorrente |
| Webhook | assinatura válida/inválida, body reformatado, token errado, duplicado, atrasado, fora de ordem |
| Finalização | ticket único, ledger único, falha acessória, reconciliação |
| Refund | total, parcial, customizado, saldo insuficiente, taxa preservada conforme decisão |
| Chargeback | evento, débito do primário, recuperação secundária, ausência de saldo |
| Asaas | regressão completa do fluxo existente e vendas antigas após ativar PagBank |

## Evidências exigidas

Para cada cenário crítico, preserve sem segredo:

- data e ambiente;
- empresa/conta de teste;
- versão do código;
- request sanitizado;
- chave de idempotência mascarada/identificador correlato;
- IDs Order, Charge e Split;
- resposta sanitizada;
- webhook bruto armazenado de forma segura e sua validação;
- consulta posterior;
- snapshot/ledger/ticket local;
- resultado esperado e observado.

## Critérios de bloqueio

Bloqueie Produção se ocorrer qualquer um:

- duplicidade de cobrança ou ticket;
- split divergente do snapshot;
- recebedor/empresa/ambiente cruzado;
- webhook sem autenticidade comprovável;
- incapacidade de recuperar timeout sem nova cobrança;
- tarifa/primário tornando o financeiro diferente do aprovado;
- cartão bruto chegando ao backend ou log;
- refund automático devolvendo taxa contra regra;
- chargeback sem responsável e trilha definidos;
- regressão no Asaas.

## Revalidação documental

A documentação usada nesta versão foi verificada em 2026-09-02. Antes de implementação financeira crítica ou liberação de Produção:

1. reabra as páginas oficiais aplicáveis;
2. confira o OpenAPI/schema atual do endpoint;
3. registre a nova data de verificação;
4. atualize a Skill se algum contrato mudou;
5. repita o teste afetado.

