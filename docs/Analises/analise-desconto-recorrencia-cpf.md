# Auditoria de desconto por recorrência de compras vinculadas ao CPF

**Data da auditoria:** 29/07/2026  
**Escopo:** estado versionado do SmartBus BR nesta revisão  
**Classificação final:** **a funcionalidade de desconto automático por histórico de compras do mesmo CPF não existe**.

> **Atualização de 29/07/2026:** após esta auditoria, o CRUD existente de Programas de Benefício por CPF foi reabilitado para gerente/developer no desktop e no menu secundário mobile. A RPC pública foi reduzida aos dados mínimos do programa. Essa reabilitação não altera a conclusão sobre inexistência de recorrência automática; a fonte normativa atual é `docs/PRD/PRD — Programas de Benefício por CPF.md`.

### Estado encontrado durante a auditoria

- O CRUD (`BenefitPrograms` e `BenefitProgramEditor`) estava implementado e compatível com o schema.
- As três rotas administrativas redirecionavam ao dashboard e o item de menu havia sido removido.
- O motor de benefício continuava ativo no checkout público, venda manual, snapshot e cobrança.
- A landing comunicava frequência e 5% automático sem correspondência na elegibilidade real.
- A RPC pública retornava, além do programa, nome e observações administrativas do cadastro do CPF.

### Estado atual após a implementação

- As rotas de listagem, criação e edição estão reabilitadas.
- Gerente/developer acessam pela sidebar desktop e pelo menu secundário **Mais** no mobile/PWA.
- O CRUD voltou a ser acessível com cards mobile e tabela desktop.
- A landing descreve somente benefício para CPF previamente cadastrado.
- A RPC retorna apenas `program_id`, `program_name`, `benefit_type` e `benefit_value` e valida a empresa do evento.
- Nenhuma recorrência automática, contador de compras ou regra financeira foi implementada ou alterada.

## 1. Resumo executivo

O SmartBus BR possui um mecanismo funcional de **programa de benefício por lista pré-cadastrada de CPFs de passageiros**, mas esse mecanismo não é recorrência, fidelidade ou recompensa por compras anteriores. A elegibilidade é obtida pela presença do CPF em `benefit_program_eligible_cpf`, dentro da empresa, vigência e evento aplicável. Nenhum dos fluxos de preço consulta, conta ou agrega vendas anteriores.

O benefício por lista está conectado ao checkout público e à venda administrativa. Ele reduz o preço individual do passageiro antes das taxas, congela o resultado em `sale_passengers` e `sales`, é revalidado pela Edge Function financeira, compõe `sales.gross_amount` enviado como `value` ao Asaas e é copiado para `tickets` após confirmação. Isso confirma a existência de **desconto por elegibilidade previamente administrada**, não de desconto conquistado por recorrência.

Na revisão auditada, a landing prometia que “clientes mais frequentes” recebiam 5% automaticamente e as páginas administrativas estavam bloqueadas por redirects. A tarefa subsequente corrigiu a comunicação e reabilitou as páginas existentes, sem criar recorrência ou alterar o motor financeiro.

### Respostas objetivas

