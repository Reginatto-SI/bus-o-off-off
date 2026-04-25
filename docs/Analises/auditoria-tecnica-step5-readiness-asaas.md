# Auditoria Técnica Completa — Fluxo de Pagamentos Asaas (Smartbus BR)

## 1) Diagnóstico geral

**Estado atual:** arquitetura em maturidade intermediária/avançada, com ganhos reais de centralização (resolver único), separação por ambiente no modelo de dados e persistência de `payment_environment` como fonte de verdade do ciclo.

**Conclusão de maturidade:** boa base para hardening, mas **ainda não pronta para Step 5** por riscos remanescentes que podem afetar segurança de webhook, previsibilidade de verify e consistência multi-tenant no snapshot financeiro.

---

## 2) Pontos fortes

- **Resolvedor central efetivo para decisões principais** (ambiente, owner, credencial, split policy), reduzindo drift entre funções.
- **Persistência explícita do ambiente na venda** após criação da cobrança, permitindo que verify/webhook/plataforma usem o mesmo contexto.
- **Sandbox espelhando produção no fluxo principal**: owner `company` + split habilitado em ambos os ambientes.
- **Modelo de dados preparado por ambiente** em `companies` e `partners`.
- **Observabilidade/logs operacionais** razoavelmente consistentes no fluxo.

---

## 3) Riscos identificados

### R1) Fallback legado de credencial no verify ainda permite contexto financeiro ambíguo
`verify-payment-status` mantém `allowLegacyVerifyFallback: true`, permitindo cair para credencial da plataforma quando API key da empresa estiver ausente no ambiente. Isso pode mascarar problema de onboarding/configuração e gerar comportamento imprevisível entre empresas antigas e novas.

### R2) Webhook ainda aceita dual-token em cenário não determinístico
Quando o ambiente não é resolvido por venda/host, o resolver monta candidatos com os dois tokens (prod + sandbox). Isso amplia superfície de aceitação indevida (evento com token de ambiente incorreto em fluxo indeterminado).

### R3) Validação de token do webhook é condicional (fail-open se sem token)
No webhook, a rejeição ocorre só quando `hasAnyToken && !tokenValid`. Se os tokens não estiverem configurados no runtime, o processamento segue sem validação efetiva de assinatura.

### R4) Cálculo financeiro pós-confirmação consulta parceiro sem filtro por empresa
Tanto em `verify-payment-status` quanto no `upsertFinancialSnapshot` do webhook, a busca de parceiro ativo não filtra `company_id`. Isso pode aplicar wallet/split de sócio de outra empresa no snapshot financeiro.

### R5) Decisão inicial de ambiente ainda depende de host/origin/referer
A decisão inicial do `create-asaas-payment` continua baseada em host da requisição. É funcional para o contrato atual, mas ainda é um gatilho com potencial de erro operacional (headers inesperados/proxy/domínio alternativo), já reconhecido como zona cinzenta.

---

## 4) Inconsistências ou complexidade desnecessária

- **Duplicação menor de log no verify** (`payment_context_loaded` chamado duas vezes com payloads diferentes), sem ganho funcional.
- **Fallbacks legados simultâneos** (verify + dual-token webhook + campos legados de API/wallet) mantêm complexidade operacional acima do ideal para hardening final.
- **Critérios de prontidão parcialmente explícitos**: create valida wallet/onboarding e API key; verify/webhook priorizam continuidade e podem "deixar passar" configurações incompletas sem erro explícito.

---

## 5) Avaliação do sandbox espelho

**Quase equivalente à produção no fluxo principal**:
- owner em sandbox está como `company`;
- split ativo também em sandbox;
- resolve wallet de parceiro por ambiente;
- base URL e secrets mudam por ambiente.

**Divergências relevantes ainda existentes**:
- verify em sandbox pode usar fallback de plataforma (não paritário com o contrato final desejado);
- webhook pode aceitar dual-token/fallback quando ambiente não é resolvido com precisão;
- snapshot financeiro pode usar parceiro de outra empresa (impacta consistência, inclusive em sandbox).

---

## 6) Avaliação de readiness para Step 5

## ⚠️ Ainda precisa de ajustes antes do Step 5

**Por quê:** ainda há risco de aceitação indevida de webhook, fallback de credencial que mascara configuração e inconsistência multi-tenant no snapshot financeiro (consulta de parceiro sem `company_id`). Esses pontos afetam previsibilidade e risco financeiro real.

---

## 7) Recomendações objetivas (pré-Step 5)

1. **Remover/fechar fallback de verify por feature-flag controlada**, migrando para erro explícito quando API key da empresa do ambiente estiver ausente.
2. **Eliminar dual-token do webhook** após validar cobertura de `payment_environment` em todas as vendas ativas e garantir resolução determinística por `externalReference`.
3. **Tornar validação de token fail-closed** no webhook: sem token configurado => rejeitar (não processar).
4. **Corrigir consultas de parceiro com filtro `company_id`** em verify e webhook (`upsertFinancialSnapshot`) para impedir mistura entre tenants.
5. **Revisar ponto único de decisão inicial por host** (contrato operacional/infra): garantir que apenas domínios esperados chegam com headers coerentes.
6. **Limpar ruído de observabilidade** (log duplicado no verify) para facilitar auditoria e troubleshooting.

---

## 8) Conclusão final

**Não avance ainda — corrigir X, Y, Z primeiro.**

Onde:
- **X:** fallback de credencial no verify;
- **Y:** dual-token + validação condicional do webhook;
- **Z:** consulta de parceiro sem escopo de empresa no snapshot financeiro.
