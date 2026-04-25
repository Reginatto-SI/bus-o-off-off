# Fase 1 — Validação do schema real e saneamento estrutural da entidade de Sócios/Split

## 1. Objetivo
Validar a estrutura real da entidade usada hoje em `/admin/socios` e no fluxo de split financeiro, comparar schema real vs repositório versionado, aplicar o menor saneamento estrutural seguro e preparar o caminho para um rename futuro sem executar refatoração ampla nesta fase.

## 2. Contexto de negócio oficial
### 2.1 Parceiros da empresa
- Parceiros institucionais/comerciais da empresa.
- Finalidade: exposição da marca e relacionamento comercial.
- Não são beneficiários financeiros de split por padrão.
- Escopo: empresa.

### 2.2 Patrocinadores do evento
- Patrocinadores ligados a eventos específicos.
- Finalidade: publicidade do evento.
- Não são beneficiários financeiros de split por padrão.
- Estrutura esperada: cadastro-base + vínculo por evento.

### 2.3 Sócios com split/comissão
- Beneficiários financeiros de comissão/split.
- Impactam diretamente repasse da venda.
- Precisam de modelagem semanticamente clara, multiempresa quando aplicável e segura para fluxo financeiro.

## 3. Estrutura atual encontrada
### 3.1 Tabela usada hoje
- A tela `/admin/socios` continua apontando para `src/pages/admin/Partners.tsx`, que usa a tabela `partners`.
- As edge functions financeiras também usam `partners` como entidade do beneficiário do split.
- O nome técnico é legado e semanticamente ruim: no uso real, `partners` significa “sócio financeiro”, não parceiro comercial.

### 3.2 Campos relacionados encontrados
- `partners.split_percent`
- `companies.partner_split_percent`
- `sales.partner_fee_amount`
- `sales.platform_net_amount`
- `sales.platform_fee_total`

### 3.3 Resumo conceitual
- `commercial_partners` = parceiro comercial/institucional.
- `sponsors` + `event_sponsors` = patrocinador/publicidade.
- `partners` = sócio/beneficiário financeiro do split.

## 4. Validação do schema real
### 4.1 Método de validação usado
A validação do schema real foi feita em dois níveis:
1. inspeção do versionamento do repositório (migrations + tipos + código);
2. validação online no projeto Supabase configurado em `.env`, autenticando com o usuário informado e consultando a API REST real.

### 4.2 Evidência objetiva do schema real atual
Na API REST real do Supabase:
- `GET /rest/v1/partners?select=id,name,status&limit=1` respondeu com sucesso.
- `GET /rest/v1/partners?select=id,split_percent&limit=1` respondeu com sucesso.
- `GET /rest/v1/partners?select=id,name,company_id&limit=1` respondeu erro `42703` com a mensagem **`column partners.company_id does not exist`**.
- `GET /rest/v1/companies?select=id,partner_split_percent&limit=1` respondeu com sucesso.
- `GET /rest/v1/sales?select=id,partner_fee_amount&limit=1` respondeu com sucesso.

### 4.3 Conclusão da validação do schema real
**A estrutura real atual da entidade financeira de sócios não está consistente.**

Motivos:
- o schema real da tabela `partners` **não possui `company_id`**;
- o código financeiro moderno **já consulta `partners` como se `company_id` existisse**;
- os tipos gerados do frontend também **não incluem `company_id`**, portanto refletem o schema real atual, mas não o comportamento esperado pelo backend financeiro;
- o repositório estava, portanto, dividido entre:
  - schema real/versionado legando `partners` sem vínculo com empresa;
  - edge functions mais novas assumindo que esse vínculo já existia.

### 4.4 FK, RLS e multiempresa
- No schema versionado anterior, `partners` não tinha FK para `companies`.
- As policies antigas também não eram company-scoped.
- Isso contrariava a diretriz multiempresa para a entidade financeira de sócios.