| Pergunta | Resposta confirmada |
|---|---|
| 1. Existe desconto automático baseado no histórico do mesmo CPF? | **Não.** Não existe consulta/contagem do histórico no resolvedor de benefício, checkout público, venda manual, RPC ou Edge financeira. |
| 2. Qual CPF seria considerado? | Não há “CPF de recorrência”. No benefício existente, a elegibilidade é do **passageiro**, individualmente. O CPF do pagador/comprador é o CPF do passageiro selecionado como responsável e serve à venda/Asaas, não à recorrência. |
| 3. Quais status entram no histórico? | **Nenhum**, pois não há histórico de recorrência. Logo, reservado, pendente, pago, cancelado, expirado, estornado e chargeback não são avaliados pela elegibilidade. |
| 4. A regra é isolada por empresa? | A recorrência não existe. O benefício existente é isolado por `company_id` na RPC, FKs compostas, trigger e RLS. |
| 5. Existe configuração administrativa? | Não existe configuração de recorrência, limiar ou quantidade. O CRUD reabilitado configura somente allowlist, vigência, eventos e os três tipos de benefício existentes. |
| 6. O que o desconto existente afeta? | O preço final individual, subtotal e total da venda. Taxas percentuais da empresa e taxa progressiva da plataforma são recalculadas sobre `final_price`; taxas fixas permanecem fixas. Não há desconto direto na taxa. |
| 7. Chega ao snapshot e Asaas? | **Sim, para o benefício por lista**, mediante validações de integridade. `gross_amount` já líquido do benefício é o `value` da cobrança. Isso não prova recorrência. |
| 8. Há estrutura preparada? | Há estrutura completa de benefício por allowlist de CPF e textos comerciais de fidelização; ela não contém campos de contagem, período, limiar ou consumo e não está “preparada” como motor de recorrência sem definição/mudança de produto. |
| 9. Há código antigo/desativado/incompleto? | Na revisão auditada, `BenefitPrograms` e `BenefitProgramEditor` estavam bloqueadas por redirect e comentários antigos ainda diziam “checkout futuro”. As rotas e a comunicação foram corrigidas na reabilitação posterior. |
| 10. Há documentação da recorrência? | **Não há PRD oficial de recorrência.** Há análises históricas do benefício por CPF, documentação financeira e Asaas; nenhuma define compras anteriores como critério. |

## 2. Método e limites

Foram realizadas buscas textuais em código, documentação e migrations com as variações solicitadas (`cpf`, `buyer_cpf`, `customer_cpf`, `passenger_cpf`, `document`, `discount`, `benefit`, `loyalty`, `recurring_customer`, `purchase_count`, `sales_count`, `promotion`, `coupon`, `voucher`, `fidelidade`, `historico_compras` e equivalentes). Depois, foram seguidos imports, chamadas, persistências, RPCs, rotas e Edge Functions até os pontos de cobrança e confirmação.

A conclusão é sobre o repositório versionado. Não houve acesso a uma instância remota do banco nem inspeção de dados reais. As migrations foram tratadas como schema/RLS declarados pelo projeto; drift de banco implantado deve ser verificado separadamente em homologação/produção.

## 3. Arquivos investigados

### 3.1 Regras e documentação

- `docs/manual-operacional-smartbus-br/Diretrizes Oficiais do Projeto.txt`: multiempresa, status oficial e Asaas.
- `docs/PRD/PRD 01 — Regra Oficial de Divisão da Taxa entre Marketplace, Sócio e Representante.txt`: base, piso/teto, divisão e snapshot.
- `docs/PRD/Asaas/00-asaas-indice-geral.md` a `07-asaas-motor-taxa-e-distribuicao-financeira.md`, com foco em `02-asaas-fluxo-checkout-e-venda.md`, `03-asaas-webhook-e-confirmacao.md`, `04-asaas-split-comissoes-e-representantes.md`, `06-asaas-operacao-erros-e-diagnostico.md` e os dois arquivos `07-*`.
- `docs/PRD/Telas/prd-public-checkout.md`, `prd-public-confirmacao.md`, `prd-admin-vendas.md`, `01-prd-telas-publicas.md`, `02-prd-telas-admin.md` e `PRD — Módulo de Passeios & Serviços (SmartBus BR).md`.
- `docs/PRD/Financeiro/PRD 01 — Comissões e Repasses da Plataforma.txt` a `PRD 05 — Configuração de Gateway por Empresa.txt`.
- Manual operacional de venda, evento e relatório (`07-*` a `10-*`).
- Análises de benefício: `analise-00-diagnostico-beneficio-checkout.md`, `analise-01-fechamento-beneficio-pos-pagamento-ticket-pdf.md`, `analise-02-beneficio-checkout-cpf.md`, `analise-03-plano-final-beneficio-checkout.md`, `analise-1-beneficios-checkout-admin.md`, `analise-2-correcao-beneficios-publico-admin.md`, `analise-3-debug-beneficios-checkout-publico.md`, `analise-4-rpc-beneficios-404.md`, `analise-48-programas-beneficio-crud.md`, `analise-49-implementacao-programas-beneficio.md`, `analise-50-auditoria-final-programas-beneficio.md`, `analise-50-refinamento-ux-programas-beneficio.md`, `analise-58-beneficios-checkout.md`, `analise-59-beneficio-cpf-checkouts.md` e `analise-60-beneficio-cpf-ticket-pdf.md`.
- Análises de taxa, venda manual, reversão, checkout, passageiros, serviços, ocupação, diagnóstico e integração Asaas encontradas em `docs/Analises/`.

