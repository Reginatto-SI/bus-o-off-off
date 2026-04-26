# PRD — Inativação e Reativação de Empresas (via seletor do Header)

## 1) Objetivo
Definir a regra oficial para empresa ativa/inativa no SmartBus BR, deixando explícito que a experiência acontece **no seletor de empresas já existente no `AdminHeader`**, evoluído de dropdown simples para **modal/popup avançado**.

## 2) Escopo oficial (sem ambiguidade)

### 2.1 Dentro do escopo
- Botão no topo com empresa atual (header).
- Abertura de **modal avançado do seletor de empresas** ao clicar no botão.
- Busca, filtros e ações de seleção/ativação/inativação dentro desse modal.
- Regras de bloqueio operacional para empresa inativa e solicitação de reativação.

### 2.2 Fora do escopo
- **Não criar nova tela de empresas**.
- **Não criar nova rota**.
- **Não criar módulo separado de empresas**.
- **Não mover esse fluxo para `/admin/empresa`**.
- Não alterar RLS nesta etapa.
- Não alterar login/auth nesta etapa.

## 3) Definições de negócio

### 3.1 Empresa ativa
`companies.is_active = true`.

### 3.2 Empresa inativa
`companies.is_active = false`, com histórico preservado e sem exclusão física.

### 3.3 Princípios obrigatórios
1. Inativação é reversível.
2. Inativação não exclui dados.
3. Exclusão física de empresa é proibida.
4. Fluxo respeita multiempresa/RLS existente.

## 4) Regra oficial de UX no Header

### 4.1 Entrada única
- O ponto de entrada é o **seletor de empresas já existente no header**.
- O dropdown atual será substituído por **modal/popup do seletor de empresas no header**.

### 4.2 Conteúdo obrigatório do modal/popup
- Busca por nome.
- Busca por CPF/CNPJ/documento.
- Filtro de status: `Todas | Ativas | Inativas`.
- Tabela/grid compacta contendo:
  - Nome da empresa.
  - Documento.
  - Telefone/contato (quando houver).
  - Status ativa/inativa.
  - Ação `Selecionar` (somente para empresa ativa).
  - Ação `Ativar/Inativar` (somente para `Developer`).

### 4.3 Regras de visibilidade
- Empresas inativas **não** aparecem no seletor rápido/lista simples.
- Empresas inativas aparecem **apenas** no modal avançado quando o filtro permitir.

## 5) Regras funcionais

### 5.1 Inativação por Developer
Quando o `Developer` inativar uma empresa no modal avançado do seletor:
1. Empresa sai da lista rápida de ativas no header.
2. Empresa continua acessível no modal avançado (com filtro apropriado).
3. Histórico permanece preservado.
4. Não há exclusão física.

### 5.2 Login e acesso operacional para empresa inativa
1. Usuário vinculado à empresa inativa pode autenticar/login.
2. Após login, se o contexto ativo estiver inativo, o avanço operacional deve ser bloqueado.
3. Exibir modal orientativo com mensagem:

> "Sua empresa está inativa no SmartBus BR.  
> Para voltar a utilizar os serviços, solicite a reativação."

4. Ações do usuário:
   - `Solicitar reativação`
   - `Sair`

### 5.3 Reativação
- Decisão oficial: **Opção B — Solicitação de reativação com aprovação manual**.
- Reativação automática pelo usuário comum não é permitida.

## 6) Papéis e permissões

### 6.1 Inativar/reativar empresa
- Permitido apenas para `Developer` (ou suporte autorizado por política interna futura).
- Usuário comum não ativa/inativa empresa.

### 6.2 Solicitar reativação
- Usuário comum da empresa inativa pode solicitar.
- Aprovação permanece com `Developer/suporte autorizado`.

## 7) Solicitação de reativação (dentro da experiência do seletor)

### 7.1 Registro
- Solicitação deve ser registrada como pendente, com rastreabilidade mínima.

### 7.2 Visualização para decisão
- A análise/aprovação deve ser feita por `Developer/suporte autorizado`.
- O produto deve priorizar reaproveitamento de experiência existente, sem criar fluxo paralelo nesta definição.

## 8) Auditoria e governança

### 8.1 Registrar motivo
- Motivo de inativação: obrigatório.
- Motivo de reativação/aprovação: obrigatório.

### 8.2 Trilha mínima
- `empresa_id`
- ação (`inativada`, `reativada`, `solicitacao_reativacao`)
- `actor_user_id`
- data/hora
- motivo
- origem da ação

## 9) Impactos esperados

### 9.1 Vendas/Eventos/Pagamentos
- Histórico preservado.
- Operação de empresa inativa bloqueada conforme regras já vigentes de acesso.

### 9.2 Usuários
- Login permitido.
- Avanço operacional bloqueado com modal orientativo.

### 9.3 Vitrine pública
- Empresa inativa não deve permanecer exposta como ativa.

## 10) Regras adicionais

### 10.1 Empresa atualmente selecionada
- Inativação da empresa atualmente ativa deve exigir confirmação reforçada.
- Regra recomendada: exigir troca prévia para outra empresa ativa antes da confirmação.

### 10.2 Empresas de teste
- Podem ser inativadas para reduzir ruído no seletor rápido.
- Continuam disponíveis no modal avançado quando filtradas.

## 11) Critérios de aceite
- [ ] O PRD não permite interpretação de criação de nova tela/rota/módulo.
- [ ] A experiência está explicitamente ancorada no `AdminHeader`.
- [ ] O dropdown simples é substituído por modal/popup avançado do seletor.
- [ ] Seleção avançada + ativar/inativar ficam no modal do header.
- [ ] Empresas inativas ficam fora da lista rápida e visíveis apenas no modal com filtro.
- [ ] Reativação automática por usuário comum está vedada.
- [ ] Solicitação de reativação com aprovação manual está definida.

## 12) Regra oficial (texto normativo)

**“A gestão de ativo/inativo e a seleção avançada de empresas do Developer acontecem no modal/popup aberto a partir do seletor de empresas existente no header.”**
