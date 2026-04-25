# Análise 71 — Pix em produção: divergência entre readiness no admin e bloqueio no checkout

## 1. Resumo executivo

### O que está acontecendo
Há uma divergência real entre **sinal de prontidão Pix** e **capacidade real de cobrar Pix**:

- no admin, a integração aparece conectada e com indicação de “Pix pronto”;
- no checkout/fluxo de cobrança, a operação pode ser bloqueada por indisponibilidade de chave Pix (inclusive com a mensagem do Asaas: “Não há nenhuma chave Pix disponível para receber cobranças.”).

### Por que é grave
É grave porque impacta diretamente conversão em produção: o sistema pode permitir o avanço da jornada com expectativa de Pix funcional e falhar na etapa crítica de venda.

### Bloqueia venda em produção?
Sim, pode bloquear a venda por Pix em produção (o comprador só consegue concluir se trocar método para cartão, quando disponível).

### Hipótese principal
A principal hipótese confirmada por código é **falso positivo de readiness Pix** + **uso de snapshot persistido (stale)** em vez de validação online na hora da cobrança.

### Causa raiz confirmada/mais provável
**Mais provável com evidência forte em código (causa composta):**

1. `pix_ready` pode virar `true` por critério permissivo na leitura de status de chave Pix (função considera quase todo status como operacional, excluindo apenas alguns valores).  
2. o checkout/edge de cobrança não revalida chaves Pix em tempo real; ele confia no flag persistido `asaas_pix_ready_*`.  
3. se houver mudança de estado no Asaas após o último sync (ou classificação permissiva indevida), o sistema mantém `pix_ready: true` localmente e a cobrança `PIX` falha no `/payments`.

Em paralelo, o badge **“Conectado”** no admin é deliberadamente calculado por API Key (conexão operacional), não por readiness Pix; isso amplifica a percepção de “está tudo pronto”.

---

## 2. Fluxo real mapeado

### 2.1 Admin / diagnóstico

#### Status visual “Conectado”
- O snapshot do admin (`getAsaasIntegrationSnapshot`) marca `connected` quando existe **API key** no ambiente ativo.
- `wallet`, `account_id` e `onboarding` não são requisitos para `connected`.

Resultado: o status “Conectado” representa **conectividade da credencial**, não garantia de Pix vendável.

#### Readiness Pix no admin
- O admin exibe `Readiness Pix` com base no campo persistido da empresa (`asaas_pix_ready_production/sandbox`) e, se houver, no retorno da última verificação dedicada (`lastAsaasCheck`).
- O texto do card em estado conectado também afirma “pronta para receber pagamentos via Pix e Cartão”, o que pode conflitar com `pixReadyEffective=false` (mensagem mista no mesmo bloco).

#### Ferramentas de diagnóstico usadas na UI
- Botão principal “Verificar integração” usa a edge function dedicada `check-asaas-integration`.
- Painel developer “Testar conexão” ainda chama `create-asaas-account` em modo `revalidate`.

Ambos os fluxos atualizam readiness via consulta/tentativa em `/pix/addressKeys`.

### 2.2 Checkout Pix

- Checkout carrega `asaas_pix_ready_production/sandbox` da empresa.
- Calcula `isPixReadyForCurrentEnvironment` pelo ambiente em runtime.
- Se `false`, desabilita seleção de Pix e força cartão.
- Se `true`, tenta criar cobrança via edge `create-asaas-payment` com `payment_method: pix`.

### 2.3 Edge de criação de cobrança

- `create-asaas-payment` resolve ambiente da venda (com `payment_environment` explícito e persistido na sale).
- Para `billingType=PIX`, primeiro verifica apenas `company.asaas_pix_ready_<env> === true`.
- Se true, envia `POST /payments` no Asaas com `billingType: PIX`.
- Se Asaas rejeitar, a função propaga `errors[0].description` ao frontend.

### 2.4 Integração externa (Asaas)

- Readiness: consulta/tentativa em `GET/POST /pix/addressKeys` (helper `ensurePixReadiness`).
- Cobrança Pix: `POST /payments` com `billingType: PIX`.
- Os dois usam mesma base URL por ambiente e API key da empresa no ambiente resolvido.

### 2.5 Banco / configuração da empresa