Nenhum desses documentos define quantidade mínima de vendas anteriores, janela temporal, statuses elegíveis, consumo por compra ou recompensa automática por recorrência.

### 3.2 Runtime e schema

- Público: `src/pages/public/Checkout.tsx`, `Confirmation.tsx`, `TicketLookup.tsx`, `LandingPage.tsx`, `src/components/public/TicketCard.tsx` e `src/lib/ticketVisualRenderer.ts`.
- Administrativo: `src/components/admin/NewSaleModal.tsx`, `src/pages/admin/Sales.tsx`, `SalesReport.tsx`, `SalesDiagnostic.tsx`, `BenefitPrograms.tsx`, `BenefitProgramEditor.tsx`, `Company.tsx`, `Events.tsx` e `ServiceSales.tsx`.
- Regras: `src/lib/benefitEligibility.ts`, `src/lib/fees.ts`, `src/lib/platformFeeEngine.ts`, `src/lib/platformFeeCheckout.ts`, tipos em `src/types/database.ts` e `src/integrations/supabase/types.ts`.
- Rotas: `src/App.tsx` e navegação administrativa.
- Edge Functions: `create-asaas-payment`, `create-platform-fee-checkout`, `asaas-webhook`, `verify-payment-status`, `reconcile-sale-payment`, `get-asaas-payment-link`, `ticket-lookup` e os módulos compartilhados `payment-finalization.ts`, `checkout-financial-integrity.ts`, `split-recipients-resolver.ts` e `platform-fee-engine.ts`.
- Todas as migrations em `supabase/migrations`, com inspeção aprofundada das migrations de criação/escopo de `sales`, `sale_passengers`, `tickets`, programas de benefício, snapshot, relatórios pagos, confirmação/reversão e RLS.

## 4. Banco: estruturas, funções, RPCs e triggers

### 4.1 Estruturas realmente relacionadas ao desconto existente

| Elemento | Papel confirmado | Recorrência? |
|---|---|---|
| `benefit_programs` | Configura nome, status, tipo (`percentual`, `valor_fixo`, `preco_final`), valor, vigência e escopo de eventos por empresa. | Não. |
| `benefit_program_eligible_cpf` | Allowlist de CPF com status/vigência. CPF é normalizado para exatamente 11 dígitos por constraint. | Não; não guarda compras ou contador. |
| `benefit_program_event_links` | Limita programa a eventos específicos quando não for global na empresa. | Não. |
| `sale_passengers` | Staging de passageiro e snapshot: programa, preço original, desconto, preço final, flag e versão. | Registra resultado, não histórico de elegibilidade. |
| `sales.benefit_total_discount` | Soma dos descontos dos passageiros da venda. | Agregado da venda atual, não compras anteriores. |
| `tickets` | Snapshot final do benefício copiado após pagamento. | Evidência histórica passiva; não é consultada para conceder novos descontos. |

A migration `20261102090000_create_benefit_programs.sql` declara explicitamente aplicação por passageiro/CPF e cria FKs compostas programa/empresa, índices e constraints. `20261103090000_add_benefit_snapshot_to_sales_and_passengers.sql` e `20261104090000_add_benefit_snapshot_to_tickets.sql` adicionam a trilha financeira. Não existem colunas como `purchase_count`, `sales_count`, `minimum_purchases`, `loyalty_tier`, período de apuração, saldo ou uso.

### 4.2 RPC de elegibilidade

`public.get_benefit_eligibility_matches(p_company_id, p_event_id, p_cpf, p_reference_date)` é a única consulta usada pelo helper. Ela:

1. remove caracteres não numéricos;
2. exige CPF de 11 dígitos, empresa e evento;
3. consulta `benefit_program_eligible_cpf` unido a `benefit_programs`;
4. exige o mesmo `company_id`, status ativo, vigências válidas e evento elegível;
5. ordena por criação do registro de CPF.

