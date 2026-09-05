# PagBank no SmartBus — checkpoint atual

> Branch oficial: `feature/pagbank-integration`.

## Estado operacional — 2026-09-05

- Primeiro PR funcional de caracterização Asaas concluído em
  [`ASAAS_CHARACTERIZATION_BASELINE.md`](./ASAAS_CHARACTERIZATION_BASELINE.md):
  motor/split, centavos e resíduo, snapshot multi-item, precedência de ambiente,
  isolamento de credenciais e token de webhook estão cobertos em helpers.
- A baseline final está verde; a execução inicial expôs duas expectativas antigas
  e contraditórias de readiness Asaas, alinhadas nos testes ao contrato atual de
  API key + wallet. Create/webhook/verify/finalização concorrente e isolamento
  tenant ponta a ponta continuam parciais ou bloqueados pelos handlers Deno
  monolíticos.
- Auditoria arquitetural do código atual concluída em
  [`PAGBANK_ARCHITECTURE_AND_SEAMS.md`](./PAGBANK_ARCHITECTURE_AND_SEAMS.md).
- Implementação funcional do PagBank ainda não iniciada; nenhum código de produção,
  migration, RLS, Edge Function, credencial ou comportamento Asaas foi alterado.
- Direção preservada: integração direta oficial pela API Order, PIX e cartão,
  coexistindo com Asaas e sem migração/fallback automático.
- **Payment Link e checkout hospedado não fazem parte do escopo.**

## Seams principais

1. fazer backfill explícito de empresas/vendas existentes como Asaas e congelar
   `company_id`, gateway, ambiente, identidade lógica não secreta da integração e
   conta/recebedor externo desde a criação de cada nova venda/reserva, antes da
   chamada externa — nunca uma versão do secret;
2. dispatcher backend mínimo para criar PIX/cartão, consultar, interpretar webhook
   e expor cancelamento/refund somente quando suportados e aprovados;
3. adapters traduzem provedor, mas motor financeiro, snapshot, reserva,
   `finalizeConfirmedPayment`, tickets, ledger e logs permanecem comuns;
4. tentativas, IDs externos, idempotência e dedup evoluem de forma aditiva.

Após criar a venda, create/retry/consulta/webhook/reconciliação/cancelamento e
diagnóstico usam exclusivamente seus snapshots e resolvem a credencial válida
atual da mesma identidade lógica. Timeout, mudança da empresa, domínio ou request
posterior não podem trocar gateway/ambiente/conta/configuração lógica. Após
o backfill, snapshot ausente falha fechado e gera diagnóstico, sem inferência ou
tentativa em outro provedor.

Access token, refresh token, API key, webhook token, chave criptográfica e demais
secrets podem expirar, ser renovados, rotacionados, revogados ou substituídos sem
alterar a identidade da venda. Reconexão a outra conta externa cria nova identidade
lógica para vendas futuras; vendas antigas preservam a anterior. Credencial
histórica irrecuperável falha fechada, registra diagnóstico e exige ação
operacional, sem usar outra empresa, conta, configuração ou provedor como fallback.
Rotação válida dentro da mesma identidade não deve impedir consulta ou
reconciliação de vendas antigas.

## Ambiente e domínio

O caminho financeiro principal já usa `sales.payment_environment` →
`companies.payment_environment` → request explícito e falha sem contexto; hostname
não decide cobrança. Persiste fallback legado em `runtime-env.ts`,
`get-runtime-payment-environment` e onboarding Asaas sem `target_environment`: só
os domínios `smartbusbr.com.br` são reconhecidos como produção, enquanto
`smartbus.com.br` cairia em sandbox. Não corrigido nesta auditoria e proibido como
contrato PagBank. Domínio continua válido para callback, redirect, webhook, CORS,
URLs públicas e OAuth.

## Divergências e bloqueios reais

- A Skill oficial atual registra até 15 recebedores PagBank; portanto o limite
  numérico de quatro deixou de ser gap documental, mas os quatro cenários, conta,
  primário, tarifas e liquidação ainda exigem homologação.
- A constraint de origem do ambiente nos logs não inclui `company`, embora o
  resolvedor conceitualmente possa escolher empresa; caracterizar antes de
  generalizar logs.
- Antes do primeiro código funcional: criar testes de caracterização Asaas,
  confirmar Sandbox Order/Connect/split, aprovar armazenamento seguro OAuth e o
  desenho aditivo; fazer backfill explícito de existentes como Asaas e definir a
  transição de default técnico temporário para escolha explícita em novas empresas.
- PagBank só será recomendado/destacado para novas empresas depois de homologado e
  habilitado. Enquanto estiver indisponível, Asaas pode ser a única escolha, desde
  que seja registrada explicitamente; ausência nunca infere gateway.
- Produção permanece bloqueada por homologação de split/PIX/cartão/3DS,
  idempotência/webhook multiempresa, contrato/tarifas/LGPD, refund/chargeback,
  piloto, reconciliação, observabilidade e regressão integral Asaas.

## Próximo passo recomendado

Próximo PR permitido: seam mínimo e aditivo de testabilidade da finalização, com
porta estreita de persistência/efeitos para caracterizar concorrência, ticket,
ledger e locks sem alterar o comportamento Asaas. Somente depois dessa proteção,
avaliar schema aditivo e seam que inicialmente encaminhe o Asaas sem mudança
funcional.

## Histórico resumido

- **2026-09-01:** iniciativa/branch/Skills; decisões multigateway; Payment Link e
  checkout hospedado retirados do escopo; auditoria PB Integrações.
- **2026-09-02:** PagBank oficial direto recomendado; Order selecionado; avanço
  permitido com restrições, produção mantida bloqueada.
- **2026-09-05:** auditoria arquitetural completa; seams mínimos, ambiente/domínio,
  evolução aditiva, caracterização e gates documentados.
- **2026-09-05:** baseline Asaas executável concluída; 205 testes verdes e lacunas
  de Edge/finalização concorrente registradas sem alterar produção.
