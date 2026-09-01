# Implementação PagBank — checkpoint

## Objetivo

Adicionar o PagBank como novo gateway de pagamento do SmartBus de forma incremental, preservando o funcionamento atual do Asaas durante a transição e mantendo um único contrato SmartBus para venda, confirmação, tickets, financeiro, ambientes e diagnóstico.

O objetivo de médio/longo prazo é permitir a migração gradual para o PagBank e, futuramente, suportar outros gateways como Mercado Pago e PayPal sem reconstruir novamente o domínio de pagamentos. Isso não autoriza criar uma arquitetura genérica excessiva nesta fase: a evolução deve continuar mínima, incremental e baseada nos casos comprovados.

## Estado atual

**Decisões de produto concluídas; implementação funcional ainda não iniciada.**

A branch persistente `feature/pagbank-integration` existe no GitHub e é a área oficial de desenvolvimento do PagBank. Ela foi criada a partir da `main` atual e, no momento da criação, ambas estavam idênticas no commit `52034416d8f9f32c52b6a06035ac662c811b3a4a`. Desde então, a branch recebeu apenas atualizações documentais deste checkpoint.

Nenhuma credencial, migration, Edge Function, regra financeira ou comportamento de produção foi alterado.

O bloqueio de persistência remota está resolvido. O próximo gate é técnico: comprovar as capacidades críticas do PagBank antes de iniciar código funcional.

## Arquitetura atual de pagamentos

- A venda é a âncora multiempresa: checkout persiste `company_id`, método, `payment_environment`, passageiros e locks antes de chamar diretamente `create-asaas-payment`.
- A Edge Function relê venda/empresa, calcula a regra financeira central, resolve recebedores, cria a cobrança Asaas e persiste campos `asaas_*`. `externalReference = sale.id` correlaciona o fluxo.
- `asaas-webhook` é a confirmação prioritária; `verify-payment-status` é fallback. Ambos convergem em `_shared/payment-finalization.ts`, que finaliza a venda e cria tickets de modo reentrante. `get-asaas-payment-link` reabre a cobrança existente.
- Configuração e diagnóstico estão em `/admin/empresa` e `/admin/diagnostico-vendas`. Logs (`sale_logs`, `sale_integration_logs`), dedup Asaas e reconciliação já existem, mas parte da terminologia/modelagem é específica do provedor.
- Conceitos reutilizáveis: venda, passageiros, locks, tickets, ambiente central, engine de taxa, snapshot, ledger de comissão, finalização, reconciliação e parte da observabilidade.
- Acoplamentos atuais: componentes `Asaas*`, chamadas de função, resolvedor de credenciais, campos `asaas_*`, status/link, split e dedup.

Detalhes e fontes de verdade: `AGENTS.md`, Skill `smartbus-payment-gateway`, Skill `pagbank-connect`, respectivas referências e código atual.

## Análise de viabilidade

**Viável de forma incremental, condicionada à validação dos capability gaps técnicos.**

A Skill PagBank Connect informa suporte a Connect Key, Orders, Payment Link, Pix, cartão, boleto, sandbox, webhooks e split por valores fixos. Isso cobre os blocos básicos necessários, mas ainda não comprova equivalência operacional/financeira completa com o contrato atual do SmartBus.

| Responsabilidade SmartBus | Asaas atual | PagBank confirmado nas referências | Avaliação |
|---|---|---|---|
| Credencial e isolamento | Campos Asaas por tenant | Connect Key; `connectInfo` valida a key e informa sandbox | Capacidade presente; desenho SmartBus ainda precisa ser validado |
| Criar/correlacionar/consultar | Cobrança + `externalReference` | Orders/Checkouts + `reference_id` e consulta | Compatível em princípio; idempotência precisa ser comprovada |
| Primeira experiência PagBank | Checkout hospedado Asaas | Payment Link disponível | **Produto decidiu começar por Payment Link** |
| Métodos do primeiro escopo | Meios atuais Asaas | Pix e cartão disponíveis | **Produto decidiu Pix + cartão** |
| Confirmação | webhook + verify | notificação + consulta | Parcial; autenticação/replay/dedup precisam de desenho comprovado |
| Split SmartBus | wallets e cenários oficiais | `splits.receivers` com `account.id` e valor fixo | Potencialmente compatível; equivalência dos recebedores é gate de produção |
| Sandbox/produção | decisão SmartBus + credenciais isoladas | Connect Key identifica tipo | Pode validar coerência, mas não substitui a fonte de verdade SmartBus |
| Diagnóstico/reconciliação | estruturas existentes, parte Asaas | consulta de order/split | Reutilizável após adicionar dimensão gateway |
| Estorno/chargeback | regra SmartBus parcial | comportamento ainda não comprovado para nosso modelo | **CAPABILITY GAP técnico** |