## 5. Divergências entre banco, migrations, tipos e código
### 5.1 Divergência crítica
**Backend financeiro vs schema real/versionado**
- `create-asaas-payment`, `verify-payment-status` e `asaas-webhook` filtravam `partners` por `company_id`.
- O schema real validado não possui esse campo.
- Logo, a base real e o repositório estavam desalinhados com o fluxo financeiro.

### 5.2 Divergência em tipos
- `src/integrations/supabase/types.ts` e `src/types/database.ts` não possuíam `company_id` em `partners`.
- Isso confirmava o atraso estrutural do schema versionado frente ao uso esperado no split.

### 5.3 Divergência em UI
- A tela `/admin/socios` tratava a entidade como “Sócio”, mas consultava `partners` sem filtro por empresa.
- Em multiempresa, isso mantinha uma leitura global inadequada para uma entidade financeira sensível.

### 5.4 Fonte de verdade ambígua
- `partners.split_percent` continua existindo, mas o split efetivo usa `companies.partner_split_percent`.
- Isso configura fonte de verdade duplicada/legada e precisa ser tratado como dívida técnica controlada.

## 6. Pontos de uso no sistema
### 6.1 Tela e rota administrativa
- `/admin/socios`
- `src/pages/admin/Partners.tsx`
- rota registrada em `src/App.tsx`

### 6.2 Edge functions / helpers financeiros
- `supabase/functions/create-asaas-payment/index.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/stripe-webhook/index.ts`
- campos auxiliares em `companies` e `sales`

### 6.3 Tipos
- `src/integrations/supabase/types.ts`
- `src/types/database.ts`

### 6.4 Migrations / políticas
- criação original de `partners`
- policies legadas da tabela
- nova migration desta fase para adicionar `company_id` e company-scoping

## 7. Riscos conceituais e estruturais
### 7.1 Ambiguidade semântica real
Sim. O projeto usa “partner” para dois conceitos diferentes:
- parceiro comercial (`commercial_partners`)
- sócio financeiro (`partners`)

### 7.2 Risco financeiro
Sim. Consultar `partners` por `company_id` quando o schema real ainda não possui esse campo cria risco de falha ou comportamento inconsistente em fluxos de split.

### 7.3 Risco multiempresa
Sim. Antes desta fase, `partners` não tinha garantia estrutural de escopo por empresa.

### 7.4 Risco de novos ambientes
Sim. Um ambiente novo criado apenas a partir das migrations antigas nasceria sem `company_id` em `partners`, reproduzindo a inconsistência.

## 8. Correções aplicadas nesta fase
### 8.1 Migration versionada para alinhar `partners` ao modelo multiempresa
Foi adicionada uma migration para:
- criar `partners.company_id` com FK para `companies`;
- documentar que `partners` é nome legado para sócio financeiro;
- documentar `split_percent` como campo legado;
- criar índice por `company_id` + `status`;
- substituir a policy global por policy company-scoped;
- falhar explicitamente em ambientes multiempresa com dados antigos ambíguos, em vez de atribuir sócios financeiros à empresa errada silenciosamente.

### 8.2 Alinhamento das tipagens
Foram atualizados:
- `src/integrations/supabase/types.ts`
- `src/types/database.ts`

Agora ambos passam a refletir `company_id` em `partners`.

### 8.3 Ajuste mínimo da tela `/admin/socios`
A tela foi alinhada para:
- filtrar `partners` por `activeCompanyId`;
- exigir empresa ativa antes do CRUD;
- persistir `company_id` no insert/update;
- documentar em comentário que `partners` é nome legado de entidade financeira e agora precisa respeitar escopo multiempresa.

### 8.4 Ajuste mínimo do fluxo legado Stripe
`supabase/functions/stripe-webhook/index.ts` também passou a filtrar `partners` por `sale.company_id`, para manter coerência com o saneamento estrutural.

## 9. O que não foi alterado e por quê
1. **Não houve rename de `partners` para `socios_split` ou equivalente.**
- Essa mudança exigiria migração mais ampla em banco, edge functions, tipagens, relatórios e UI.