Ela **não consulta** `sales`, `sale_passengers` nem `tickets`, não recebe status de venda e não calcula quantidade de compras. As migrations `20260329143000_add_secure_benefit_eligibility_rpc.sql` e `20260329170000_ensure_benefit_eligibility_rpc_available.sql` contêm a mesma regra operacional.

### 4.3 Triggers, views e outras RPCs

- `enforce_benefit_program_event_company_match()` bloqueia vínculo de programa com evento de outra empresa.
- Triggers `benefit_programs_set_updated_at` e `benefit_program_eligible_cpf_set_updated_at` apenas atualizam timestamps.
- Não foi encontrado trigger em `sales` ou `tickets` que incremente recorrência, habilite CPF, aplique desconto ou mantenha pontos.
- Funções de relatório contam vendas pagas para relatórios/KPIs, porém não alimentam elegibilidade de benefício.
- O motor `company_referral_progress` conta indicações de empresas, não compras de passageiros; é domínio diferente.

## 5. Fluxo atual do CPF

### 5.1 Checkout público

Cada passageiro informa nome e CPF. `isPassengerComplete` e `validatePassengers` exigem CPF válido; CPFs repetidos na mesma compra são rejeitados. A máscara é visual (`000.000.000-00`) e inserções removem `\D`, evitando comparação formatado/não formatado.

O usuário seleciona um `payerIndex`. O pagador é, portanto, **um dos passageiros**:

- `sales.customer_name`, `customer_cpf` e `customer_phone` recebem os dados desse passageiro;
- cada `sale_passengers.passenger_cpf` recebe o CPF de seu próprio passageiro;
- elegibilidade é resolvida para **cada passageiro**, não apenas para `sales.customer_cpf`;
- o Asaas usa `sales.customer_cpf` somente para buscar/criar o customer e cobrar o pagador.

Consequência: numa venda de várias passagens, cada CPF pode ou não ter benefício próprio. O CPF do comprador não transfere benefício aos demais passageiros. A vedação de CPF duplicado na mesma compra impede usar a mesma elegibilidade em várias passagens daquele checkout.

### 5.2 Venda manual administrativa

`NewSaleModal.resolvePassengerBenefitSnapshots` repete a consulta por passageiro usando `activeCompanyId`, `selectedEventId` e CPF sem máscara. O primeiro passageiro abastece `sales.customer_cpf`; todos os passageiros recebem snapshot individual. O modo `bloqueio` usa CPF sintético `00000000000`, preço zero e nenhum benefício.

### 5.3 Armazenamento e privacidade

Os CPFs são armazenados sem formatação em `sales.customer_cpf`, `sale_passengers.passenger_cpf`, `tickets.passenger_cpf` e na allowlist. Logs de benefício no frontend mascaram o CPF ou registram só os últimos quatro dígitos. No estado atual:

- a RPC `SECURITY DEFINER`, executável por `anon`, não retorna mais `cpf_full_name`, `cpf_notes` nem o próprio CPF;
- permanece risco residual de enumeração: quem informar empresa, evento e CPF válido pode confirmar se existe benefício e conhecer os quatro campos públicos do programa;
- policies públicas históricas de `sales`/`sale_passengers` devem ser revisadas por exposição de payload completo, embora não sejam usadas para procurar recorrência;
- CPF permanece dado pessoal em frontend, banco e integração Asaas e exige minimização/controle conforme a política de privacidade.

## 6. Fluxo atual de descontos

### 6.1 Elegibilidade

`getEligibleBenefitsByPassenger` normaliza o CPF e chama a RPC. `resolvePassengerBenefitPrice` passa todos os matches a `resolveBestBenefitForPassengerPrice`. Não há query de venda anterior.

### 6.2 Fórmula

`applyBenefitToPrice` implementa:

- `percentual`: `preço final = base - base × percentual / 100`;
- `valor_fixo`: `preço final = base - valor`;
- `preco_final`: `preço final = valor configurado`.

