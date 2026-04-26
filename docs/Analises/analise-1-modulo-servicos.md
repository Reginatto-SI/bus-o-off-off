# Auditoria Inicial — Módulo de Passeios & Serviços

## 1) Resumo executivo

**Estado geral: MÉDIO (com risco crítico em entrega funcional).**

Há base técnica consistente para iniciar o módulo (tabelas `services` e `event_services`, RLS, rota `/admin/servicos`, CRUD e isolamento por `company_id`). Porém, a integração principal no fluxo de evento **não está concluída** (a aba “Serviços” não está conectada no `EventDetail`), e etapas centrais do PRD (ex.: `sale_items`, venda avulsa `/vendas/servicos`, QR/validação por item) ainda não aparecem no código.

---

## 2) O que já está correto

### 2.1 Estrutura base de dados (catálogo e vínculo por evento)
- ✔ Existe tabela `services` com `company_id`, `name`, `description`, `unit_type`, `control_type`, `status`, timestamps.
- ✔ Existe tabela `event_services` com `event_id`, `service_id`, `company_id`, `base_price`, `total_capacity`, `sold_quantity`, `allow_checkout`, `allow_standalone_sale`, `is_active`.
- ✔ Há checks de domínio para `unit_type` e `control_type`.
- ✔ Há checks numéricos de não-negatividade para capacidade/quantidade/preço base.

### 2.2 Multiempresa
- ✔ `services` e `event_services` possuem RLS habilitada.
- ✔ Policies de gestão e leitura filtram por pertencimento da empresa (`user_belongs_to_company(auth.uid(), company_id)`).
- ✔ Frontend de `/admin/servicos` aplica filtro obrigatório por `activeCompanyId` em leitura e mutações.
- ✔ `EventServicesTab` também consulta/escreve sempre com `.eq('company_id', companyId)`.

### 2.3 Tela `/admin/servicos`
- ✔ Rota existe (`/admin/servicos`) e está registrada em `App.tsx`.
- ✔ Está no menu admin (“Serviços”).
- ✔ Usa `AdminLayout`.
- ✔ CRUD funcional (listar, criar, editar, inativar/ativar, excluir).
- ✔ Campos do PRD cobertos semanticamente:
  - `nome` → `name`
  - `descrição` → `description`
  - `unit_type` → `unit_type`
  - `tipo_controle` → `control_type` (diferença de nome, mesma intenção)
  - `ativo` → `status` (`ativo`/`inativo`)
- ✔ Ações usam padrão de botão “...” (`ActionsDropdown`).

### 2.4 Preparação de capacidade
- ✔ Existe `total_capacity`.
- ✔ Existe `sold_quantity` (preparação para vendidos).
- ✔ Interface já calcula “disponível” em tela (`total_capacity - sold_quantity`).

### 2.5 Reuso de arquitetura existente
- ✔ Não há evidência de criação de nova entidade “agencia” no banco.
- ✔ Comentários do código reforçam reaproveitamento de `companies`.
- ✔ Não há evidência de novo sistema de vendas ativo para serviços nesta etapa (ainda não implementado), evitando duplicação prematura do core de vendas.

---

## 3) Problemas encontrados (com impacto)

### 3.1 ❌ Aba “Serviços” do evento não está disponível no fluxo real
**Evidência:** componente `EventServicesTab` existe, mas `EventDetail.tsx` não importa nem renderiza esse componente; tabs atuais são apenas `Viagens`, `Locais de Embarque` e `Vendas`.

**Impacto:** requisito central do PRD (“Evento → Aba Serviços”) não está disponível para operação, bloqueando vínculo de serviços pelo fluxo oficial do evento.

### 3.2 ⚠ Divergência de nomenclatura em relação ao PRD
- PRD define `tipo_controle`; implementação usa `control_type`.
- PRD define “ativo/inativo” como campo; implementação usa `status` textual em `services` e `is_active` boolean em `event_services`.

**Impacto:** não quebra funcionalidade, mas pode gerar ambiguidade em documentação, integração futura e validações automáticas por nome de campo.

### 3.3 ⚠ Integridade relacional incompleta em `event_services`
**Evidência:** migration define `event_id` e `service_id`, mas não cria explicitamente FK para `events(id)`/`services(id)`.

**Impacto:** risco de registros órfãos e inconsistência se houver inserções incorretas por integração futura.

### 3.4 ❌ Itens do PRD de venda/validação ainda não encontrados
Não foram encontrados (nesta auditoria) artefatos para:
- `sale_items` ligado a `sales` para tipo `servico`.
- Rota/tela `/vendas/servicos` (venda avulsa).
- Geração de QR por item de serviço validável.
- Estrutura de consumo (`quantidade_utilizada` / `quantidade_restante`) e log de uso por leitura de QR.

**Impacto:** módulo ainda está em estágio de cadastro/configuração; operação comercial e validação de uso não está pronta conforme PRD completo.

