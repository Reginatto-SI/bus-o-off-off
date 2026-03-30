# Análise de viabilidade — expansão do card “Diagnóstico Asaas (developer)” para diagnóstico operacional completo do Pix

## 1. Situação atual do card

### O que já mostra hoje
O card atual em `/admin/empresa` já entrega um diagnóstico técnico inicial útil para suporte, com:

- **Contexto básico de ambiente e integração**: ambiente operacional, source do ambiente, status (`connected`/etc.), `companyId`, `onboardingComplete`, `walletId`, `accountId` e indicador de API key (`***set***`).
- **Ações operacionais já existentes**:
  - `Testar conexão` (usa `create-asaas-account` em modo `revalidate`)
  - `Reconfigurar webhook` (usa `create-asaas-account` em modo `ensure_webhook`)
  - `Copiar diagnóstico`
- **Rastro de execução por passos** (timeline com sucesso/erro)
- **Resposta técnica bruta (JSON)** no próprio card.

### O que ainda falta para diagnóstico Pix real
Mesmo com os campos atuais, o card **não responde de forma auditável e direta** à pergunta “Pix está operacional neste ambiente?” porque ainda não exibe explicitamente:

1. **Contagem operacional de chaves Pix** (total, ativas, status agregados, tipos).
2. **Comparativo lado a lado** entre readiness persistido local e estado consultado no gateway no mesmo bloco visual.
3. **Fingerprint seguro da credencial** (hoje há só `***set***`).
4. **Status cadastral detalhado da conta no Asaas** (substatus comercial/banco/documentação/geral).
5. **Conclusão humana final padronizada** por cenário operacional (sem chave `ACTIVE`, conta pendente, erro de consulta, divergência local x gateway).

---

## 2. Lacunas de diagnóstico

### Respostas operacionais que hoje não aparecem claramente

- **Qual conta exatamente foi consultada no gateway?**
  - Existe `accountId`/`walletId` local e resultado do check, mas sem bloco consolidado de identidade/fingerprint da credencial.
- **Há chave Pix `ACTIVE` agora?**
  - O backend calcula readiness, porém o card não mostra a composição do resultado (quantidade total, quantidade `ACTIVE`, status encontrados, tipos encontrados).
- **A conta está apta para Pix por status cadastral do Asaas?**
  - Hoje não há exibição de substatus de conta no diagnóstico admin.
- **Existe divergência entre estado local e gateway?**
  - Há dados para inferir, mas falta um painel explícito “local x gateway” com motivo de divergência.

### Por que isso atrapalha suporte/debug

- O suporte fica dependente de leitura de JSON bruto e interpretação manual.
- A investigação de incidentes de Pix (ex.: “conectado mas sem chave ativa”) não fica imediata no card.
- Sem fingerprint e sem bloco de identidade de consulta, aumenta risco de confusão de credencial/ambiente durante troubleshooting.

---

## 3. Viabilidade técnica

### Dados que já existem e podem ser reaproveitados

1. **Frontend/Admin já possui estrutura de card diagnóstico com ações e trace**, então a evolução pode ser incremental no componente existente.
2. **`check-asaas-integration` já faz validação de integração e readiness Pix** e já retorna detalhes operacionais (`pix_ready`, `pix_readiness_action`, `pix_last_error`, etc.).
3. **Persistência local de readiness por ambiente já existe** em `companies`:
   - `asaas_pix_ready_{env}`
   - `asaas_pix_last_checked_at_{env}`
   - `asaas_pix_last_error_{env}`.
4. **Comparação local x runtime já existe parcialmente** em `/admin/empresa` (`persistedPixReady` vs `pixReadyFromCheck`).

### Dados que precisariam de nova consulta (ou expansão de payload)

Para atingir o diagnóstico completo solicitado, é viável expandir o endpoint dedicado de check para incluir:

- `GET /v3/pix/addressKeys?status=ACTIVE` (contagem objetiva de ativas)
- `GET /v3/pix/addressKeys` (total + distribuição de status/tipos)
- `GET /v3/myAccount/status/` (status e substatus cadastral)
- `GET /v3/wallets/` (auditoria de wallet/conta consultada)

