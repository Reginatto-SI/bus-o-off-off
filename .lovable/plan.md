
# Plano de Evolução: Sistema Multiempresa

## 1. O Conceito de Empresa no Sistema

A partir desta evolução, o **Busão Off Off** passa a operar com o conceito de **Empresa**:

**Regra de funcionamento:**
- Cada **Empresa** representa uma operação comercial independente
- Uma empresa possui seus próprios cadastros e operações:
  - Veículos (frota)
  - Motoristas
  - Locais de embarque
  - Vendedores
  - Eventos
  - Viagens
  - Vendas
- Dados de uma empresa **nunca aparecem** para outra empresa
- O cliente final (no portal público) não visualiza informações sobre a empresa - ele apenas vê os eventos disponíveis para compra

---

## 2. Como Usuários e Empresas se Relacionam

**Vínculo entre usuário e empresa:**
- Um usuário pode estar vinculado a **uma ou mais empresas**
- Cada vínculo define o **papel do usuário naquela empresa** (gerente, operador ou vendedor)

**Experiência ao acessar o sistema:**
- Ao fazer login, o sistema identifica a(s) empresa(s) do usuário
- Se vinculado a apenas uma empresa, ela é automaticamente ativada
- Se vinculado a várias, o usuário escolhe em qual deseja atuar (seletor simples no header)
- Todas as telas administrativas passam a considerar automaticamente a empresa ativa
- Um usuário **nunca vê dados** de empresas às quais não está vinculado

**Exemplo prático:**
- João é gerente na "Empresa A" e operador na "Empresa B"
- Ao logar, João escolhe em qual empresa quer trabalhar
- Enquanto estiver na "Empresa A", vê apenas veículos, motoristas e eventos dessa empresa
- Se trocar para "Empresa B", os dados mudam automaticamente

---

## 3. Impacto nas Telas Existentes

Todas as telas administrativas passam a exibir **apenas dados da empresa ativa**:

| Tela | O que passa a ser "da empresa" | O que muda na prática |
|------|-------------------------------|----------------------|
| **Frota (Veículos)** | Cada veículo pertence a uma empresa | Usuário vê e cadastra apenas veículos da empresa ativa |
| **Motoristas** | Cada motorista pertence a uma empresa | Usuário vê e cadastra apenas motoristas da empresa ativa |
| **Locais de Embarque** | Cada local pertence a uma empresa | Usuário vê e cadastra apenas locais da empresa ativa |
| **Vendedores** | Cada vendedor pertence a uma empresa | Usuário vê e cadastra apenas vendedores da empresa ativa |
| **Eventos** | Cada evento pertence a uma empresa | Usuário vê e cria apenas eventos da empresa ativa |
| **Viagens** | Herdado do evento (já vinculado à empresa) | Viagens aparecem conforme o evento selecionado |
| **Vendas** | Herdada do evento | Usuário vê apenas vendas de eventos da empresa ativa |
| **Minhas Vendas** | Vendedor vê suas vendas na empresa ativa | Mantém o filtro por vendedor + empresa |

**Para o cliente final (portal público):**
- Nenhuma mudança visível
- O sistema filtra automaticamente eventos disponíveis por empresa
- A passagem gerada contém internamente a referência à empresa

---

## 4. Empresa de Teste

Você poderá criar uma **empresa em seu nome** para usar como ambiente de testes:

- Será a primeira empresa do sistema
- Todos os dados atuais serão associados a ela (veículos, motoristas, eventos, etc.)
- Você poderá criar outras empresas depois, quando necessário
- Não é necessário ambiente separado - a separação acontece por empresa

---

## 5. Plano de Implementação

### ✅ Etapa 1: Criar cadastro de empresa (CONCLUÍDO)
- Tabela `companies` criada com dados básicos
- Empresa Padrão (Teste) criada automaticamente
- Todos os dados existentes migrados para a empresa padrão

### ✅ Etapa 2: Vincular usuários a empresas (CONCLUÍDO)
- Campo `company_id` adicionado à tabela `user_roles`
- Usuário pode ter papéis diferentes em empresas diferentes
- Lógica de "empresa ativa" implementada no `AuthContext`

### ✅ Etapa 3: Associar cadastros à empresa (CONCLUÍDO)
- Campo `company_id` adicionado em: veículos, motoristas, locais de embarque, vendedores, eventos
- Viagens e vendas herdam empresa via evento
- Frontend atualizado para enviar `company_id` nas operações de insert

### ✅ Etapa 4: Ajustar regras de acesso (CONCLUÍDO)
- Políticas RLS atualizadas para filtrar por empresa via `user_belongs_to_company()`
- Usuário só vê dados das empresas às quais está vinculado

### 🔄 Etapa 5: Interface de seleção de empresa (EM ANDAMENTO)
- [ ] Adicionar indicador da empresa ativa no header administrativo
- [ ] Criar seletor para usuários com múltiplas empresas
- [ ] Persistir a escolha durante a sessão (localStorage)

---

## Resumo Visual

```text
+------------------+
|     EMPRESA      |
+------------------+
        |
        +-- Veículos
        +-- Motoristas
        +-- Locais de Embarque
        +-- Vendedores
        +-- Eventos
              |
              +-- Viagens
              +-- Vendas
```

Cada empresa é uma "caixa isolada" com todos os seus recursos. Usuários acessam apenas as caixas às quais estão vinculados.