## Decisões de produto confirmadas

### Modelo de coexistência

- O SmartBus passará a trabalhar com múltiplos gateways durante a transição.
- Asaas não será removido agora e deve continuar funcionando sem regressões.
- Existe intenção de descontinuar o Asaas futuramente, mas somente após migração segura e validação suficiente dos novos gateways.
- Cada empresa terá **um gateway ativo por vez** para novas vendas.
- Não haverá fallback automático entre gateways. Se o gateway escolhido estiver indisponível, o sistema não deve criar silenciosamente uma nova cobrança em outro provedor.
- A arquitetura deve permitir evolução futura para outros gateways, incluindo Mercado Pago e PayPal, sem antecipar uma plataforma genérica de plugins desnecessária.

### Empresas atuais e empresas novas

- Empresas que já usam Asaas permanecem no Asaas até que a troca seja feita explicitamente.
- Nenhuma empresa existente será migrada automaticamente para PagBank.
- Para novas empresas, o onboarding deverá apresentar escolha de gateway, com **PagBank recomendado/destacado**, sem impedir a escolha de outro gateway disponível.
- Quando o PagBank estiver homologado, ele poderá ficar disponível para todas as empresas, mas cada empresa deverá configurar/ativar individualmente sua integração.

### Permissões e troca de gateway

- Administrador da própria empresa e administrador SmartBus poderão alterar o gateway, sujeitos às validações e proteções que a implementação definir.
- A troca de gateway afeta somente novas vendas.
- Cada venda deve continuar vinculada ao gateway em que nasceu, inclusive se estiver pendente no momento em que a empresa trocar o gateway.
- Uma cobrança antiga Asaas nunca deve ser recriada automaticamente no PagBank apenas porque a empresa mudou de gateway.

### Primeira versão PagBank

- A primeira versão deve priorizar **Payment Link** como caminho mais simples e seguro.
- Métodos do primeiro escopo: **Pix + cartão**.
- Evolução posterior para pagamentos mais integrados/diretos pode ser avaliada depois da primeira homologação.
- Venda manual administrativa fica fora da primeira fase e poderá ser incorporada em etapa posterior.

### Configuração e onboarding

- A configuração deve permanecer na área de pagamentos da empresa, preferencialmente com representação clara dos gateways disponíveis, sem criar uma área paralela desconectada.
- O objetivo de UX é, se o PagBank permitir, oferecer fluxo guiado para o usuário criar/autorizar/conectar sua conta pelo SmartBus.
- Também deve existir opção de inserir/configurar a credencial manualmente, de forma semelhante ao fluxo disponível hoje para Asaas.
- A viabilidade exata de criação/autorização de conta pelo SmartBus ainda precisa ser comprovada tecnicamente na documentação/API PagBank.

### Sandbox e Produção

- Sandbox e Produção devem possuir a mesma lógica e a mesma experiência funcional.
- Mudam apenas credenciais, endpoints/dados externos e contexto operacional necessário.
- Nunca misturar pagamentos, webhooks, status, logs ou credenciais entre ambientes.
- O ambiente efetivamente usado por uma venda deve permanecer rastreável durante todo o ciclo daquela venda.

### Regras financeiras

- Taxa, mínimo, teto, divisão Marketplace/Sócio/Representante, snapshot, ledger e demais regras financeiras continuam sendo responsabilidades do SmartBus e não mudam por causa do gateway.
- O PagBank só pode entrar em produção quando for comprovado que o modelo financeiro obrigatório pode ser atendido com segurança.
- Se o split PagBank não conseguir reproduzir os recebedores e cenários obrigatórios do SmartBus, **não liberar PagBank em produção até resolver a lacuna**.

### Cancelamento, desistência e estorno comercial