**Observação importante de consistência:** hoje o fluxo de readiness compartilhado consulta `/pix/addressKeys` e, dependendo do parâmetro, pode tentar criação automática de EVP. Para o card de diagnóstico proposto, a recomendação é **modo estritamente leitura** (sem autocorreção).

### O que deve continuar como leitura apenas

Para aderir às diretrizes desta tarefa:

- Não criar chave Pix automaticamente no diagnóstico.
- Não corrigir conta/status automaticamente.
- Não alterar onboarding nem checkout.
- Não tocar fluxo de cartão.

---

## 4. Proposta mínima recomendada

### Blocos/campos a adicionar no card (sem nova tela)

#### A) Contexto da credencial e ambiente (compacto)
- Ambiente efetivo
- Source do ambiente
- `companyId`
- `accountId` e `walletId` consultados
- **Fingerprint seguro da API key** (ex.: prefixo + hash curto, sem segredo)

#### B) Estado operacional da conta Asaas
- Status da conta
- Onboarding completo (local)
- Apta para Pix: sim/não
- Motivo objetivo
- Substatus cadastral quando disponível: comercial, banco, documentação, geral

#### C) Diagnóstico de chaves Pix
- Quantidade total de chaves
- Quantidade `ACTIVE`
- Status encontrados (resumo)
- Tipos de chave encontrados
- Última checagem
- Último erro Pix

#### D) Conclusão operacional final (mensagem humana única)
Padronizar para um dos resultados:
- Pix operacional neste ambiente
- Pix indisponível: sem chave ACTIVE
- Pix indisponível: conta pendente
- Pix indisponível: erro ao consultar Asaas
- Pix indisponível: divergência entre estado local e gateway

#### E) Ações úteis (mínimas)
- **Verificar Pix agora** (check dedicado, leitura)
- **Copiar diagnóstico Pix** (payload resumido + técnico)
- **Accordion JSON técnico** (já existe padrão no card; manter)

### Como manter interface enxuta

- Manter card colapsável atual.
- Mostrar visão executiva em 3 blocos curtos (Contexto, Pix, Conclusão).
- Deixar payload técnico no accordion.
- Evitar nova tela e evitar dashboard paralelo.

---

## 5. Riscos

1. **Poluição visual**
   - Mitigar com blocos compactos, labels curtos e detalhes avançados no accordion.

2. **Duplicação de lógica**
   - Mitigar centralizando cálculo de diagnóstico Pix no endpoint dedicado (`check-asaas-integration`) e apenas renderizando no card.

3. **Inconsistência por estratégia de consulta inadequada**
   - Mitigar com contrato único de resposta de diagnóstico (payload explícito para local x gateway).
   - Separar claramente campos persistidos (local) de campos consultados em tempo real (gateway).

4. **Risco de comportamento não-desejado**
   - Evitar ações de escrita/auto-correção no botão de diagnóstico (somente leitura).

---

## 6. Recomendação final

## Vale implementar?
**Sim, vale implementar.** A evolução é de alta utilidade operacional e pode ser feita com **mudança mínima e segura**, reaproveitando card e endpoint já existentes, sem tocar checkout/cartão.

## Menor abordagem segura
1. **Expandir o payload do `check-asaas-integration`** para retornar diagnóstico Pix operacional completo (incluindo local x gateway e substatus cadastral).
2. **Ajustar apenas o `AsaasDiagnosticPanel`** para renderizar os novos campos em blocos compactos + conclusão final padronizada.
3. **Manter tudo em modo leitura**, sem criação automática de chave e sem alteração de fluxo transacional.

## Arquivos provavelmente afetados (quando for implementar)

- `src/components/admin/AsaasDiagnosticPanel.tsx`
- `src/pages/admin/Company.tsx` (tipagem/encadeamento do payload no estado local)
- `supabase/functions/check-asaas-integration/index.ts`
- `supabase/functions/_shared/asaas-pix-readiness.ts` (apenas se necessário para enriquecer retorno sem side effects)

---

## Nome do arquivo de relatório

`analise-73-viabilidade-card-diagnostico-pix-admin.md`
