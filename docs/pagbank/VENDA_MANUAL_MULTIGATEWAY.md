# Venda manual multi-gateway — implantação por etapas

Regras aprovadas: cobrar somente a taxa; ausência comprovada de sócio/representante
seleciona a tabela do PRD 01 sem dívida. Beneficiário elegível sem liquidação direta
preserva seu direito com obrigação de repasse. Resultado incerto não equivale a
ausência. Reserva vencida com cobrança pendente/incerta preserva lugares e bloqueia
embarque até conciliação. Não há transferências/estornos automáticos.

## Etapa 1 — segurança Asaas

O endpoint administrativo exige sessão e papel gerente da empresa ou capacidade
global developer. A consulta de taxa manual existente usa a conta da plataforma
no ambiente congelado, inclusive nos vínculos históricos Asaas de vendas PagBank.
Testes locais de autorização e caracterização passaram (9 testes). Não houve
implantação, mudança de credenciais ou escrita no banco conectado.

Etapas seguintes: operação privada/idempotência, cadastro/finalização atômicos,
ledger/conciliação/expiração, adapter PagBank Sandbox e piloto controlado.
A migration 0002 e o checkout público permanecem preservados.

## Etapa 2 — operação privada e adapter Asaas

Migration 0003 aditiva cria operação privada, contexto imutável e claim de criação
único. Flags por empresa começam desligadas. O adapter Asaas cobra somente a taxa;
a mesma operação serve a retries/consulta. Criação incerta nunca libera outro POST.
O contrato normalizado valida valor, referência, conta, ambiente e moeda antes de
persistir confirmação. Nenhuma tabela pública payment_attempts foi alterada.
Os módulos serão conectados na etapa de cadastro/finalização, ainda sem ativação.

## Etapa 3 — cadastro e emissão atômicos

Migration 0004 cria request idempotente, cadastro transacional e finalização manual
que chama emissão 0002 na mesma transação do status pago. Staging é confrontado com
o manifesto congelado antes da emissão. Prova financeira permanece na operação
mesmo se emissão falhar. NewSaleModal é preservado para empresas fora do piloto;
empresas habilitadas usam cadastro backend e comprovante de reserva sem QR liberado.
11 cenários PostgreSQL e 19 testes relevantes passaram. A flag deve continuar
DESLIGADA até completar/publicar as etapas seguintes; o SQL isolado não comprova
schema completo nem homologação financeira.

## Etapa 4 — confirmação, ledger e expiração comuns

Migration 0005 registra destinações econômicas sem confundir recebimento técnico
com receita Marketplace. Parcela de terceiro fica pendente de conciliação, mesmo
quando split foi solicitado: NÃO executar repasse manual sem verificar se o
provedor já liquidou. Comissão manual projeta o valor absoluto no ledger existente,
sem alterar a RPC pública ou sobrescrever registros históricos conflitantes.
Dados financeiros de vendas geridas são protegidos contra escrita pelo cliente.
A reserva gerida incerta/pendente nunca é cancelada; prepared (nenhum envio) e
terminal seguro podem expirar sob a mesma trava. Staging/evidências são preservados.
O cleanup antigo preserva também reservas legadas com taxa pendente/falha; esses
vínculos não são importados por suposição. Métodos públicos rejeitam cobrar valor
integral de venda manual. Webhook Asaas, consulta, reconciliação e cron convergem
para consulta autoritativa da operação e liberação integral. Readiness valida a
wallet emissora contra /wallets antes das operações Asaas.

Elegibilidade econômica é comum: identidade válida no ambiente em um gateway
suportado preserva direito, ainda que o gateway escolhido não tenha destino técnico.
Ausência comprovada não cria dívida. Uma wallet legada sem identificação do
ambiente não pode ser usada como prova de elegibilidade em Sandbox nem completada
com dados de Produção. Se a consulta ao cadastro for bem-sucedida e não houver
wallet válida específica do ambiente, o beneficiário é ausente nesse ambiente,
conforme PRD 01, sem remover ou alterar a wallet histórica. Falha de consulta
ou múltiplos recebedores elegíveis permanecem sujeitos a revisão.