- Após uma venda efetivamente paga, a taxa SmartBus é considerada ganha no ato da venda.
- Cancelamento, desistência ou devolução negociada entre passageiro e empresa anunciante é responsabilidade da empresa e do passageiro.
- O SmartBus não deve devolver automaticamente sua taxa em razão dessa negociação.
- Essa regra comercial não substitui o estudo técnico de eventos compulsórios do gateway, como chargeback, que podem produzir impacto financeiro independente da vontade do SmartBus.

### Chargeback

- Ainda não existe nova regra automática SmartBus aprovada para chargeback.
- Primeiro deve ser comprovado como o PagBank trata chargeback, inclusive seu efeito sobre split e recebedores.
- Até essa análise, não criar dívida, compensação, cobrança automática contra a empresa nem outra regra financeira presumida.

## Alinhamento normativo pendente

As Diretrizes Oficiais atuais ainda registram o Asaas como gateway oficial. Essa redação ficou desatualizada em relação às decisões de produto acima.

Antes da implementação funcional avançar para uma arquitetura multigateway definitiva, deverá existir uma tarefa própria para alinhar as Diretrizes Oficiais, preservando o histórico e registrando formalmente o novo modelo.

Isso é uma pendência documental/normativa; as decisões de produto desta seção já estão confirmadas.

## Pontos técnicos ainda pendentes

Estes pontos devem ser investigados pelo Codex com as duas Skills e evidência atual antes de implementar:

1. **Split:** comprovar como Marketplace, sócio global e representante serão identificados no PagBank (`account.id` ou equivalente) e se os quatro cenários financeiros oficiais do SmartBus funcionam em sandbox e produção.
2. **Onboarding PagBank:** comprovar se é possível criar/autorizar/conectar conta pelo SmartBus e qual fluxo oficial permite isso; validar também a configuração manual de credencial.
3. **Credenciais:** definir armazenamento seguro por empresa e ambiente, autorização, rotação, auditoria e acesso mínimo às Connect Keys.
4. **Webhook:** comprovar autenticação, proteção contra replay, correlação, deduplicação e forma segura de validação.
5. **Idempotência:** comprovar garantia do endpoint escolhido e definir estratégia de timeout/retry sem duplicar cobrança.
6. **Estados:** mapear estados PagBank para estados SmartBus sem alterar o contrato de venda/ticket.
7. **Chargeback/reversões:** comprovar comportamento real do PagBank e impacto sobre split/recebedores antes de propor regra SmartBus.
8. **Payment Link Pix + cartão:** confirmar fluxo ponta a ponta, retorno, consulta e confirmação para o primeiro escopo aprovado.
9. **Persistência do gateway de origem:** propor a menor evolução de dados necessária para rastrear gateway/ambiente/IDs externos por venda sem quebrar registros Asaas existentes.
10. **Regressão Asaas:** definir testes de caracterização antes de generalizar seams atualmente específicos do Asaas.

## Etapas planejadas

- [x] Preparar roteador no `AGENTS.md`, checkpoint e análise inicial.
- [x] Criar e publicar `feature/pagbank-integration` no GitHub a partir da `main` atual.
- [x] Fechar decisões de produto sobre coexistência, seleção, rollout, primeiro escopo e regras financeiras.
- [ ] Alinhar as Diretrizes Oficiais ao modelo multigateway aprovado em tarefa própria.
- [ ] Executar segunda análise técnica focada nos capability gaps acima e fechar a matriz de capacidades com evidência atual.
- [ ] Revisar a análise técnica e obter decisão humana apenas onde permanecer verdadeiro bloqueio de produto/financeiro/segurança.
- [ ] Criar testes de caracterização do Asaas e especificar o contrato mínimo dos seams que serão generalizados.
- [ ] Propor alternativas mínimas de dados/RLS/secrets e revisar antes de qualquer migration.
- [ ] Generalizar incrementalmente roteamento backend, observabilidade/dedup e telas existentes, mantendo Asaas coberto.
- [ ] Implementar PagBank Payment Link com Pix + cartão.
- [ ] Implementar webhook/verify/finalização PagBank convergindo para o fluxo SmartBus existente.
- [ ] Validar sandbox: tenant, ambiente, split/ledger, tickets, diagnóstico, idempotência e regressão Asaas.
- [ ] Homologar PagBank e disponibilizar para as empresas sem migração automática das empresas Asaas existentes.
- [ ] Planejar produção e futura migração gradual do Asaas somente após evidências suficientes.