2. **Não houve rename de `partner_split_percent` e `partner_fee_amount`.**
- São nomes semanticamente ruins, mas ainda amplamente usados; alterar agora aumentaria o risco da fase.

3. **Não foi removido `partners.split_percent`.**
- O campo foi apenas marcado/documentado como legado transitório nesta fase.

4. **Não foi refatorado todo o fluxo financeiro.**
- O objetivo desta fase foi saneamento mínimo, não reescrita do split.

## 10. Próximo passo recomendado
### 10.1 Aplicar a migration nos ambientes
Antes de qualquer rename futuro, o próximo passo exato é aplicar a migration desta fase no banco real para eliminar a divergência comprovada do schema.

### 10.2 Validar dados existentes após deploy da migration
- confirmar que `partners.company_id` ficou corretamente preenchido;
- confirmar que a tela `/admin/socios` lista apenas sócios da empresa ativa;
- validar fluxo de split em cenário com sócio ativo.

### 10.3 Planejar rename semântico futuro
Após o schema estar estável, a próxima fase deve planejar o rename de legado:
- tabela `partners` → `socios_split` ou equivalente;
- `companies.partner_split_percent` → algo semanticamente ligado a sócio/split;
- `sales.partner_fee_amount` → algo semanticamente ligado a sócio/beneficiário financeiro.

### 10.4 Impactos do rename futuro
- **frontend:** telas, tipos e textos técnicos;
- **edge functions:** queries, logs e comentários;
- **banco:** migrations e compatibilidade transitória;
- **relatórios:** colunas e nomenclatura financeira;
- **tipagens:** `src/types/database.ts` e tipos Supabase gerados.

## 11. Veredito final
### Respostas objetivas
1. **A tabela usada hoje para split está estruturalmente correta?**
- Não no schema real validado originalmente; precisava do saneamento mínimo desta fase.

2. **O `company_id` existe de verdade no schema real?**
- Não no ambiente validado antes da correção. A API real respondeu que `partners.company_id` não existe.

3. **O repositório versionado refletia isso corretamente?**
- Refletia o schema antigo, mas não a necessidade atual do fluxo financeiro. Estava incompleto para o modelo multiempresa exigido.

4. **Os tipos gerados estavam alinhados?**
- Estavam alinhados ao schema antigo, mas desalinhados do comportamento esperado pelo backend financeiro.

5. **O backend financeiro está consultando a entidade certa?**
- Sim quanto ao conceito funcional de sócio financeiro, mas estava parcialmente desalinhado do schema real por presumir `company_id` antes da versionagem correta.

6. **Existe ambiguidade semântica real entre “partner” comercial e “partner” financeiro?**
- Sim.

7. **Existe mais de uma fonte de verdade para split?**
- Sim. `companies.partner_split_percent` é a fonte efetiva atual, enquanto `partners.split_percent` permanece como legado ambíguo.

8. **Qual é a menor correção segura que precisava ser feita agora?**
- Versionar `partners.company_id` com FK/RLS company-scoped, alinhar tipos e limitar a tela `/admin/socios` ao escopo da empresa ativa.

9. **O sistema já pode seguir para uma fase futura de rename sem risco?**
- Pode seguir para planejamento da fase seguinte, mas somente após aplicar esta migration no banco real e validar os dados resultantes.

10. **Qual deve ser o próximo passo exato?**
- Aplicar a migration desta fase no banco real, validar dados de `partners.company_id` e então iniciar o plano de rename semântico controlado.

### Opção escolhida
**Opção B — A estrutura atual funciona, mas precisava de saneamento estrutural mínimo antes de avançar.**

### Justificativa
- O problema principal era uma inconsistência estrutural objetiva entre schema real, versionamento, tipos e backend financeiro.
- A correção mínima desta fase resolve a base estrutural necessária sem fazer rename amplo nem refatoração completa.
- Depois da migration ser aplicada no banco real, o projeto fica em posição segura para uma fase futura de rename e limpeza semântica.
