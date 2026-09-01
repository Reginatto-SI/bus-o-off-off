# Implementação PagBank — checkpoint

## Objetivo

Estudar a inclusão do PagBank como gateway adicional do SmartBus, preservando a coerência do fluxo de venda, confirmação, ticket, financeiro e diagnóstico, sem regressão do Asaas. Forma de seleção, escopo e ativação ainda dependem de decisão de produto.

## Estado atual

**Análise de viabilidade concluída; implementação funcional não iniciada.** A branch `feature/pagbank-integration` existe somente neste ambiente temporário. O clone não possui remote nem referência local de `main`; portanto, a base mais recente da `main` não foi comprovada e uma branch persistente não foi publicada no GitHub. Isso é **bloqueio para iniciar implementação funcional**, até existir armazenamento remoto seguro. Nenhuma credencial, migration, Edge Function ou comportamento de produção foi alterado.

## Arquitetura atual de pagamentos

- A venda é a âncora multiempresa: checkout persiste `company_id`, método, `payment_environment`, passageiros e locks antes de chamar diretamente `create-asaas-payment`.
- A Edge Function relê venda/empresa, calcula a regra financeira central, resolve recebedores, cria a cobrança Asaas e persiste campos `asaas_*`. `externalReference = sale.id` correlaciona o fluxo.
- `asaas-webhook` é a confirmação prioritária; `verify-payment-status` é fallback. Ambos convergem em `_shared/payment-finalization.ts`, que finaliza a venda e cria tickets de modo reentrante. `get-asaas-payment-link` reabre a cobrança existente.
- Configuração e diagnóstico estão em `/admin/empresa` e `/admin/diagnostico-vendas`. Logs (`sale_logs`, `sale_integration_logs`), dedup Asaas e reconciliação já existem, mas parte da terminologia/modelagem é específica do provedor.
- Conceitos reutilizáveis: venda/passageiros/locks/tickets, ambiente central, engine de taxa, snapshot, ledger de comissão, finalização, reconciliação e parte da observabilidade. Acoplamentos: componentes `Asaas*`, chamadas de função, resolvedor de credenciais, campos `asaas_*`, status/link, split e dedup.

Detalhes e fontes de verdade: Skills obrigatórias e suas referências de arquitetura, configuração, checkout, webhook, financeiro, diagnóstico e checklist.

## Análise de viabilidade

**Viável de forma incremental, condicionada às decisões e gaps abaixo.** PagBank Connect oferece validação de chave, pedidos e consulta por ID, Pix, cartão, boleto, checkout hospedado, sandbox, webhooks e split por valores fixos. Isso cobre os blocos básicos, mas não comprova sozinho equivalência operacional/financeira completa.

| Responsabilidade SmartBus | Asaas atual | PagBank confirmado nas referências | Avaliação |
|---|---|---|---|
| Credencial e isolamento | Campos Asaas por tenant | Connect Key; `connectInfo` valida a key e informa se ela é sandbox | Capacidade presente; modelo de configuração SmartBus ainda pendente |
| Criar/correlacionar/consultar | Cobrança + `externalReference` | Orders HTTP 201, `reference_id`, consulta com a mesma key | Compatível; falta definir idempotência externa comprovada |
| Pix/cartão/boleto | Checkout hospedado Asaas | Orders suportam os três; payment link também existe | Capacidade presente; UX e escopo precisam de decisão |
| Confirmação | webhook autenticado + verify | notificação + consulta de pedido | Parcial; autenticação recomenda segredo na URL e exige desenho/revisão de replay |
| Split SmartBus | wallets Asaas e cenários oficiais | `splits.receivers` com `account.id` e valor fixo | Potencialmente compatível; onboarding/elegibilidade dos três destinos não estão comprovados |
| Sandbox/produção | decisão SmartBus e credenciais/IDs Asaas separados | mesma base; `connectInfo` identifica o tipo da Connect Key | Mecanismo de validação do PagBank, não fonte de verdade SmartBus; desenho pendente |
| Diagnóstico/reconciliação | estruturas existentes, parte Asaas | consulta de order/split; sandbox somente via API | Reutilizável após adicionar dimensão gateway |
| Estorno/chargeback | fluxo completo não comprovado | material consultado declara reembolsos fora do escopo | **CAPABILITY GAP**; não prometer automação |