## Concluído

- Skills obrigatórias instaladas e consultadas.
- Arquitetura e acoplamentos atuais mapeados em nível inicial.
- Branch persistente preparada.
- Sistema de checkpoint/continuidade preparado.
- Decisões de produto da primeira fase concluídas.
- Nenhuma implementação funcional ou migration aplicada.

## Em andamento

Preparação para a **segunda análise técnica de capacidade do PagBank**. Não iniciar ainda implementação funcional enquanto os gaps críticos de split, webhook, idempotência, onboarding e chargeback não estiverem suficientemente comprovados.

## Próximo passo

Solicitar ao Codex, trabalhando exclusivamente em `feature/pagbank-integration`, uma investigação técnica focada nos pontos pendentes deste checkpoint.

A tarefa deve consultar obrigatoriamente:

- `.agents/skills/smartbus-payment-gateway/SKILL.md`;
- `.agents/skills/pagbank-connect/SKILL.md`;
- referências aplicáveis das duas Skills;
- código atual do SmartBus.

O resultado esperado é uma matriz final de capacidades e gaps, sem implementação funcional nesta etapa.

## Testes e validações

- Inspeção estática inicial de branch, Skills, rotas, Edge Functions, shared helpers, migrations e chamadas diretas Asaas: concluída.
- `git diff --check`: aprovado na preparação anterior.
- `npm test -- --runInBand`: não executou porque as dependências locais não estavam instaladas (`vitest: not found`); `--runInBand` não deve ser usado com Vitest na próxima execução.
- `npm ci`: anteriormente bloqueado porque `package-lock.json` estava divergente de `package.json` e o Node 20 do ambiente não atendia ao requisito do Capacitor 8. São limitações preexistentes do ambiente de desenvolvimento, não falhas causadas pelo PagBank.
- Testes funcionais/sandbox/produção: ainda não executados, pois não houve mudança funcional nem credenciais.

## Alterações de banco

Nenhuma aplicada ou criada.

Possíveis necessidades continuam sendo propostas técnicas para avaliação: rastrear gateway/ambiente/IDs externos por venda ou cobrança, isolar configuração/secrets com RLS e incluir contexto do provedor em logs/dedup.

Não existe campo, tabela, default ou backfill aprovado até a revisão técnica de dados/RLS. Qualquer solução deverá preservar vendas Asaas existentes e o gateway de origem das vendas históricas.

## Riscos e bloqueios

- **Alinhamento normativo:** Diretrizes Oficiais ainda dizem que Asaas é o gateway oficial e precisam ser atualizadas em tarefa própria.
- **Split PagBank:** equivalência dos destinatários SmartBus ainda não comprovada; é gate para produção.
- **Webhook:** autenticidade, replay e dedup precisam ser comprovados.
- **Idempotência:** criação sem garantia comprovada pode gerar cobrança duplicada.
- **Onboarding:** criação/conexão de conta pelo SmartBus ainda depende de comprovação de capacidade PagBank.
- **Chargeback:** comportamento e impacto sobre split ainda não definidos tecnicamente.
- **Credenciais:** risco de mistura de tenant/ambiente/Connect Key exige desenho seguro.
- **Regressão Asaas:** generalização ampla ou troca de defaults pode quebrar o gateway atual; mitigar com mudanças pequenas e testes de caracterização.
- **Arquitetura futura:** Mercado Pago/PayPal são roadmap, não justificativa para overengineering agora.

## Histórico resumido

- **2026-09-01:** preparação, leitura das Skills/referências, auditoria inicial e conclusão de viabilidade condicional; sem mudança funcional.
- **2026-09-01:** checkpoint refinado para separar confirmações, propostas, decisões pendentes, gaps e bloqueios.
- **2026-09-01:** branch persistente `feature/pagbank-integration` criada no GitHub a partir da `main` atual; bloqueio de persistência remota resolvido.
- **2026-09-01:** decisões de produto concluídas: coexistência transitória Asaas/PagBank, escolha por empresa, PagBank recomendado para novas empresas, vínculo imutável da venda ao gateway de origem, sem fallback automático, primeira fase com Payment Link + Pix/cartão, venda manual posterior, regras financeiras preservadas e rollout sem migração automática.