Campos centrais:
- `asaas_api_key_production/sandbox`
- `asaas_wallet_id_production/sandbox`
- `asaas_account_id_production/sandbox`
- `asaas_onboarding_complete_production/sandbox`
- `asaas_pix_ready_production/sandbox`
- `asaas_pix_last_checked_at_production/sandbox`
- `asaas_pix_last_error_production/sandbox`

A cobrança usa o `pix_ready` persistido, não um check online no momento da venda.

---

## 3. Evidências técnicas

## 3.1 Onde o sistema diz “conectado”
- `src/lib/asaasIntegrationStatus.ts`
  - `hasOperationalConnection(...)` retorna `Boolean(config.apiKey)`.
  - `status='connected'` quando `currentIsConnected` (API key presente).

## 3.2 Onde `pix_ready` é calculado
- `supabase/functions/_shared/asaas-pix-readiness.ts`
  - `ensurePixReadiness(...)` consulta `/pix/addressKeys`, tenta criar EVP e reconsulta.
  - `isPixKeyOperational(status)` é permissivo: se status não string, retorna `true`; se string, só reprova `DELETED/REMOVED/INACTIVE/DISABLED`.

Ponto crítico: esse filtro pode classificar como “operacional” status não explicitamente tratados como aptos para cobrança.

## 3.3 Onde admin exibe readiness
- `src/pages/admin/Company.tsx`
  - `pixReadyEffective = pixReadyFromCheck ?? persistedPixReady`.
  - Mostra “Readiness Pix: Pix pronto / pendente”.
  - No estado conectado, também exibe texto geral “pronta para receber pagamentos via Pix e Cartão”, que pode criar falsa segurança operacional.

## 3.4 Onde checkout bloqueia / libera Pix
- `src/pages/public/Checkout.tsx`
  - carrega `asaas_pix_ready_production/sandbox` da empresa;
  - define `isPixReadyForCurrentEnvironment`;
  - se `false`, desabilita opção Pix e força cartão;
  - submit também bloqueia Pix quando readiness local está false.

## 3.5 Onde a mensagem “Não há nenhuma chave Pix disponível...” entra
- `supabase/functions/create-asaas-payment/index.ts`
  - envia `POST /payments` com `billingType: PIX`;
  - em erro do Asaas, retorna `paymentData?.errors?.[0]?.description` para o frontend.

Logo, a mensagem vem do **retorno real do Asaas na criação da cobrança**, não de string fixa local.

## 3.6 `account_id` nulo e integração saudável
- `check-asaas-integration` trata ausência de `account_id` local como **non-blocking** (metadado), registrando log mas sem invalidar operação se API key + wallet estiverem válidas.
- `create-asaas-account` em `revalidate` pode retornar `account_id: null` e ainda sucesso, desde que validação principal passe.

Conclusão: `account_id` nulo não é usado como bloqueador operacional de cobrança Pix.

---

## 4. Comparativo de critérios

| Etapa | Critério usado | Resultado esperado | Inconsistência potencial | Impacto |
|---|---|---|---|---|
| Status “Conectado” (admin) | API key presente no ambiente | Mostrar conexão ativa | Não garante chave Pix operacional | Falso senso de prontidão |
| Readiness Pix (diagnóstico) | `ensurePixReadiness` em `/pix/addressKeys` com filtro permissivo de status + persistência local | `pix_ready` refletir aptidão real | Pode marcar `true` com status não estritamente validado ou ficar stale | Divergência com cobrança real |
| Checkout (UI) | `asaas_pix_ready_<env>` persistido | Habilitar/desabilitar Pix | Usa snapshot local, não consulta online no submit | Pode liberar Pix mesmo desatualizado |
| Criação de cobrança | `POST /payments` com `billingType=PIX` | Cobrança criada | Asaas rejeita por ausência de chave apta | Bloqueio de venda no fim do funil |

---

## 5. Causa raiz

## 5.1 Causa raiz principal (mais provável)
**Divergência entre “readiness persistido” e “elegibilidade real no Asaas no momento da cobrança”.**

Tecnicamente:
- readiness é calculado em momento anterior e persistido;
- criação da cobrança depende do estado real atual da conta no gateway;
- não há revalidação online obrigatória no `create-asaas-payment` antes de chamar `/payments`.

## 5.2 Causa contribuinte de regra
**Classificação permissiva de chave “operacional” no helper de readiness** (`isPixKeyOperational`).

Só quatro estados são bloqueados explicitamente; demais estados acabam tratados como aptos.