O resultado nunca fica negativo. Havendo múltiplos programas, vence o menor preço final; em empate, maior desconto absoluto e depois menor ID em ordem lexical. Portanto, não há acumulação entre programas. Não foram encontrados cupom, voucher ou promoção comercial em runtime com os quais acumular; taxas e tipos de passagem não são cupons.

### 6.3 Itens elegíveis

O benefício opera sobre o preço individual da passagem/tipo/pacote selecionado pelo passageiro. Preço de tipo de passagem tem precedência; categoria/valor-base é fallback. Taxas e serviços/adicionais não recebem uma linha de “desconto por CPF” própria. A venda de serviços é um fluxo separado e não chama `resolvePassengerBenefitPrice`.

Não existe critério de:

- compras mínimas;
- status anterior;
- período ou expiração desde a compra;
- limite de usos;
- quantidade anterior de passagens;
- estorno/reembolso/chargeback;
- deduplicação de vendas anteriores.

Esses itens não estão “mal configurados”: simplesmente não fazem parte da regra existente.

## 7. Fluxo da venda pública

1. O checkout coleta e valida todos os passageiros.
2. Na transição/submit, resolve benefício por CPF para cada passageiro.
3. Em falha da RPC, aplica fallback **fail-open para a venda e fail-closed para o desconto**: preço-base, desconto zero; a venda não é bloqueada.
4. Soma `final_price`, taxas de evento e, quando repassada ao cliente, taxa de plataforma.
5. Cria `sales` com `status = pendente_pagamento`, `gross_amount` e `benefit_total_discount`.
6. Cria `sale_passengers` com CPF e snapshot individual.
7. Invoca `create-asaas-payment`.
8. Após confirmação, `finalizeConfirmedPayment` copia o snapshot para `tickets` e só então remove o staging.

Não há passo entre 1 e 8 que leia histórico do CPF.

## 8. Fluxo da venda manual

1. O admin seleciona empresa/evento, assentos e passageiros.
2. O modal resolve o mesmo benefício por allowlist e passageiro.
3. Calcula o resumo líquido e persiste `sales`/`sale_passengers` com snapshot.
4. Venda manual paga/pendente segue suas regras existentes de taxa/cobrança; a resolução do benefício não depende de compra anterior.

O fluxo manual está funcional para programa já cadastrado. Na revisão original desta auditoria, as rotas `/admin/programas-beneficio`, `/novo` e `/:id` redirecionavam para `/admin/dashboard`; elas foram posteriormente reabilitadas reutilizando as páginas e guardas existentes.

## 9. Relação entre passageiro e comprador

O nome “customer” em `sales` não deve ser interpretado como um cadastro histórico de cliente. É snapshot do pagador da venda. Não existe tabela de perfil de comprador recorrente nem chave estrangeira de cliente usada para fidelidade.

O mecanismo existente é inequivocamente por passageiro:

- a RPC recebe um CPF por resolução;
- checkout e venda manual chamam a resolução dentro do conjunto de passageiros;
- `discount_amount`/`final_price` estão em `sale_passengers` e depois em `tickets`;
- `benefit_total_discount` é apenas a soma na venda.

O comprador só é relevante ao Asaas porque `customer_cpf` identifica o customer/cobrança. O customer existente no Asaas encontrado pelo CPF não gera benefício; é somente reutilização do cadastro no gateway.

## 10. Relação com taxas, snapshot e Asaas

### 10.1 Base e total

No benefício existente, a ordem efetiva é:

`preço/tipo da passagem → benefício → final_price → taxas por passageiro → gross_amount`.

Taxa percentual de evento usa o `final_price`; taxa fixa mantém seu valor por passageiro. A taxa progressiva da plataforma também recebe os preços finais individuais, aplica faixa/teto por passageiro e piso total conforme o motor oficial. Logo, o benefício reduz indiretamente uma taxa percentual/faixa quando reduz sua base, mas não grava “desconto da taxa”.

### 10.2 Blindagem backend

`create-asaas-payment` lê `sale_passengers.final_price`, `original_price`, `discount_amount`, `benefit_applied` e tipo de passagem. `buildCheckoutFinancialIntegritySnapshot` recompõe:

