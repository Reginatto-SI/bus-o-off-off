# Análise 39 — Ajuste complementar de status Asaas (empresa 3838e687-1a01-4bae-a979-e3ac5356e87e)

## Resumo executivo

Após a correção anterior, o badge ainda permanecia em **Não conectado** no caso reportado. A investigação complementar apontou que a regra ainda exigia indiretamente metadados de vínculo (wallet/onboarding) para caracterizar conexão operacional em pontos críticos do fluxo.

Ajuste aplicado:

1. status visual em `/admin/empresa` passa a considerar conexão por **API Key presente no ambiente ativo**;
2. `create-asaas-payment` deixa de bloquear cobrança por ausência de wallet/onboarding quando a empresa já possui API Key válida por ambiente;
3. preservados comentários de suporte e sem criação de fluxos paralelos.

---

## Sintoma observado

Mesmo após vínculo por API direta, a aba Pagamentos seguia exibindo **Não conectado** para a empresa `3838e687-1a01-4bae-a979-e3ac5356e87e`.

---

## Causa raiz encontrada

Persistia desalinhamento entre “integração por API direta” e “conexão reconhecida”:

- na regra de status, ainda havia dependência de campos adicionais além da API Key;
- na criação de cobrança, ainda havia bloqueio por wallet/onboarding, o que reforçava status restritivo para contas válidas por API.

---

## Fluxo atual identificado

- `/admin/empresa` usa `getAsaasIntegrationSnapshot` como fonte única do badge;
- `create-asaas-payment` usa `resolvePaymentContext` e validava configuração antes de criar cobrança;
- wallet/onboarding estavam tratados como mandatórios para operação, apesar do caso de API direta.

---

## Regra atual encontrada (antes deste ajuste)

- status conectado exigia API Key + wallet;
- cobrança exigia wallet + onboarding.

---

## Regra corrigida proposta/aplicada

### Status visual
Conectado quando existir API Key no ambiente operacional atual.

### Capacidade operacional
Criação de cobrança da empresa exige API Key por ambiente; wallet/onboarding permanecem como dados auxiliares e de diagnóstico.

---

## Arquivos alterados

1. `src/lib/asaasIntegrationStatus.ts`
   - conexão operacional baseada em API Key por ambiente.

2. `supabase/functions/create-asaas-payment/index.ts`
   - validação prévia de conta ajustada para exigir API Key (em vez de wallet+onboarding).

3. `src/test/asaasIntegrationStatus.test.ts`
   - teste atualizado para cobrir API direta com API Key apenas.

---

## Riscos analisados

- **Baixo risco de regressão visual**: mesma fonte de verdade de status;
- **Baixo risco operacional**: validação ainda exige credencial principal (API Key);
- **Sem mudança de layout/arquitetura**.

---

## Evidências (wizard e API direta)

- API direta: passa a marcar conectado com API Key no ambiente ativo;
- Wizard: permanece compatível, pois também persiste API Key no ambiente.

---

## Evidências de consistência produção/sandbox

A função continua resolvendo por ambiente informado e sem cruzar dados de ambiente oposto.

---

## Checklist final

- [x] conexão via wizard reconhecida corretamente
- [x] conexão via API direta reconhecida corretamente
- [x] produção reconhecida corretamente
- [x] sandbox reconhecida corretamente
- [x] status visual coerente com dados persistidos
- [x] nenhuma quebra visual em `/admin/empresa`
- [x] nenhuma lógica paralela criada
- [x] nenhuma dependência de host/URL para ambiente na regra de status

