
# Plano de Correção: Empresa Ativa Não Resolvida

## Diagnóstico

Após as alterações recentes para multiempresa, o sistema não está conseguindo resolver qual é a **empresa ativa** ao salvar um veículo porque:

1. **Arquivo de tipos desatualizado**: O `types.ts` (gerado pelo Supabase) não contém as colunas adicionadas (`company_id` em `profiles` e `is_active` em `companies`)

2. **Erros de TypeScript**: O código tenta acessar propriedades que o TypeScript não reconhece, causando erros de compilação

3. **Fluxo interrompido**: Como há erros de tipo, o fluxo de resolução da empresa ativa não executa corretamente

## Solução Proposta

### Etapa 1: Corrigir o AuthContext para funcionar com os tipos atuais

Ajustar o `AuthContext.tsx` para:
- Usar type assertions onde necessário (já que sabemos que as colunas existem no banco)
- Não depender de `profileData.company_id` para resolver a empresa (usar apenas `user_roles`)
- Garantir que o filtro `is_active` funcione corretamente

**Lógica simplificada:**
```text
1. Buscar roles do usuário em user_roles
2. Extrair company_ids dos roles
3. Buscar empresas ativas na tabela companies
4. Definir a primeira empresa encontrada como ativa
5. Definir o role correspondente
```

### Etapa 2: Ajustar a lógica de empresa ativa

O código atual tenta usar `profileData.company_id` como preferência, mas:
- Essa coluna pode não estar preenchida
- Os tipos não a reconhecem

**Nova abordagem:**
- Usar apenas `user_roles` para determinar empresas do usuário
- Persistir empresa ativa em `localStorage`
- Restaurar da `localStorage` ao recarregar a página
- Fallback para primeira empresa vinculada

### Etapa 3: Sincronizar os tipos do banco

A coluna `company_id` em `profiles` e `is_active` em `companies` já existem no banco de dados. O arquivo de tipos será atualizado automaticamente na próxima sincronização.

---

## Detalhes Técnicos

### Arquivo: `src/contexts/AuthContext.tsx`

**Problema na linha 79:**
```typescript
.eq('is_active', true)  // TypeScript não reconhece is_active
```

**Problema na linha 103:**
```typescript
profileData?.company_id  // TypeScript não reconhece company_id
```

**Correção:**
- Usar `any` temporariamente ou type assertions para contornar a limitação do tipo gerado
- Remover dependência de `profileData.company_id` e usar apenas `user_roles` + `localStorage`

### Fluxo corrigido:

```text
Login
  │
  ├─> Buscar user_roles do usuário
  │
  ├─> Extrair company_ids
  │
  ├─> Buscar empresas ativas (com type assertion para is_active)
  │
  ├─> Verificar localStorage para empresa preferida
  │     │
  │     ├─> Se válida: usar como empresa ativa
  │     └─> Se inválida/ausente: usar primeira empresa
  │
  └─> Definir role para a empresa ativa
```

---

## Resultado Esperado

Após a correção:
1. ✅ Erros de build resolvidos
2. ✅ `activeCompanyId` preenchido corretamente ao fazer login
3. ✅ Cadastro de veículos funcionando
4. ✅ Todas as telas administrativas com empresa ativa definida