- quantidade e preços unitários;
- soma final dos passageiros;
- soma de descontos;
- taxas;
- total bruto esperado.

A Edge rejeita divergência de quantidade/total e rejeita diferença acima de R$ 0,01 entre `sales.benefit_total_discount` e a soma do snapshot. A cobrança usa `paymentPayload.value = grossAmount` e `externalReference = sale.id`. O desconto não é enviado como campo “discount” do Asaas; ele já está incorporado ao valor líquido cobrado.

### 10.3 Split e confirmação

O motor calcula a taxa oficial sobre os preços finais e converte os valores distribuídos em percentuais do `grossAmount` para o split. O benefício não muda a regra de divisão marketplace/sócio/representante; pode mudar a base/valor da taxa conforme o PRD oficial.

Webhook (`PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`) e verificação manual convergem em `finalizeConfirmedPayment`. A função preserva o snapshot em `tickets`. Eventos de reversão/chargeback podem invalidar operação e alertar necessidade de tratamento manual, mas não retroagem sobre uma futura elegibilidade porque inexiste contador de recorrência.

### 10.4 Relatórios e diagnóstico

Relatórios usam `sales.gross_amount` e status financeiro; tickets e tela de venda exibem dados do benefício já congelados. Não há relatório de fidelidade, compras por CPF para concessão de desconto, saldo, tier ou uso. A busca de vendas por CPF no diagnóstico é ferramenta de investigação administrativa, com escopo de empresa, e não participa do cálculo.

## 11. Multiempresa

O benefício existente respeita multiempresa em camadas:

- todas as três tabelas têm `company_id NOT NULL`;
- FK composta impede CPF/programa e programa/evento cruzarem empresas;
- trigger valida a empresa real do evento;
- RPC filtra `c.company_id = p_company_id`, join com a mesma empresa e link de evento com a mesma empresa;
- checkout passa `event.company_id`; venda manual passa `activeCompanyId`;
- persistência de vendas/passagens usa a empresa do contexto.

Não foi encontrada consulta de elegibilidade sem empresa. Como não há histórico de recorrência, também não há consulta cross-company de histórico. Uma futura regra não pode reutilizar apenas `customer_cpf` sem `company_id` e `status = pago`.

## 12. RLS

### 12.1 Programas de benefício

`benefit_programs`, `benefit_program_eligible_cpf` e `benefit_program_event_links` têm RLS habilitada. Membros autenticados podem ler somente quando `user_belongs_to_company`; administração exige `is_admin` e vínculo à empresa, tanto em `USING` quanto `WITH CHECK`.

O checkout anônimo não ganha `SELECT` direto. Ele executa a RPC `SECURITY DEFINER`, concedida a `anon`, `authenticated` e `service_role`. A RPC atual mantém filtro de empresa/evento/CPF e retorna somente id, nome, tipo e valor do programa. Ainda é possível confirmar a existência de benefício ao informar empresa, evento e CPF válido; não foi encontrada proteção compartilhada de rate limit/CAPTCHA reutilizável sem ampliar a arquitetura.

### 12.2 Vendas, passageiros e tickets

As migrations habilitam RLS nas tabelas. Policies autenticadas de `sales` foram reescritas com vínculo de empresa; inserts públicos são condicionados a evento público em migrations posteriores. `sale_passengers` possui policies públicas para inserir/visualizar dados vinculados a evento público e policy admin. `tickets` teve policy pública antiga removida no endurecimento do fluxo de validação.

Como migrations históricas criam e substituem policies em momentos diferentes, a validação final em ambiente deve consultar `pg_policies` e testar anon/authenticated. Em especial, permitir `SELECT` anônimo de linhas completas de `sales` ou `sale_passengers` pode expor CPF. Isso não cria fidelidade, mas é risco de privacidade.

## 13. Elementos encontrados e classificação

