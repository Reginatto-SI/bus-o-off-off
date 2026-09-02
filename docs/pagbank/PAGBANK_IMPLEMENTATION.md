# PagBank no SmartBus — checkpoint atual

> Documento operacional de continuidade da iniciativa PagBank.
> Branch oficial: `feature/pagbank-integration`.
> O histórico detalhado das auditorias anteriores permanece preservado no Git.

## 1. Estado atual

A implementação funcional do PagBank ainda não foi iniciada.

Já foram concluídos:

- criação da branch persistente `feature/pagbank-integration`;
- instalação e roteamento das Skills de pagamentos;
- proteção de branch e Pull Requests no `AGENTS.md`;
- análise inicial da arquitetura atual do Asaas;
- decisões de produto sobre coexistência de gateways;
- auditoria técnica inicial da solução PB Integrações/PagBank Connect;
- identificação da necessidade de comparar PB Integrações com a API oficial direta do PagBank.

Nenhum código funcional, migration, RLS, Edge Function, credencial ou comportamento do Asaas foi alterado por esta iniciativa até este checkpoint.

## 2. Decisão de produto atual — meios e experiência de pagamento

### Payment Link removido do escopo

**O SmartBus não utilizará Payment Link, link de pagamento ou checkout hospedado do PagBank como fluxo oficial desta integração.**

Referências anteriores a Payment Link/checkout hospedado nas auditorias antigas estão **superadas por esta decisão de produto** e não devem orientar implementação futura.

O primeiro escopo PagBank deve trabalhar por integração de API com:

- **PIX**;
- **cartão de crédito**.

O produto/API exato do PagBank para executar esses pagamentos ainda deve ser definido pela auditoria técnica comparativa. Não assumir `Orders`, `Checkout` ou outro produto somente pelo nome; escolher o mecanismo que reproduza com segurança o contrato SmartBus.

Boleto fica fora da primeira fase.

Venda manual administrativa também fica fora da primeira fase.

## 3. Modelo oficial de gateways aprovado

- O SmartBus passará a suportar múltiplos gateways.
- Asaas e PagBank coexistirão durante a transição.
- Existe intenção de migrar gradualmente para PagBank e, futuramente, possivelmente descontinuar o Asaas.
- No futuro poderão ser adicionados outros gateways, incluindo Mercado Pago e PayPal.
- Não criar agora um framework genérico excessivo de plugins; abstrair apenas os seams realmente necessários.
- Cada empresa terá somente **um gateway ativo por vez para novas vendas**.
- Empresas atuais no Asaas permanecem nele até troca explícita.
- Empresas novas poderão escolher o gateway, com PagBank recomendado/destacado.
- PagBank poderá ser disponibilizado para todas as empresas após homologação, sem migração automática de empresas existentes.
- Administrador da empresa e administrador SmartBus poderão alterar o gateway, sujeitos às validações de segurança.

## 4. Regra imutável da venda

Cada venda permanece vinculada ao gateway que originou sua cobrança.

Trocar o gateway da empresa afeta somente novas vendas.

Uma venda iniciada no Asaas continua sendo processada e confirmada pelo Asaas mesmo após a empresa migrar para PagBank.

Nunca recriar automaticamente uma cobrança em outro gateway.

Não haverá fallback automático entre gateways.

## 5. Regras financeiras que não podem mudar

As regras financeiras pertencem ao SmartBus, e não ao gateway.

Devem permanecer iguais em qualquer provedor:

- cálculo da taxa;
- mínimo;
- teto;
- Marketplace;
- sócio global;
- representante;
- elegibilidade;
- snapshot financeiro;
- ledger;
- rastreabilidade.

O PagBank só poderá entrar em produção quando for comprovado que o modelo financeiro obrigatório pode ser reproduzido com segurança.

Se o split não conseguir reproduzir os cenários oficiais do SmartBus, PagBank não deve ser liberado em produção.

### Cenários de divisão da taxa SmartBus

| Sócio elegível | Representante elegível | Destino da taxa SmartBus |
|---|---|---|
| sim | sim | Marketplace 1/3; sócio 1/3; representante 1/3 |
| sim | não | Marketplace 1/2; sócio 1/2 |
| não | sim | Marketplace 2/3; representante 1/3 |
| não | não | Marketplace 100% |

Em todos os cenários, o restante do valor da passagem pertence à empresa vendedora.

## 6. Cancelamento, desistência, estorno e chargeback

Após uma venda efetivamente paga, a taxa SmartBus é considerada ganha no ato da venda.

Cancelamento, desistência ou devolução comercial negociada entre passageiro e empresa anunciante não deve gerar automaticamente devolução da taxa SmartBus.

Chargeback compulsório é um evento diferente e permanece pendente de estudo técnico.

Antes de criar qualquer política automática para chargeback, deve ser comprovado:

- quem suporta o débito;
- efeito sobre Marketplace;
- efeito sobre empresa vendedora;
- efeito sobre sócio e representante;
- valores já liquidados;
- saldos negativos;
- possibilidade de transferência de responsabilidade;
- diferenças entre PIX e cartão, quando aplicável.

Não criar dívida, compensação ou cobrança automática contra a empresa sem decisão posterior de produto/financeiro.

## 7. Sandbox e Produção

Sandbox e Produção devem permanecer espelhos funcionais.

Devem ter:

- mesma lógica;
- mesmo fluxo;
- mesma experiência;
- credenciais próprias;
- dados externos separados;
- isolamento absoluto de pagamentos, webhooks, status e logs.