### 3.5 ⚠ Código possivelmente “morto” no estado atual
`EventServicesTab.tsx` está implementado, porém sem uso detectado no app.

**Impacto:** aumenta custo de manutenção e sensação de funcionalidade pronta quando ela não está navegável no produto.

---

## 4) Riscos identificados

### 4.1 Risco crítico de produto (go-live parcial)
Se o time considerar que o módulo “já começou completo”, há alto risco de bloqueio operacional porque a aba do evento não está publicada no fluxo principal.

### 4.2 Risco de desalinhamento de contrato de dados
Diferenças de nomes (`tipo_controle` vs `control_type`; `ativo` vs `status`/`is_active`) podem gerar ruído entre PRD, frontend, banco e futuras integrações.

### 4.3 Risco de integridade
Sem FK explícita em `event_services`, existe risco de dados inválidos/orfandade sob falha de aplicação ou integrações externas.

### 4.4 Risco de percepção de conclusão
A existência de telas/componentes parcialmente conectados pode mascarar que o escopo comercial do PRD (venda/QR/consumo) ainda não foi iniciado.

---

## 5) Itens faltantes (baseado no PRD)

### 5.1 Estrutura e fluxo de venda
- ❓ `sale_items` com campos exigidos do PRD (`sale_id`, `service_id`, `unit_type`, `quantidade`, `valor_unitario`, `valor_total`, `tipo`).
- ❓ Fluxo de venda casada no checkout com serviços.
- ❓ Fluxo de venda avulsa em `/vendas/servicos`.

### 5.2 Evento
- ❌ Aba “Serviços” no `EventDetail` (não encontrada em uso no fluxo atual).

### 5.3 Validação e consumo
- ❓ Geração de QR por item validável.
- ❓ Regras de consumo parcial (`quantidade_total`, `quantidade_utilizada`, `quantidade_restante`) e bloqueio ao zerar.
- ❓ Logs de validação por leitura de QR.

### 5.4 Comprovante/layout único
- ❓ Comprovante único com bloco Passagem + bloco Serviços.
- ❓ Variante para venda avulsa sem bloco de passagem.

### 5.5 Relatórios e financeiro de serviço
- ❓ Indicadores de receita por serviço e quantidade vendida por serviço.
- ❓ Campo de custo e margem (repasse manual fase atual).

---

## 6) Recomendações (ajustes mínimos, sem refatoração ampla)

1. **Conectar imediatamente a aba “Serviços” no `EventDetail`** (import + `TabsTrigger` + `TabsContent` usando `EventServicesTab`).
2. **Padronizar nomenclatura de contrato** entre PRD e implementação (ao menos documentar formalmente o mapeamento `tipo_controle -> control_type`, `ativo -> status/is_active`).
3. **Adicionar FKs explícitas em `event_services`** para `events` e `services` para reduzir risco de órfãos.
4. **Marcar escopo atual como “fase cadastro/configuração”** para evitar percepção de entrega completa.
5. **Antes de avançar venda/QR**, validar desenho mínimo de `sale_items` em aderência ao PRD e ao reuso de `sales` já existente.

---

## 7) Classificação por item obrigatório

| Item | Status | Observação objetiva |
|---|---|---|
| 1. Estrutura de dados (`services`, `event_services`, `company_id`) | ✔ Correto | Estruturas existem e incluem `company_id`; sem nova entidade `agencia`. |
| 2. Multiempresa (filtros, isolamento, RLS) | ✔ Correto | RLS + filtros frontend por `company_id` presentes. |
| 3. Tela `/admin/servicos` | ✔ Correto (com ressalva) | Existe, usa `AdminLayout`, CRUD e botão “...”; ressalva de nomenclatura (`control_type`). |
| 4. Aba “Serviços” no evento | ❌ Incorreto | Componente existe, mas não está integrado ao `EventDetail` em produção. |
| 5. Estrutura de capacidade | ⚠ Parcial | `total_capacity` e `sold_quantity` existem; `disponível` é derivado em UI, não persistido. |
| 6. Reutilização de arquitetura | ✔ Correto (fase atual) | Sem sistema paralelo novo de vendas implementado até aqui. |
| 7. UI/UX | ⚠ Parcial | `/admin/servicos` segue padrão; aba de evento não navegável impede validação UX completa. |
| 8. Código e estrutura | ⚠ Parcial | Organização coerente; há indício de código não conectado (`EventServicesTab`). |

---

## 8) Verificação dos pontos de atenção solicitados

- criação indevida de entidade "agencia" → **não encontrada** ✔
- ausência de `company_id` → **não encontrada nas estruturas auditadas** ✔
- quebra de padrão visual → **não encontrada em `/admin/servicos`** ✔
- criação de fluxo paralelo → **não encontrada** ✔
- hardcode de dados → **não identificado no escopo auditado** ✔
- ausência de preparação para capacidade → **parcialmente atendido** ⚠
- campos divergentes do PRD → **encontrada divergência de nomenclatura** ⚠