No marco original de implementação, 67 testes relevantes e 15 cenários
PostgreSQL passaram antes do ajuste final de snapshots (a suíte completa seria
reexecutada ao concluir o conjunto). Naquela etapa, as flags estavam desligadas.

## Etapa 5 — adapter PagBank apenas Sandbox

O adapter usa o token da conta SmartBus da plataforma, referência própria e
idempotency key congelados; envia UM item com SOMENTE a taxa e nenhum valor das
passagens. É Order PIX direto, sem checkout hospedado e sem Connect do vendedor.
Os direitos de terceiros permanecem no ledger para conciliação manual. O Pix da
taxa é exibido no admin; fechar a janela não interrompe recuperação em backend.
Notificações deste propósito usam x-authenticity-token com um único token da
conta da plataforma, corpo original e GET autoritativo; ramo Connect público não
foi alterado. Assinatura inválida permanece 401, sem efeitos financeiros.

9 testes locais passaram (payload, ambiente, moeda, referência ambígua, assinatura
válida/inválida/ausente e body alterado). A documentação instalada descreve este
contrato; reconsulta oficial anterior retornou 403. A conta emissora e o modelo
real desta notificação DIRETA precisam de homologação Sandbox específica: o caso
Connect público não comprova nenhum dos dois. Flags começam desligadas; habilitar
manual_fee_pagbank_sandbox_enabled exige evidência desse novo contexto. A política
de repasse manual está autorizada, porém exige comprovar ausência de liquidação
nativa antes de enviar dinheiro para evitar repasse duplicado. Nenhum token foi
consultado/copied de histórico, nenhum pagamento/envio/credencial foi executado.
Produção PagBank é bloqueada por código e constraints existentes e novas.

## Etapa 6 — gates, evidência e operação do piloto

Base: main `6051424e`. As etapas são cumulativas, todas em Draft contra main:

