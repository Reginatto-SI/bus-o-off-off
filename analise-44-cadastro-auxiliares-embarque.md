# Análise 44 — Cadastro de Auxiliares de Embarque (espelho de Motoristas)

## Diagnóstico da estrutura reaproveitada

A implementação partiu da tela `src/pages/admin/Drivers.tsx` como referência direta de padrão visual, UX e comportamento (KPIs, card de filtros, tabela, ações `...`, modal com abas e exportações). O novo cadastro foi mantido no mesmo domínio operacional existente (`drivers`) para preservar o fluxo atual de vínculo com usuário (`user_roles.driver_id`) e evitar arquitetura paralela.

## Arquivos/componentes reutilizados

- `AdminLayout`, `PageHeader`, `StatsCard`, `FilterCard`, `ActionsDropdown`, `ExportExcelModal`, `ExportPDFModal`, `EmptyState`, `StatusBadge`.
- Estrutura de CRUD e modal com abas no mesmo padrão da tela de Motoristas.
- Fonte de dados Supabase (`drivers`) com isolamento por `company_id`.

## Campos implementados

### Dados pessoais
- Nome completo (`name`)
- CPF (`cpf`)
- RG (`rg`)
- Data de nascimento (`birth_date`)

### Contato
- Telefone (`phone`)
- WhatsApp (`whatsapp`)
- E-mail (`email`)

### Endereço
- CEP (`cep`)
- Logradouro (`street`)
- Número (`number`)
- Complemento (`complement`)
- Bairro (`neighborhood`)
- Cidade (`city`)
- UF (`state`)

### Dados operacionais
- Status (`status`)
- Observações (`notes`)
- Papel operacional (`operational_role = auxiliar_embarque`)

### Apoio
- Contato de emergência (`emergency_contact_name`)
- Telefone de emergência (`emergency_contact_phone`)

## Impacto no fluxo existente

- **Autenticação/permissões não foram alteradas**.
- O vínculo continua pelo fluxo existente de usuários (`role = motorista` + `operational_role` + `driver_id`).
- A tela de Motoristas foi ajustada para listar/salvar apenas `operational_role = motorista`, preservando separação operacional.
- A tela de Eventos foi ajustada para não listar auxiliares no campo de motorista principal.

## Risco residual

- Como o reuso foi feito na tabela `drivers`, o campo `cnh` permanece obrigatório por legado; para auxiliares, foi aplicado valor técnico `NAO_APLICAVEL` para manter compatibilidade sem quebrar contratos atuais.
- Se existirem integrações externas que assumem que todo registro de `drivers` é condutor, elas devem considerar `operational_role` para distinção.