| Elemento | Classificação | Justificativa |
|---|---|---|
| Benefício por CPF no checkout | **Funcional e utilizado em runtime** | Import, resolução, preço, persistência e cobrança conectados. |
| Benefício por CPF na venda manual | **Funcional e restrito ao fluxo** | Mesmo resolvedor no modal; bloqueio não recebe benefício. |
| Snapshot em `sale_passengers`, `sales`, `tickets` | **Funcional e utilizado em runtime** | Integridade antes da cobrança e cópia pós-pagamento. |
| RPC `get_benefit_eligibility_matches` | **Funcional e utilizada em runtime** | Única fonte de elegibilidade para público/admin. |
| CRUD `BenefitPrograms`/`BenefitProgramEditor` | **Funcional e acessível no estado atual** | Rotas e navegação foram reabilitadas para gerente/developer em desktop e mobile. |
| Texto “clientes mais frequentes recebem 5%” | **Divergência histórica corrigida** | A landing atual descreve allowlist por CPF sem frequência ou percentual fixo. |
| Comentários “checkout futuro” no helper | **Estado encontrado durante a auditoria — corrigido** | O helper atual documenta o uso real nos checkouts público e administrativo e mantém o desempate determinístico. |
| Campos `discount_amount` e `benefit_total_discount` | **Estrutura ativa, não recorrência** | Snapshot do benefício allowlist na venda atual. |
| Busca por CPF no diagnóstico | **Funcional, restrita a diagnóstico** | Localiza venda para suporte; não alimenta preço. |
| Customer do Asaas por CPF | **Funcional, integração externa** | Busca/cria pagador; não consulta compras nem concede desconto. |
| Cupons/promoções/vouchers/fidelidade | **Não encontrados em runtime** | Termos não correspondem a motor/tabelas aplicáveis. |
| Recorrência por comprador/passageiro | **Inexistente** | Sem consulta, contador, regra, configuração ou snapshot específico. |

## 14. Código legado, desativado ou incompleto

1. **Rotas do CRUD (histórico corrigido):** na revisão auditada os URLs redirecionavam ao dashboard; no estado atual as páginas existentes estão reabilitadas para gerente/developer.
2. **Comentários obsoletos — Estado encontrado durante a auditoria:** `benefitEligibility.ts` descrevia integração “futura” e decisão posterior de desempate. **Estado atual após a implementação:** esses comentários foram corrigidos; o helper documenta o uso real nos checkouts público e administrativo, e o desempate determinístico permanece implementado.
3. **Marketing à frente do produto (histórico corrigido):** a landing usava frequência/5%; o texto atual descreve somente passageiro com CPF previamente cadastrado.
4. **Fail-open do benefício:** falha de elegibilidade prossegue sem desconto. É comportamento explícito, mas pode gerar divergência de expectativa comercial e atendimento.
5. **Ausência deliberada de recorrência:** não há esqueleto de contador/status. Os snapshots existentes poderiam servir como fonte histórica futura, mas isso exigiria novo PRD, consulta paga por empresa, regras de reversão e implementação; não devem ser tratados como funcionalidade parcial.

## 15. Divergências entre código e documentação

### 15.1 Divergência crítica

No estado encontrado, `src/pages/public/LandingPage.tsx` afirmava:

- transformar clientes em passageiros recorrentes;
- criar descontos para melhores clientes e aumentar recompra;
- que “clientes mais frequentes recebem 5% de desconto automaticamente”.

As duas primeiras frases podiam descrever uso manual da allowlist como intenção comercial; a terceira descrevia comportamento automático inexistente. No estado atual, todas foram substituídas por comunicação fiel ao cadastro explícito por CPF.

### 15.2 Documentação técnica

As análises de benefício descrevem corretamente, em geral, lista de CPFs e snapshot por passageiro. O PRD normativo consolidado do recurso existente é `docs/PRD/PRD — Programas de Benefício por CPF.md`; continua não existindo PRD de recorrência automática. Documentos históricos que registram etapas futuras não são a fonte atual.

O PRD financeiro/Asaas exige consistência da base e snapshot; o fluxo atual de benefício está alinhado no caminho principal por usar `final_price`, `gross_amount` e validação backend. Isso não autoriza inferir regra de recorrência.

## 16. Riscos

### 16.1 Produto e comunicação

- **Corrigido:** a promessa pública de 5% por frequência foi removida.
- **Mitigado:** nomenclatura e PRD distinguem benefício cadastrado de fidelidade automática.
- **Corrigido:** o CRUD voltou à navegação autorizada no desktop e mobile.
- **Mitigado:** o PRD de Programas de Benefício por CPF é a fonte normativa principal.