| Ordem | Draft | Entrega |
|---|---|---|
| 1 | [#772](https://github.com/Reginatto-SI/bus-o-off-off/pull/772) | Autorização e conta da consulta manual Asaas |
| 2 | [#774](https://github.com/Reginatto-SI/bus-o-off-off/pull/774) | Operação privada e criação exclusiva; migration 0003 |
| 3 | [#775](https://github.com/Reginatto-SI/bus-o-off-off/pull/775) | Cadastro e liberação transacionais; migration 0004 |
| 4 | [#776](https://github.com/Reginatto-SI/bus-o-off-off/pull/776) | Confirmação, ledger, reserva e recuperação; migration 0005 |
| 5 | [#777](https://github.com/Reginatto-SI/bus-o-off-off/pull/777) | Adapter PIX PagBank da plataforma, exclusivamente Sandbox |
| 6 | [#778](https://github.com/Reginatto-SI/bus-o-off-off/pull/778) | Validação e proteção final do piloto; migration 0006 |

Revisar/mergear na ordem e atualizar a branch da próxima PR com a main após cada
merge, especialmente se for squash, para retirar mudanças já integradas do diff.
**Não ativar flags ao mergear uma etapa intermediária.** Nenhum merge de PR,
deploy, pagamento, atualização de credenciais ou escrita no banco conectado foi
executado nesta implementação. Não importar histórico sem vínculo comprovado.
Não há migração automática de empresa, gateway ou cobranças antigas.

0006 restringe leitura financeira a gerente da empresa/developer, impede ativação
das flags pelo cliente, congela identidade financeira/comercial da venda e impede
alterar/deletar tickets e staging geridos via cliente. Mesmo um writer backend
não pode descartar staging antes da emissão integral. Mudança do representante
entre cálculo e INSERT provoca rollback, em vez de snapshot divergente. O claim
confere a flag sob trava; desativação impede novos claims, mas não desfaz uma
chamada externa já iniciada. Consulta/recuperação continuam disponíveis.

A taxa mínima pode tornar a comissão absoluta maior que o preço da passagem.
0006 conserva o valor devido e registra a razão sobre bruto no JSON de auditoria;
o campo legado `commission_percent` permanece limitado a 100, compatível com
`numeric(5,2)`/CHECK existentes. Esse campo não determina cobrança ou repasse.
Projeção alternativa de valor divergente é rejeitada; a comissão nova permanece
bloqueada até conciliação. Cenário de passagem R$ 0,01/taxa mínima passou no SQL.

O backend preserva a precedência administrativa existente: preço positivo do tipo,
depois categoria da poltrona, depois preço manual do operador autorizado. Benefícios
são resolvidos no backend; falha na consulta preserva segurança e não inventa
isenção. Adicionais usam o helper público existente e arredondamento por item;
não entram na base da taxa SmartBus. Comprovantes usam preços/regras congelados
retornados pelo backend, incluindo retorno sem valor adicional. A isenção registra
motivo derivado pelo backend. O checkout público mantém seus contratos.

### Arquivos e regras

| Área | Arquivos principais | Regra |
|---|---|---|
| Persistência | `drizzle/migrations/0003*` até `0006*`, journal | Operação única, manifestos, ledger, RLS, gates e retenção |
| Negócio comum | `_shared/manual-fee/{auth,register,decision,beneficiaries,pricing,service,runtime,contracts}.ts` | Autorização, taxa, contexto, prova e finalização |
| Adapters | `_shared/manual-fee/{asaas,pagbank,notification}.ts` | Transporte/conta da plataforma e fatos externos |
| Regras reutilizadas | `_shared/{platform-fee-rules,platform-fee-engine,benefit-price}.ts`, `src/lib/{feeCalculator,benefitEligibility}.ts` | Fórmula/benefício compartilhados; sem mudança normativa |
| Consumidores | As nove funções listadas abaixo | Toda origem converge sem recobrar |
| Admin | `NewSaleModal`, `ManualFeePixDialog`, `Sales`, `platformFeeCheckout` | Reserva administrativa e cobrança somente da taxa |
| Validação | `src/lib/manualFee*.test.ts`, `tests/database/manual-fee.mjs` | Segurança, contratos, concorrência e rollback |

### Evidência local e limites

- PostgreSQL 16 descartável: **33 cenários**, incluindo registro/rollback, claim
  concorrente, retenção, RLS/grants, isenção financeira, ledger/centavos,
  representante divergente e status de pagamento protegido. A venda simulada com
  10 itens de R$ 100 emitiu 10 tickets e registrou taxa de R$ 60.
- Reproduzido **1 ticket físico existente / 2 esperados → 2 / 2**, com duas
  conexões concorrentes, sem duplicação, usando exatamente o resolvedor e os
  triggers físicos BEFORE INSERT/UPDATE do repositório. Staging só foi descartado
  após persistência integral. Reserva física incerta vencida continuou ocupada.
- **25 cenários** da emissão compartilhada anterior reaprovados, incluindo Asaas,
  ida/volta, itens repetidos, sem poltrona, ambiguidade e conflito físico/rollback.
- Suíte Vitest, TypeScript do app, build Vite e Deno dos nove consumidores foram
  executados; resultado final registrado no checkpoint. Build tem aviso de tamanho
  dos bundles, sem falha.

O banco de teste tem tabelas auxiliares sintéticas. Não prova compatibilidade com
todas as constraints, policies, triggers e versões de RPC do Supabase implantado.
Não houve chamada financeira externa, teste com credenciais reais, teste do cron
publicado ou homologação do fluxo manual. A recuperação backend usa o cron existente:
o resultado fornecido pelo responsável indica `*/5 * * * *`, **5 minutos**.
Não foi alterado para um minuto. Fila manual não tem corte de 24 horas e usa lotes
de 20 com rotação por última tentativa; avaliar backlog/duração no piloto.

Para reproduzir localmente: `npm test`, `npx tsc --noEmit -p tsconfig.app.json` e
`npx vite build` (não precisa gerar versão do produto). Os harnesses SQL são
`TICKET_TEST_CONTAINER=smartbus-ticket-test-<nome> node tests/database/manual-fee.mjs`
e `... node tests/database/partial-ticket-issuance.mjs`. Cada harness precisa de
container PostgreSQL 16 **novo e separado**, sem portas publicadas, com readiness
`docker exec <nome> pg_isready -U postgres`; nunca URL do banco do SmartBus.
Criar roles/tabelas é permitido somente nesse banco descartável. Remover o
container de teste após coletar resultados. Deno check deve incluir os nove
entrypoints abaixo e manter verificação TLS, sem usar credenciais do projeto.

No Asaas, somente rejeição explícita de split admite tentativa no mesmo worker sem
split; erro de rede, 5xx e rejeição genérica não permitem outro POST. Mock comprova
o controle, mas antes da ativação comprovar no Sandbox que a rejeição não criou
pagamento. Lookup vazio após timeout nunca autoriza recriação. Dados de split
solicitado não comprovam liquidação: terceiros continuam pendentes até evidência.
No PagBank, Charge cancelada isolada é incerta; não libera reserva. Múltiplas
Charges/QRs exigem revisão. Este adapter não implementa cancelamento/estorno.

### Ordem futura de implantação — exige autorização própria

1. Validar schema completo Sandbox: dados, enums, índices, grants, RLS, proprietários
   das RPCs, triggers físicos/staging, snapshot de representante e definição da
   comissão existente. Confirmar histórico Drizzle e hash de 0002; preparar backup
   e inventário de vendas/cobranças em andamento, sem tokens nos relatórios.
2. Revisar/mergear as seis Drafts em ordem. Se merge disparar deploy automático,
   preparar as migrations antes desse evento ou pausar o automatismo aprovado.
   Nunca publicar consumidores novos sobre banco que não tem suas RPCs/tabelas.
3. Aplicar **arquivos versionados** 0003 → 0004 → 0005 → 0006 pelo runner oficial,
   com controle de histórico/transação e janela para DDL. Não copiar SQL paralelo,
   regenerar schema/snapshots vazios do Drizzle nem reaplicar 0002. Manter flags off.
4. Conferir constraints/índices/RLS e privilégios: RPCs de escrita somente
   service_role; cliente não pode ativar piloto ou escrever prova financeira.
5. Publicar coordenadamente os nove consumidores: `register-manual-sale`,
   `create-platform-fee-checkout`, `verify-payment-status`, `reconcile-sale-payment`,
   `cleanup-expired-locks`, `asaas-webhook`, `pagbank-webhook`, `create-asaas-payment`
   e `create-pagbank-payment`. Depois publicar frontend compatível. Secrets existentes
   são referências por ambiente, não valores persistidos na operação.
6. Validar Asaas Sandbox na conta emissora da plataforma: 10 passagens / R$ 60,
   dois cliques/operadores, fechamento da página, timeout/perda da resposta,
   webhook/consulta repetidos e simultâneos, isenção, rollback, expiração incerta
   e quatro divisões. Provar ledger e liquidação; preservar vendas públicas.
7. Só após esses gates habilitar `manual_fee_flow_enabled` para empresa de piloto
   aprovada, pelo backend administrativo, registrando responsável/data/evidência.
   Primeiro Asaas. **Não habilitar PagBank em Produção.**
8. PagBank manual exige gate separado Sandbox: provar conta emissora/token,
   criação/consulta exclusiva da taxa, assinatura real direta, idempotência e
   recuperação. Depois autorizar `manual_fee_pagbank_sandbox_enabled` para empresa
   Sandbox específica. Não reutilizar a homologação Connect como prova.

Interromper se houver drift de schema/history, acesso client indevido, diferença de
valor/conta/ambiente, cobrança duplicada/incerta sem correlação, emissão incompleta,
divergência de ledger, falta de cron funcional ou regressão pública. Não prosseguir
com as flags apenas porque os testes locais passaram.

### Recuperação e conciliação

- Desativar criação afetada pela flag, mantendo consumidores capazes de consultar
  e finalizar operações congeladas. Preservar IDs, staging, tickets, ledger e logs.
- Operação `confirmed` com emissão falhando: corrigir o impedimento e reexecutar
  consulta/reconciliação da **mesma** operação. Não cobrar novamente. A prova
  externa e o ledger são persistidos antes da transação de emissão.
- `creating`/`indeterminate` sem ID: consultar referência na conta/ambiente congelados.
  Se não houver prova segura de ausência, manter revisão; não resetar estado/chave
  para autorizar POST, não criar outro registro/cobrança por suposição.
- Reserva pendente/incerta vencida permanece ocupada e sem liberação de embarque.
  Somente `prepared` sem criação iniciada ou terminal definitivo consultado aplica
  a política de expiração. Staging/evidências permanecem armazenados.
- Pagamento tardio em venda cancelada: registrar direito financeiro e revisão,
  sem emissão para assento ocupado, cancelamento ou estorno improvisado.
- `pending_reconciliation`: conferir no provedor extratos/IDs de liquidação de cada
  destinatário e histórico de repasses. Não transferir com base apenas em
  `native_requested=false`, payload ou presença de SPLI. Não existe transferência
  automática nova nem UI de liquidação nesta entrega. Registrar comprovante e
  concluir ledger/comissão apenas pelo procedimento financeiro aprovado.
- Recuperar por correção adiante. Voltar código somente se compatível com operações
  novas. Não restaurar índices antigos, apagar passagens, reverter pagamentos ou
  remover migrations/dados; backup não cobre efeitos externos posteriores.

Históricos sem operação privada continuam no caminho compatível legado. Consultas
de taxa Asaas conhecida usam a conta da plataforma no ambiente da venda, mesmo
quando a venda está marcada PagBank. As garantias novas de cadastro/claim/ledger
valem para operações privadas do piloto; **não declarar saneado todo o legado**.

Não repetir OAuth, troca de conexão, GET Split/Charge, PIX/cartão básicos ou
diagnóstico público do 401. A nova conta/contexto manual é homologação independente;
produção PagBank continua bloqueada.

## Correção da ordem de locks — validação antes dos merges (2026-10-12)

O bloqueio de concorrência encontrado na revisão final foi corrigido em 0005 e
0006: `guard_managed_manual_sale` retorna antes do advisory lock quando não existe
operação privada. Para vendas geridas, mantém a trava e lê o estado financeiro
depois dela. Não modifica o contrato de emissão 0002 ou o checkout público.

O teste `tests/database/manual-fee-lock-order.mjs`, executado após a fixture manual,
reproduz a falha anterior e controla a concorrência por conexões reais/barreiras
de lock, sem depender de coincidência de timing. **12 cenários aprovados** no
conjunto final, incluindo as duas falhas antigas esperadas; **33 cenários** da
fixture manual reaprovados. Também validada 0005 isoladamente na etapa #776
(fixture de 15 cenários e 6 direcionados). Não houve repetição da suíte de app.

#776, #777 e #778 foram atualizadas preservando a cadeia cumulativa; as três
primeiras Drafts permanecem iguais. 0002/snapshot/journal e as demais regras são
preservados. Nenhuma migration adicional, merge de PR ou implantação foi executado.
**APROVADO PARA INICIAR OS MERGES**, observando a sequência e os gates operacionais
acima: nenhuma publicação parcial sobre banco sem os novos contratos, flags off,
validação do banco conectado e publicação coordenada antes do piloto autorizado.
PagBank em Produção permanece bloqueado.