## 5.3 Causa contribuinte de UX/observabilidade
- badge “Conectado” significa conectividade de API key, mas a percepção visual pode ser “Pix vendável”.
- texto “pronta para receber pagamentos via Pix e Cartão” no card conectado é mais forte que a semântica real.

## 5.4 Sobre ambiente/configuração
Não foi identificada evidência de divergência estrutural de ambiente entre diagnóstico e cobrança no código auditado:
- ambas as rotas usam ambiente resolvido e API key por ambiente.
- risco residual existe se edge de runtime cair em fallback por hostname no frontend, mas a criação da cobrança recebe `payment_environment` explícito e persiste na sale.

---

## 6. Correção mínima recomendada

> Sem refatoração ampla. Sem fluxo paralelo novo. Mudança pontual e reversível.

1. **Endurecer o critério de readiness Pix** em `ensurePixReadiness`:
   - trocar lógica “nega-lista” (somente alguns status inválidos) por “allow-list” explícita de status aceitos como chave apta para cobrança;
   - se status desconhecido, tratar como não pronto + log técnico.

2. **Sincronizar mensagem operacional do admin**:
   - manter badge “Conectado” (conectividade), mas ajustar frase do card para não afirmar prontidão Pix sem condicionar ao `pixReadyEffective`.

3. **Observabilidade mínima na cobrança**:
   - quando Asaas devolver erro de chave Pix ausente em `/payments`, registrar incidente técnico com contexto (`company_id`, ambiente, `asaas_pix_ready` persistido, payload resumido de erro) para acelerar suporte.

4. **Opcional e mínima proteção adicional (sem novo fluxo):**
   - no `create-asaas-payment`, em tentativa PIX com `pix_ready=true`, permitir um recheck rápido de `/pix/addressKeys` apenas para confirmar e reduzir stale crítico (feature-flagável). Se não confirmado, devolver erro claro antes de tentar `/payments`.

---

## 7. Riscos

- **Falso positivo de “Pix pronto”**: admin indica pronto, mas cobrança falha.
- **Perda de venda**: comprador abandona ao falhar no fim da jornada.
- **Suporte confuso**: diagnóstico mostra sucesso parcial/desalinhado com erro em checkout.
- **Divergência entre telas**: card conectado vs indisponibilidade no checkout.
- **Risco de produção**: incidente recorrente enquanto readiness depender de flag potencialmente stale/permissivo.

---

## 8. Checklist de validação (pós-correção)

### Admin
- [ ] Empresa em produção com API key válida e sem chave Pix apta: card não deve sugerir “Pix pronto”.
- [ ] `Readiness Pix` deve ficar pendente com motivo explícito.
- [ ] Botão “Verificar integração” deve registrar e exibir causa detalhada.

### Checkout
- [ ] Em `pix_ready=false`, Pix desabilitado e mensagem consistente.
- [ ] Em `pix_ready=true`, permitir seleção Pix.
- [ ] Se conta ficar sem chave entre check e compra, erro deve ser específico e auditável.

### Criação da cobrança
- [ ] `POST /payments` com PIX só quando readiness estiver coerente.
- [ ] Em falha Asaas de chave Pix, log operacional deve incluir ambiente/empresa e flag local na hora.

### Logs
- [ ] Logs devem indicar etapa (`readiness_check` vs `payment_create`), ambiente e fonte do erro.
- [ ] Deve existir trilha para comparar “readiness local no momento” x “resposta real do Asaas”.

### Produção e sandbox
- [ ] Mesmo comportamento em ambos ambientes (sem fluxo duplicado).
- [ ] Sem inferência por URL como fonte principal de decisão de cobrança.

---

## Resposta direta ao ponto crítico

**Como o sistema consegue afirmar `pix_ready: true` e ao mesmo tempo bloquear venda por ausência de chave Pix?**

Porque hoje são dois momentos/portas diferentes:

1. o sistema persiste `pix_ready` a partir de uma checagem anterior (`/pix/addressKeys`) com critério permissivo e sujeito a desatualização;
2. depois, na venda real, o Asaas valida novamente no `POST /payments` e pode rejeitar `PIX` se não houver chave realmente apta naquele instante.

Ou seja: o `pix_ready` local pode virar (ou permanecer) `true` sem refletir exatamente a elegibilidade real no gateway no momento da cobrança.