### 16.2 Financeiro e operação

- Uma implementação futura ingênua poderia contar reservado/pendente/cancelado ou misturar empresas; hoje não há regra que faça isso.
- Reversões, estornos e chargebacks não têm efeito numa elegibilidade futura porque ela inexiste; seriam definição obrigatória antes de qualquer recorrência.
- O fallback sem desconto pode cobrar mais que a expectativa criada pela comunicação, embora preserve disponibilidade da venda.
- Alterar benefício depois não muda snapshots anteriores, o que é correto para auditoria.

### 16.3 Segurança e privacidade

- A RPC não retorna mais nome/notas do beneficiário, mas mantém risco residual de confirmação de benefício para empresa, evento e CPF válido.
- Policies públicas históricas precisam ser confirmadas no banco implantado para garantir que linhas completas com CPF não sejam enumeráveis.
- Busca de customer no Asaas por CPF é necessária à cobrança, mas não deve ser reaproveitada como histórico de fidelidade.

## 17. Pendências de produto para eventual implementação

Antes de criar qualquer recorrência, um PRD futuro deve decidir, sem inferência:

1. CPF do comprador, do passageiro ou ambos;
2. contagem por venda ou por passagem e tratamento de várias passagens na mesma venda;
3. somente `pago` e como retirar compras posteriormente revertidas;
4. estorno parcial, reembolso, chargeback, duplicidade e reconciliação;
5. isolamento obrigatório por `company_id`;
6. limiar, janela temporal, validade, limites de uso e eventos/tipos/serviços elegíveis;
7. acumulação/prioridade com allowlist de benefícios;
8. fórmula e base das taxas depois do desconto;
9. proteção contra corrida entre duas compras simultâneas;
10. transparência, base legal e minimização do CPF.

## 18. Conclusão

**Não existe desconto automático baseado no histórico de compras do mesmo CPF.** Não há CPF de recorrência, status de histórico, contador, configuração de quantidade, período, consumo ou integração desse conceito ao preço. Consequentemente, também não existe resposta operacional para reembolso/chargeback dentro de uma regra de recorrência.

O que existe e participa do runtime é um **benefício por CPF de passageiro previamente incluído numa allowlist da própria empresa**, com vigência/evento e valor configurado. Esse desconto funciona tanto no checkout público quanto na venda manual, reduz `final_price`, afeta subtotal e bases percentuais, é validado contra o snapshot e chega líquido ao `value` da cobrança Asaas. Seus registros são isolados por empresa e preservados em tickets.

A estrutura não deve ser rotulada como recorrência parcial: falta justamente a origem da elegibilidade por compras anteriores. **Estado encontrado durante a auditoria:** a comunicação comercial prometia frequência e desconto automático de 5% sem implementação correspondente. **Estado atual após a implementação:** essa divergência foi corrigida, e a landing descreve somente benefício para passageiro com CPF previamente cadastrado. Não existe recorrência automática.

## 19. Decisão e recomendação documental

Para recorrência automática, foi aplicado o **Cenário C — funcionalidade não existe**. Não foi criado PRD de recorrência, pois isso oficializaria regras ausentes. A implementação subsequente criou apenas o PRD do recurso real de benefício por allowlist de CPF.

Estado documental e operacional atual:

1. a landing descreve somente allowlist/configuração real;
2. o PRD do **benefício por allowlist de CPF** é a fonte atual, sem chamá-lo de fidelidade;
3. manter o CRUD reabilitado sob as guardas gerente/developer e monitorar seu uso;
4. criar PRD de recorrência antes de qualquer migration, tela ou cálculo futuro;
5. auditar `pg_policies` e a assinatura/grants da RPC no ambiente implantado.

## 20. Confirmação de escopo

Na auditoria original, somente este documento foi adicionado. Na implementação subsequente foram reabilitadas rotas/navegação, refinada a UI e minimizada a RPC. **Nenhuma fórmula, checkout, venda manual, taxa, split, webhook, confirmação, status financeiro ou recorrência automática foi modificada.**
