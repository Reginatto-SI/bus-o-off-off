# Gate obrigatório para novo gateway

## 1. Descoberta (nenhum código antes de concluir)

- [ ] Gateway/produto/país/conta identificados.
- [ ] Documentação oficial atual citada com data.
- [ ] Autenticação, rotação e escopos mapeados.
- [ ] Sandbox/produção e separação de IDs/credenciais mapeados.
- [ ] Adapter consome o ambiente central SmartBus BR e não possui decisão própria por host/domínio/credencial.
- [ ] Métodos e experiência de checkout confirmados.
- [ ] Criar, consultar, cancelar, estornar e tratar disputa avaliados.
- [ ] Idempotency key, timeouts e retries confirmados.
- [ ] Webhook, assinatura, replay, retries e ordem de eventos confirmados.
- [ ] Marketplace/split/recebedores, limites e liquidação confirmados.
- [ ] LGPD/PCI e dados sensíveis delimitados.

## 2. Matriz de capacidade

| Responsabilidade SmartBus | Asaas atual | Novo gateway + fonte | Compatível? | Adaptação | Bloqueio/decisão |
|---|---|---|---|---|---|
| tenant/credencial segura | | | | | |
| ambiente | | | | | |
| cobrança/idempotência | | | | | |
| correlação/consulta | | | | | |
| webhook/autenticidade/dedup | | | | | |
| métodos | | | | | |
| confirmação/ticket | | | | | |
| taxa/snapshot | | | | | |
| marketplace/split/ledger | | | | | |
| cancelamento/estorno/disputa | | | | | |
| logs/reconciliação | | | | | |

Para cada incompatibilidade, emitir bloco `CAPABILITY GAP` do SKILL.md. Obter decisão humana se afetar negócio.

Na linha financeira, confirmar faixa por item, teto por item, mínimo sobre a taxa total, taxas adicionais, os quatro cenários sócio/representante, redirecionamentos e valores monetários. `walletId`, `fixedValue`, `totalFixedValue` e campos percentuais descrevem o mecanismo Asaas, não a regra SmartBus BR; outro modelo exige equivalência demonstrada ou `CAPABILITY GAP`.

## 3. Desenho incremental

- [ ] Asaas permanece operacional e coberto por regressão.
- [ ] Gateway+ambiente são congelados por venda.
- [ ] Operações históricas priorizam gateway+ambiente da venda sobre navegação e configuração atual da empresa.
- [ ] Configuração/credencial é isolada por empresa e backend.
- [ ] Provider selection não altera vendas históricas.
- [ ] Mapeamento de status/eventos é explícito.
- [ ] Criação e finalização são idempotentes.
- [ ] Regras financeiras continuam centralizadas.
- [ ] Estrutura genérica é criada somente onde dois casos reais justificam.
- [ ] Rollback, feature flag/piloto e compatibilidade definidos.

## 4. Segurança, dados e observabilidade

- [ ] RLS e checagem server-side/service-role revisadas.
- [ ] Nenhum secret ou dado de cartão chega ao frontend/log.
- [ ] Webhook trata corpo bruto/assinatura/replay conforme provedor.
- [ ] Constraints e dedup incluem gateway+ambiente+conta.
- [ ] Logs mínimos e mascaramento implementados.
- [ ] Diagnóstico mostra gateway, tenant, ambiente, venda, externo/interno, webhook/verify e divergência.
- [ ] Reconciliação não cria nova cobrança nem inventa pagamento.

## 5. Testes e liberação

- [ ] Unitários: taxas, status mapping, erros, assinatura e normalização.
- [ ] Integração sandbox: sucesso, recusa, expiração, cancelamento e estorno disponível.
- [ ] Concorrência: duplo clique, retry, webhook duplicado/fora de ordem, verify concorrente.
- [ ] Multiempresa/multiambiente negativos.
- [ ] Preview e publicado respeitam a empresa configurada; venda sandbox em contexto production e venda production em contexto sandbox continuam usando seus ambientes persistidos.
- [ ] Webhook/verify nos dois ambientes, configuração alterada após a venda e credencial oposta presente não provocam fallback cruzado.
- [ ] Ticket exatamente uma vez e pago sem ticket reconciliável.
- [ ] Split/snapshot/ledger reconciliados ou gap aprovado.
- [ ] Regressão Asaas e venda manual executada.
- [ ] Runbook, alertas, rollback e piloto aprovados.

## 6. Entrega da análise

- [ ] Resumo e mapa ponta a ponta.
- [ ] Inventários de UI, componentes, dados, RPCs, funções e secrets sem valores.
- [ ] Fontes normativas versus históricas e divergências.
- [ ] Dependências Asaas versus responsabilidades genéricas.
- [ ] Riscos/acoplamentos e plano mínimo.
- [ ] Matriz, gaps e decisões humanas.
- [ ] Confirmação explícita do que não foi alterado.