**Proposta técnica, não aprovada:** avaliar evolução incremental dos pontos atuais de configuração, checkout, confirmação, backend, webhook/dedup e diagnóstico, mantendo comuns ticket lookup, locks, passageiros, regras financeiras e finalização. A forma de selecionar e persistir o gateway, o schema, o armazenamento de secrets e a inclusão da venda manual dependem das decisões abaixo.

## Decisões confirmadas

- O Asaas deve continuar funcionando sem regressões.
- PagBank será estudado como gateway adicional, não como substituição imediata do Asaas.
- Regras financeiras, isolamento multiempresa, separação de ambientes, confirmação, emissão de tickets e auditoria do SmartBus devem permanecer coerentes.
- Não devem ser criados fluxos paralelos desnecessários quando o fluxo atual puder ser reutilizado ou evoluído com segurança.
- Sandbox e Produção devem manter a mesma lógica funcional, com isolamento rigoroso de pagamentos, webhooks, status, logs, credenciais e dados externos; o ambiente usado por cada venda deve permanecer rastreável.

## Decisões pendentes

1. Qual produto/UX entra no primeiro piloto: link hospedado ou Orders; e quais métodos (Pix, cartão, boleto). Cartão direto adiciona SDK, 3DS e escopo PCI.
2. **Incompatibilidade normativa:** as Diretrizes Oficiais atuais declaram o Asaas como gateway oficial. Antes de código funcional, Produto deve definir se o SmartBus suportará oficialmente múltiplos gateways, como Asaas e PagBank coexistirão, qual será o padrão, como ocorrerá a escolha e como vendas existentes permanecerão vinculadas ao gateway de origem. Somente depois as Diretrizes Oficiais deverão ser atualizadas em tarefa própria.
3. Onde e em qual nível ocorrerá a seleção do gateway, quem poderá alterá-la e qual estratégia de ativação/piloto será usada. Não está confirmado que a escolha será exclusivamente por empresa.
4. Como tornar rastreável o gateway de origem de cada venda, inclusive as existentes, sem assumir novo campo, backfill ou schema definitivo antes da revisão de dados/RLS.
5. Onde armazenar Connect Keys com isolamento e segurança adequados e qual fluxo de autorização, rotação e auditoria será aprovado; não assumir uma única env global.
6. Como a decisão central de ambiente do SmartBus será aplicada ao PagBank. O tipo da Connect Key pode validar coerência, mas não deve escolher implicitamente o ambiente nem permitir fallback cruzado.
7. **CAPABILITY GAP:** comprovar como marketplace, sócio global e representante obtêm `account.id`, sua elegibilidade e se os quatro cenários financeiros SmartBus funcionam em sandbox e produção.
8. Aprovar o modelo de autenticação, replay e dedup do webhook PagBank. Segredo na URL é recomendação da referência consultada, não equivalência automática ao token Asaas.
9. Confirmar garantia de idempotência do endpoint escolhido e estratégia para timeout após criação sem duplicar pedidos.
10. Definir estados/transições PagBank, expiração, cancelamento, estorno e chargeback; reembolso está fora do escopo da Skill consultada.
11. Confirmar se a cobrança de taxa da venda manual integra o primeiro escopo ou permanece Asaas.

## Etapas planejadas

- [x] Preparar branch local, roteador no `AGENTS.md`, checkpoint e análise inicial.
- [ ] Regularizar base remota: validar/publicar a branch a partir da `main` mais recente sem reescrever histórico.
- [ ] Obter decisão de produto sobre o modelo oficial de gateways e, em tarefa própria, alinhar as Diretrizes Oficiais.
- [ ] Fechar matriz de capacidades com evidência oficial atual e obter decisões de produto/financeiro/segurança.
- [ ] Criar testes de caracterização do Asaas e especificar contrato mínimo nos seams existentes.
- [ ] Somente após as decisões, propor alternativas de dados/RLS/secrets e escolher um schema em revisão específica; aplicar migrations apenas em tarefa autorizada.
- [ ] Generalizar incrementalmente roteamento backend, observabilidade/dedup e telas existentes, mantendo Asaas como caminho coberto.
- [ ] Implementar adaptador PagBank e métodos aprovados, seguido de webhook/verify/finalização.
- [ ] Validar sandbox: concorrência, tenant/ambiente, split/ledger, tickets, diagnóstico e regressão Asaas.
- [ ] Executar piloto controlado, runbook/rollback e revisão antes de produção.