O ambiente usado por uma venda deve permanecer rastreável por todo seu ciclo.

Nenhum gateway pode escolher ou trocar silenciosamente o ambiente com base em hostname, URL ou credencial.

## 8. Multiempresa e credenciais

Toda integração deve respeitar `company_id`.

Cada empresa deve possuir sua própria configuração por gateway e ambiente.

Credenciais nunca podem ser expostas ao frontend ou registradas em logs.

A auditoria técnica deverá definir a forma mínima e segura de armazenar/autorizá-las, incluindo rotação, revogação e auditoria.

## 9. Onboarding desejado

A configuração continuará na área de pagamentos da empresa.

A experiência desejada é:

1. permitir, se a API escolhida suportar, que o usuário conecte/autorize sua conta PagBank a partir do SmartBus;
2. permitir também configuração manual de credencial quando tecnicamente adequada;
3. validar conta, tenant e ambiente antes de ativar o gateway.

A possibilidade e o melhor fluxo ainda precisam ser comprovados na comparação API oficial PagBank × PB Integrações.

## 10. Arquitetura atual do Asaas — proteção obrigatória

O Asaas continua sendo o caminho funcional existente e não deve sofrer regressões durante a implantação PagBank.

Preservar inicialmente:

- engine financeira;
- resolvedores de regra SmartBus;
- finalização de pagamento;
- geração idempotente de tickets;
- fluxo de venda manual;
- webhooks e verificações Asaas existentes;
- diagnóstico atual.

A evolução deve ocorrer por seams mínimos, sem generalizar toda a base Asaas de uma vez.

## 11. Resultado da auditoria PB Integrações já realizada

A auditoria anterior concluiu que a solução `pagbank-connect` instalada usa a PB Integrações como camada intermediária entre SmartBus e PagBank.

Ela mostrou capacidades úteis, mas também deixou lacunas de evidência em pontos críticos, principalmente:

- dependência operacional da intermediária;
- contrato/SLA/custos e tratamento de dados;
- idempotência comprovada através da intermediária;
- autenticação e anti-replay de webhook;
- onboarding completo;
- elegibilidade dos recebedores para split;
- chargeback e estornos.

Essas lacunas são da evidência disponível para a solução intermediada e **não devem ser automaticamente tratadas como limitações da API oficial PagBank**.

## 12. Próxima etapa — comparação arquitetural

Antes de escrever código, executar uma auditoria comparativa entre:

### Opção A

`SmartBus → API Oficial PagBank`

### Opção B

`SmartBus → PB Integrações / PagBank Connect → PagBank`

A comparação deve validar, com evidência atual:

- segurança;
- autenticação;
- multiempresa;
- onboarding;
- PIX;
- cartão de crédito;
- split;
- idempotência;
- webhook;
- consulta/fallback;
- status;
- chargeback;
- estorno;
- Sandbox/Produção;
- diagnóstico;
- SLA e suporte;
- custos comprovados;
- tratamento de dados/LGPD;
- lock-in;
- manutenção;
- aderência a futuros gateways.

### Regra da pesquisa

**Não pesquisar nem recomendar Payment Link como solução para o SmartBus.**

A análise deve considerar pagamento via APIs do gateway para PIX e cartão de crédito, com os endpoints necessários para criação, confirmação, consulta, split, segurança e operação.

## 13. Gates técnicos ainda abertos

Antes de começar implementação funcional, precisamos fechar:

1. API oficial direta ou PB Integrações;
2. produto/endpoints adequados para PIX + cartão sem Payment Link;
3. split completo nos quatro cenários SmartBus;
4. onboarding e elegibilidade de recebedores;
5. idempotência de criação;
6. autenticidade, replay e deduplicação de webhook;
7. armazenamento seguro de credenciais por empresa/ambiente;
8. gateway e IDs externos persistidos na venda;
9. matriz de status PagBank → SmartBus;
10. comportamento de estorno/chargeback;
11. testes de regressão do Asaas.

## 14. Gate atual

### PODE INICIAR IMPLEMENTAÇÃO FUNCIONAL?

**NÃO.**

Motivo: a decisão de produto está suficientemente clara, porém a arquitetura PagBank direta × PB Integrações e os gates financeiros/segurança ainda precisam ser fechados.

## 15. Branch e Pull Requests

- Branch persistente oficial: `feature/pagbank-integration`.
- Branches temporárias `codex/*` são permitidas apenas se derivadas dela.
- Todo PR/Draft intermediário deve ter `feature/pagbank-integration` como base/destino.
- Nunca usar `main` como destino de PR intermediário PagBank.
- `main` somente no PR final, após implementação, homologação, regressão do Asaas e autorização explícita.

## 16. Histórico resumido

- **2026-09-01:** preparação da iniciativa, Skills, branch persistente e checkpoint.
- **2026-09-01:** decisões de produto sobre multigateway, coexistência Asaas/PagBank, gateway por empresa e venda vinculada ao gateway de origem.
- **2026-09-01:** auditoria técnica inicial da PB Integrações/PagBank Connect; gate mantido em NÃO por lacunas de evidência.
- **2026-09-01:** identificada a necessidade de comparar PB Integrações com API oficial direta do PagBank.
- **2026-09-01:** **Payment Link/checkout hospedado removido do escopo oficial. Primeira fase definida como integração via API para PIX + cartão de crédito, mantendo split obrigatório e regras financeiras SmartBus.**
