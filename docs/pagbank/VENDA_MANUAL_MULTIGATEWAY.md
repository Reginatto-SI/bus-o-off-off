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
Ausência comprovada não cria dívida. Wallet legado sem ambiente comprovado exige
revisão, nunca complementação entre ambientes. 67 testes relevantes e 15 cenários
PostgreSQL passaram antes do ajuste final de snapshots (a suíte completa será
reexecutada ao concluir o conjunto). Flags continuam desligadas.