## Concluído

- Skills e referências aplicáveis consultadas; arquitetura, acoplamentos, capacidades, riscos e fases registrados.
- Branch temporária local e documentos de continuidade preparados. A branch persistente ainda não existe; nenhuma implementação funcional ou migration foi feita.

## Em andamento

Nenhuma etapa funcional. A preparação aguarda uma branch remota segura, a decisão oficial de produto sobre coexistência/seleção de gateways e o fechamento dos gaps da matriz.

## Próximo passo

**Próxima decisão:** Produto deve definir o modelo oficial de gateways (suporte multigateway, coexistência, padrão, forma de escolha e continuidade das vendas existentes). Em paralelo, em um clone com remote, deve-se criar/publicar com segurança `feature/pagbank-integration` a partir da `main` mais recente. Não iniciar código funcional enquanto ambos os bloqueios permanecerem.

## Testes e validações

- Inspeção estática de branch, Skills, rotas, Edge Functions, shared helpers, migrations e chamadas diretas Asaas: concluída.
- `git diff --check`: aprovado. Estrutura e links locais do Markdown verificados por inspeção.
- `npm test -- --runInBand`: não executou porque as dependências locais não estão instaladas (`vitest: not found`); além disso, `--runInBand` deve ser omitido na próxima execução com Vitest.
- `npm ci`: bloqueado porque `package-lock.json` está divergente de `package.json` e o Node 20 local não atende ao requisito do Capacitor 8. São limitações preexistentes deste ambiente de desenvolvimento, não falhas causadas pelo PagBank; nenhum arquivo de dependência foi alterado.
- Testes funcionais/sandbox/produção: não executados, pois não houve mudança funcional nem credenciais.

## Alterações de banco

Nenhuma aplicada ou criada. **Propostas técnicas para avaliação, não decisões de schema:** comparar formas de rastrear gateway/ambiente/IDs externos por venda ou cobrança, isolar configuração e secrets com RLS e incluir contexto do provedor em logs/dedup. Não há campo, tabela, default ou backfill aprovado; qualquer alternativa deve preservar os dados Asaas e vendas legadas.

## Riscos e bloqueios

- **Bloqueio:** a branch existe apenas no ambiente temporário, sem remote/`main` verificável ou persistência no GitHub; não iniciar implementação funcional nessa condição.
- **Bloqueio normativo:** as Diretrizes Oficiais ainda definem o Asaas como gateway oficial; o modelo futuro precisa de decisão de produto antes de alterar essa regra em tarefa separada.
- Regressão Asaas por refatoração ampla ou troca de defaults; mitigar com seams pequenos, caracterização, feature flag e rollback.
- Mistura de tenant/ambiente/Connect Key; a mesma key que criou o pedido é exigida para consulta e sandbox não aparece no painel.
- A identificação de sandbox pela Connect Key é capacidade de validação PagBank, não autoriza substituir a fonte de verdade SmartBus nem inferir ambiente automaticamente.
- Webhook sem equivalência comprovada de assinatura forte e criação sem idempotência externa comprovada.
- Split PagBank existe, mas onboarding e equivalência dos destinatários SmartBus não foram demonstrados; bloquear implementação financeira até decisão.
- Cartão direto amplia PCI/3DS; preferência de UX não pode ser presumida.
- Schema, logs, diagnóstico e funções ainda carregam nomes/campos Asaas; generalizar tudo de uma vez elevaria o risco.
- Cancelamento, estorno e chargeback não possuem contrato end-to-end confirmado no SmartBus/PagBank.

## Histórico resumido

- **2026-09-01:** preparação local, leitura das Skills/referências, auditoria inicial e conclusão de viabilidade condicional; sem mudança funcional.
- **2026-09-01:** checkpoint refinado para separar confirmações, propostas, decisões pendentes, gaps e bloqueios; registrada a incompatibilidade das Diretrizes Oficiais, sem alterá-las.
